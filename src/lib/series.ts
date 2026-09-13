import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
} from "date-fns";
import { fr } from "date-fns/locale";
import type { Compte, Transaction } from "../db/types";
import { soldeCompteAvecInitial, soldeGlobal, totauxMois } from "./calculs";

function soldeALaDate(
  comptes: Compte[],
  transactions: Transaction[],
  compteId: number | null,
  dateIso: string
): number {
  const jusque = transactions.filter((t) => t.date <= dateIso);
  if (compteId == null) return soldeGlobal(comptes, jusque);
  const c = comptes.find((x) => x.id === compteId);
  return c ? soldeCompteAvecInitial(c, jusque) : 0;
}

export interface PointSolde {
  key: string;
  label: string;
  solde: number;
}

/** Solde de fin de mois sur les `nbMois` derniers mois (courbe de tendance). */
export function pointsSoldeMensuel(
  comptes: Compte[],
  transactions: Transaction[],
  compteId: number | null,
  nbMois = 12
): PointSolde[] {
  const now = new Date();
  const pts: PointSolde[] = [];
  for (let i = nbMois - 1; i >= 0; i--) {
    const d = endOfMonth(addMonths(now, -i));
    const iso = format(d, "yyyy-MM-dd");
    pts.push({
      key: format(d, "yyyy-MM"),
      label: format(d, "MMM", { locale: fr }),
      solde: soldeALaDate(comptes, transactions, compteId, iso),
    });
  }
  return pts;
}

/** Solde jour par jour sur un mois 'YYYY-MM'. */
export function pointsSoldeJournalier(
  comptes: Compte[],
  transactions: Transaction[],
  compteId: number | null,
  mois: string
): PointSolde[] {
  const start = startOfMonth(parseISO(`${mois}-01`));
  const end = endOfMonth(start);
  return eachDayOfInterval({ start, end }).map((d) => {
    const iso = format(d, "yyyy-MM-dd");
    return {
      key: iso,
      label: String(d.getDate()),
      solde: soldeALaDate(comptes, transactions, compteId, iso),
    };
  });
}

export interface PointFlux {
  key: string;
  label: string;
  revenus: number;
  depenses: number;
  epargne: number;
}

/** Revenus / dépenses / épargne par mois sur les `nbMois` derniers mois. */
export function pointsFluxMensuel(
  transactions: Transaction[],
  compteId: number | undefined,
  nbMois = 6
): PointFlux[] {
  const now = new Date();
  const pts: PointFlux[] = [];
  for (let i = nbMois - 1; i >= 0; i--) {
    const d = addMonths(now, -i);
    const mois = format(d, "yyyy-MM");
    const t = totauxMois(transactions, mois, compteId);
    pts.push({
      key: mois,
      label: format(d, "MMM", { locale: fr }),
      revenus: t.revenus,
      depenses: t.depenses,
      epargne: t.revenus - t.depenses,
    });
  }
  return pts;
}

const MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** Revenus / dépenses / épargne pour chacun des 12 mois d'une année donnée. */
export function pointsFluxAnnee(
  transactions: Transaction[],
  annee: number,
  compteId: number | undefined
): PointFlux[] {
  const pts: PointFlux[] = [];
  for (let m = 1; m <= 12; m++) {
    const mois = `${annee}-${String(m).padStart(2, "0")}`;
    const t = totauxMois(transactions, mois, compteId);
    pts.push({
      key: mois,
      label: MOIS_COURTS[m - 1],
      revenus: t.revenus,
      depenses: t.depenses,
      epargne: t.revenus - t.depenses,
    });
  }
  return pts;
}

/** Total des dépenses par jour du mois (pour la heatmap façon calendrier). */
export function depensesParJour(
  transactions: Transaction[],
  mois: string,
  compteId?: number
): number[] {
  const start = startOfMonth(parseISO(`${mois}-01`));
  const nbJours = endOfMonth(start).getDate();
  const arr = new Array(nbJours).fill(0);
  for (const t of transactions) {
    if (t.type !== "depense") continue;
    if (!t.date.startsWith(mois)) continue;
    if (compteId !== undefined && t.compte_id !== compteId) continue;
    const jour = Number(t.date.slice(8, 10));
    if (jour >= 1 && jour <= nbJours) arr[jour - 1] += t.montant;
  }
  return arr;
}
