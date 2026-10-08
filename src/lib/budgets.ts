import type { Budget, Categorie, Compte, Transaction } from "../db/types";

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
  /**
   * Budget d'épargne : c'est un OBJECTIF mensuel (montant à mettre de côté), pas
   * un plafond. `depense` y désigne le montant épargné ; l'état reste « ok »
   * (jamais d'alerte), et il est exclu des totaux de dépenses.
   */
  epargne: boolean;
}

const SEUIL_ATTENTION = 0.8; // 80 %

/** La catégorie « Épargne » (insensible aux accents et à la casse). */
export function estCategorieEpargne(nom: string | null | undefined): boolean {
  return (nom ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .includes("epargne");
}

/**
 * Montant épargné sur le mois : virements nets vers les comptes de type
 * « épargne » (retraits déduits ; un virement entre deux comptes épargne est
 * neutre) + dépenses explicitement classées dans la catégorie Épargne.
 */
export function epargneDuMois(
  transactions: Transaction[],
  comptes: Compte[],
  mois: string,
  categorieEpargneId: number | null
): number {
  const epargne = new Set(comptes.filter((c) => c.type === "epargne").map((c) => c.id));
  let total = 0;
  for (const t of transactions) {
    if (!t.date.startsWith(mois)) continue;
    if (t.type === "virement") {
      const versLe = t.compte_dest_id != null && epargne.has(t.compte_dest_id);
      const depuisLe = t.compte_id != null && epargne.has(t.compte_id);
      if (versLe && !depuisLe) total += t.montant;
      else if (depuisLe && !versLe) total -= t.montant;
    } else if (t.type === "depense" && categorieEpargneId != null && t.categorie_id === categorieEpargneId) {
      total += t.montant;
    }
  }
  return total;
}

/**
 * Statut de chaque budget pour un mois donné : dépensé (dépenses de la
 * catégorie sur le mois, virements exclus par nature) vs plafond. Le budget de
 * la catégorie Épargne est un objectif mensuel (voir `epargneDuMois`) : il a
 * besoin des comptes pour reconnaître les virements vers l'épargne.
 */
export function statutsBudgets(
  budgets: Budget[],
  categories: Categorie[],
  transactions: Transaction[],
  mois: string,
  comptes: Compte[] = []
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
      const epargne = estCategorieEpargne(cat?.nom);
      // Arrondi au centime : d'anciennes conversions de devise ont laissé des reliquats (150,000107).
      const plafond = Math.round(b.montant_plafond * 100) / 100;
      const depense = epargne
        ? Math.max(0, epargneDuMois(transactions, comptes, mois, b.categorie_id))
        : depenseParCat.get(b.categorie_id) ?? 0;
      const ratio = plafond > 0 ? depense / plafond : 0;
      const etat: BudgetEtat = epargne
        ? "ok"
        : ratio >= 1
          ? "depasse"
          : ratio >= SEUIL_ATTENTION
            ? "attention"
            : "ok";
      return {
        categorie_id: b.categorie_id,
        nom: cat?.nom ?? "Catégorie",
        couleur: cat?.couleur ?? "#94a3b8",
        plafond,
        depense,
        reste: plafond - depense,
        ratio,
        etat,
        epargne,
      };
    })
    .sort((a, b) => Number(a.epargne) - Number(b.epargne) || b.ratio - a.ratio);
}
