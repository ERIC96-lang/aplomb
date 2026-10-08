import { useMemo, useState, type ReactNode } from "react";
import { addMonths, format } from "date-fns";
import { useAppData } from "../state/AppDataContext";
import { Modal } from "../components/Modal";
import {
  chargerDashboardPrefs,
  sauverDashboardPrefs,
  reinitDashboardPrefs,
  SECTIONS,
  type DashboardPrefs,
  type SectionId,
} from "../lib/dashboardPrefs";
import {
  moisDisponibles,
  repartitionDepenses,
  soldeCompteAvecInitial,
  soldeGlobal,
  totauxMois,
  variationPct,
} from "../lib/calculs";
import { projeterFinDeMois } from "../lib/projection";
import { statutsBudgets } from "../lib/budgets";
import { planDuMois } from "../lib/planMois";
import { lireProfil } from "../lib/profil";
import { genererInsights } from "../lib/insights";
import { InsightRow } from "../components/Insights";
import { Icon } from "../components/Icon";
import { Link } from "react-router-dom";
import {
  depensesParJour,
  pointsFluxMensuel,
  pointsSoldeJournalier,
  pointsSoldeMensuel,
} from "../lib/series";
import { formatMontant, formatMois, moisCourant } from "../lib/format";
import { StatCard } from "../components/StatCard";
import {
  CategorieBars,
  CategorieDonut,
  FluxBarChart,
  Gauge,
  Heatmap,
  SoldeAreaChart,
} from "../components/charts";

export function Dashboard() {
  const { comptes, transactions, categories, chargesFixes, echeances, budgets, objectifs, suggestions } = useAppData();
  const [mois, setMois] = useState(moisCourant());
  const [compteId, setCompteId] = useState<number | "global">("global");
  const [courbe, setCourbe] = useState<"mois" | "jour">("mois");
  const [prefs, setPrefs] = useState<DashboardPrefs>(() => chargerDashboardPrefs());
  const [perso, setPerso] = useState(false);

  const moisList = useMemo(() => {
    const l = moisDisponibles(transactions);
    const mc = moisCourant();
    if (!l.includes(mc)) l.unshift(mc);
    return l;
  }, [transactions]);

  const compteSel = compteId === "global" ? undefined : compteId;
  const compteIdOrNull = compteId === "global" ? null : compteId;
  const moisPrec = format(addMonths(new Date(`${mois}-01`), -1), "yyyy-MM");

  const totaux = useMemo(() => totauxMois(transactions, mois, compteSel), [transactions, mois, compteSel]);
  const totauxPrec = useMemo(
    () => totauxMois(transactions, moisPrec, compteSel),
    [transactions, moisPrec, compteSel]
  );

  const solde = useMemo(() => {
    if (compteSel === undefined) return soldeGlobal(comptes, transactions);
    const c = comptes.find((x) => x.id === compteSel);
    return c ? soldeCompteAvecInitial(c, transactions) : 0;
  }, [comptes, transactions, compteSel]);

  const repartition = useMemo(
    () => repartitionDepenses(transactions, categories, mois, compteSel),
    [transactions, categories, mois, compteSel]
  );
  const totalDep = repartition.reduce((a, r) => a + r.montant, 0);

  const serieSolde = useMemo(
    () =>
      courbe === "mois"
        ? pointsSoldeMensuel(comptes, transactions, compteIdOrNull, 12)
        : pointsSoldeJournalier(comptes, transactions, compteIdOrNull, mois),
    [comptes, transactions, compteIdOrNull, mois, courbe]
  );

  const serieFlux = useMemo(
    () => pointsFluxMensuel(transactions, compteSel, 6),
    [transactions, compteSel]
  );

  // Patrimoine total = solde cumulé de TOUS les comptes (12 mois), indépendant du filtre.
  const patrimoine = useMemo(
    () => pointsSoldeMensuel(comptes, transactions, null, 12),
    [comptes, transactions]
  );

  const heat = useMemo(
    () => depensesParJour(transactions, mois, compteSel),
    [transactions, mois, compteSel]
  );

  const projections = useMemo(
    () => projeterFinDeMois(comptes, transactions, chargesFixes, echeances, mois),
    [comptes, transactions, chargesFixes, echeances, mois]
  );
  const projGlobale = useMemo(() => {
    const list =
      compteSel === undefined ? projections : projections.filter((p) => p.compte_id === compteSel);
    return list.reduce(
      (a, p) => ({
        soldeActuel: a.soldeActuel + p.soldeActuel,
        chargesRestantes: a.chargesRestantes + p.chargesRestantes,
        depensesVariablesEstimees: a.depensesVariablesEstimees + p.depensesVariablesEstimees,
        soldeProjete: a.soldeProjete + p.soldeProjete,
      }),
      { soldeActuel: 0, chargesRestantes: 0, depensesVariablesEstimees: 0, soldeProjete: 0 }
    );
  }, [projections, compteSel]);

  const budgetsStatut = useMemo(
    () => statutsBudgets(budgets, categories, transactions, mois),
    [budgets, categories, transactions, mois]
  );

  const insights = useMemo(
    () =>
      genererInsights(
        { comptes, transactions, categories, chargesFixes, echeances, budgets, objectifs, suggestions },
        mois
      ),
    [comptes, transactions, categories, chargesFixes, echeances, budgets, objectifs, suggestions, mois]
  );

  const chargesMois = useMemo(() => {
    const ech = echeances.filter((e) => e.mois === mois);
    const n = (s: string) => ech.filter((e) => e.statut === s).length;
    return {
      total: ech.length,
      a_venir: n("a_venir"),
      en_retard: n("en_retard"),
      payee_sans_justif: n("payee_sans_justif"),
      payee_avec_justif: n("payee_avec_justif"),
    };
  }, [echeances, mois]);

  const delta = variationPct;

  const tauxEpargne = totaux.revenus > 0 ? Math.max(0, totaux.solde / totaux.revenus) : 0;

  // Assistant « Plan du mois » — seulement pertinent pour le mois en cours.
  const estMoisCourant = mois === moisCourant();
  const plan = useMemo(
    () =>
      planDuMois({ transactions, chargesFixes, budgets, categories, profil: lireProfil() }, mois),
    [transactions, chargesFixes, budgets, categories, mois]
  );

  // --- Sections personnalisables du tableau de bord -----------------------
  const blocs: Record<SectionId, ReactNode> = {
    planmois: estMoisCourant ? (
      <div className="card">
        <div className="flex-between" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>
            <span className="flex" style={{ gap: 8 }}>
              <span style={{ color: "var(--accent)" }}><Icon name="calendar" size={18} /></span>
              Plan de {formatMois(mois)}
            </span>
          </h2>
        </div>
        {plan.revenuAttendu > 0 ? (
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
            Revenu attendu <strong className="num">{formatMontant(plan.revenuAttendu)}</strong>
            {" − "}charges fixes du mois <strong className="num">{formatMontant(plan.chargesMoisTotal)}</strong>
            {" = "}
            <strong className="num" style={{ color: plan.resteAvantVariable >= 0 ? "var(--pos)" : "var(--neg)" }}>
              {formatMontant(plan.resteAvantVariable)}
            </strong>{" "}avant dépenses variables.
          </p>
        ) : (
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
            Renseigne ton revenu dans <Link to="/parametres">Paramètres</Link> pour une prévision du mois.
          </p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {plan.aConfirmer > 0 && (
            <PlanLigne to="/transactions" cls="amber"
              texte={`${plan.aConfirmer} transaction${plan.aConfirmer > 1 ? "s" : ""} générée${plan.aConfirmer > 1 ? "s" : ""} à confirmer`} />
          )}
          {plan.echeancesSemaine > 0 && (
            <PlanLigne to="/echeancier" cls="amber"
              texte={`${plan.echeancesSemaine} charge${plan.echeancesSemaine > 1 ? "s" : ""} fixe${plan.echeancesSemaine > 1 ? "s" : ""} à régler cette semaine`} />
          )}
          {plan.budgetsAlerte > 0 && (
            <PlanLigne to="/budgets" cls="red"
              texte={`${plan.budgetsAlerte} budget${plan.budgetsAlerte > 1 ? "s" : ""} à surveiller`} />
          )}
          {plan.chargesRestantesCount > 0 && (
            <PlanLigne to="/echeancier" cls="muted"
              texte={`${plan.chargesRestantesCount} charge${plan.chargesRestantesCount > 1 ? "s" : ""} fixe${plan.chargesRestantesCount > 1 ? "s" : ""} encore à venir ce mois (${formatMontant(plan.chargesRestantesTotal)})`} />
          )}
          {plan.aConfirmer === 0 && plan.echeancesSemaine === 0 && plan.budgetsAlerte === 0 && plan.chargesRestantesCount === 0 && (
            <div className="flex" style={{ gap: 8, fontSize: 13, color: "var(--pos)" }}>
              <Icon name="check" size={16} /> Tout est à jour pour ce mois.
            </div>
          )}
        </div>
      </div>
    ) : null,

    stats: (
      <div className="grid grid-auto">
        <StatCard
          label={compteSel === undefined ? "Solde global" : "Solde du compte"}
          value={solde}
          icon="wallet"
          tone={solde < 0 ? "neg" : "neutral"}
          hint="à aujourd'hui"
        />
        <StatCard
          label="Revenus du mois"
          value={totaux.revenus}
          icon="trending-up"
          tone="pos"
          delta={delta(totaux.revenus, totauxPrec.revenus)}
        />
        <StatCard
          label="Dépenses du mois"
          value={totaux.depenses}
          icon="trending-down"
          tone="neg"
          delta={delta(totaux.depenses, totauxPrec.depenses)}
          invertDelta
        />
        <StatCard
          label="Reste à vivre"
          value={totaux.solde}
          icon="coins"
          tone={totaux.solde >= 0 ? "pos" : "neg"}
          delta={delta(totaux.solde, totauxPrec.solde)}
        />
      </div>
    ),

    insights:
      insights.length > 0 ? (
        <div className="card">
          <div className="flex-between" style={{ marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>
              <span className="flex" style={{ gap: 8 }}>
                <span style={{ color: "var(--accent)" }}><Icon name="bulb" size={18} /></span>
                Points clés
              </span>
            </h2>
            {insights.length > 3 && (
              <Link to="/analyse" className="btn sm">Tout voir ({insights.length})</Link>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {insights.slice(0, 3).map((i) => (
              <InsightRow key={i.id} insight={i} />
            ))}
          </div>
        </div>
      ) : null,

    solde: (
      <div className="grid" style={{ gridTemplateColumns: "1fr 320px" }}>
        <div className="card">
          <div className="flex-between" style={{ marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>Évolution du solde</h2>
            <div className="segmented">
              <button className={courbe === "mois" ? "active" : ""} onClick={() => setCourbe("mois")}>
                12 mois
              </button>
              <button className={courbe === "jour" ? "active" : ""} onClick={() => setCourbe("jour")}>
                Ce mois
              </button>
            </div>
          </div>
          <SoldeAreaChart data={serieSolde} />
        </div>
        <div className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <h2>Taux d'épargne</h2>
          <Gauge
            ratio={tauxEpargne}
            centerValue={`${Math.round(tauxEpargne * 100)} %`}
            centerLabel="du revenu épargné"
          />
          <div className="flex-between" style={{ marginTop: 14, fontSize: 13 }}>
            <span className="muted">Reste à vivre</span>
            <span className="num" style={{ fontWeight: 700, color: totaux.solde >= 0 ? "var(--pos)" : "var(--neg)" }}>
              {formatMontant(totaux.solde)}
            </span>
          </div>
        </div>
      </div>
    ),

    flux: (
      <div className="card">
        <h2>Revenus, dépenses & épargne — 6 derniers mois</h2>
        <FluxBarChart data={serieFlux} />
      </div>
    ),

    patrimoine: (
      <div className="card">
        <div className="flex-between" style={{ marginBottom: 4 }}>
          <h2 style={{ margin: 0 }}>Patrimoine total</h2>
          <span className="num" style={{ fontWeight: 750, fontSize: 18 }}>
            {formatMontant(soldeGlobal(comptes, transactions))}
          </span>
        </div>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
          Évolution de la somme de tous tes comptes (courant + épargne) sur 12 mois.
        </p>
        <SoldeAreaChart data={patrimoine} />
      </div>
    ),

    budgets:
      budgetsStatut.length > 0 ? (
        <div className="card">
          <h2>Budgets du mois</h2>
          <div className="grid grid-2" style={{ gap: 18 }}>
            {budgetsStatut.slice(0, 6).map((s) => {
              const col = s.etat === "depasse" ? "var(--red)" : s.etat === "attention" ? "var(--amber)" : "var(--green)";
              return (
                <div key={s.categorie_id}>
                  <div className="flex-between" style={{ marginBottom: 5 }}>
                    <span className="flex" style={{ gap: 8, fontSize: 13 }}>
                      <span className="dot" style={{ background: s.couleur }} />
                      {s.nom}
                    </span>
                    <span className="num" style={{ fontSize: 12.5 }}>
                      <strong style={{ color: col }}>{formatMontant(s.depense)}</strong>
                      <span className="muted"> / {formatMontant(s.plafond)}</span>
                    </span>
                  </div>
                  <div className="progress">
                    <span style={{ width: `${Math.min(100, s.ratio * 100)}%`, background: col }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null,

    repartition: (
      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="card">
          <h2>Répartition des dépenses</h2>
          {repartition.length === 0 ? (
            <div className="empty">
              <p>Aucune dépense sur ce mois.</p>
            </div>
          ) : (
            <CategorieDonut data={repartition} total={totalDep} />
          )}
        </div>
        <div className="card">
          <h2>Détail par catégorie</h2>
          {repartition.length === 0 ? (
            <p className="muted">Aucune dépense sur ce mois.</p>
          ) : (
            <CategorieBars data={repartition.slice(0, 8)} />
          )}
        </div>
      </div>
    ),

    projection: (
      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="card">
          <h2>Projection de fin de mois</h2>
          <p className="muted" style={{ fontSize: 12.5, marginTop: -10 }}>
            Solde actuel − charges fixes restantes − moyenne des dépenses variables (3 mois).
          </p>
          <LigneProj label="Solde actuel" value={projGlobale.soldeActuel} />
          <LigneProj label="− Charges fixes restantes" value={-projGlobale.chargesRestantes} neg />
          <LigneProj label="− Dépenses variables estimées" value={-projGlobale.depensesVariablesEstimees} neg />
          <div
            className="flex-between"
            style={{ padding: "13px 0 2px", borderTop: "1px solid var(--border)", marginTop: 8 }}
          >
            <span style={{ fontWeight: 700 }}>Solde projeté</span>
            <span
              className="num"
              style={{
                fontWeight: 750,
                fontSize: 19,
                color: projGlobale.soldeProjete < 0 ? "var(--neg)" : "var(--pos)",
              }}
            >
              {formatMontant(projGlobale.soldeProjete)}
            </span>
          </div>
        </div>

        <div style={{ display: "grid", gap: 18 }}>
          <div className="card">
            <h2>Intensité des dépenses — {formatMois(mois)}</h2>
            <Heatmap data={heat} />
            <div className="flex" style={{ gap: 6, marginTop: 12, fontSize: 11.5, color: "var(--text-muted)" }}>
              <span>Moins</span>
              <span className="heat-cell" style={{ background: "var(--surface-2)" }} />
              <span className="heat-cell" style={{ background: "color-mix(in srgb, var(--accent) 40%, transparent)" }} />
              <span className="heat-cell" style={{ background: "color-mix(in srgb, var(--accent) 70%, transparent)" }} />
              <span className="heat-cell" style={{ background: "var(--accent)" }} />
              <span>Plus</span>
            </div>
          </div>

          <div className="card">
            <h2>Charges fixes du mois</h2>
            {chargesMois.total === 0 ? (
              <p className="muted">Aucune charge fixe active ce mois-ci.</p>
            ) : (
              <div className="grid grid-2" style={{ gap: 10 }}>
                <StatutTile n={chargesMois.a_venir} label="À venir" cls="a_venir" />
                <StatutTile n={chargesMois.en_retard} label="En retard" cls="en_retard" />
                <StatutTile n={chargesMois.payee_sans_justif} label="Payées sans justif." cls="payee_sans_justif" />
                <StatutTile n={chargesMois.payee_avec_justif} label="Payées + justif." cls="payee_avec_justif" />
              </div>
            )}
          </div>
        </div>
      </div>
    ),
  };

  const visibles = prefs.ordre.filter((id) => !prefs.masquees.includes(id) && blocs[id]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Tableau de bord</h1>
          <div className="sub">{formatMois(mois)} · {compteSel === undefined ? "tous les comptes" : comptes.find((c) => c.id === compteSel)?.nom}</div>
        </div>
        <div className="flex" style={{ gap: 10 }}>
          <select
            className="select"
            style={{ width: 170 }}
            aria-label="Filtrer par compte"
            value={compteId}
            onChange={(e) => setCompteId(e.target.value === "global" ? "global" : Number(e.target.value))}
          >
            <option value="global">Vue globale</option>
            {comptes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
          <select className="select" style={{ width: 160 }} aria-label="Choisir le mois" value={mois} onChange={(e) => setMois(e.target.value)}>
            {moisList.map((m) => (
              <option key={m} value={m}>
                {formatMois(m)}
              </option>
            ))}
          </select>
          <button className="btn" onClick={() => setPerso(true)} title="Personnaliser le tableau de bord">
            <Icon name="settings" size={16} /> Personnaliser
          </button>
        </div>
      </div>

      {visibles.map((id) => (
        <div key={id} className="dash-section">
          {blocs[id]}
        </div>
      ))}

      {perso && (
        <PersoDashboard
          prefs={prefs}
          onChange={(p) => {
            setPrefs(p);
            sauverDashboardPrefs(p);
          }}
          onClose={() => setPerso(false)}
        />
      )}
    </>
  );
}

function PersoDashboard({
  prefs,
  onChange,
  onClose,
}: {
  prefs: DashboardPrefs;
  onChange: (p: DashboardPrefs) => void;
  onClose: () => void;
}) {
  const meta = new Map(SECTIONS.map((s) => [s.id, s.label]));

  function deplacer(index: number, sens: -1 | 1) {
    const cible = index + sens;
    if (cible < 0 || cible >= prefs.ordre.length) return;
    const ordre = [...prefs.ordre];
    [ordre[index], ordre[cible]] = [ordre[cible], ordre[index]];
    onChange({ ...prefs, ordre });
  }

  function basculer(id: SectionId) {
    const masquees = prefs.masquees.includes(id)
      ? prefs.masquees.filter((m) => m !== id)
      : [...prefs.masquees, id];
    onChange({ ...prefs, masquees });
  }

  return (
    <Modal
      titre="Personnaliser le tableau de bord"
      onClose={onClose}
      footer={
        <>
          <button className="btn" style={{ marginRight: "auto" }} onClick={() => onChange(reinitDashboardPrefs())}>
            Réinitialiser
          </button>
          <button className="btn primary" onClick={onClose}>Terminé</button>
        </>
      }
    >
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        Coche les sections à afficher et réordonne-les avec les flèches. Tes choix sont mémorisés sur cet appareil.
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {prefs.ordre.map((id, index) => {
          const visible = !prefs.masquees.includes(id);
          return (
            <li
              key={id}
              className="flex"
              style={{
                gap: 10, alignItems: "center", padding: "10px 12px",
                border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface-2)",
              }}
            >
              <label className="flex" style={{ gap: 10, alignItems: "center", flex: 1, cursor: "pointer" }}>
                <input type="checkbox" checked={visible} onChange={() => basculer(id)} />
                <span style={{ opacity: visible ? 1 : 0.5 }}>{meta.get(id)}</span>
              </label>
              <button
                className="icon-btn"
                aria-label="Monter"
                disabled={index === 0}
                onClick={() => deplacer(index, -1)}
              >
                <Icon name="chevron-up" size={16} />
              </button>
              <button
                className="icon-btn"
                aria-label="Descendre"
                disabled={index === prefs.ordre.length - 1}
                onClick={() => deplacer(index, 1)}
              >
                <Icon name="chevron-down" size={16} />
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

function PlanLigne({ to, texte, cls }: { to: string; texte: string; cls: "amber" | "red" | "muted" }) {
  const couleur = cls === "red" ? "var(--red)" : cls === "amber" ? "var(--amber)" : "var(--text-muted)";
  return (
    <Link
      to={to}
      className="flex-between"
      style={{
        gap: 10, alignItems: "center", padding: "9px 12px", borderRadius: 10,
        border: "1px solid var(--border)", background: "var(--surface-2)",
        textDecoration: "none", color: "var(--text)", fontSize: 13,
      }}
    >
      <span className="flex" style={{ gap: 9, alignItems: "center" }}>
        <span className="dot" style={{ background: couleur }} />
        {texte}
      </span>
      <Icon name="chevron-down" size={15} style={{ transform: "rotate(-90deg)", opacity: 0.5 }} />
    </Link>
  );
}

function LigneProj({ label, value, neg }: { label: string; value: number; neg?: boolean }) {
  return (
    <div className="flex-between" style={{ padding: "7px 0" }}>
      <span className="muted">{label}</span>
      <span className="num" style={{ fontWeight: 650, color: neg ? "var(--neg)" : undefined }}>
        {formatMontant(Math.abs(value))}
      </span>
    </div>
  );
}

function StatutTile({ n, label, cls }: { n: number; label: string; cls: string }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "13px 15px", background: "var(--surface-2)" }}>
      <div className="num" style={{ fontSize: 23, fontWeight: 750 }}>{n}</div>
      <span className={`badge ${cls}`} style={{ marginTop: 5, display: "inline-block" }}>
        {label}
      </span>
    </div>
  );
}
