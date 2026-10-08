import { addMonths, format, parseISO } from "date-fns";
import type { ChargeFixe, Echeance, Transaction } from "../db/types";
import { soldeCompteAvecInitial } from "./calculs";
import { estReglee } from "./statutEcheance";
import type { Compte } from "../db/types";

export interface ProjectionCompte {
  compte_id: number;
  soldeActuel: number;
  chargesRestantes: number;
  depensesVariablesEstimees: number;
  soldeProjete: number;
}

function moisPrecedents(mois: string, n: number): string[] {
  const base = parseISO(`${mois}-01`);
  const res: string[] = [];
  for (let i = 1; i <= n; i++) {
    res.push(format(addMonths(base, -i), "yyyy-MM"));
  }
  return res;
}

/**
 * Projette le solde de fin de mois pour chaque compte :
 *   solde actuel
 *   - charges fixes du mois pas encore réglées (sur ce compte)
 *   - estimation des dépenses variables restantes
 *       (moyenne des 3 derniers mois par catégorie, moins ce qui a déjà été
 *        dépensé ce mois-ci en variable)
 */
export function projeterFinDeMois(
  comptes: Compte[],
  transactions: Transaction[],
  chargesFixes: ChargeFixe[],
  echeances: Echeance[],
  mois: string
): ProjectionCompte[] {
  const trois = moisPrecedents(mois, 3);

  // Ensemble des transactions déjà rattachées à une charge fixe (= non variables).
  const txLiees = new Set<number>();
  for (const e of echeances) {
    if (e.transaction_id != null) txLiees.add(e.transaction_id);
  }

  // Échéances du mois courant, indexées par charge fixe.
  const echeancesMois = new Map<number, Echeance>();
  for (const e of echeances) {
    if (e.mois === mois) echeancesMois.set(e.charge_fixe_id, e);
  }

  return comptes.map((compte) => {
    const soldeActuel = soldeCompteAvecInitial(compte, transactions);

    // Charges fixes restantes : actives, sur ce compte, dont l'échéance du mois
    // n'est pas encore payée.
    let chargesRestantes = 0;
    for (const cf of chargesFixes) {
      if (cf.actif !== 1 || cf.compte_id !== compte.id) continue;
      const ech = echeancesMois.get(cf.id);
      if (!ech || !estReglee(ech.statut)) chargesRestantes += cf.montant_attendu;
    }

    // Dépenses variables : moyenne par catégorie sur 3 mois.
    const totalParCatMois = new Map<string, number>(); // clé: `${cat}|${mois}`
    const dejaMoisCat = new Map<number | null, number>();
    for (const t of transactions) {
      if (t.type !== "depense" || t.compte_id !== compte.id) continue;
      if (txLiees.has(t.id)) continue; // exclut les charges fixes
      const m = t.date.slice(0, 7);
      if (trois.includes(m)) {
        const k = `${t.categorie_id}|${m}`;
        totalParCatMois.set(k, (totalParCatMois.get(k) ?? 0) + t.montant);
      } else if (m === mois) {
        dejaMoisCat.set(
          t.categorie_id,
          (dejaMoisCat.get(t.categorie_id) ?? 0) + t.montant
        );
      }
    }

    // Moyenne mensuelle par catégorie sur la fenêtre de 3 mois.
    const moyenneParCat = new Map<number | null, number>();
    for (const [k, v] of totalParCatMois) {
      const cat = k.split("|")[0];
      const catKey = cat === "null" ? null : Number(cat);
      moyenneParCat.set(catKey, (moyenneParCat.get(catKey) ?? 0) + v / 3);
    }

    let depensesVariablesEstimees = 0;
    const cats = new Set<number | null>([
      ...moyenneParCat.keys(),
      ...dejaMoisCat.keys(),
    ]);
    for (const cat of cats) {
      const moyenne = moyenneParCat.get(cat) ?? 0;
      const deja = dejaMoisCat.get(cat) ?? 0;
      depensesVariablesEstimees += Math.max(0, moyenne - deja);
    }

    return {
      compte_id: compte.id,
      soldeActuel,
      chargesRestantes,
      depensesVariablesEstimees,
      soldeProjete: soldeActuel - chargesRestantes - depensesVariablesEstimees,
    };
  });
}
