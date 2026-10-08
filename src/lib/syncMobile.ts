// Synchronisation avec l'app compagnon iPhone, côté PC.
//
// Le PC reste la source de vérité. À chaque synchronisation :
//   1. il intègre les saisies déposées par le téléphone dans `saisies/`
//      (idempotent : clé `mobile:<uuid>` dans `auto_origine`), puis les supprime ;
//   2. il republie `instantane.bpsync` (état complet, chiffré).
// Le dossier est un dossier OneDrive local : c'est le client OneDrive qui
// assure le transport vers le cloud, puis vers le téléphone.

import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import {
  BaseDirectory,
  exists,
  mkdir,
  readDir,
  readFile,
  remove,
  rename,
  writeFile,
} from "@tauri-apps/plugin-fs";
import { subDays } from "date-fns";
import {
  creerTransaction,
  definirJustificatifTransaction,
  listBudgets,
  listCategories,
  listChargesFixes,
  listComptes,
  listEcheances,
  listObjectifs,
  listRegles,
  listTransactions,
} from "../db/repo";
import { codeAppairage, deballer, depuisBase64, emballer, empreinte, importerCle } from "../sync/crypto";
import {
  DOSSIER_SAISIES,
  EXTENSION,
  FICHIER_INSTANTANE,
  NOM_DOSSIER_SYNC,
  VERSION_PROTOCOLE,
  origineSaisie,
  saisieValide,
  uuidDepuisOrigine,
  type Instantane,
  type SaisieMobile,
} from "../sync/protocole";
import { getDevise } from "./format";
import { lireProfil } from "./profil";

/** Adresse de l'app compagnon (PWA hébergée sur GitHub Pages). */
export const URL_APP_MOBILE = "https://eric96-lang.github.io/aplomb/";

const CLE_CONF = "syncMobile";
/** Fenêtre d'accusés de réception publiés au téléphone (il purge sa file bien avant). */
const JOURS_ACCUSES = 180;

export interface ConfSync {
  actif: boolean;
  dossier: string | null;
  derniere: string | null; // ISO de la dernière synchro réussie
  erreur: string | null;
  dernieresIntegrees: number; // saisies intégrées lors de la dernière synchro
}

const DEFAUT: ConfSync = {
  actif: false,
  dossier: null,
  derniere: null,
  erreur: null,
  dernieresIntegrees: 0,
};

export const EVENEMENT_SYNC = "bp-sync-mobile";

export function lireConfSync(): ConfSync {
  try {
    const raw = localStorage.getItem(CLE_CONF);
    if (raw) return { ...DEFAUT, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAUT };
}

export function ecrireConfSync(patch: Partial<ConfSync>): ConfSync {
  const c = { ...lireConfSync(), ...patch };
  try {
    localStorage.setItem(CLE_CONF, JSON.stringify(c));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(EVENEMENT_SYNC));
  return c;
}

/** `<OneDrive>\Aplomb Sync`, ou null si OneDrive n'est pas installé. */
export async function dossierParDefaut(): Promise<string | null> {
  const od = await invoke<string | null>("dossier_onedrive");
  return od ? join(od, NOM_DOSSIER_SYNC) : null;
}

async function cleBrute(): Promise<Uint8Array> {
  return depuisBase64(await invoke<string>("sync_cle"));
}

/** Code à afficher en QR pour appairer l'iPhone, et son empreinte de vérification. */
export async function infosAppairage(): Promise<{ code: string; empreinte: string }> {
  const brute = await cleBrute();
  return { code: codeAppairage(brute), empreinte: await empreinte(brute) };
}

/** Nouvelle clé : l'ancien appairage devient invalide. */
export async function renouvelerCleSync(): Promise<{ code: string; empreinte: string }> {
  const brute = depuisBase64(await invoke<string>("sync_cle_renouveler"));
  return { code: codeAppairage(brute), empreinte: await empreinte(brute) };
}

export interface ResultatSync {
  integrees: number;
  illisibles: number;
}

let enCours: Promise<ResultatSync> | null = null;

/**
 * Synchronise avec le téléphone. Sans effet si la synchro n'est pas activée.
 * Deux appels simultanés partagent la même exécution.
 */
export function synchroniserMobile(opts: { integrer?: boolean } = {}): Promise<ResultatSync> {
  const conf = lireConfSync();
  if (!conf.actif || !conf.dossier) return Promise.resolve({ integrees: 0, illisibles: 0 });
  if (enCours) return enCours;
  const dossier = conf.dossier;
  enCours = (async () => {
    try {
      const cle = await importerCle(await cleBrute());
      await mkdir(await join(dossier, DOSSIER_SAISIES), { recursive: true });
      const res =
        opts.integrer === false ? { integrees: 0, illisibles: 0 } : await integrerSaisies(cle, dossier);
      await publierInstantane(cle, dossier);
      ecrireConfSync({
        derniere: new Date().toISOString(),
        erreur:
          res.illisibles > 0
            ? `${res.illisibles} saisie(s) illisible(s) : le téléphone utilise peut-être une ancienne clé.`
            : null,
        ...(res.integrees > 0 ? { dernieresIntegrees: res.integrees } : {}),
      });
      return res;
    } catch (e) {
      ecrireConfSync({ erreur: e instanceof Error ? e.message : String(e) });
      throw e;
    } finally {
      enCours = null;
    }
  })();
  return enCours;
}

let minuteurExport: ReturnType<typeof setTimeout> | null = null;

/** Republie l'instantané peu après une modification (regroupe les rafales). */
export function programmerPublication(delaiMs = 4000): void {
  if (!lireConfSync().actif) return;
  if (minuteurExport) clearTimeout(minuteurExport);
  minuteurExport = setTimeout(() => {
    minuteurExport = null;
    synchroniserMobile({ integrer: false }).catch(() => {});
  }, delaiMs);
}

async function integrerSaisies(cle: CryptoKey, dossier: string): Promise<ResultatSync> {
  const dir = await join(dossier, DOSSIER_SAISIES);
  const fichiers = (await readDir(dir)).filter((e) => !e.isDirectory && e.name.endsWith(EXTENSION));
  if (fichiers.length === 0) return { integrees: 0, illisibles: 0 };

  const [transactions, comptes, categories] = await Promise.all([
    listTransactions(),
    listComptes(),
    listCategories(),
  ]);
  const dejaLa = new Set(transactions.map((t) => t.auto_origine).filter(Boolean));
  const comptesOk = new Set(comptes.filter((c) => !c.archive).map((c) => c.id));
  const categoriesOk = new Set(categories.map((c) => c.id));

  let integrees = 0;
  let illisibles = 0;
  for (const f of fichiers) {
    const chemin = await join(dir, f.name);
    let s: SaisieMobile;
    try {
      const brut = await deballer<unknown>(cle, await readFile(chemin));
      if (!saisieValide(brut)) throw new Error("saisie invalide");
      s = brut;
    } catch (e) {
      // On ne supprime pas : un fichier illisible peut venir d'une ancienne clé.
      console.error("Saisie mobile ignorée", f.name, e);
      illisibles++;
      continue;
    }
    const origine = origineSaisie(s.uuid);
    if (!dejaLa.has(origine)) {
      const id = await creerTransaction({
        type: s.type,
        montant: Math.round(s.montant * 100) / 100,
        date: s.date,
        description: s.description?.slice(0, 200) || null,
        compte_id: s.compte_id != null && comptesOk.has(s.compte_id) ? s.compte_id : null,
        compte_dest_id: null,
        categorie_id: s.categorie_id != null && categoriesOk.has(s.categorie_id) ? s.categorie_id : null,
        auto_origine: origine,
      });
      if (s.photo) {
        try {
          await definirJustificatifTransaction(id, await enregistrerPhoto(s));
        } catch (e) {
          console.error("Photo de saisie non enregistrée", e);
        }
      }
      dejaLa.add(origine);
      integrees++;
    }
    await remove(chemin);
  }
  return { integrees, illisibles };
}

/** Copie la photo du ticket dans les justificatifs ; renvoie le chemin relatif. */
async function enregistrerPhoto(s: SaisieMobile): Promise<string> {
  const photo = s.photo!;
  const ext = photo.type === "image/png" ? "png" : "jpg";
  const dossierRel = `justificatifs/${s.date.slice(0, 4)}`;
  const rel = `${dossierRel}/${s.date.slice(5, 7)}-mobile-${s.uuid.slice(0, 8)}.${ext}`;
  if (!(await exists(dossierRel, { baseDir: BaseDirectory.AppData }))) {
    await mkdir(dossierRel, { baseDir: BaseDirectory.AppData, recursive: true });
  }
  await writeFile(rel, depuisBase64(photo.base64), { baseDir: BaseDirectory.AppData });
  return rel;
}

async function publierInstantane(cle: CryptoKey, dossier: string): Promise<void> {
  const [comptes, categories, transactions, charges, budgets, objectifs, regles, echeances] = await Promise.all([
    listComptes(),
    listCategories(),
    listTransactions(),
    listChargesFixes(),
    listBudgets(),
    listObjectifs(),
    listRegles(),
    listEcheances(),
  ]);
  const depuis = subDays(new Date(), JOURS_ACCUSES).toISOString();
  const inst: Instantane = {
    v: VERSION_PROTOCOLE,
    genere_le: new Date().toISOString(),
    devise: getDevise(),
    profil: lireProfil(),
    comptes,
    categories,
    transactions,
    charges,
    budgets,
    objectifs,
    regles,
    echeances,
    saisies_integrees: transactions
      .filter((t) => (t.created_at ?? "") >= depuis)
      .map((t) => uuidDepuisOrigine(t.auto_origine))
      .filter((u): u is string => u !== null),
  };
  const blob = await emballer(cle, inst);
  // Écriture atomique : OneDrive ne doit jamais envoyer un fichier à moitié écrit.
  const final = await join(dossier, FICHIER_INSTANTANE);
  const tmp = `${final}.tmp`;
  await writeFile(tmp, blob);
  await rename(tmp, final);
}
