import { useMemo, useState } from "react";
import { addMonths, format } from "date-fns";
import { useAppData } from "../state/AppDataContext";
import { useToast } from "../state/ToastContext";
import {
  repartitionDepenses,
  repartitionDepensesPeriode,
  soldeGlobal,
  totauxMois,
  totauxPeriode,
} from "../lib/calculs";
import { pointsFluxAnnee } from "../lib/series";
import { CategorieBars, FluxBarChart } from "../components/charts";
import { Icon } from "../components/Icon";
import { genererRapportPdf } from "../lib/pdf";
import { aujourdhui, formatDate, formatMontant, formatMois, moisCourant } from "../lib/format";

type TypeRapport = "mensuel" | "annuel" | "periode";

export function Rapports() {
  const { comptes, transactions, categories } = useAppData();
  const toast = useToast();
  const [type, setType] = useState<TypeRapport>("mensuel");
  const [mois, setMois] = useState(moisCourant());
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [debut, setDebut] = useState(`${moisCourant()}-01`);
  const [fin, setFin] = useState(aujourdhui());

  /** Données consolidées du rapport courant (pour l'export PDF). */
  function donneesRapport() {
    if (type === "mensuel") {
      return {
        titre: "Rapport mensuel",
        periode: formatMois(mois),
        t: totauxMois(transactions, mois),
        rep: repartitionDepenses(transactions, categories, mois),
      };
    }
    if (type === "annuel") {
      return {
        titre: "Rapport annuel",
        periode: String(annee),
        t: totauxMois(transactions, String(annee)),
        rep: repartitionDepenses(transactions, categories, String(annee)),
      };
    }
    return {
      titre: "Rapport",
      periode: `${formatDate(debut)} – ${formatDate(fin)}`,
      t: totauxPeriode(transactions, debut, fin),
      rep: repartitionDepensesPeriode(transactions, categories, debut, fin),
    };
  }

  async function telechargerPdf() {
    const d = donneesRapport();
    const ok = await genererRapportPdf({
      titre: d.titre,
      periode: d.periode,
      revenus: d.t.revenus,
      depenses: d.t.depenses,
      solde: d.t.solde,
      repartition: d.rep.map((r) => ({ nom: r.nom, montant: r.montant })),
    });
    if (ok) toast("Rapport PDF généré");
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Rapports</h1>
          <div className="sub">Synthèses mensuelles, annuelles ou sur une période, à imprimer ou exporter en PDF</div>
        </div>
        <div className="flex no-print" style={{ gap: 10, flexWrap: "wrap" }}>
          <div className="segmented">
            <button className={type === "mensuel" ? "active" : ""} onClick={() => setType("mensuel")}>Mensuel</button>
            <button className={type === "annuel" ? "active" : ""} onClick={() => setType("annuel")}>Annuel</button>
            <button className={type === "periode" ? "active" : ""} onClick={() => setType("periode")}>Période</button>
          </div>
          {type === "mensuel" && (
            <input className="input" type="month" style={{ width: 160 }} value={mois} onChange={(e) => e.target.value && setMois(e.target.value)} />
          )}
          {type === "annuel" && (
            <input className="input" type="number" style={{ width: 100 }} value={annee} onChange={(e) => setAnnee(Number(e.target.value))} />
          )}
          {type === "periode" && (
            <>
              <input className="input" type="date" style={{ width: 150 }} value={debut} onChange={(e) => setDebut(e.target.value)} />
              <input className="input" type="date" style={{ width: 150 }} value={fin} onChange={(e) => setFin(e.target.value)} />
            </>
          )}
          <button className="btn" onClick={() => window.print()}>
            <Icon name="printer" size={16} /> Imprimer
          </button>
          <button className="btn primary" onClick={telechargerPdf}>
            <Icon name="download" size={16} /> Export PDF
          </button>
        </div>
      </div>

      {type === "mensuel" && <RapportMensuel mois={mois} transactions={transactions} categories={categories} />}
      {type === "annuel" && <RapportAnnuel annee={annee} comptes={comptes} transactions={transactions} categories={categories} />}
      {type === "periode" && <RapportPeriode debut={debut} fin={fin} transactions={transactions} categories={categories} />}
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RapportPeriode({ debut, fin, transactions, categories }: any) {
  const t = useMemo(() => totauxPeriode(transactions, debut, fin), [transactions, debut, fin]);
  const rep = useMemo(
    () => repartitionDepensesPeriode(transactions, categories, debut, fin),
    [transactions, categories, debut, fin]
  );
  const taux = t.revenus > 0 ? (t.solde / t.revenus) * 100 : 0;
  return (
    <div className="animate-in">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="flex-between">
          <h2 style={{ margin: 0 }}>{formatDate(debut)} – {formatDate(fin)}</h2>
          <span className="chip" style={{ background: "var(--brand-grad-soft)" }}>Période personnalisée</span>
        </div>
      </div>
      <div className="grid grid-auto" style={{ marginBottom: 16 }}>
        <Bloc label="Revenus" value={t.revenus} tone="pos" />
        <Bloc label="Dépenses" value={t.depenses} tone="neg" />
        <Bloc label="Épargne" value={t.solde} tone={t.solde >= 0 ? "pos" : "neg"} />
        <Bloc label="Taux d'épargne" value={taux} suffix=" %" raw />
      </div>
      <div className="card">
        <h2>Répartition des dépenses</h2>
        {rep.length === 0 ? <p className="muted">Aucune dépense sur cette période.</p> : <CategorieBars data={rep} />}
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RapportMensuel({ mois, transactions, categories }: any) {
  const moisPrec = format(addMonths(new Date(`${mois}-01`), -1), "yyyy-MM");
  const t = useMemo(() => totauxMois(transactions, mois), [transactions, mois]);
  const tp = useMemo(() => totauxMois(transactions, moisPrec), [transactions, moisPrec]);
  const rep = useMemo(
    () => repartitionDepenses(transactions, categories, mois),
    [transactions, categories, mois]
  );
  const taux = t.revenus > 0 ? (t.solde / t.revenus) * 100 : 0;

  return (
    <div className="animate-in">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="flex-between">
          <h2 style={{ margin: 0, textTransform: "capitalize" }}>{formatMois(mois)}</h2>
          <span className="chip" style={{ background: "var(--brand-grad-soft)" }}>Rapport mensuel</span>
        </div>
      </div>

      <div className="grid grid-auto" style={{ marginBottom: 16 }}>
        <Bloc label="Revenus" value={t.revenus} tone="pos" />
        <Bloc label="Dépenses" value={t.depenses} tone="neg" />
        <Bloc label="Épargne du mois" value={t.solde} tone={t.solde >= 0 ? "pos" : "neg"} />
        <Bloc label="Taux d'épargne" value={taux} suffix=" %" raw />
      </div>

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="card">
          <h2>Comparaison avec {formatMois(moisPrec)}</h2>
          <table className="data">
            <thead>
              <tr>
                <th></th>
                <th className="right">{formatMois(moisPrec)}</th>
                <th className="right">{formatMois(mois)}</th>
                <th className="right">Écart</th>
              </tr>
            </thead>
            <tbody>
              <LigneComp label="Revenus" prev={tp.revenus} cur={t.revenus} />
              <LigneComp label="Dépenses" prev={tp.depenses} cur={t.depenses} invert />
              <LigneComp label="Épargne" prev={tp.solde} cur={t.solde} />
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2>Principales dépenses</h2>
          {rep.length === 0 ? (
            <p className="muted">Aucune dépense ce mois-ci.</p>
          ) : (
            <CategorieBars data={rep.slice(0, 8)} />
          )}
        </div>
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RapportAnnuel({ annee, comptes, transactions, categories }: any) {
  const t = useMemo(() => totauxMois(transactions, String(annee)), [transactions, annee]);
  const rep = useMemo(
    () => repartitionDepenses(transactions, categories, String(annee)),
    [transactions, categories, annee]
  );
  const flux = useMemo(
    () => pointsFluxAnnee(transactions, annee, undefined),
    [transactions, annee]
  );
  const soldeFin = useMemo(() => {
    const iso = `${annee}-12-31`;
    const jusque = transactions.filter((x: { date: string }) => x.date <= iso);
    return soldeGlobal(comptes, jusque);
  }, [comptes, transactions, annee]);
  const taux = t.revenus > 0 ? (t.solde / t.revenus) * 100 : 0;
  const moyMensuelleDep = t.depenses / 12;

  return (
    <div className="animate-in">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="flex-between">
          <h2 style={{ margin: 0 }}>Année {annee}</h2>
          <span className="chip" style={{ background: "var(--brand-grad-soft)" }}>Rapport annuel</span>
        </div>
      </div>

      <div className="grid grid-auto" style={{ marginBottom: 16 }}>
        <Bloc label="Revenus de l'année" value={t.revenus} tone="pos" />
        <Bloc label="Dépenses de l'année" value={t.depenses} tone="neg" />
        <Bloc label="Épargne de l'année" value={t.solde} tone={t.solde >= 0 ? "pos" : "neg"} />
        <Bloc label="Taux d'épargne" value={taux} suffix=" %" raw />
        <Bloc label="Dépense mensuelle moyenne" value={moyMensuelleDep} tone="neutral" />
        <Bloc label="Solde au 31/12" value={soldeFin} tone={soldeFin >= 0 ? "pos" : "neg"} />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Flux mois par mois — {annee}</h2>
        <FluxBarChart data={flux} />
      </div>

      <div className="card">
        <h2>Répartition annuelle des dépenses</h2>
        {rep.length === 0 ? (
          <p className="muted">Aucune dépense sur {annee}.</p>
        ) : (
          <CategorieBars data={rep} />
        )}
      </div>
    </div>
  );
}

function Bloc({
  label,
  value,
  tone = "neutral",
  suffix,
  raw,
}: {
  label: string;
  value: number;
  tone?: "pos" | "neg" | "neutral";
  suffix?: string;
  raw?: boolean;
}) {
  const cls = tone === "pos" ? "pos" : tone === "neg" ? "neg" : "";
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className={`value num ${cls}`}>
        {raw ? `${value.toFixed(0)}${suffix ?? ""}` : formatMontant(value)}
      </div>
    </div>
  );
}

function LigneComp({
  label,
  prev,
  cur,
  invert,
}: {
  label: string;
  prev: number;
  cur: number;
  invert?: boolean;
}) {
  const ecart = cur - prev;
  const bon = invert ? ecart <= 0 : ecart >= 0;
  return (
    <tr>
      <td style={{ fontWeight: 600 }}>{label}</td>
      <td className="right num muted">{formatMontant(prev)}</td>
      <td className="right num" style={{ fontWeight: 650 }}>{formatMontant(cur)}</td>
      <td className="right num" style={{ fontWeight: 650, color: bon ? "var(--pos)" : "var(--neg)" }}>
        {ecart >= 0 ? "+" : "−"}
        {formatMontant(Math.abs(ecart))}
      </td>
    </tr>
  );
}
