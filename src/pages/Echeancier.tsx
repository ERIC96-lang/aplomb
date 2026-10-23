import { useMemo, useState } from "react";
import { useAppData } from "../state/AppDataContext";
import { useToast } from "../state/ToastContext";
import { Icon } from "../components/Icon";
import { creerTransaction, majEcheance } from "../db/repo";
import { dateEcheance, statutPaye } from "../lib/echeances";
import { grouperParMois, prochainesOccurrences } from "../lib/echeancier";
import { formatDate, formatMois, formatMontant, moisCourant, aujourdhui } from "../lib/format";
import type { ChargeFixe, Echeance } from "../db/types";
import { Segmente } from "../components/ui/Segmente";
import { Bandeau, Carte, Vide } from "../components/ui/Page";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

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
  const maxMois = Math.max(
    1,
    ...Array.from(parMois.values()).map((occs) => occs.reduce((a, o) => a + o.charge.montant_attendu, 0))
  );

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
        <Segmente
          label="Horizon"
          valeur={horizon}
          onChange={setHorizon}
          options={[3, 6, 12].map((h) => ({ value: h, label: `${h} mois` }))}
        />
      </div>

      {occurrences.length > 0 && (
        <Bandeau
          surtitre={`Sorties prévues · ${horizon} prochains mois`}
          montant={totalPrev}
          humeur={aGenerer.length > 0 ? "attention" : "ok"}
          statut={aGenerer.length > 0 ? `${aGenerer.length} échue${aGenerer.length > 1 ? "s" : ""} à générer` : "Rien d'échu en attente"}
          phrase={
            <>
              soit <strong className="num">{formatMontant(totalPrev / horizon)}</strong> par mois en moyenne
              {occurrences[0] && (
                <>
                  {" "}· prochaine : {occurrences[0].charge.nom} le {formatDate(occurrences[0].date)}
                </>
              )}
            </>
          }
        >
          <div className="pg-barres" aria-hidden="true">
            {Array.from(parMois.entries()).map(([m, occs], i) => {
              const t = occs.reduce((a, o) => a + o.charge.montant_attendu, 0);
              return (
                <div key={m} className="pg-barre-mois">
                  <span className="num">{formatMontant(t)}</span>
                  <div className="pg-barre-piste">
                    <span style={{ height: `${(t / maxMois) * 100}%`, animationDelay: `${0.15 + i * 0.05}s` }} />
                  </div>
                  <em>{format(parseISO(`${m}-01`), "MMM", { locale: fr })}</em>
                </div>
              );
            })}
          </div>
        </Bandeau>
      )}

      {aGenerer.length > 0 && (
        <Carte
          titre={`À générer maintenant (${aGenerer.length})`}
          ico="sparkles"
          className="pg-espace"
          action={
            <button className="btn sm primary" onClick={toutGenerer}>
              <Icon name="check" size={14} /> Tout générer
            </button>
          }
        >
          <p className="muted" style={{ fontSize: 12.5, marginTop: -6 }}>
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
        </Carte>
      )}

      <Carte titre={`Chronologie · ${horizon} mois`} ico="calendar">
        {occurrences.length === 0 ? (
          <Vide
            ico="calendar"
            titre="Rien à prévoir"
            texte="Ajoute tes charges fixes (avec leur périodicité) pour voir tes sorties d'argent à venir."
          />
        ) : (
          <div className="pg-chrono">
            {Array.from(parMois.entries()).map(([m, occs]) => {
              const totalMois = occs.reduce((a, o) => a + o.charge.montant_attendu, 0);
              return (
                <section key={m} className="pg-chrono-mois">
                  <div className="pg-chrono-tete">
                    <span className="pg-chrono-point" />
                    <strong>{formatMois(m)}</strong>
                    <span className="num">{formatMontant(totalMois)}</span>
                  </div>
                  <ul>
                    {occs.map((o, i) => (
                      <li key={i}>
                        <span className="db-date">{format(parseISO(o.date), "d MMM", { locale: fr })}</span>
                        <span className="pg-chrono-nom">{o.charge.nom}</span>
                        <span className="chip etat-inactif">{LIB_PERIODE[o.charge.periodicite]}</span>
                        <span className="dim pg-chrono-compte">{compteNom.get(o.charge.compte_id) ?? "—"}</span>
                        <span className="num pg-chrono-montant">− {formatMontant(o.charge.montant_attendu)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </Carte>
    </>
  );
}
