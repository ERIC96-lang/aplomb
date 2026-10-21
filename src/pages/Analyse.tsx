import { useMemo, useState } from "react";
import { useAppData } from "../state/AppDataContext";
import { SelecteurMois } from "../components/ui/SelecteurMois";
import { Icon } from "../components/Icon";
import { InsightRow } from "../components/Insights";
import { genererInsights } from "../lib/insights";
import { moisDisponibles } from "../lib/calculs";
import { formatMois, moisCourant } from "../lib/format";

export function Analyse() {
  const data = useAppData();
  const [mois, setMois] = useState(moisCourant());

  const moisList = useMemo(() => {
    const l = moisDisponibles(data.transactions);
    const mc = moisCourant();
    if (!l.includes(mc)) l.unshift(mc);
    return l;
  }, [data.transactions]);

  const insights = useMemo(
    () =>
      genererInsights(
        {
          comptes: data.comptes,
          transactions: data.transactions,
          categories: data.categories,
          chargesFixes: data.chargesFixes,
          echeances: data.echeances,
          budgets: data.budgets,
          objectifs: data.objectifs,
          suggestions: data.suggestions,
        },
        mois
      ),
    [data, mois]
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Analyse</h1>
          <div className="sub">Ce que l'app repère automatiquement dans tes finances</div>
        </div>
        <SelecteurMois valeur={mois} onChange={setMois} disponibles={moisList} />
      </div>

      {insights.length === 0 ? (
        <div className="card empty">
          <div className="big">
            <Icon name="sparkles" size={44} strokeWidth={1.5} />
          </div>
          <p>Rien à signaler pour {formatMois(mois)} — tout semble sous contrôle. Ajoute des données ou reviens le mois prochain.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {insights.map((i) => (
            <InsightRow key={i.id} insight={i} />
          ))}
        </div>
      )}
    </>
  );
}
