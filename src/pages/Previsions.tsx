import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAppData } from "../state/AppDataContext";
import { Icon } from "../components/Icon";
import { SoldeAreaChart } from "../components/charts";
import { calculerPrevisions, estimerRevenus } from "../lib/previsions";
import { lireProfil } from "../lib/profil";
import { formatMontant, formatMois } from "../lib/format";
import { Segmente } from "../components/ui/Segmente";
import { Bandeau, Carte, LigneCalcul, TotalCalcul, type Humeur } from "../components/ui/Page";

type Scenario = "bas" | "attendu" | "haut";

const LIBELLE_SCENARIO: Record<Scenario, string> = { bas: "prudent", attendu: "attendu", haut: "optimiste" };

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
  const dernier = prev.mois[prev.mois.length - 1];
  const premierNegatif = prev.mois.find((m) => m.soldeProjete < 0);
  const plansDates = prev.plans.filter((p) => p.moisRestants != null);

  const humeur: Humeur = premierNegatif ? "risque" : deficit || prev.capaciteEpargne < 0 ? "attention" : "ok";
  const statut = premierNegatif
    ? `Solde négatif en ${premierNegatif.label}`
    : deficit
      ? "Objectifs trop ambitieux"
      : prev.capaciteEpargne < 0
        ? "Mois déficitaires"
        : "Trajectoire saine";

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
            <Segmente
              label="Scénario"
              valeur={scenario}
              onChange={setScenario}
              options={[
                { value: "bas", label: "Prudent" },
                { value: "attendu", label: "Attendu" },
                { value: "haut", label: "Optimiste" },
              ]}
            />
          )}
          <Segmente
            label="Horizon"
            valeur={horizon}
            onChange={setHorizon}
            options={[3, 6, 12].map((h) => ({ value: h, label: `${h} mois` }))}
          />
        </div>
      </div>

      {!profil.configure && (
        <div className="card pg-alerte">
          <span className="pg-alerte-ico">
            <Icon name="alert" size={18} />
          </span>
          <div style={{ flex: 1 }}>
            Renseigne ton <strong>profil</strong> (revenu mensuel, jour de paie) pour que l'app projette automatiquement
            tes revenus.
          </div>
          <Link to="/parametres?onglet=profil" className="btn sm primary">
            Configurer
          </Link>
        </div>
      )}

      <Bandeau
        surtitre={dernier ? `Solde projeté · fin ${dernier.label}` : "Solde projeté"}
        montant={dernier?.soldeProjete ?? 0}
        humeur={humeur}
        statut={statut}
        phrase={
          <>
            Capacité d'épargne <strong className="num">{formatMontant(prev.capaciteEpargne)}</strong> / mois · scénario{" "}
            {LIBELLE_SCENARIO[scenario]}
          </>
        }
        calcul={
          <>
            <LigneCalcul label="Revenu mensuel" valeur={prev.revenusMensuels} aide={aScenarios ? `scénario ${LIBELLE_SCENARIO[scenario]}` : undefined} />
            <LigneCalcul label="Charges fixes" valeur={-prev.chargesMensuelMoy} />
            <LigneCalcul label="Dépenses variables" valeur={-prev.depensesVariablesMoy} aide="moyenne récente" />
            <TotalCalcul label="Capacité d'épargne" valeur={prev.capaciteEpargne} />
          </>
        }
      >
        {aScenarios && (
          <div className="pg-scenarios">
            {(["bas", "attendu", "haut"] as Scenario[]).map((s) => (
              <button
                key={s}
                type="button"
                className={"pg-scenario" + (s === scenario ? " actif" : "")}
                onClick={() => setScenario(s)}
              >
                <em>{LIBELLE_SCENARIO[s]}</em>
                <strong className="num">{formatMontant(estim[s])}</strong>
                <span>revenu / mois</span>
              </button>
            ))}
          </div>
        )}
      </Bandeau>

      <Carte titre="Trajectoire du solde" ico="trending-up" className="pg-espace">
        <SoldeAreaChart data={courbe} />
      </Carte>

      {plansDates.length > 0 && (
        <Carte
          titre="Épargne optimale pour tes objectifs"
          ico="target"
          className="pg-espace"
          action={
            deficit ? (
              <span className="badge en_retard">Capacité insuffisante</span>
            ) : (
              <span className="badge payee_avec_justif">Objectifs atteignables</span>
            )
          }
        >
          <p className="muted" style={{ fontSize: 12.5, marginTop: -6 }}>
            Montant à épargner chaque mois pour tenir chaque échéance. Total requis :{" "}
            <strong style={{ color: deficit ? "var(--red)" : "var(--green)" }}>
              {formatMontant(prev.epargneRecommandee)}
            </strong>{" "}
            / mois · capacité estimée {formatMontant(prev.capaciteEpargne)}.
          </p>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Objectif</th>
                  <th>Échéance</th>
                  <th className="right">Reste</th>
                  <th className="right">À épargner / mois</th>
                </tr>
              </thead>
              <tbody>
                {plansDates.map((p) => (
                  <tr key={p.objectif.id}>
                    <td style={{ fontWeight: 600 }}>
                      <span className="flex" style={{ gap: 8 }}>
                        <span className="dot" style={{ background: p.objectif.couleur }} />
                        {p.objectif.nom}
                      </span>
                    </td>
                    <td>
                      {p.objectif.date_cible ? formatMois(p.objectif.date_cible.slice(0, 7)) : "—"} ({p.moisRestants} mois)
                    </td>
                    <td className="right num">{formatMontant(p.reste)}</td>
                    <td className="right num" style={{ fontWeight: 700 }}>
                      {formatMontant(p.requisMensuel)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Carte>
      )}

      <Carte titre="Détail mois par mois" ico="calendar">
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
                  <td className={"right num " + (m.resteAVivre >= 0 ? "montant-pos" : "montant-neg")}>
                    {formatMontant(m.resteAVivre)}
                  </td>
                  <td className="right num" style={{ fontWeight: 700, color: m.soldeProjete < 0 ? "var(--red)" : undefined }}>
                    {formatMontant(m.soldeProjete)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Carte>
    </>
  );
}
