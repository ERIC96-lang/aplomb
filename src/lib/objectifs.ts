import { addMonths, format } from "date-fns";
import { fr } from "date-fns/locale";
import type { Compte, ModeSuivi, Objectif, Transaction } from "../db/types";
import { soldeCompteAvecInitial } from "./calculs";

/**
 * Mode de suivi effectif. Les données antérieures à la v10 n'ont pas de
 * `mode_suivi` : un objectif lié à un compte y suivait le solde.
 */
export function modeSuivi(o: Objectif): ModeSuivi {
  if (o.compte_id == null) return "manuel";
  return o.mode_suivi === "versements" ? "versements" : o.mode_suivi === "manuel" ? "manuel" : "solde";
}

/** Effet d'une transaction sur le solde d'un compte (entrées +, sorties −). */
export function mouvementNet(t: Transaction, compteId: number): number {
  if (t.type === "revenu") return t.compte_id === compteId ? t.montant : 0;
  if (t.type === "depense") return t.compte_id === compteId ? -t.montant : 0;
  return (t.compte_dest_id === compteId ? t.montant : 0) - (t.compte_id === compteId ? t.montant : 0);
}

/** True si un autre objectif « versements » suit le même compte. */
export function comptePartage(o: Objectif, objectifs: Objectif[]): boolean {
  return objectifs.some(
    (x) => x.id !== o.id && x.compte_id === o.compte_id && modeSuivi(x) === "versements"
  );
}

/** Objectif « versements » le plus ancien d'un compte : il reçoit les mouvements non affectés. */
export function objectifPrincipalDuCompte(objectifs: Objectif[], compteId: number | null): Objectif | null {
  const l = objectifsVersementsDuCompte(objectifs, compteId);
  l.sort((a, b) => (a.cree_le ?? "").localeCompare(b.cree_le ?? "") || a.id - b.id);
  return l[0] ?? null;
}

/**
 * Le mouvement `t` compte-t-il pour l'objectif « versements » `o` ?
 * - affecté explicitement à un objectif : seulement pour celui-ci ;
 * - sinon : pour l'objectif le plus ancien du compte (le seul, si le compte
 *   est dédié). Créer un second objectif ne fait donc jamais reculer le premier.
 */
function comptePourObjectif(t: Transaction, o: Objectif, principal: boolean): boolean {
  if (t.objectif_id != null) return t.objectif_id === o.id;
  return principal;
}

/** Somme des mouvements comptés pour un objectif « versements », depuis une date. */
function versementsDepuis(o: Objectif, objectifs: Objectif[], transactions: Transaction[], depuis: string): number {
  if (o.compte_id == null) return 0;
  const principal = (objectifPrincipalDuCompte([...objectifs.filter((x) => x.id !== o.id), o], o.compte_id)?.id ?? o.id) === o.id;
  let total = 0;
  for (const t of transactions) {
    if (t.date < depuis) continue;
    const m = mouvementNet(t, o.compte_id);
    if (m !== 0 && comptePourObjectif(t, o, principal)) total += m;
  }
  return total;
}

/** Date (AAAA-MM-JJ) à partir de laquelle les versements comptent : la création de l'objectif. */
export function debutObjectif(o: Objectif): string {
  return (o.cree_le ?? "").slice(0, 10);
}

/**
 * Montant réellement épargné pour un objectif.
 *
 * - « manuel » : la valeur saisie (`montant_actuel`).
 * - « solde » : le solde réel du compte suivi.
 * - « versements » : le montant de départ (`montant_actuel`) + les mouvements
 *   nets du compte depuis la création de l'objectif (virements entrants,
 *   moins les retraits). Chaque virement fait avancer l'objectif tout seul.
 */
export function montantActuelObjectif(
  o: Objectif,
  comptes: Compte[],
  transactions: Transaction[],
  objectifs: Objectif[] = []
): number {
  const mode = modeSuivi(o);
  if (mode === "manuel") return o.montant_actuel;
  const compte = comptes.find((c) => c.id === o.compte_id);
  if (!compte) return o.montant_actuel; // compte supprimé : repli sur la dernière valeur connue
  if (mode === "solde") return Math.max(0, soldeCompteAvecInitial(compte, transactions));
  return Math.max(0, o.montant_actuel + versementsDepuis(o, objectifs, transactions, debutObjectif(o)));
}

/**
 * Rythme mensuel réel d'un objectif suivi sur un compte : mouvements comptés
 * sur les 90 derniers jours (ou depuis la création si plus récente), ramenés
 * au mois. null pour un objectif manuel (on garde alors l'épargne globale).
 */
export function rythmeMensuelObjectif(
  o: Objectif,
  transactions: Transaction[],
  objectifs: Objectif[] = [],
  aujourdHui = new Date()
): number | null {
  const mode = modeSuivi(o);
  if (mode === "manuel" || o.compte_id == null) return null;
  const il90 = new Date(aujourdHui.getTime() - 90 * 86_400_000).toISOString().slice(0, 10);
  const debut = mode === "versements" && debutObjectif(o) > il90 ? debutObjectif(o) : il90;
  const jours = Math.max(30, (aujourdHui.getTime() - new Date(debut).getTime()) / 86_400_000);
  const total =
    mode === "versements"
      ? versementsDepuis(o, objectifs, transactions, debut)
      : transactions.reduce((a, t) => (t.date >= debut ? a + mouvementNet(t, o.compte_id!) : a), 0);
  return total / (jours / 30.44);
}

/** True si l'objectif est suivi automatiquement sur un compte existant. */
export function objectifLieCompte(o: Objectif, comptes: Compte[]): boolean {
  return modeSuivi(o) !== "manuel" && comptes.some((c) => c.id === o.compte_id);
}

/** Objectifs « versements » suivant un compte (pour proposer l'affectation d'un virement). */
export function objectifsVersementsDuCompte(objectifs: Objectif[], compteId: number | null): Objectif[] {
  if (compteId == null) return [];
  return objectifs.filter((o) => o.compte_id === compteId && modeSuivi(o) === "versements");
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
