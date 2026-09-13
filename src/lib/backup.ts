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

/** Crée une sauvegarde cohérente de la base dans `sauvegardes/`. Renvoie le nom du fichier. */
export async function creerSauvegarde(): Promise<string> {
  const base = await appDataDir();
  if (!(await exists("sauvegardes", { baseDir: BaseDirectory.AppData }))) {
    await mkdir("sauvegardes", { baseDir: BaseDirectory.AppData, recursive: true });
  }
  const nom = `budget-${format(new Date(), "yyyyMMdd-HHmmss")}.db`;
  const abs = await join(base, "sauvegardes", nom);
  await sauvegarderBaseVers(abs);
  await purgerVieillesSauvegardes();
  return nom;
}

async function purgerVieillesSauvegardes(): Promise<void> {
  try {
    const entries = await readDir("sauvegardes", { baseDir: BaseDirectory.AppData });
    const dbs = entries
      .filter((e) => e.isFile && e.name.endsWith(".db"))
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
    filters: [{ name: "Sauvegarde Budget Perso", extensions: ["db"] }],
  });
  if (!sel || typeof sel !== "string") return false;
  await copyFile(sel, "restore.pending", { toPathBaseDir: BaseDirectory.AppData });
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
