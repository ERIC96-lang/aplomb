import { useMemo, useState } from "react";
import { useAppData } from "../state/AppDataContext";
import { useToast } from "../state/ToastContext";
import { Icon } from "../components/Icon";
import { detecterRecurrences } from "../lib/recurrence";
import {
  creerChargeFixe,
  enregistrerDecisionSuggestion,
} from "../db/repo";
import { formatMois, formatMontant } from "../lib/format";
import type { CandidatRecurrence } from "../db/types";

export function Suggestions() {
  const { transactions, echeances, suggestions, categories, comptes, rafraichir } =
    useAppData();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const catNom = useMemo(() => new Map(categories.map((c) => [c.id, c.nom])), [categories]);
  const compteNom = useMemo(() => new Map(comptes.map((c) => [c.id, c.nom])), [comptes]);

  const traitees = useMemo(
    () => new Set(suggestions.filter((s) => s.statut !== "proposee").map((s) => s.signature)),
    [suggestions]
  );

  const candidats = useMemo(
    () => detecterRecurrences(transactions, echeances, traitees),
    [transactions, echeances, traitees]
  );

  // Compte dominant parmi les transactions d'un candidat.
  function compteDominant(c: CandidatRecurrence): number | null {
    const cpt = new Map<number, number>();
    for (const id of c.transaction_ids) {
      const t = transactions.find((x) => x.id === id);
      if (t?.compte_id != null) cpt.set(t.compte_id, (cpt.get(t.compte_id) ?? 0) + 1);
    }
    let best: number | null = null;
    let max = 0;
    for (const [k, v] of cpt) if (v > max) ((max = v), (best = k));
    return best;
  }

  async function accepter(c: CandidatRecurrence) {
    const compteId = compteDominant(c) ?? comptes[0]?.id;
    if (!compteId) {
      toast("Crée d'abord un compte");
      return;
    }
    setBusy(c.signature);
    await creerChargeFixe({
      nom: c.libelle,
      montant_attendu: c.montant_moyen,
      compte_id: compteId,
      categorie_id: c.categorie_id,
      jour_echeance: c.jour_moyen,
      actif: 1,
      periodicite: "mensuelle",
    });
    await enregistrerDecisionSuggestion({
      signature: c.signature,
      categorie_id: c.categorie_id,
      libelle: c.libelle,
      montant_moyen: c.montant_moyen,
      jour_moyen: c.jour_moyen,
      nb_occurrences: c.nb_occurrences,
      transaction_ids: c.transaction_ids,
      statut: "acceptee",
    });
    await rafraichir();
    setBusy(null);
    toast(`« ${c.libelle} » ajoutée aux charges fixes`);
  }

  async function ignorer(c: CandidatRecurrence) {
    setBusy(c.signature);
    await enregistrerDecisionSuggestion({
      signature: c.signature,
      categorie_id: c.categorie_id,
      libelle: c.libelle,
      montant_moyen: c.montant_moyen,
      jour_moyen: c.jour_moyen,
      nb_occurrences: c.nb_occurrences,
      transaction_ids: c.transaction_ids,
      statut: "ignoree",
    });
    await rafraichir();
    setBusy(null);
    toast("Suggestion ignorée");
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Suggestions de charges récurrentes</h1>
          <div className="sub">
            Détectées automatiquement à partir de ton historique — rien n'est créé sans ta validation
          </div>
        </div>
      </div>

      {candidats.length === 0 ? (
        <div className="card empty">
          <div className="big">
            <Icon name="sparkles" size={44} strokeWidth={1.5} />
          </div>
          <p>
            Aucune suggestion pour le moment. Ressaisis quelques mois d'historique :
            l'app repérera les dépenses qui reviennent chaque mois (même catégorie,
            montant et jour proches, sur au moins 3 mois).
          </p>
        </div>
      ) : (
        <div className="grid grid-auto">
          {candidats.map((c) => {
            const compteId = compteDominant(c);
            return (
              <div className="card" key={c.signature}>
                <div className="flex-between">
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{c.libelle}</div>
                  <span className="chip" style={{ background: "#eef2ff", color: "#4f46e5" }}>
                    {c.nb_occurrences}× détectée
                  </span>
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, margin: "12px 0 4px" }}>
                  ≈ {formatMontant(c.montant_moyen)}
                </div>
                <div className="muted" style={{ fontSize: 13 }}>
                  vers le {c.jour_moyen} du mois
                  {c.categorie_id != null && ` · ${catNom.get(c.categorie_id) ?? ""}`}
                  {compteId != null && ` · ${compteNom.get(compteId) ?? ""}`}
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                  Mois : {c.mois.map((m) => formatMois(m)).join(", ")}
                </div>
                <div className="flex" style={{ marginTop: 16 }}>
                  <button
                    className="btn primary sm"
                    disabled={busy === c.signature}
                    onClick={() => accepter(c)}
                  >
                    <Icon name="check" size={15} /> Créer la charge fixe
                  </button>
                  <button
                    className="btn sm"
                    disabled={busy === c.signature}
                    onClick={() => ignorer(c)}
                  >
                    Ignorer
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
