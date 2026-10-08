import { addMonths, format } from "date-fns";
import { fr } from "date-fns/locale";
import type { Compte, Objectif, Transaction } from "../db/types";
import { soldeCompteAvecInitial } from "./calculs";

/**
 * Montant réellement épargné pour un objectif.
 *
 * - Objectif « manuel » (compte_id null) : la valeur saisie (`montant_actuel`).
 * - Objectif « lié à un compte » : le solde réel du compte de suivi, calculé
 *   automatiquement à partir des transactions. Plus aucune saisie manuelle —
 *   l'objectif reflète l'argent effectivement présent sur le compte.
 */
export function montantActuelObjectif(
  o: Objectif,
  comptes: Compte[],
  transactions: Transaction[]
): number {
  if (o.compte_id == null) return o.montant_actuel;
  const compte = comptes.find((c) => c.id === o.compte_id);
  if (!compte) return o.montant_actuel; // compte supprimé : repli sur la dernière valeur connue
  return Math.max(0, soldeCompteAvecInitial(compte, transactions));
}

/** True si l'objectif est suivi automatiquement sur un compte existant. */
export function objectifLieCompte(o: Objectif, comptes: Compte[]): boolean {
  return o.compte_id != null && comptes.some((c) => c.id === o.compte_id);
}

/**
 * Phrase de projection d'atteinte d'un objectif au rythme d'épargne moyen.
 *
 * Robuste par construction : un rythme nul, négatif, NaN ou infime (qui
 * donnerait une date hors plage) ne doit jamais faire planter le rendu — c'est
 * ce qui provoquait un écran blanc via `format()` sur une date invalide.
 */
export function projectionAtteinte(
  reste: number,
  epargneMoyenne: number,
  atteint: boolean,
  base = new Date()
): string {
  if (atteint) return "Objectif atteint 🎉";
  if (!Number.isFinite(epargneMoyenne) || epargneMoyenne <= 0 || !Number.isFinite(reste)) {
    return "Rythme d'épargne insuffisant pour estimer";
  }
  const mois = Math.ceil(reste / epargneMoyenne);
  if (!Number.isFinite(mois) || mois <= 0) {
    return "Rythme d'épargne insuffisant pour estimer";
  }
  if (mois > 1200) return "Atteint dans plus de 100 ans à ce rythme"; // hors plage de dates
  return `Atteint vers ${format(addMonths(base, mois), "MMMM yyyy", { locale: fr })} (~${mois} mois)`;
}
