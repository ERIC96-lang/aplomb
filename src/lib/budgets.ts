import type { Budget, Categorie, Transaction } from "../db/types";

export type BudgetEtat = "ok" | "attention" | "depasse";

export interface BudgetStatut {
  categorie_id: number;
  nom: string;
  couleur: string;
  plafond: number;
  depense: number;
  reste: number;
  ratio: number; // depense / plafond
  etat: BudgetEtat;
}

const SEUIL_ATTENTION = 0.8; // 80 %

/**
 * Statut de chaque budget pour un mois donné : dépensé (dépenses de la
 * catégorie sur le mois, virements exclus par nature) vs plafond.
 */
export function statutsBudgets(
  budgets: Budget[],
  categories: Categorie[],
  transactions: Transaction[],
  mois: string
): BudgetStatut[] {
  const catById = new Map(categories.map((c) => [c.id, c]));

  // Dépenses du mois par catégorie.
  const depenseParCat = new Map<number, number>();
  for (const t of transactions) {
    if (t.type !== "depense") continue;
    if (!t.date.startsWith(mois)) continue;
    if (t.categorie_id == null) continue;
    depenseParCat.set(t.categorie_id, (depenseParCat.get(t.categorie_id) ?? 0) + t.montant);
  }

  return budgets
    .map((b) => {
      const cat = catById.get(b.categorie_id);
      const depense = depenseParCat.get(b.categorie_id) ?? 0;
      const plafond = b.montant_plafond;
      const ratio = plafond > 0 ? depense / plafond : 0;
      const etat: BudgetEtat =
        ratio >= 1 ? "depasse" : ratio >= SEUIL_ATTENTION ? "attention" : "ok";
      return {
        categorie_id: b.categorie_id,
        nom: cat?.nom ?? "Catégorie",
        couleur: cat?.couleur ?? "#94a3b8",
        plafond,
        depense,
        reste: plafond - depense,
        ratio,
        etat,
      };
    })
    .sort((a, b) => b.ratio - a.ratio);
}
