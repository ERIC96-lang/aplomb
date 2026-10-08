import type { Transaction } from "../db/types";
import {
  origineSaisie,
  uuidDepuisOrigine,
  type Instantane,
  type SaisieMobile,
} from "./protocole";

/** uuid des saisies que le PC a déjà intégrées (accusé explicite + transactions présentes). */
export function uuidsIntegres(inst: Instantane | null): Set<string> {
  const faits = new Set(inst?.saisies_integrees ?? []);
  for (const t of inst?.transactions ?? []) {
    const u = uuidDepuisOrigine(t.auto_origine);
    if (u) faits.add(u);
  }
  return faits;
}

/** Saisies du téléphone pas encore intégrées par le PC. */
export function saisiesEnAttente<S extends SaisieMobile>(saisies: S[], inst: Instantane | null): S[] {
  const faits = uuidsIntegres(inst);
  return saisies.filter((s) => !faits.has(s.uuid));
}

/** Représentation provisoire d'une saisie locale, pour l'intégrer aux calculs. */
export function saisieVersTransaction(s: SaisieMobile, idProvisoire: number): Transaction {
  return {
    id: idProvisoire,
    type: s.type,
    montant: s.montant,
    date: s.date,
    description: s.description,
    compte_id: s.compte_id,
    compte_dest_id: null,
    categorie_id: s.categorie_id,
    created_at: s.cree_le,
    a_confirmer: 0,
    auto_origine: origineSaisie(s.uuid),
    pointee: 0,
    justificatif_path: null,
  };
}

/**
 * Transactions du PC + saisies locales en attente (ids négatifs provisoires),
 * triées du plus récent au plus ancien. Les soldes, budgets et le plan du mois
 * affichés sur le téléphone reflètent ainsi immédiatement les nouvelles saisies.
 */
export function transactionsFusionnees(
  inst: Instantane | null,
  saisies: SaisieMobile[]
): Transaction[] {
  const attente = saisiesEnAttente(saisies, inst).map((s, i) => saisieVersTransaction(s, -(i + 1)));
  return [...attente, ...(inst?.transactions ?? [])].sort(
    (a, b) => b.date.localeCompare(a.date) || (b.created_at ?? "").localeCompare(a.created_at ?? "")
  );
}

/** True si la transaction est une saisie mobile pas encore confirmée par le PC. */
export function estEnAttente(t: Transaction): boolean {
  return t.id < 0;
}
