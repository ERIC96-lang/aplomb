import { Bandeau, Carte, Rangee, Vide } from "../components/ui/Page";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { useMemo, useState } from "react";
import { useAppData } from "../state/AppDataContext";
import { useToast } from "../state/ToastContext";
import { Icon } from "../components/Icon";
import { detecterRecurrences } from "../lib/recurrence";
import {
  creerChargeFixe,
  enregistrerDecisionSuggestion,
} from "../db/repo";
import { formatMontant } from "../lib/format";
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
        <Carte>
          <Vide
            ico="sparkles"
            titre="Aucune suggestion pour le moment"
            texte="Ressaisis quelques mois d'historique : l'app repérera les dépenses qui reviennent chaque mois (même catégorie, montant et jour proches, sur au moins 3 mois)."
          />
        </Carte>
      ) : (
        <>
          <Bandeau
            surtitre="Charges récurrentes détectées"
            valeur={
              <>
                {candidats.length} <span className="pg-unite">à valider</span>
              </>
            }
            humeur="attention"
            statut="Rien n'est créé sans toi"
            phrase={
              <>
                ≈ <strong className="num">{formatMontant(candidats.reduce((a, c) => a + c.montant_moyen, 0))}</strong> par mois
                si tu les ajoutes toutes à tes charges fixes
              </>
            }
          />
          <Rangee type="tiers">
            {candidats.map((c) => {
              const compteId = compteDominant(c);
              return (
                <section className="card pg-suggestion" key={c.signature}>
                  <div className="pg-compte-tete">
                    <span className="pg-compte-ico" style={{ color: "var(--amber)" }}>
                      <Icon name="repeat" size={18} />
                    </span>
                    <div>
                      <div className="pg-compte-nom">{c.libelle}</div>
                      <div className="dim pg-compte-type">
                        {c.categorie_id != null ? catNom.get(c.categorie_id) ?? "Sans catégorie" : "Sans catégorie"}
                      </div>
                    </div>
                    <span className="chip etat-info">{c.nb_occurrences}×</span>
                  </div>
                  <div className="pg-compte-solde num">≈ {formatMontant(c.montant_moyen)}</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    vers le {c.jour_moyen} du mois{compteId != null && ` · ${compteNom.get(compteId) ?? ""}`}
                  </div>
                  <div className="pg-mois-detectes">
                    {c.mois.map((m) => (
                      <span key={m}>{format(parseISO(`${m}-01`), "MMM yy", { locale: fr })}</span>
                    ))}
                  </div>
                  <div className="flex pg-suggestion-actions">
                    <button className="btn primary sm" disabled={busy === c.signature} onClick={() => accepter(c)}>
                      <Icon name="check" size={15} /> Créer la charge fixe
                    </button>
                    <button className="btn sm ghost" disabled={busy === c.signature} onClick={() => ignorer(c)}>
                      Ignorer
                    </button>
                  </div>
                </section>
              );
            })}
          </Rangee>
        </>
      )}
    </>
  );
}
