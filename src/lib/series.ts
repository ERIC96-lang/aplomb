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
import { totauxMois } from "./calculs";

export interface PointSolde {
  key: string;
  label: string;
  solde: number;
}

/** Effet d'une transaction sur le solde global (les virements sont neutres). */
function deltaGlobal(t: Transaction): number {
  if (t.type === "revenu") return t.montant;
  if (t.type === "depense") return -t.montant;
  return 0; // virement : neutre au global
}

/** Effet d'une transaction sur le solde d'un compte donné. */
function deltaCompte(t: Transaction, compteId: number): number {
  if (t.type === "revenu" && t.compte_id === compteId) return t.montant;
  if (t.type === "depense" && t.compte_id === compteId) return -t.montant;
  if (t.type === "virement") {
    if (t.compte_id === compteId) return -t.montant;
    if (t.compte_dest_id === compteId) return t.montant;
  }
  return 0;
}

/**
 * Soldes cumulés à une série de dates, en UN SEUL passage (O(n log n) tri +
 * O(n + points)) au lieu de re-filtrer toutes les transactions à chaque point.
 * `datesIso` doit être trié croissant.
 */
function soldesAuxDates(
  comptes: Compte[],
  transactions: Transaction[],
  compteId: number | null,
  datesIso: string[]
): number[] {
  let solde =
    compteId == null
      ? comptes.reduce((a, c) => a + c.solde_initial, 0)
      : comptes.find((c) => c.id === compteId)?.solde_initial ?? 0;
  const delta = (t: Transaction) =>
    compteId == null ? deltaGlobal(t) : deltaCompte(t, compteId);

  const tri = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  const res: number[] = [];
  let i = 0;
  for (const dateIso of datesIso) {
    while (i < tri.length && tri[i].date <= dateIso) {
      solde += delta(tri[i]);
      i++;
    }
    res.push(solde);
  }
  return res;
}

/** Solde de fin de mois sur les `nbMois` derniers mois (courbe de tendance). */
export function pointsSoldeMensuel(
  comptes: Compte[],
  transactions: Transaction[],
  compteId: number | null,
  nbMois = 12
): PointSolde[] {
  const now = new Date();
  const bornes: { key: string; label: string; iso: string }[] = [];
  for (let i = nbMois - 1; i >= 0; i--) {
    const d = endOfMonth(addMonths(now, -i));
    bornes.push({
      key: format(d, "yyyy-MM"),
      label: format(d, "MMM", { locale: fr }),
      iso: format(d, "yyyy-MM-dd"),
    });
  }
  const soldes = soldesAuxDates(comptes, transactions, compteId, bornes.map((b) => b.iso));
  return bornes.map((b, k) => ({ key: b.key, label: b.label, solde: soldes[k] }));
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
  const jours = eachDayOfInterval({ start, end });
  const isos = jours.map((d) => format(d, "yyyy-MM-dd"));
  const soldes = soldesAuxDates(comptes, transactions, compteId, isos);
  return jours.map((d, k) => ({ key: isos[k], label: String(d.getDate()), solde: soldes[k] }));
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
