// Protocole de synchronisation PC ⇄ iPhone (app compagnon).
//
// Tout transite par un dossier OneDrive, chiffré de bout en bout : Microsoft
// ne voit que des fichiers illisibles, la clé n'existe que sur les deux
// appareils appairés.
//
//   PC  → iPhone : `instantane.bpsync`      — état complet en lecture (le PC
//                                              reste la source de vérité)
//   iPhone → PC  : `saisies/<uuid>.bpsync`  — une saisie par fichier ; le PC
//                                              l'intègre puis supprime le fichier
//
// Un fichier par saisie : aucune écriture concurrente sur un même fichier, donc
// aucun conflit possible. L'intégration est idempotente (clé `mobile:<uuid>`
// stockée dans `transactions.auto_origine`).

import type {
  Budget,
  Categorie,
  ChargeFixe,
  Compte,
  Echeance,
  Objectif,
  RegleCategorisation,
  Transaction,
} from "../db/types";
import type { Profil } from "../lib/profil";

export const VERSION_PROTOCOLE = 1;
export const NOM_DOSSIER_SYNC = "Aplomb Sync";
export const FICHIER_INSTANTANE = "instantane.bpsync";
export const DOSSIER_SAISIES = "saisies";
export const EXTENSION = ".bpsync";
export const PREFIXE_ORIGINE = "mobile:";

/** État publié par le PC pour le téléphone. */
export interface Instantane {
  v: typeof VERSION_PROTOCOLE;
  genere_le: string; // ISO
  devise: string;
  profil: Profil;
  comptes: Compte[];
  categories: Categorie[];
  transactions: Transaction[];
  charges: ChargeFixe[];
  budgets: Budget[];
  objectifs: Objectif[];
  regles: RegleCategorisation[];
  /** Échéances des charges fixes (statut de paiement) — absent avant la v1.1.24 du PC. */
  echeances?: Echeance[];
  /** uuid des saisies mobiles déjà intégrées côté PC (accusé de réception). */
  saisies_integrees: string[];
}

export interface PhotoSaisie {
  type: string; // ex. "image/jpeg"
  base64: string;
}

/** Saisie faite sur le téléphone, en attente d'intégration par le PC. */
export interface SaisieMobile {
  v: typeof VERSION_PROTOCOLE;
  uuid: string;
  cree_le: string; // ISO
  type: "depense" | "revenu";
  montant: number;
  date: string; // 'YYYY-MM-DD'
  description: string | null;
  compte_id: number | null;
  categorie_id: number | null;
  photo: PhotoSaisie | null;
}

export function origineSaisie(uuid: string): string {
  return PREFIXE_ORIGINE + uuid;
}

export function uuidDepuisOrigine(origine: string | null): string | null {
  return origine && origine.startsWith(PREFIXE_ORIGINE)
    ? origine.slice(PREFIXE_ORIGINE.length)
    : null;
}

export function nomFichierSaisie(uuid: string): string {
  return `${uuid}${EXTENSION}`;
}

/** Validation minimale d'une saisie déchiffrée (défense contre un fichier inattendu). */
export function saisieValide(s: unknown): s is SaisieMobile {
  if (!s || typeof s !== "object") return false;
  const o = s as Record<string, unknown>;
  return (
    o.v === VERSION_PROTOCOLE &&
    typeof o.uuid === "string" &&
    /^[0-9a-f-]{36}$/i.test(o.uuid) &&
    (o.type === "depense" || o.type === "revenu") &&
    typeof o.montant === "number" &&
    Number.isFinite(o.montant) &&
    o.montant > 0 &&
    typeof o.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(o.date)
  );
}

export function instantaneValide(i: unknown): i is Instantane {
  if (!i || typeof i !== "object") return false;
  const o = i as Record<string, unknown>;
  return (
    o.v === VERSION_PROTOCOLE &&
    Array.isArray(o.comptes) &&
    Array.isArray(o.transactions) &&
    Array.isArray(o.categories)
  );
}
