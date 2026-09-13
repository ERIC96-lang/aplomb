import { addMonths, format } from "date-fns";
import type {
  Budget,
  Categorie,
  ChargeFixe,
  Compte,
  Echeance,
  Objectif,
  SuggestionRecurrence,
  Transaction,
} from "../db/types";
import type { IconName } from "../components/Icon";
import { totauxMois } from "./calculs";
import { statutsBudgets } from "./budgets";
import { detecterRecurrences } from "./recurrence";
import { projeterFinDeMois } from "./projection";
import { formatMontant } from "./format";

export type NiveauInsight = "positif" | "info" | "attention" | "alerte";

export interface Insight {
  id: string;
  niveau: NiveauInsight;
  titre: string;
  detail: string;
  icon: IconName;
  lien?: { label: string; to: string };
}

export interface DonneesInsights {
  comptes: Compte[];
  transactions: Transaction[];
  categories: Categorie[];
  chargesFixes: ChargeFixe[];
  echeances: Echeance[];
  budgets: Budget[];
  objectifs: Objectif[];
  suggestions: SuggestionRecurrence[];
}

function moisAvant(ref: string, n: number): string {
  return format(addMonths(new Date(`${ref}-01`), -n), "yyyy-MM");
}
function pct(cur: number, base: number): number {
  return base === 0 ? 0 : Math.round(((cur - base) / base) * 100);
}
function normaliserLibelle(s: string | null): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}
function mediane(nums: number[]): number {
  if (nums.length === 0) return 0;
  const t = [...nums].sort((a, b) => a - b);
  const m = Math.floor(t.length / 2);
  return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2;
}

/** Génère les analyses automatiques (insights) sur le mois de référence. */
export function genererInsights(d: DonneesInsights, moisRef: string): Insight[] {
  const insights: Insight[] = [];
  const prev3 = [1, 2, 3].map((i) => moisAvant(moisRef, i));

  // --- 1. Variations par catégorie (mois vs moyenne des 3 précédents) ---
  const sommeCatMois = (cat: number | null, mois: string) =>
    d.transactions
      .filter((t) => t.type === "depense" && t.categorie_id === cat && t.date.startsWith(mois))
      .reduce((a, t) => a + t.montant, 0);

  type Varc = { cat: number; nom: string; cur: number; moy: number; delta: number };
  const variations: Varc[] = [];
  for (const c of d.categories.filter((x) => x.type === "depense")) {
    const cur = sommeCatMois(c.id, moisRef);
    const moy = prev3.reduce((a, m) => a + sommeCatMois(c.id, m), 0) / 3;
    if (moy < 5 && cur < 5) continue;
    variations.push({ cat: c.id, nom: c.nom, cur, moy, delta: cur - moy });
  }
  // Hausses marquées
  variations
    .filter((v) => v.moy > 0 && v.cur > v.moy * 1.25 && v.delta >= 20)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 2)
    .forEach((v) =>
      insights.push({
        id: `hausse-cat-${v.cat}`,
        niveau: "attention",
        icon: "trending-up",
        titre: `${v.nom} en hausse (+${pct(v.cur, v.moy)} %)`,
        detail: `${formatMontant(v.cur)} ce mois-ci contre ${formatMontant(v.moy)} en moyenne sur 3 mois.`,
      })
    );
  // Belle baisse
  variations
    .filter((v) => v.moy >= 30 && v.cur < v.moy * 0.6)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 1)
    .forEach((v) =>
      insights.push({
        id: `baisse-cat-${v.cat}`,
        niveau: "positif",
        icon: "trending-down",
        titre: `${v.nom} en baisse (${pct(v.cur, v.moy)} %)`,
        detail: `${formatMontant(v.cur)} ce mois-ci contre ${formatMontant(v.moy)} habituellement. Beau contrôle !`,
      })
    );

  // --- 2. Dépense inhabituelle (vs médiane de la catégorie sur 4 mois) ---
  const fenetre4 = [moisRef, ...[1, 2, 3].map((i) => moisAvant(moisRef, i))];
  for (const c of d.categories.filter((x) => x.type === "depense")) {
    const histo = d.transactions.filter(
      (t) => t.type === "depense" && t.categorie_id === c.id && fenetre4.some((m) => t.date.startsWith(m))
    );
    if (histo.length < 4) continue;
    const med = mediane(histo.map((t) => t.montant));
    if (med < 10) continue;
    const gros = d.transactions
      .filter((t) => t.type === "depense" && t.categorie_id === c.id && t.date.startsWith(moisRef))
      .filter((t) => t.montant > med * 3 && t.montant >= 60)
      .sort((a, b) => b.montant - a.montant)[0];
    if (gros) {
      insights.push({
        id: `inhabituelle-${gros.id}`,
        niveau: "attention",
        icon: "alert",
        titre: `Dépense inhabituelle en ${c.nom}`,
        detail: `${formatMontant(gros.montant)}${gros.description ? ` (${gros.description})` : ""} — bien au-dessus de ton habitude (${formatMontant(med)}).`,
        lien: { label: "Voir", to: "/transactions" },
      });
    }
  }

  // --- 3. Hausse d'un abonnement / dépense récurrente (même libellé, >=3 fois) ---
  const parLib = new Map<string, Transaction[]>();
  for (const t of d.transactions) {
    if (t.type !== "depense") continue;
    const lib = normaliserLibelle(t.description);
    if (!lib) continue;
    const arr = parLib.get(lib) ?? [];
    arr.push(t);
    parLib.set(lib, arr);
  }
  for (const [lib, txs] of parLib) {
    if (txs.length < 3) continue;
    const parDate = [...txs].sort((a, b) => a.date.localeCompare(b.date));
    const ancien = parDate[0].montant;
    const recent = parDate[parDate.length - 1].montant;
    if (ancien > 0 && recent > ancien * 1.1 && recent - ancien >= 2) {
      insights.push({
        id: `hausse-abo-${lib}`,
        niveau: "attention",
        icon: "repeat",
        titre: `Hausse détectée : ${parDate[parDate.length - 1].description}`,
        detail: `Ce prélèvement est passé de ${formatMontant(ancien)} à ${formatMontant(recent)}.`,
      });
    }
  }

  // --- 4. Doublons potentiels ce mois (même compte, date, montant) ---
  const cle = new Map<string, Transaction[]>();
  for (const t of d.transactions) {
    if (t.type !== "depense" || !t.date.startsWith(moisRef)) continue;
    const k = `${t.compte_id}|${t.date}|${t.montant.toFixed(2)}`;
    const arr = cle.get(k) ?? [];
    arr.push(t);
    cle.set(k, arr);
  }
  for (const [, group] of cle) {
    if (group.length >= 2) {
      insights.push({
        id: `doublon-${group[0].id}`,
        niveau: "info",
        icon: "alert",
        titre: "Doublon possible",
        detail: `${group.length} dépenses identiques de ${formatMontant(group[0].montant)} le ${group[0].date.slice(8)}/${group[0].date.slice(5, 7)}. Vérifie si ce n'est pas une double saisie.`,
        lien: { label: "Vérifier", to: "/transactions" },
      });
    }
  }

  // --- 5. Charges récurrentes détectées à valider ---
  const traitees = new Set(d.suggestions.filter((s) => s.statut !== "proposee").map((s) => s.signature));
  const nbSug = detecterRecurrences(d.transactions, d.echeances, traitees).length;
  if (nbSug > 0) {
    insights.push({
      id: "suggestions",
      niveau: "info",
      icon: "sparkles",
      titre: `${nbSug} charge${nbSug > 1 ? "s" : ""} récurrente${nbSug > 1 ? "s" : ""} détectée${nbSug > 1 ? "s" : ""}`,
      detail: "L'app a repéré des dépenses qui reviennent chaque mois. Tu peux les transformer en charges fixes.",
      lien: { label: "Voir les suggestions", to: "/suggestions" },
    });
  }

  // --- 6. Budgets dépassés ---
  const depasses = statutsBudgets(d.budgets, d.categories, d.transactions, moisRef).filter((s) => s.etat === "depasse");
  if (depasses.length > 0) {
    insights.push({
      id: "budgets-depasses",
      niveau: "alerte",
      icon: "coins",
      titre: `${depasses.length} budget${depasses.length > 1 ? "s" : ""} dépassé${depasses.length > 1 ? "s" : ""}`,
      detail: depasses.map((s) => `${s.nom} (${formatMontant(s.depense)}/${formatMontant(s.plafond)})`).join(", ") + ".",
      lien: { label: "Voir les budgets", to: "/budgets" },
    });
  }

  // --- 7. Projection de fin de mois négative ---
  const proj = projeterFinDeMois(d.comptes, d.transactions, d.chargesFixes, d.echeances, moisRef);
  const soldeProjete = proj.reduce((a, p) => a + p.soldeProjete, 0);
  if (proj.length > 0 && soldeProjete < 0) {
    insights.push({
      id: "projection-negative",
      niveau: "alerte",
      icon: "trending-down",
      titre: "Fin de mois tendue",
      detail: `Ton solde global projeté en fin de mois est estimé à ${formatMontant(soldeProjete)}. Prudence sur les dépenses.`,
      lien: { label: "Voir les prévisions", to: "/previsions" },
    });
  }

  // --- 8. Taux d'épargne du mois ---
  const t = totauxMois(d.transactions, moisRef);
  if (t.revenus > 0) {
    const taux = Math.round((t.solde / t.revenus) * 100);
    if (taux >= 15) {
      insights.push({
        id: "epargne-ok",
        niveau: "positif",
        icon: "check",
        titre: `Taux d'épargne de ${taux} % ce mois`,
        detail: `Tu as mis de côté ${formatMontant(t.solde)} sur ${formatMontant(t.revenus)} de revenus. Continue comme ça !`,
      });
    } else if (taux < 0) {
      insights.push({
        id: "epargne-negative",
        niveau: "attention",
        icon: "alert",
        titre: "Tu dépenses plus que tes revenus ce mois",
        detail: `Dépenses (${formatMontant(t.depenses)}) supérieures aux revenus (${formatMontant(t.revenus)}).`,
      });
    }
  }

  // Priorité d'affichage : alerte > attention > info > positif
  const ordre: Record<NiveauInsight, number> = { alerte: 0, attention: 1, info: 2, positif: 3 };
  return insights.sort((a, b) => ordre[a.niveau] - ordre[b.niveau]);
}
