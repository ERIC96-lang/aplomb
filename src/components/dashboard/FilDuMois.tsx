import { motion } from "motion/react";
import { formatMontant } from "../../lib/format";
import { Icon } from "../Icon";
import { aplomb } from "../../lib/motion";

export type EtatEvenement = "paye" | "avenir" | "retard" | "ailleurs" | "paie";

export interface EvenementFil {
  jour: number;
  label: string;
  montant: number;
  etat: EtatEvenement;
}

const LIBELLE_ETAT: Record<EtatEvenement, string> = {
  paye: "payée",
  avenir: "à venir",
  retard: "en retard",
  ailleurs: "réglée hors comptes",
  paie: "revenu attendu",
};

/**
 * « Le fil du mois » : une ligne du 1er au dernier jour, le fil à plomb sur
 * aujourd'hui, la paie et chaque charge fixe placées à leur date.
 */
export function FilDuMois({
  jours,
  aujourdhui,
  evenements,
}: {
  jours: number;
  /** Jour courant (1..jours), ou null pour un mois passé (fil entièrement parcouru). */
  aujourdhui: number | null;
  evenements: EvenementFil[];
}) {
  const position = (j: number) => `${((j - 0.5) / jours) * 100}%`;
  const avancement = aujourdhui === null ? 1 : (aujourdhui - 0.5) / jours;

  // Plusieurs événements le même jour : empilés au-dessus du fil.
  const parJour = new Map<number, number>();
  const places = [...evenements]
    .sort((a, b) => a.jour - b.jour)
    .map((e) => {
      const rang = parJour.get(e.jour) ?? 0;
      parJour.set(e.jour, rang + 1);
      return { ...e, rang };
    });

  const reperes = [1, Math.round(jours / 4), Math.round(jours / 2), Math.round((3 * jours) / 4), jours];

  return (
    <div className="fil" role="img" aria-label={`Fil du mois : ${evenements.length} événement(s)`}>
      <div className="fil-piste" style={{ height: 46 + Math.max(0, ...places.map((e) => e.rang)) * 15 }}>
        <div className="fil-ligne" />
        <motion.div
          className="fil-parcouru"
          style={{ width: `${avancement * 100}%` }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1, transition: { duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.15 } }}
        />
        {places.map((e, i) => (
          <motion.span
            key={`${e.jour}-${e.label}-${i}`}
            className={`fil-point ${e.etat}${e.jour / jours > 0.8 ? " bord-droit" : e.jour / jours < 0.15 ? " bord-gauche" : ""}`}
            style={{ left: position(e.jour), bottom: 4 + e.rang * 15 }}
            initial={{ opacity: 0, y: -10, scale: 0.6 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { ...aplomb, delay: 0.3 + i * 0.05 } }}
            tabIndex={0}
            aria-label={`${e.label}, le ${e.jour} : ${formatMontant(e.montant)} (${LIBELLE_ETAT[e.etat]})`}
          >
            {e.etat === "paie" ? <Icon name="trending-up" size={10} strokeWidth={3} /> : null}
            <span className="fil-bulle" role="tooltip">
              <strong>{e.label}</strong>
              <span>
                le {e.jour} · {formatMontant(e.montant)}
              </span>
              <em>{LIBELLE_ETAT[e.etat]}</em>
            </span>
          </motion.span>
        ))}
        {aujourdhui !== null && (
          // Le fil à plomb tombe sur aujourd'hui et se stabilise.
          <motion.div
            className="fil-plomb"
            style={{ left: position(aujourdhui) }}
            initial={{ opacity: 0, y: -18 }}
            animate={{ opacity: 1, y: 0, transition: { type: "spring", stiffness: 160, damping: 9, delay: 0.9 } }}
          >
            <span className="fil-plomb-lib">Aujourd'hui</span>
          </motion.div>
        )}
      </div>
      <div className="fil-reperes">
        {reperes.map((j) => (
          <span key={j} style={{ left: position(j) }}>
            {j}
          </span>
        ))}
      </div>
      <div className="fil-legende">
        <span><i className="fil-point paie mini"><Icon name="trending-up" size={8} strokeWidth={3} /></i> Paie</span>
        <span><i className="fil-point paye mini" /> Payée</span>
        <span><i className="fil-point avenir mini" /> À venir</span>
        <span><i className="fil-point retard mini" /> En retard</span>
      </div>
    </div>
  );
}
