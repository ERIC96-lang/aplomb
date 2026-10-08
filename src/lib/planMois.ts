import { addDays, format, startOfMonth } from "date-fns";
import type { Budget, Categorie, ChargeFixe, Echeance, Transaction } from "../db/types";
import type { Profil } from "./profil";
import { estimerRevenus } from "./previsions";
import { prochainesOccurrences } from "./echeancier";
import { statutsBudgets } from "./budgets";
import { estReglee } from "./statutEcheance";

/** Synthèse actionnable du mois en cours (l'« assistant Plan du mois »). */
export interface PlanMois {
  mois: string; // 'YYYY-MM'
  revenuAttendu: number;
  chargesMoisTotal: number; // toutes les charges fixes prévues sur le mois
  chargesMoisCount: number;
  chargesRestantesTotal: number; // celles encore à venir (date >= aujourd'hui)
  chargesRestantesCount: number;
  resteAvantVariable: number; // revenu attendu − charges fixes du mois
  aConfirmer: number; // transactions auto en attente de validation
  echeancesSemaine: number; // charges fixes dues dans les 7 prochains jours
  budgetsAlerte: number; // budgets en attention ou dépassés
  budgetsTotal: number; // somme des plafonds définis
}

export function planDuMois(
  data: {
    transactions: Transaction[];
    chargesFixes: ChargeFixe[];
    budgets: Budget[];
    categories: Categorie[];
    profil: Profil;
    /** Statut des échéances (optionnel) : exclut les charges déjà réglées des « restantes ». */
    echeances?: Echeance[];
  },
  mois: string,
  today = new Date()
): PlanMois {
  const { transactions, chargesFixes, budgets, categories, profil } = data;
  const statutDuMois = new Map(
    (data.echeances ?? []).filter((e) => e.mois === mois).map((e) => [e.charge_fixe_id, e.statut])
  );

  const revenuAttendu = estimerRevenus(transactions, profil).attendu;

  const todayIso = format(today, "yyyy-MM-dd");
  const dansSeptJours = format(addDays(today, 7), "yyyy-MM-dd");

  // Occurrences des charges fixes du mois courant (depuis le 1er du mois).
  // Une charge réglée hors comptes (PayPal…) ne pèse pas sur les comptes suivis.
  const occ = prochainesOccurrences(chargesFixes, 1, startOfMonth(today)).filter(
    (o) => o.mois === mois && statutDuMois.get(o.charge.id) !== "reglee_ailleurs"
  );
  const dejaReglee = (o: (typeof occ)[number]) => {
    const s = statutDuMois.get(o.charge.id);
    return s !== undefined && estReglee(s);
  };
  const chargesMoisTotal = occ.reduce((a, o) => a + o.charge.montant_attendu, 0);
  const restantes = occ.filter((o) => o.date >= todayIso && !dejaReglee(o));
  const chargesRestantesTotal = restantes.reduce((a, o) => a + o.charge.montant_attendu, 0);
  const echeancesSemaine = restantes.filter((o) => o.date <= dansSeptJours).length;

  const aConfirmer = transactions.filter((t) => t.a_confirmer === 1).length;

  const statuts = statutsBudgets(budgets, categories, transactions, mois);
  const budgetsAlerte = statuts.filter((b) => b.etat !== "ok").length;
  // L'objectif d'épargne n'est pas un plafond de dépenses.
  const budgetsTotal = statuts.filter((s) => !s.epargne).reduce((a, s) => a + s.plafond, 0);

  return {
    mois,
    revenuAttendu,
    chargesMoisTotal,
    chargesMoisCount: occ.length,
    chargesRestantesTotal,
    chargesRestantesCount: restantes.length,
    resteAvantVariable: revenuAttendu - chargesMoisTotal,
    aConfirmer,
    echeancesSemaine,
    budgetsAlerte,
    budgetsTotal,
  };
}
