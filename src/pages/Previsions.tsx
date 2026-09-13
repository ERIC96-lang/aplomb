import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAppData } from "../state/AppDataContext";
import { Icon } from "../components/Icon";
import { SoldeAreaChart } from "../components/charts";
import { calculerPrevisions, estimerRevenus } from "../lib/previsions";
import { lireProfil } from "../lib/profil";
import { formatMontant, formatMois } from "../lib/format";

type Scenario = "bas" | "attendu" | "haut";

export function Previsions() {
  const { comptes, transactions, chargesFixes, objectifs } = useAppData();
  const [horizon, setHorizon] = useState(6);
  const [scenario, setScenario] = useState<Scenario>("attendu");
  const profil = lireProfil();

  const estim = useMemo(() => estimerRevenus(transactions, profil), [transactions, profil]);
  const revenuChoisi = estim[scenario];
  const aScenarios = estim.bas !== estim.haut;

  const prev = useMemo(
    () => calculerPrevisions(comptes, transactions, chargesFixes, objectifs, revenuChoisi, horizon),
    [comptes, transactions, chargesFixes, objectifs, revenuChoisi, horizon]
  );

  const courbe = prev.mois.map((m) => ({ key: m.mois, label: m.label, solde: m.soldeProjete }));
  const deficit = prev.epargneRecommandee > prev.capaciteEpargne + 0.01;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Prévisions</h1>
          <div className="sub">
            {profil.configure
              ? "Projection automatique de tes prochains mois"
              : "Configure ton profil pour des prévisions précises"}
          </div>
        </div>
        <div className="flex" style={{ gap: 10 }}>
          {aScenarios && (
            <div className="segmented">
              <button className={scenario === "bas" ? "active" : ""} onClick={() => setScenario("bas")}>
                Prudent
              </button>
              <button className={scenario === "attendu" ? "active" : ""} onClick={() => setScenario("attendu")}>
                Attendu
              </button>
              <button className={scenario === "haut" ? "active" : ""} onClick={() => setScenario("haut")}>
                Optimiste
              </button>
            </div>
          )}
          <div className="segmented">
            {[3, 6, 12].map((h) => (
              <button key={h} className={horizon === h ? "active" : ""} onClick={() => setHorizon(h)}>
                {h} mois
              </button>
            ))}
          </div>
        </div>
      </div>

      {aScenarios && (
        <div className="card" style={{ marginBottom: 18, display: "flex", gap: 20, flexWrap: "wrap" }}>
          <span className="muted" style={{ fontSize: 13 }}>Revenu mensuel estimé :</span>
          <span><strong style={{ color: "var(--red)" }}>Prudent</strong> {formatMontant(estim.bas)}</span>
          <span><strong>Attendu</strong> {formatMontant(estim.attendu)}</span>
          <span><strong style={{ color: "var(--green)" }}>Optimiste</strong> {formatMontant(estim.haut)}</span>
        </div>
      )}

      {!profil.configure && (
        <div
          className="card"
          style={{ marginBottom: 18, display: "flex", alignItems: "center", gap: 12 }}
        >
          <span style={{ color: "var(--amber)" }}><Icon name="alert" size={22} /></span>
          <div style={{ flex: 1 }}>
            Renseigne ton <strong>profil</strong> (revenu mensuel, jour de paie) pour que l'app projette automatiquement tes revenus.
          </div>
          <Link to="/parametres" className="btn sm primary">Configurer</Link>
        </div>
      )}

      {/* Résumé */}
      <div className="grid grid-auto" style={{ marginBottom: 18 }}>
        <Tuile label="Revenu mensuel" value={prev.revenusMensuels} icon="trending-up" />
        <Tuile label="Charges fixes / mois" value={prev.chargesMensuelMoy} icon="repeat" />
        <Tuile label="Dépenses variables (moy.)" value={prev.depensesVariablesMoy} icon="card" />
        <Tuile label="Capacité d'épargne / mois" value={prev.capaciteEpargne} icon="coins" tone={prev.capaciteEpargne >= 0 ? "pos" : "neg"} />
      </div>

      {/* Courbe solde projeté */}
      <div className="card" style={{ marginBottom: 18 }}>
        <h2>Solde projeté</h2>
        <SoldeAreaChart data={courbe} />
      </div>

      {/* Objectifs : épargne optimale */}
      {prev.plans.some((p) => p.moisRestants != null) && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="flex-between" style={{ marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>Épargne optimale pour tes objectifs</h2>
            {deficit ? (
              <span className="badge en_retard">Capacité insuffisante</span>
            ) : (
              <span className="badge payee_avec_justif">Objectifs atteignables</span>
            )}
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: -4 }}>
            Montant à épargner chaque mois pour tenir chaque échéance. Total requis :{" "}
            <strong style={{ color: deficit ? "var(--red)" : "var(--green)" }}>
              {formatMontant(prev.epargneRecommandee)}
            </strong>{" "}
            / mois · capacité estimée {formatMontant(prev.capaciteEpargne)}.
          </p>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Objectif</th><th>Échéance</th><th className="right">Reste</th><th className="right">À épargner / mois</th></tr>
              </thead>
              <tbody>
                {prev.plans.filter((p) => p.moisRestants != null).map((p) => (
                  <tr key={p.objectif.id}>
                    <td style={{ fontWeight: 600 }}>{p.objectif.nom}</td>
                    <td>{p.objectif.date_cible ? formatMois(p.objectif.date_cible.slice(0, 7)) : "—"} ({p.moisRestants} mois)</td>
                    <td className="right num">{formatMontant(Math.max(0, p.objectif.montant_cible - p.objectif.montant_actuel))}</td>
                    <td className="right num" style={{ fontWeight: 700, color: "var(--accent)" }}>{formatMontant(p.requisMensuel)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Détail mensuel */}
      <div className="card">
        <h2>Détail mois par mois</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Mois</th>
                <th className="right">Revenus</th>
                <th className="right">Charges</th>
                <th className="right">Variables</th>
                <th className="right">Reste à vivre</th>
                <th className="right">Solde projeté</th>
              </tr>
            </thead>
            <tbody>
              {prev.mois.map((m) => (
                <tr key={m.mois}>
                  <td style={{ fontWeight: 600, textTransform: "capitalize" }}>{m.label}</td>
                  <td className="right num montant-pos">{formatMontant(m.revenus)}</td>
                  <td className="right num montant-neg">{formatMontant(m.charges)}</td>
                  <td className="right num montant-neg">{formatMontant(m.depensesVariables)}</td>
                  <td className={"right num " + (m.resteAVivre >= 0 ? "montant-pos" : "montant-neg")}>{formatMontant(m.resteAVivre)}</td>
                  <td className="right num" style={{ fontWeight: 700, color: m.soldeProjete < 0 ? "var(--red)" : undefined }}>{formatMontant(m.soldeProjete)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Tuile({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: "trending-up" | "repeat" | "card" | "coins";
  tone?: "pos" | "neg";
}) {
  return (
    <div className="stat">
      <div className="stat-top">
        <span className="label">{label}</span>
        <span className="stat-ico"><Icon name={icon} size={17} /></span>
      </div>
      <div className={"value num " + (tone ?? "")}>{formatMontant(value)}</div>
    </div>
  );
}
