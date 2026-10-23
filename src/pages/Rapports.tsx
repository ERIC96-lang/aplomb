import { Segmente } from "../components/ui/Segmente";
import { useMemo, useState } from "react";
import { addMonths, format } from "date-fns";
import { useAppData } from "../state/AppDataContext";
import { useToast } from "../state/ToastContext";
import {
  moisDisponibles,
  repartitionDepenses,
  repartitionDepensesPeriode,
  soldeGlobal,
  totauxMois,
  totauxPeriode,
} from "../lib/calculs";
import { pointsFluxAnnee } from "../lib/series";
import { CategorieBars, CategorieDonut, FluxBarChart } from "../components/charts";
import { Bandeau, Carte, Indicateurs, Kpi, LigneCalcul, Rangee, TotalCalcul } from "../components/ui/Page";
import { Icon } from "../components/Icon";
import { SelecteurAnnee, SelecteurMois } from "../components/ui/SelecteurMois";
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
  const moisAvecDonnees = useMemo(() => moisDisponibles(transactions), [transactions]);

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
      repartition: d.rep.map((r) => ({ nom: r.nom, montant: r.montant, couleur: r.couleur })),
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
          <Segmente
            label="Type de rapport"
            valeur={type}
            onChange={setType}
            options={[
              { value: "mensuel", label: "Mensuel" },
              { value: "annuel", label: "Annuel" },
              { value: "periode", label: "Période" },
            ]}
          />
          {type === "mensuel" && (
            <SelecteurMois valeur={mois} onChange={setMois} disponibles={moisAvecDonnees} />
          )}
          {type === "annuel" && (
            <SelecteurAnnee
              valeur={annee}
              onChange={setAnnee}
              min={Math.min(new Date().getFullYear(), ...moisAvecDonnees.map((m) => Number(m.slice(0, 4))))}
              max={new Date().getFullYear()}
            />
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

/** Bandeau commun : l'épargne de la période, son taux, le calcul. */
function Synthese({ surtitre, revenus, depenses }: { surtitre: string; revenus: number; depenses: number }) {
  const solde = revenus - depenses;
  const taux = revenus > 0 ? Math.round((solde / revenus) * 100) : 0;
  return (
    <Bandeau
      surtitre={surtitre}
      montant={solde}
      humeur={solde >= 0 ? "ok" : "risque"}
      statut={revenus > 0 ? `${taux} % épargnés` : solde >= 0 ? "Équilibré" : "Déficitaire"}
      phrase={
        <>
          épargnés sur <strong className="num">{formatMontant(revenus)}</strong> de revenus
        </>
      }
      calcul={
        <>
          <LigneCalcul label="Revenus" valeur={revenus} />
          <LigneCalcul label="Dépenses" valeur={-depenses} />
          <TotalCalcul label="Épargne" valeur={solde} />
        </>
      }
    />
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RapportPeriode({ debut, fin, transactions, categories }: any) {
  const t = useMemo(() => totauxPeriode(transactions, debut, fin), [transactions, debut, fin]);
  const rep = useMemo(
    () => repartitionDepensesPeriode(transactions, categories, debut, fin),
    [transactions, categories, debut, fin]
  );
  const total = rep.reduce((a: number, r: { montant: number }) => a + r.montant, 0);
  return (
    <>
      <Synthese surtitre={`Période · ${formatDate(debut)} – ${formatDate(fin)}`} revenus={t.revenus} depenses={t.depenses} />
      <Repartition rep={rep} total={total} vide="Aucune dépense sur cette période." />
    </>
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
  const total = rep.reduce((a: number, r: { montant: number }) => a + r.montant, 0);

  return (
    <>
      <Synthese surtitre={`Rapport mensuel · ${formatMois(mois)}`} revenus={t.revenus} depenses={t.depenses} />
      <Rangee>
        <Repartition rep={rep} total={total} vide="Aucune dépense ce mois-ci." seule />
        <Carte titre={`Comparé à ${formatMois(moisPrec)}`} ico="trending-up">
          <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th></th>
                <th className="right">Avant</th>
                <th className="right">Ce mois</th>
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
        </Carte>
      </Rangee>
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RapportAnnuel({ annee, comptes, transactions, categories }: any) {
  const t = useMemo(() => totauxMois(transactions, String(annee)), [transactions, annee]);
  const rep = useMemo(
    () => repartitionDepenses(transactions, categories, String(annee)),
    [transactions, categories, annee]
  );
  const flux = useMemo(() => pointsFluxAnnee(transactions, annee, undefined), [transactions, annee]);
  const soldeFin = useMemo(() => {
    const iso = `${annee}-12-31`;
    const jusque = transactions.filter((x: { date: string }) => x.date <= iso);
    return soldeGlobal(comptes, jusque);
  }, [comptes, transactions, annee]);
  const total = rep.reduce((a: number, r: { montant: number }) => a + r.montant, 0);
  const meilleur = flux.reduce(
    (m: { label: string; epargne: number } | null, f: { label: string; epargne: number }) => (!m || f.epargne > m.epargne ? f : m),
    null
  );

  return (
    <>
      <Synthese surtitre={`Rapport annuel · ${annee}`} revenus={t.revenus} depenses={t.depenses} />
      <Indicateurs>
        <Kpi label="Revenus / mois" ico="trending-up" montant={t.revenus / 12} ton="pos" sous="moyenne sur 12 mois" serie={flux.map((f: { revenus: number }) => f.revenus)} couleur="var(--green)" />
        <Kpi label="Dépenses / mois" ico="trending-down" montant={t.depenses / 12} ton="neg" sous="moyenne sur 12 mois" serie={flux.map((f: { depenses: number }) => f.depenses)} couleur="var(--red)" />
        <Kpi label="Meilleur mois" ico="sparkles" montant={meilleur?.epargne ?? 0} sous={meilleur ? `épargnés en ${meilleur.label}` : undefined} />
        <Kpi label="Solde au 31/12" ico="wallet" montant={soldeFin} ton={soldeFin >= 0 ? undefined : "neg"} sous="tous comptes" />
      </Indicateurs>
      <Carte titre={`Flux mois par mois — ${annee}`} ico="trending-up" className="pg-espace">
        <FluxBarChart data={flux} />
      </Carte>
      <Repartition rep={rep} total={total} vide={`Aucune dépense sur ${annee}.`} />
    </>
  );
}

/** Dépenses par catégorie : donut + détail, comme sur le tableau de bord. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Repartition({ rep, total, vide, seule }: { rep: any[]; total: number; vide: string; seule?: boolean }) {
  return (
    <Carte titre="Dépenses par catégorie" ico="coins" className={seule ? "" : "pg-espace"}>
      {rep.length === 0 ? (
        <p className="muted db-vide">{vide}</p>
      ) : (
        <div className="db-repartition">
          <CategorieDonut data={rep} total={total} />
          <CategorieBars data={rep.slice(0, 8)} />
        </div>
      )}
    </Carte>
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
