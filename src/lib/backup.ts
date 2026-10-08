import {
  BaseDirectory,
  mkdir,
  writeTextFile,
  exists,
  copyFile,
  readDir,
  remove,
} from "@tauri-apps/plugin-fs";
import { appDataDir, join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { format } from "date-fns";
import type { Categorie, Compte, Transaction } from "../db/types";
import { sauvegarderBaseVers } from "../db/repo";

/** Ouvre un dossier dans l'explorateur via la commande Rust (fiable sous Windows). */
async function ouvrirChemin(chemin: string): Promise<void> {
  await invoke("ouvrir_chemin", { chemin });
}

const MAX_SAUVEGARDES = 15;

/**
 * Crée une sauvegarde **chiffrée** (AES-256-GCM, clé dans le trousseau Windows)
 * dans `sauvegardes/`. On produit d'abord une copie cohérente (VACUUM INTO),
 * qu'on chiffre puis on supprime la version en clair. Renvoie le nom du fichier.
 */
export async function creerSauvegarde(): Promise<string> {
  const base = await appDataDir();
  if (!(await exists("sauvegardes", { baseDir: BaseDirectory.AppData }))) {
    await mkdir("sauvegardes", { baseDir: BaseDirectory.AppData, recursive: true });
  }
  const horodatage = format(new Date(), "yyyyMMdd-HHmmss");
  const tmpRel = `sauvegardes/.tmp-${horodatage}.db`;
  const tmpAbs = await join(base, tmpRel);
  const nom = `budget-${horodatage}.db.enc`;
  const absEnc = await join(base, "sauvegardes", nom);
  try {
    await sauvegarderBaseVers(tmpAbs); // copie en clair temporaire
    await invoke("chiffrer_fichier", { source: tmpAbs, dest: absEnc });
  } finally {
    // on retire toujours la copie en clair
    try {
      await remove(tmpRel, { baseDir: BaseDirectory.AppData });
    } catch {
      /* ignore */
    }
  }
  await purgerVieillesSauvegardes();
  return nom;
}

async function purgerVieillesSauvegardes(): Promise<void> {
  try {
    const entries = await readDir("sauvegardes", { baseDir: BaseDirectory.AppData });
    const dbs = entries
      .filter((e) => e.isFile && e.name.endsWith(".db.enc"))
      .map((e) => e.name)
      .sort(); // noms horodatés -> ordre chronologique
    const aSupprimer = dbs.slice(0, Math.max(0, dbs.length - MAX_SAUVEGARDES));
    for (const nom of aSupprimer) {
      await remove(`sauvegardes/${nom}`, { baseDir: BaseDirectory.AppData });
    }
  } catch {
    /* ignore */
  }
}

/** Sauvegarde automatique au plus une fois par jour. */
export async function sauvegardeAutoQuotidienne(): Promise<void> {
  try {
    const auj = format(new Date(), "yyyy-MM-dd");
    if (localStorage.getItem("derniereSauvegarde") === auj) return;
    await creerSauvegarde();
    localStorage.setItem("derniereSauvegarde", auj);
  } catch {
    /* ignore */
  }
}

export async function ouvrirDossierSauvegardes(): Promise<void> {
  const base = await appDataDir();
  await ouvrirChemin(await join(base, "sauvegardes"));
}

/**
 * Prépare une restauration : copie la sauvegarde choisie vers `restore.pending`.
 * Le remplacement effectif se fait au prochain démarrage (côté Rust).
 * Renvoie true si une sauvegarde a été sélectionnée.
 */
export async function preparerRestauration(): Promise<boolean> {
  const sel = await open({
    multiple: false,
    filters: [
      { name: "Sauvegarde chiffrée", extensions: ["enc"] },
      { name: "Sauvegarde (non chiffrée)", extensions: ["db"] },
    ],
  });
  if (!sel || typeof sel !== "string") return false;
  const base = await appDataDir();
  const destAbs = await join(base, "restore.pending");
  if (sel.toLowerCase().endsWith(".enc")) {
    // déchiffre la sauvegarde vers la base de restauration en attente
    await invoke("dechiffrer_fichier", { source: sel, dest: destAbs });
  } else {
    await copyFile(sel, "restore.pending", { toPathBaseDir: BaseDirectory.AppData });
  }
  return true;
}

/** Sauvegarde chiffrée la plus récente : nom de fichier et date lisible, ou null. */
export async function derniereSauvegarde(): Promise<{ nom: string; date: Date } | null> {
  try {
    const noms = (await readDir("sauvegardes", { baseDir: BaseDirectory.AppData }))
      .map((e) => e.name)
      .filter((n) => /^budget-\d{8}-\d{6}\.db\.enc$/.test(n))
      .sort();
    const nom = noms[noms.length - 1];
    if (!nom) return null;
    const [, a, mo, j, h, mi, s] = nom.match(/(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/)!;
    return { nom, date: new Date(+a, +mo - 1, +j, +h, +mi, +s) };
  } catch {
    return null;
  }
}

/**
 * Prépare la restauration de la sauvegarde la plus récente (remplacement au
 * prochain démarrage, côté Rust). Utilisé quand la base est endommagée.
 */
export async function preparerRestaurationDerniere(): Promise<boolean> {
  const derniere = await derniereSauvegarde();
  if (!derniere) return false;
  const base = await appDataDir();
  await invoke("dechiffrer_fichier", {
    source: await join(base, "sauvegardes", derniere.nom),
    dest: await join(base, "restore.pending"),
  });
  return true;
}

function champCsv(v: string | number | null): string {
  const s = v == null ? "" : String(v);
  if (/[";\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const LIBELLE_TYPE: Record<Transaction["type"], string> = {
  revenu: "Revenu",
  depense: "Dépense",
  virement: "Virement",
};

/**
 * Exporte toutes les transactions en CSV (séparateur « ; » pour Excel FR) dans
 * `exports/` du dossier de données, puis ouvre le dossier. Renvoie le chemin
 * relatif écrit.
 */
export async function exporterCsv(
  transactions: Transaction[],
  comptes: Compte[],
  categories: Categorie[]
): Promise<string> {
  const compteNom = new Map(comptes.map((c) => [c.id, c.nom]));
  const catNom = new Map(categories.map((c) => [c.id, c.nom]));

  const lignes = [
    ["Date", "Type", "Montant", "Compte", "Compte destination", "Catégorie", "Description"]
      .map(champCsv)
      .join(";"),
  ];

  for (const t of transactions) {
    lignes.push(
      [
        t.date,
        LIBELLE_TYPE[t.type],
        t.montant.toFixed(2).replace(".", ","),
        t.compte_id != null ? compteNom.get(t.compte_id) ?? "" : "",
        t.compte_dest_id != null ? compteNom.get(t.compte_dest_id) ?? "" : "",
        t.categorie_id != null ? catNom.get(t.categorie_id) ?? "" : "",
        t.description ?? "",
      ]
        .map(champCsv)
        .join(";")
    );
  }

  if (!(await exists("exports", { baseDir: BaseDirectory.AppData }))) {
    await mkdir("exports", { baseDir: BaseDirectory.AppData, recursive: true });
  }
  const rel = `exports/budget-export-${format(new Date(), "yyyyMMdd-HHmmss")}.csv`;
  // BOM pour qu'Excel ouvre l'UTF-8 correctement.
  await writeTextFile(rel, "﻿" + lignes.join("\r\n"), {
    baseDir: BaseDirectory.AppData,
  });

  // Confort : ouvre le dossier des exports (ne doit pas faire échouer l'export).
  try {
    const base = await appDataDir();
    await ouvrirChemin(await join(base, "exports"));
  } catch {
    /* ignore */
  }
  return rel;
}

/** Ouvre le dossier de données de l'app dans l'explorateur. Renvoie son chemin. */
export async function ouvrirDossierDonnees(): Promise<string> {
  const base = await appDataDir();
  try {
    await ouvrirChemin(base);
  } catch {
    /* ignore */
  }
  return base;
}
