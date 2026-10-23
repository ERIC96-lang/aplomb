import { AnimatePresence } from "motion/react";
import { useMemo, useState, type ReactNode } from "react";
import { addDays, addMonths, format, getDaysInMonth, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Link, useNavigate } from "react-router-dom";
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
import { prochainesOccurrences } from "../lib/echeancier";
import { estReglee } from "../lib/statutEcheance";
import { InsightRow } from "../components/Insights";
import { Icon, type IconName } from "../components/Icon";
import { MenuChoix } from "../components/ui/Menu";
import { Segmente } from "../components/ui/Segmente";
import { SelecteurMois } from "../components/ui/SelecteurMois";
import { Defilant } from "../components/Defilant";
import { Kpi, LigneCalcul } from "../components/ui/Page";
import { FilDuMois, type EtatEvenement, type EvenementFil } from "../components/dashboard/FilDuMois";
import { pointsFluxMensuel, pointsSoldeJournalier, pointsSoldeMensuel } from "../lib/series";
import { formatDate, formatMontant, formatMois, moisCourant } from "../lib/format";
import { CategorieBars, CategorieDonut, FluxBarChart, SoldeAreaChart } from "../components/charts";
import type { EcheanceStatut } from "../db/types";

type Vue = "solde" | "jour" | "flux";
type Humeur = "ok" | "attention" | "risque";

const ETAT_FIL: Record<EcheanceStatut, EtatEvenement> = {
  a_venir: "avenir",
  en_retard: "retard",
  payee_sans_justif: "paye",
  payee_avec_justif: "paye",
  reglee_ailleurs: "ailleurs",
};

const jourCourt = (iso: string) => format(parseISO(iso), "d MMM", { locale: fr });

export function Dashboard() {
  const { comptes, transactions, categories, chargesFixes, echeances, budgets, objectifs, suggestions } =
    useAppData();
  const navigate = useNavigate();
  const [mois, setMois] = useState(moisCourant());
  const [compteId, setCompteId] = useState<number | "global">("global");
  const [vue, setVue] = useState<Vue>("solde");
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
  const nomCompte = compteSel === undefined ? null : comptes.find((c) => c.id === compteSel)?.nom ?? null;
  const moisPrec = format(addMonths(new Date(`${mois}-01`), -1), "yyyy-MM");
  const estMoisCourant = mois === moisCourant();
  const profil = useMemo(() => lireProfil(), []);

  // --- Données ------------------------------------------------------------
  const totaux = useMemo(() => totauxMois(transactions, mois, compteSel), [transactions, mois, compteSel]);
  const totauxPrec = useMemo(() => totauxMois(transactions, moisPrec, compteSel), [transactions, moisPrec, compteSel]);

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

  const flux6 = useMemo(() => pointsFluxMensuel(transactions, compteSel, 6), [transactions, compteSel]);

  const serie = useMemo(() => {
    if (vue === "jour") return pointsSoldeJournalier(comptes, transactions, compteIdOrNull, mois);
    return pointsSoldeMensuel(comptes, transactions, compteIdOrNull, 12);
  }, [comptes, transactions, compteIdOrNull, mois, vue]);

  const projections = useMemo(
    () => projeterFinDeMois(comptes, transactions, chargesFixes, echeances, mois),
    [comptes, transactions, chargesFixes, echeances, mois]
  );
  const proj = useMemo(() => {
    const list = compteSel === undefined ? projections : projections.filter((p) => p.compte_id === compteSel);
    return list.reduce(
      (a, p) => ({
        chargesRestantes: a.chargesRestantes + p.chargesRestantes,
        variables: a.variables + p.depensesVariablesEstimees,
        projete: a.projete + p.soldeProjete,
      }),
      { chargesRestantes: 0, variables: 0, projete: 0 }
    );
  }, [projections, compteSel]);

  const budgetsStatut = useMemo(
    () => statutsBudgets(budgets, categories, transactions, mois, comptes),
    [budgets, categories, transactions, mois, comptes]
  );
  const budgetsDepense = budgetsStatut.filter((b) => !b.epargne);
  const plafondTotal = budgetsDepense.reduce((a, b) => a + b.plafond, 0);
  const consommeTotal = budgetsDepense.reduce((a, b) => a + b.depense, 0);
  const budgetsAlerte = budgetsDepense.filter((b) => b.etat !== "ok").length;
  const budgetsDepasses = budgetsDepense.filter((b) => b.etat === "depasse").length;

  const insights = useMemo(
    () =>
      genererInsights(
        { comptes, transactions, categories, chargesFixes, echeances, budgets, objectifs, suggestions },
        mois
      ),
    [comptes, transactions, categories, chargesFixes, echeances, budgets, objectifs, suggestions, mois]
  );

  const plan = useMemo(
    () => planDuMois({ transactions, chargesFixes, budgets, categories, profil, echeances }, mois),
    [transactions, chargesFixes, budgets, categories, mois, echeances, profil]
  );

  const chargeParId = useMemo(() => new Map(chargesFixes.map((c) => [c.id, c])), [chargesFixes]);
  const echeancesMois = useMemo(
    () =>
      echeances
        .filter((e) => e.mois === mois)
        .map((e) => ({ e, c: chargeParId.get(e.charge_fixe_id) }))
        .filter((x) => x.c && (compteSel === undefined || x.c.compte_id === compteSel)),
    [echeances, mois, chargeParId, compteSel]
  );
  const enRetard = echeancesMois.filter((x) => x.e.statut === "en_retard").length;

  // Fil du mois : la paie et chaque charge fixe à sa date.
  const joursDuMois = getDaysInMonth(parseISO(`${mois}-01`));
  const evenements = useMemo<EvenementFil[]>(() => {
    const ev: EvenementFil[] = echeancesMois.map(({ e, c }) => ({
      jour: Math.min(c!.jour_echeance, joursDuMois),
      label: c!.nom,
      montant: c!.montant_attendu,
      etat: ETAT_FIL[e.statut],
    }));
    if (profil.configure && profil.jourPaie > 0 && plan.revenuAttendu > 0) {
      ev.push({ jour: Math.min(profil.jourPaie, joursDuMois), label: "Paie", montant: plan.revenuAttendu, etat: "paie" });
    }
    return ev;
  }, [echeancesMois, joursDuMois, profil, plan.revenuAttendu]);

  // Prochaines échéances (30 jours), hors celles déjà réglées.
  const aVenir = useMemo(() => {
    const statut = new Map(echeances.map((e) => [`${e.charge_fixe_id}|${e.mois}`, e.statut]));
    const limite = format(addDays(new Date(), 30), "yyyy-MM-dd");
    return prochainesOccurrences(chargesFixes, 1, new Date())
      .filter((o) => o.date <= limite)
      .filter((o) => compteSel === undefined || o.charge.compte_id === compteSel)
      .filter((o) => {
        const s = statut.get(`${o.charge.id}|${o.mois}`);
        return !s || !estReglee(s);
      })
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5);
  }, [chargesFixes, echeances, compteSel]);

  const recentes = useMemo(
    () =>
      transactions
        .filter((t) => compteSel === undefined || t.compte_id === compteSel || t.compte_dest_id === compteSel)
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
        .slice(0, 6),
    [transactions, compteSel]
  );
  const catParId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  // --- Statut du mois -------------------------------------------------------
  const humeur: Humeur = estMoisCourant
    ? proj.projete < 0
      ? "risque"
      : enRetard > 0 || budgetsDepasses > 0
        ? "attention"
        : "ok"
    : totaux.solde >= 0
      ? "ok"
      : "risque";
  const HUMEUR: Record<Humeur, { label: string; ico: IconName }> = {
    ok: { label: estMoisCourant ? "D'aplomb" : "Mois d'aplomb", ico: "check" },
    attention: { label: "À surveiller", ico: "alert" },
    risque: { label: estMoisCourant ? "Hors d'aplomb" : "Mois déficitaire", ico: "alert" },
  };
  const finMois = format(parseISO(`${mois}-01`), "MMMM", { locale: fr });
  const raisons = [
    enRetard > 0 && `${enRetard} charge${enRetard > 1 ? "s" : ""} en retard`,
    budgetsDepasses > 0 && `${budgetsDepasses} budget${budgetsDepasses > 1 ? "s" : ""} dépassé${budgetsDepasses > 1 ? "s" : ""}`,
  ].filter(Boolean) as string[];

  const tauxEpargne = totaux.revenus > 0 ? totaux.solde / totaux.revenus : 0;
  const actions = [
    plan.aConfirmer > 0 && {
      to: "/transactions",
      ton: "amber",
      ico: "sparkles" as IconName,
      texte: `${plan.aConfirmer} transaction${plan.aConfirmer > 1 ? "s" : ""} à confirmer`,
    },
    enRetard > 0 && {
      to: "/charges",
      ton: "red",
      ico: "alert" as IconName,
      texte: `${enRetard} charge${enRetard > 1 ? "s" : ""} fixe${enRetard > 1 ? "s" : ""} en retard`,
    },
    plan.echeancesSemaine > 0 && {
      to: "/charges",
      ton: "amber",
      ico: "calendar" as IconName,
      texte: `${plan.echeancesSemaine} échéance${plan.echeancesSemaine > 1 ? "s" : ""} cette semaine`,
    },
    budgetsAlerte > 0 && {
      to: "/budgets",
      ton: budgetsDepasses > 0 ? "red" : "amber",
      ico: "coins" as IconName,
      texte: `${budgetsAlerte} budget${budgetsAlerte > 1 ? "s" : ""} à surveiller`,
    },
    estMoisCourant &&
      plan.revenuAttendu === 0 && {
        to: "/parametres?onglet=profil",
        ton: "muted",
        ico: "settings" as IconName,
        texte: "Renseigner ton revenu pour la projection",
      },
  ].filter(Boolean) as { to: string; ton: string; ico: IconName; texte: string }[];

  // --- Sections -------------------------------------------------------------
  const blocs: Record<SectionId, ReactNode> = {
    apercu: (
      <section className={`db-hero ${humeur}`}>
        <div className="db-hero-haut">
          <div className="db-hero-principal">
            <div className="db-surtitre">
              {estMoisCourant ? (nomCompte ? `Solde · ${nomCompte}` : "Solde aujourd'hui") : `Bilan de ${formatMois(mois)}`}
            </div>
            <div className={`db-hero-montant num ${(estMoisCourant ? solde : totaux.solde) < 0 ? "neg" : ""}`}>
              <Defilant valeur={estMoisCourant ? solde : totaux.solde} />
            </div>
            <div className="db-hero-statut">
              <span className={`db-humeur ${humeur}`}>
                <Icon name={HUMEUR[humeur].ico} size={14} strokeWidth={2.4} />
                {HUMEUR[humeur].label}
              </span>
              <span className="db-hero-phrase">
                {estMoisCourant ? (
                  <>
                    Fin {finMois}, tu devrais finir à{" "}
                    <strong className="num">{formatMontant(proj.projete)}</strong>
                    {raisons.length > 0 && <> · {raisons.join(", ")}</>}
                  </>
                ) : (
                  <>
                    {formatMontant(totaux.revenus)} de revenus pour {formatMontant(totaux.depenses)} de dépenses
                  </>
                )}
              </span>
            </div>
          </div>

          <div className="db-hero-calcul">
            {estMoisCourant ? (
              <>
                <LigneCalcul label="Solde actuel" valeur={solde} />
                <LigneCalcul label="Charges fixes restantes" valeur={-proj.chargesRestantes} />
                <LigneCalcul label="Dépenses variables estimées" valeur={-proj.variables} aide="moyenne des 3 derniers mois" />
                <div className="db-calcul-total">
                  <span>Fin de mois projetée</span>
                  <strong className={`num ${proj.projete < 0 ? "neg" : "pos"}`}>
                    <Defilant valeur={proj.projete} />
                  </strong>
                </div>
              </>
            ) : (
              <>
                <LigneCalcul label="Revenus" valeur={totaux.revenus} />
                <LigneCalcul label="Dépenses" valeur={-totaux.depenses} />
                <div className="db-calcul-total">
                  <span>Épargné sur le mois</span>
                  <strong className={`num ${totaux.solde < 0 ? "neg" : "pos"}`}>
                    <Defilant valeur={totaux.solde} />
                  </strong>
                </div>
              </>
            )}
          </div>
        </div>

        <FilDuMois
          jours={joursDuMois}
          aujourdhui={estMoisCourant ? new Date().getDate() : null}
          evenements={evenements}
        />
      </section>
    ),

    indicateurs: (
      <div className="db-kpis">
        <Kpi
          label="Revenus"
          ico="trending-up"
          montant={totaux.revenus}
          ton="pos"
          delta={variationPct(totaux.revenus, totauxPrec.revenus)}
          serie={flux6.map((p) => p.revenus)}
          couleur="var(--green)"
        />
        <Kpi
          label="Dépenses"
          ico="trending-down"
          montant={totaux.depenses}
          ton="neg"
          delta={variationPct(totaux.depenses, totauxPrec.depenses)}
          inverse
          serie={flux6.map((p) => p.depenses)}
          couleur="var(--red)"
        />
        <Kpi
          label="Épargne du mois"
          ico="coins"
          montant={totaux.solde}
          ton={totaux.solde >= 0 ? "pos" : "neg"}
          sous={totaux.revenus > 0 ? `${Math.round(tauxEpargne * 100)} % des revenus` : undefined}
          serie={flux6.map((p) => p.epargne)}
          couleur="var(--teal)"
        />
        <div className="db-kpi">
          <div className="db-kpi-tete">
            <span>Budgets</span>
            <span className="db-kpi-ico"><Icon name="target" size={16} /></span>
          </div>
          {plafondTotal > 0 ? (
            <>
              <div className="db-kpi-valeur num">
                {Math.round((consommeTotal / plafondTotal) * 100)} %
                <span className="db-kpi-unite"> consommés</span>
              </div>
              <div className="progress db-kpi-barre">
                <span
                  style={{
                    width: `${Math.min(100, (consommeTotal / plafondTotal) * 100)}%`,
                    background: budgetsDepasses ? "var(--red)" : budgetsAlerte ? "var(--amber)" : "var(--green)",
                  }}
                />
              </div>
              <div className="db-kpi-pied">
                {formatMontant(consommeTotal)} sur {formatMontant(plafondTotal)}
                {budgetsAlerte > 0 && <span className="db-kpi-alerte"> · {budgetsAlerte} à surveiller</span>}
              </div>
            </>
          ) : (
            <Link to="/budgets" className="db-kpi-vide">
              Définir des plafonds <Icon name="chevron-right" size={14} />
            </Link>
          )}
        </div>
      </div>
    ),

    evolution: (
      <div className="db-rangee large-etroit">
        <section className="card">
          <div className="db-carte-tete">
            <h2>Évolution</h2>
            <Segmente
              label="Graphique"
              valeur={vue}
              onChange={setVue}
              options={[
                { value: "solde", label: "Solde · 12 mois" },
                { value: "jour", label: "Ce mois" },
                { value: "flux", label: "Revenus & dépenses" },
              ]}
            />
          </div>
          {vue === "flux" ? <FluxBarChart data={flux6} /> : <SoldeAreaChart data={serie} />}
        </section>

        <section className="card db-afaire">
          <div className="db-carte-tete">
            <h2>À faire</h2>
            {actions.length > 0 && <span className="db-compteur">{actions.length}</span>}
          </div>
          {actions.length === 0 ? (
            <div className="db-ok">
              <Icon name="check" size={16} strokeWidth={2.4} /> Tout est à jour.
            </div>
          ) : (
            <div className="db-actions">
              {actions.map((a) => (
                <Link key={a.texte} to={a.to} className={`db-action ${a.ton}`}>
                  <span className="db-action-ico"><Icon name={a.ico} size={15} /></span>
                  <span>{a.texte}</span>
                  <Icon name="chevron-right" size={15} />
                </Link>
              ))}
            </div>
          )}

          <div className="db-sous-titre">
            <span>Prochaines échéances</span>
            <Link to="/charges">Tout voir</Link>
          </div>
          {aVenir.length === 0 ? (
            <p className="muted db-vide">Rien dans les 30 prochains jours.</p>
          ) : (
            <ul className="db-echeances">
              {aVenir.map((o) => (
                <li key={`${o.charge.id}-${o.date}`}>
                  <span className="db-date">{jourCourt(o.date)}</span>
                  <span className="db-ech-nom">{o.charge.nom}</span>
                  <span className="num">{formatMontant(o.charge.montant_attendu)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    ),

    repartition: (
      <div className="db-rangee egale">
        <section className="card">
          <div className="db-carte-tete">
            <h2>Dépenses par catégorie</h2>
            <span className="muted db-note">{formatMois(mois)}</span>
          </div>
          {repartition.length === 0 ? (
            <p className="muted db-vide">Aucune dépense sur ce mois.</p>
          ) : (
            <div className="db-repartition">
              <CategorieDonut data={repartition} total={totalDep} />
              <CategorieBars data={repartition.slice(0, 5)} />
            </div>
          )}
        </section>

        <section className="card">
          <div className="db-carte-tete">
            <h2>Budgets</h2>
            <Link to="/budgets" className="db-lien">Gérer</Link>
          </div>
          {budgetsStatut.length === 0 ? (
            <p className="muted db-vide">Aucun plafond défini pour l'instant.</p>
          ) : (
            <div className="db-budgets">
              {budgetsStatut.slice(0, 6).map((s) => {
                const col = s.epargne
                  ? "var(--teal)"
                  : s.etat === "depasse"
                    ? "var(--red)"
                    : s.etat === "attention"
                      ? "var(--amber)"
                      : "var(--green)";
                return (
                  <div key={s.categorie_id}>
                    <div className="flex-between db-budget-ligne">
                      <span className="flex" style={{ gap: 8 }}>
                        <span className="dot" style={{ background: s.couleur }} />
                        {s.nom}
                      </span>
                      <span className="num">
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
          )}
        </section>
      </div>
    ),

    suivi: (
      <div className="db-rangee egale">
        <section className="card">
          <div className="db-carte-tete">
            <h2>Points clés</h2>
            {insights.length > 3 && (
              <Link to="/analyse" className="db-lien">Tout voir ({insights.length})</Link>
            )}
          </div>
          {insights.length === 0 ? (
            <p className="muted db-vide">Rien de particulier à signaler ce mois-ci.</p>
          ) : (
            <div className="db-insights">
              {insights.slice(0, 3).map((i) => (
                <InsightRow key={i.id} insight={i} />
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <div className="db-carte-tete">
            <h2>Dernières opérations</h2>
            <Link to="/transactions" className="db-lien">Toutes</Link>
          </div>
          {recentes.length === 0 ? (
            <p className="muted db-vide">Aucune opération pour l'instant.</p>
          ) : (
            <ul className="db-operations">
              {recentes.map((t) => {
                const cat = t.categorie_id != null ? catParId.get(t.categorie_id) : undefined;
                const signe = t.type === "revenu" ? "+ " : t.type === "depense" ? "− " : "";
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => navigate("/transactions", { state: { transaction: t.id } })}
                    >
                      <span
                        className="db-op-pastille"
                        style={{ background: cat ? `color-mix(in srgb, ${cat.couleur} 18%, transparent)` : undefined, color: cat?.couleur }}
                      >
                        <Icon name={t.type === "revenu" ? "trending-up" : t.type === "virement" ? "repeat" : "trending-down"} size={15} />
                      </span>
                      <span className="db-op-txt">
                        <span>{t.description || cat?.nom || "Opération"}</span>
                        <span className="dim">
                          {formatDate(t.date)}
                          {cat ? ` · ${cat.nom}` : ""}
                          {t.a_confirmer === 1 ? " · à confirmer" : ""}
                        </span>
                      </span>
                      <span className={`num db-op-montant ${t.type}`}>
                        {signe}
                        {formatMontant(t.montant)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    ),
  };

  const visibles = prefs.ordre.filter((id) => !prefs.masquees.includes(id) && blocs[id]);
  const salut = (() => {
    const h = new Date().getHours();
    return h < 5 ? "Bonsoir" : h < 18 ? "Bonjour" : "Bonsoir";
  })();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Tableau de bord</h1>
          <div className="sub">
            {salut} · {format(new Date(), "EEEE d MMMM", { locale: fr })}
            {nomCompte ? ` · ${nomCompte}` : ""}
          </div>
        </div>
        <div className="flex" style={{ gap: 10 }}>
          <MenuChoix
            libelle="Compte"
            ico="bank"
            valeur={compteId}
            onChange={setCompteId}
            options={[
              { value: "global" as const, label: "Vue globale", ico: "dashboard", description: "Tous les comptes" },
              ...comptes.map((c) => ({
                value: c.id,
                label: c.nom,
                ico: (c.type === "epargne" ? "coins" : "wallet") as IconName,
              })),
            ]}
          />
          <SelecteurMois valeur={mois} onChange={setMois} disponibles={moisList} />
          <button
            className="btn-icone db-perso"
            onClick={() => setPerso(true)}
            title="Personnaliser le tableau de bord"
            aria-label="Personnaliser le tableau de bord"
          >
            <Icon name="settings" size={17} />
          </button>
        </div>
      </div>

      {visibles.map((id) => (
        <div key={id} className="dash-section">
          {blocs[id]}
        </div>
      ))}

      <AnimatePresence>
        {perso && (
          <PersoDashboard
            key="perso"
            prefs={prefs}
            onChange={(p) => {
              setPrefs(p);
              sauverDashboardPrefs(p);
            }}
            onClose={() => setPerso(false)}
          />
        )}
      </AnimatePresence>
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
              <button className="icon-btn" aria-label="Monter" disabled={index === 0} onClick={() => deplacer(index, -1)}>
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
