import type {
  CandidatRecurrence,
  Echeance,
  Transaction,
} from "../db/types";

const TOLERANCE_MONTANT = 0.08; // ± 8 %
const TOLERANCE_JOUR = 4; // ± 4 jours
const MIN_MOIS = 3; // au moins 3 mois distincts

interface Cluster {
  txs: Transaction[];
}

function jourDuMois(iso: string): number {
  return Number(iso.slice(8, 10));
}

function moyenne(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * Détecte des candidats de charge récurrente parmi les dépenses qui ne sont
 * PAS déjà rattachées à une charge fixe.
 *
 * Regroupe, catégorie par catégorie, les dépenses de montant proche (± 8 %) et
 * de jour du mois proche (± 4 j) apparues sur au moins 3 mois distincts.
 * Ne crée jamais rien automatiquement : renvoie des candidats à valider.
 *
 * `signaturesTraitees` = signatures déjà acceptées ou ignorées (à masquer).
 */
export function detecterRecurrences(
  transactions: Transaction[],
  echeances: Echeance[],
  signaturesTraitees: Set<string>
): CandidatRecurrence[] {
  const txLiees = new Set<number>();
  for (const e of echeances) {
    if (e.transaction_id != null) txLiees.add(e.transaction_id);
  }

  const depenses = transactions.filter(
    (t) => t.type === "depense" && !txLiees.has(t.id)
  );

  // Groupement par catégorie.
  const parCat = new Map<number | null, Transaction[]>();
  for (const t of depenses) {
    const arr = parCat.get(t.categorie_id) ?? [];
    arr.push(t);
    parCat.set(t.categorie_id, arr);
  }

  const candidats: CandidatRecurrence[] = [];

  for (const [catId, txs] of parCat) {
    // Clustering glouton par montant puis jour.
    const tri = [...txs].sort((a, b) => a.montant - b.montant);
    const clusters: Cluster[] = [];

    for (const t of tri) {
      let place = false;
      for (const c of clusters) {
        const mMontant = moyenne(c.txs.map((x) => x.montant));
        const mJour = moyenne(c.txs.map((x) => jourDuMois(x.date)));
        const okMontant =
          Math.abs(t.montant - mMontant) <= mMontant * TOLERANCE_MONTANT;
        const okJour =
          Math.abs(jourDuMois(t.date) - mJour) <= TOLERANCE_JOUR;
        if (okMontant && okJour) {
          c.txs.push(t);
          place = true;
          break;
        }
      }
      if (!place) clusters.push({ txs: [t] });
    }

    for (const c of clusters) {
      const moisDistincts = new Set(c.txs.map((t) => t.date.slice(0, 7)));
      if (moisDistincts.size < MIN_MOIS) continue;

      const montant_moyen = Math.round(moyenne(c.txs.map((t) => t.montant)) * 100) / 100;
      const jour_moyen = Math.round(moyenne(c.txs.map((t) => jourDuMois(t.date))));
      const bucketMontant = Math.round(montant_moyen / 5) * 5; // stabilise la signature
      const signature = `${catId}|${bucketMontant}|${jour_moyen}`;
      if (signaturesTraitees.has(signature)) continue;

      // Libellé : description la plus fréquente, sinon générique.
      const libelle = descriptionDominante(c.txs) ?? "Dépense récurrente";

      candidats.push({
        signature,
        categorie_id: catId,
        libelle,
        montant_moyen,
        jour_moyen,
        nb_occurrences: c.txs.length,
        transaction_ids: c.txs.map((t) => t.id),
        mois: Array.from(moisDistincts).sort(),
      });
    }
  }

  // Les plus « fiables » d'abord (plus d'occurrences, montant plus élevé).
  return candidats.sort(
    (a, b) =>
      b.nb_occurrences - a.nb_occurrences || b.montant_moyen - a.montant_moyen
  );
}

function descriptionDominante(txs: Transaction[]): string | null {
  const compte = new Map<string, number>();
  for (const t of txs) {
    const d = (t.description ?? "").trim().toLowerCase();
    if (!d) continue;
    compte.set(d, (compte.get(d) ?? 0) + 1);
  }
  let best: string | null = null;
  let max = 0;
  for (const [d, n] of compte) {
    if (n > max) {
      max = n;
      // Récupère la casse d'origine.
      best = txs.find((t) => (t.description ?? "").trim().toLowerCase() === d)
        ?.description ?? d;
    }
  }
  return best;
}
