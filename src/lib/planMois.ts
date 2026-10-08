import { addDays, format, startOfMonth } from "date-fns";
import type { Budget, Categorie, ChargeFixe, Transaction } from "../db/types";
import type { Profil } from "./profil";
import { estimerRevenus } from "./previsions";
import { prochainesOccurrences } from "./echeancier";
import { statutsBudgets } from "./budgets";

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
  },
  mois: string,
  today = new Date()
): PlanMois {
  const { transactions, chargesFixes, budgets, categories, profil } = data;

  const revenuAttendu = estimerRevenus(transactions, profil).attendu;

  const todayIso = format(today, "yyyy-MM-dd");
  const dansSeptJours = format(addDays(today, 7), "yyyy-MM-dd");

  // Occurrences des charges fixes du mois courant (depuis le 1er du mois).
  const occ = prochainesOccurrences(chargesFixes, 1, startOfMonth(today)).filter(
    (o) => o.mois === mois
  );
  const chargesMoisTotal = occ.reduce((a, o) => a + o.charge.montant_attendu, 0);
  const restantes = occ.filter((o) => o.date >= todayIso);
  const chargesRestantesTotal = restantes.reduce((a, o) => a + o.charge.montant_attendu, 0);
  const echeancesSemaine = occ.filter((o) => o.date >= todayIso && o.date <= dansSeptJours).length;

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
