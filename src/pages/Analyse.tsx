import { useMemo, useState } from "react";
import { useAppData } from "../state/AppDataContext";
import { SelecteurMois } from "../components/ui/SelecteurMois";
import { InsightRow } from "../components/Insights";
import { genererInsights, type NiveauInsight } from "../lib/insights";
import { Bandeau, Carte, Rangee, Vide } from "../components/ui/Page";
import { Segmente } from "../components/ui/Segmente";
import { moisDisponibles } from "../lib/calculs";
import { formatMois, moisCourant } from "../lib/format";

export function Analyse() {
  const data = useAppData();
  const [mois, setMois] = useState(moisCourant());
  const [filtre, setFiltre] = useState<NiveauInsight | "tous">("tous");

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

  const compte = {
    alerte: insights.filter((i) => i.niveau === "alerte").length,
    attention: insights.filter((i) => i.niveau === "attention").length,
    positif: insights.filter((i) => i.niveau === "positif").length,
    info: insights.filter((i) => i.niveau === "info").length,
  };
  const visibles = filtre === "tous" ? insights : insights.filter((i) => i.niveau === filtre);
  const aTraiter = visibles.filter((i) => i.niveau === "alerte" || i.niveau === "attention");
  const aSavoir = visibles.filter((i) => i.niveau === "positif" || i.niveau === "info");

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
        <Carte>
          <Vide
            ico="sparkles"
            titre={`Rien à signaler pour ${formatMois(mois)}`}
            texte="Tout semble sous contrôle. Ajoute des données ou reviens le mois prochain."
          />
        </Carte>
      ) : (
        <>
          <Bandeau
            surtitre={`Analyse · ${formatMois(mois)}`}
            valeur={
              <>
                {insights.length} <span className="pg-unite">point{insights.length > 1 ? "s" : ""} relevé{insights.length > 1 ? "s" : ""}</span>
              </>
            }
            humeur={compte.alerte > 0 ? "risque" : compte.attention > 0 ? "attention" : "ok"}
            statut={
              compte.alerte > 0
                ? `${compte.alerte} alerte${compte.alerte > 1 ? "s" : ""}`
                : compte.attention > 0
                  ? `${compte.attention} à surveiller`
                  : "Rien d'inquiétant"
            }
            phrase={`${compte.positif} bonne${compte.positif > 1 ? "s" : ""} nouvelle${compte.positif > 1 ? "s" : ""} · ${compte.info} information${compte.info > 1 ? "s" : ""}`}
          >
            <div className="pg-filtre-niveaux">
              <Segmente
                label="Afficher"
                valeur={filtre}
                onChange={setFiltre}
                options={[
                  { value: "tous", label: "Tout", compte: insights.length },
                  { value: "alerte", label: "Alertes", compte: compte.alerte },
                  { value: "attention", label: "À surveiller", compte: compte.attention },
                  { value: "positif", label: "Bonnes nouvelles", compte: compte.positif },
                  { value: "info", label: "Infos", compte: compte.info },
                ]}
              />
            </div>
          </Bandeau>

          <Rangee>
            <Carte titre="À traiter" ico="alert">
              {aTraiter.length === 0 ? (
                <p className="muted db-vide">Rien à traiter dans cette sélection.</p>
              ) : (
                <div className="db-insights">
                  {aTraiter.map((i) => (
                    <InsightRow key={i.id} insight={i} />
                  ))}
                </div>
              )}
            </Carte>
            <Carte titre="Bonnes nouvelles & infos" ico="bulb">
              {aSavoir.length === 0 ? (
                <p className="muted db-vide">Rien dans cette sélection.</p>
              ) : (
                <div className="db-insights">
                  {aSavoir.map((i) => (
                    <InsightRow key={i.id} insight={i} />
                  ))}
                </div>
              )}
            </Carte>
          </Rangee>
        </>
      )}
    </>
  );
}
