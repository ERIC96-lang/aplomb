import { addMonths, differenceInCalendarMonths, format } from "date-fns";
import { fr } from "date-fns/locale";
import type { ChargeFixe, Compte, Objectif, Transaction } from "../db/types";
import { soldeGlobal } from "./calculs";
import { pointsFluxMensuel } from "./series";
import { grouperParMois, prochainesOccurrences } from "./echeancier";
import type { Profil } from "./profil";

export interface MoisPrevision {
  mois: string;
  label: string;
  revenus: number;
  charges: number;
  depensesVariables: number;
  resteAVivre: number;
  soldeProjete: number;
}

export interface PlanObjectif {
  objectif: Objectif;
  requisMensuel: number; // pour tenir la date cible
  moisRestants: number | null;
}

export interface Previsions {
  mois: MoisPrevision[];
  revenusMensuels: number;
  chargesMensuelMoy: number;
  depensesVariablesMoy: number;
  plans: PlanObjectif[];
  epargneRecommandee: number; // total requis / mois pour les objectifs datés
  capaciteEpargne: number; // reste à vivre moyen prév!
}

export interface EstimationRevenu {
  bas: number;
  attendu: number;
  haut: number;
}

/** Estime le revenu mensuel (bas / attendu / haut) selon le mode du profil. */
export function estimerRevenus(transactions: Transaction[], profil: Profil): EstimationRevenu {
  if (profil.modeRevenu === "fourchette") {
    const attendu = profil.revenuMensuel || 0;
    return {
      bas: profil.revenuBas || attendu,
      attendu,
      haut: profil.revenuHaut || attendu,
    };
  }
  if (profil.modeRevenu === "moyenne") {
    const flux = pointsFluxMensuel(transactions, undefined, 6);
    const mois = flux.map((f) => f.revenus).filter((v) => v > 0);
    if (mois.length > 0) {
      const avg = mois.reduce((a, b) => a + b, 0) / mois.length;
      return { bas: Math.min(...mois), attendu: avg, haut: Math.max(...mois) };
    }
  }
  // Mode fixe (ou pas de données) : montant du profil, sinon moyenne 3 mois.
  const flux3 = pointsFluxMensuel(transactions, undefined, 3);
  const revMoy3 = flux3.reduce((a, f) => a + f.revenus, 0) / (flux3.length || 1);
  const v = profil.configure && profil.revenuMensuel > 0 ? profil.revenuMensuel : revMoy3;
  return { bas: v, attendu: v, haut: v };
}

export function calculerPrevisions(
  comptes: Compte[],
  transactions: Transaction[],
  chargesFixes: ChargeFixe[],
  objectifs: Objectif[],
  revenusMensuels: number,
  horizon = 6
): Previsions {
  const today = new Date();

  // Charges fixes mensuelles moyennes (pour estimer le variable).
  const chargesMensuelMoy = chargesFixes
    .filter((c) => c.actif === 1 && c.periodicite === "mensuelle")
    .reduce((a, c) => a + c.montant_attendu, 0);

  // Dépenses variables moyennes = dépenses totales moyennes − charges mensuelles.
  const flux3 = pointsFluxMensuel(transactions, undefined, 3);
  const depMoy3 = flux3.reduce((a, f) => a + f.depenses, 0) / (flux3.length || 1);
  const depensesVariablesMoy = Math.max(0, depMoy3 - chargesMensuelMoy);

  // Occurrences de charges (toutes périodicités) par mois.
  const occ = prochainesOccurrences(chargesFixes, horizon + 1, today);
  const parMois = grouperParMois(occ);

  let solde = soldeGlobal(comptes, transactions);
  const mois: MoisPrevision[] = [];
  for (let i = 1; i <= horizon; i++) {
    const d = addMonths(today, i);
    const key = format(d, "yyyy-MM");
    const chargesMois = (parMois.get(key) ?? []).reduce((a, o) => a + o.charge.montant_attendu, 0);
    const resteAVivre = revenusMensuels - chargesMois - depensesVariablesMoy;
    solde += resteAVivre;
    mois.push({
      mois: key,
      label: format(d, "MMM yyyy", { locale: fr }),
      revenus: revenusMensuels,
      charges: chargesMois,
      depensesVariables: depensesVariablesMoy,
      resteAVivre,
      soldeProjete: solde,
    });
  }

  // Plans d'épargne pour les objectifs datés.
  const plans: PlanObjectif[] = objectifs.map((o) => {
    const reste = Math.max(0, o.montant_cible - o.montant_actuel);
    if (!o.date_cible) return { objectif: o, requisMensuel: 0, moisRestants: null };
    const moisRestants = Math.max(1, differenceInCalendarMonths(new Date(o.date_cible), today));
    return { objectif: o, requisMensuel: reste / moisRestants, moisRestants };
  });

  const epargneRecommandee = plans.reduce((a, p) => a + p.requisMensuel, 0);
  const capaciteEpargne = mois.length
    ? mois.reduce((a, m) => a + m.resteAVivre, 0) / mois.length
    : 0;

  return {
    mois,
    revenusMensuels,
    chargesMensuelMoy,
    depensesVariablesMoy,
    plans,
    epargneRecommandee,
    capaciteEpargne,
  };
}
