import type { Categorie, Compte, Transaction } from "../db/types";

/**
 * Solde d'un compte = solde initial
 *   + revenus reçus sur ce compte
 *   - dépenses faites depuis ce compte
 *   - virements sortants (compte source)
 *   + virements entrants (compte destination)
 *
 * NB : les virements NE comptent PAS comme revenu/dépense — ce sont de simples
 * mouvements entre comptes. Ils n'agissent que sur les soldes des comptes.
 */
export function soldeCompte(compteId: number, transactions: Transaction[]): number {
  let solde = 0;
  for (const t of transactions) {
    if (t.type === "revenu" && t.compte_id === compteId) solde += t.montant;
    else if (t.type === "depense" && t.compte_id === compteId) solde -= t.montant;
    else if (t.type === "virement") {
      if (t.compte_id === compteId) solde -= t.montant; // sortant
      if (t.compte_dest_id === compteId) solde += t.montant; // entrant
    }
  }
  return solde;
}

export function soldeCompteAvecInitial(
  compte: Compte,
  transactions: Transaction[]
): number {
  return compte.solde_initial + soldeCompte(compte.id, transactions);
}

export function soldeGlobal(comptes: Compte[], transactions: Transaction[]): number {
  return comptes.reduce(
    (acc, c) => acc + soldeCompteAvecInitial(c, transactions),
    0
  );
}

/** Filtre : transaction dans le mois 'YYYY-MM'. */
export function estDansMois(t: Transaction, mois: string): boolean {
  return t.date.startsWith(mois);
}

export interface Totaux {
  revenus: number;
  depenses: number;
  solde: number; // revenus - depenses (reste à vivre du mois)
}

/**
 * Totaux revenus / dépenses sur un mois donné, éventuellement filtrés sur un
 * compte. Les VIREMENTS sont toujours exclus.
 */
export function totauxMois(
  transactions: Transaction[],
  mois: string,
  compteId?: number
): Totaux {
  let revenus = 0;
  let depenses = 0;
  for (const t of transactions) {
    if (t.type === "virement") continue; // jamais compté
    if (!estDansMois(t, mois)) continue;
    if (compteId !== undefined && t.compte_id !== compteId) continue;
    if (t.type === "revenu") revenus += t.montant;
    else if (t.type === "depense") depenses += t.montant;
  }
  return { revenus, depenses, solde: revenus - depenses };
}

export interface PartCategorie {
  categorie_id: number | null;
  nom: string;
  couleur: string;
  montant: number;
}

/** Répartition des dépenses du mois par catégorie (virements exclus). */
export function repartitionDepenses(
  transactions: Transaction[],
  categories: Categorie[],
  mois: string,
  compteId?: number
): PartCategorie[] {
  const parCat = new Map<number | null, number>();
  for (const t of transactions) {
    if (t.type !== "depense") continue;
    if (!estDansMois(t, mois)) continue;
    if (compteId !== undefined && t.compte_id !== compteId) continue;
    parCat.set(t.categorie_id, (parCat.get(t.categorie_id) ?? 0) + t.montant);
  }
  const byId = new Map(categories.map((c) => [c.id, c]));
  const res: PartCategorie[] = [];
  for (const [catId, montant] of parCat) {
    const cat = catId != null ? byId.get(catId) : undefined;
    res.push({
      categorie_id: catId,
      nom: cat?.nom ?? "Sans catégorie",
      couleur: cat?.couleur ?? "#94a3b8",
      montant,
    });
  }
  return res.sort((a, b) => b.montant - a.montant);
}

/** Liste triée des mois 'YYYY-MM' présents dans l'historique (récent -> ancien). */
export function moisDisponibles(transactions: Transaction[]): string[] {
  const set = new Set<string>();
  for (const t of transactions) set.add(t.date.slice(0, 7));
  return Array.from(set).sort().reverse();
}
