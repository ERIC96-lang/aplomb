import { useMemo, useState } from "react";
import { useAppData } from "../state/AppDataContext";
import { useToast } from "../state/ToastContext";
import { Icon } from "../components/Icon";
import { creerTransaction, majEcheance } from "../db/repo";
import { dateEcheance, statutPaye } from "../lib/echeances";
import { grouperParMois, prochainesOccurrences } from "../lib/echeancier";
import { formatDate, formatMois, formatMontant, moisCourant, aujourdhui } from "../lib/format";
import type { ChargeFixe, Echeance } from "../db/types";

const LIB_PERIODE: Record<string, string> = {
  mensuelle: "Mensuelle",
  hebdomadaire: "Hebdo",
  trimestrielle: "Trimestrielle",
  annuelle: "Annuelle",
};

export function Echeancier() {
  const { chargesFixes, echeances, comptes, rafraichir } = useAppData();
  const toast = useToast();
  const [horizon, setHorizon] = useState(6);

  const compteNom = useMemo(() => new Map(comptes.map((c) => [c.id, c.nom])), [comptes]);
  const chargeById = useMemo(() => new Map(chargesFixes.map((c) => [c.id, c])), [chargesFixes]);

  // À générer : échéances mensuelles du mois courant, échues, sans transaction.
  const mois = moisCourant();
  const aGenerer = useMemo(() => {
    const auj = aujourdhui();
    return echeances
      .filter((e) => e.mois === mois && e.transaction_id == null)
      .map((e) => ({ e, charge: chargeById.get(e.charge_fixe_id) }))
      .filter((x): x is { e: Echeance; charge: ChargeFixe } => !!x.charge)
      .filter(({ charge }) => dateEcheance(mois, charge.jour_echeance) <= new Date(auj + "T23:59:59"));
  }, [echeances, mois, chargeById]);

  const occurrences = useMemo(
    () => prochainesOccurrences(chargesFixes, horizon),
    [chargesFixes, horizon]
  );
  const parMois = useMemo(() => grouperParMois(occurrences), [occurrences]);
  const totalPrev = occurrences.reduce((a, o) => a + o.charge.montant_attendu, 0);

  async function generer(charge: ChargeFixe, e: Echeance) {
    const txId = await creerTransaction({
      type: "depense",
      montant: charge.montant_attendu,
      date: `${e.mois}-${String(Math.min(charge.jour_echeance, 28)).padStart(2, "0")}`,
      description: charge.nom,
      compte_id: charge.compte_id,
      compte_dest_id: null,
      categorie_id: charge.categorie_id,
    });
    await majEcheance(e.id, { transaction_id: txId, statut: statutPaye(e.justificatif_path) });
    await rafraichir();
    toast(`Transaction générée pour ${charge.nom}`);
  }

  async function toutGenerer() {
    for (const { e, charge } of aGenerer) {
      const txId = await creerTransaction({
        type: "depense",
        montant: charge.montant_attendu,
        date: `${e.mois}-${String(Math.min(charge.jour_echeance, 28)).padStart(2, "0")}`,
        description: charge.nom,
        compte_id: charge.compte_id,
        compte_dest_id: null,
        categorie_id: charge.categorie_id,
      });
      await majEcheance(e.id, { transaction_id: txId, statut: statutPaye(e.justificatif_path) });
    }
    await rafraichir();
    toast("Transactions générées");
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Échéancier prévisionnel</h1>
          <div className="sub">Sorties d'argent à venir et génération des transactions dues</div>
        </div>
        <div className="segmented">
          {[3, 6, 12].map((h) => (
            <button key={h} className={horizon === h ? "active" : ""} onClick={() => setHorizon(h)}>
              {h} mois
            </button>
          ))}
        </div>
      </div>

      {/* À générer */}
      {aGenerer.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="flex-between" style={{ marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>À générer maintenant ({aGenerer.length})</h2>
            <button className="btn sm primary" onClick={toutGenerer}>
              <Icon name="check" size={14} /> Tout générer
            </button>
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: -4 }}>
            Charges mensuelles échues ce mois-ci sans transaction saisie — l'app peut créer la transaction pour toi.
          </p>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Charge</th><th>Date</th><th>Compte</th><th className="right">Montant</th><th className="right"></th></tr>
              </thead>
              <tbody>
                {aGenerer.map(({ e, charge }) => (
                  <tr key={e.id}>
                    <td style={{ fontWeight: 600 }}>{charge.nom}</td>
                    <td>{formatDate(dateEcheance(e.mois, charge.jour_echeance).toISOString().slice(0, 10))}</td>
                    <td>{compteNom.get(charge.compte_id) ?? "—"}</td>
                    <td className="right num">{formatMontant(charge.montant_attendu)}</td>
                    <td className="right">
                      <button className="btn sm primary" onClick={() => generer(charge, e)}>Générer</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Prévisionnel */}
      <div className="card">
        <div className="flex-between" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Prévisionnel {horizon} mois</h2>
          <span className="num muted">Total : <strong style={{ color: "var(--text)" }}>{formatMontant(totalPrev)}</strong></span>
        </div>
        {occurrences.length === 0 ? (
          <div className="empty">
            <div className="big"><Icon name="calendar" size={44} strokeWidth={1.5} /></div>
            <p>Aucune charge fixe active à prévoir. Ajoute des charges (avec leur périodicité) pour voir tes sorties à venir.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {Array.from(parMois.entries()).map(([m, occs]) => {
              const totalMois = occs.reduce((a, o) => a + o.charge.montant_attendu, 0);
              return (
                <div key={m}>
                  <div className="flex-between" style={{ marginBottom: 8 }}>
                    <span style={{ fontWeight: 700, textTransform: "capitalize" }}>{formatMois(m)}</span>
                    <span className="num" style={{ fontWeight: 700 }}>{formatMontant(totalMois)}</span>
                  </div>
                  <div className="table-wrap">
                    <table className="data">
                      <tbody>
                        {occs.map((o, i) => (
                          <tr key={i}>
                            <td style={{ width: 90 }}>{formatDate(o.date)}</td>
                            <td style={{ fontWeight: 600 }}>{o.charge.nom}</td>
                            <td><span className="chip" style={{ background: "var(--surface-2)" }}>{LIB_PERIODE[o.charge.periodicite]}</span></td>
                            <td>{compteNom.get(o.charge.compte_id) ?? "—"}</td>
                            <td className="right num montant-neg">− {formatMontant(o.charge.montant_attendu)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
