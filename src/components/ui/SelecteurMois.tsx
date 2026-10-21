import { useId, useMemo, useState, type KeyboardEvent as KE } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { addMonths, format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Icon } from "../Icon";
import { formatMois, moisCourant } from "../../lib/format";
import { ressort, sortie } from "../../lib/motion";
import { usePopover } from "./usePopover";

const decaler = (m: string, n: number) => format(addMonths(parseISO(`${m}-01`), n), "yyyy-MM");
const ABREGES = Array.from({ length: 12 }, (_, i) =>
  format(new Date(2026, i, 1), "MMM", { locale: fr }).replace(".", "")
);

/**
 * Sélecteur de mois commun : ‹ octobre 2026 › pour passer d'un mois à l'autre,
 * clic sur le libellé pour une grille par année. Les mois qui ont des données
 * sont marqués d'un point. Option « Tous les mois » pour les filtres.
 */
export function SelecteurMois({
  valeur,
  onChange,
  disponibles,
  max = moisCourant(),
  tous,
}: {
  valeur: string;
  onChange: (m: string) => void;
  /** Mois ayant des données (bornent aussi la navigation vers le passé). */
  disponibles: string[];
  max?: string;
  /** Libellé de l'option « tous les mois » (valeur "tous"). */
  tous?: string;
}) {
  const { ouvert, setOuvert, fermer, declRef, popRef, pos, style } = usePopover("gauche");
  const avecDonnees = useMemo(() => new Set(disponibles), [disponibles]);
  const borneMax = [max, ...disponibles].sort().reverse()[0];
  const min = [moisCourant(), ...disponibles].sort()[0];
  const estTous = valeur === "tous";
  const base = estTous ? moisCourant() : valeur;
  const [annee, setAnnee] = useState(Number(base.slice(0, 4)));
  const idSel = useId();
  const [sens, setSens] = useState(0);

  const prec = decaler(base, -1);
  const suiv = decaler(base, 1);
  const aller = (m: string, s: number) => {
    setSens(s);
    onChange(m);
  };

  function ouvrir() {
    setAnnee(Number(base.slice(0, 4)));
    setOuvert(true);
  }

  function clavier(e: KE) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      fermer();
    }
  }

  const libelle = estTous ? tous : formatMois(valeur);

  return (
    <div className="mois-nav">
      <button
        type="button"
        className="mois-fleche"
        onClick={() => (estTous ? aller(moisCourant(), -1) : aller(prec, -1))}
        disabled={!estTous && prec < min}
        aria-label="Mois précédent"
        title="Mois précédent"
      >
        <Icon name="chevron-left" size={16} />
      </button>
      <button
        type="button"
        ref={(el) => (declRef.current = el)}
        className={"mois-lib" + (ouvert ? " ouvert" : "")}
        onClick={() => (ouvert ? fermer() : ouvrir())}
        aria-haspopup="dialog"
        aria-expanded={ouvert}
        aria-label={`Choisir le mois (actuellement ${libelle})`}
      >
        <Icon name="calendar" size={15} />
        <span className="mois-lib-txt">
          <AnimatePresence mode="popLayout" initial={false} custom={sens}>
            <motion.span
              key={valeur}
              custom={sens}
              initial={{ opacity: 0, y: sens >= 0 ? 10 : -10 }}
              animate={{ opacity: 1, y: 0, transition: ressort }}
              exit={{ opacity: 0, y: sens >= 0 ? -10 : 10, transition: sortie }}
            >
              {libelle}
            </motion.span>
          </AnimatePresence>
        </span>
      </button>
      <button
        type="button"
        className="mois-fleche"
        onClick={() => (estTous ? aller(moisCourant(), 1) : aller(suiv, 1))}
        disabled={!estTous && suiv > borneMax}
        aria-label="Mois suivant"
        title="Mois suivant"
      >
        <Icon name="chevron-right" size={16} />
      </button>

      {createPortal(
        <AnimatePresence>
          {ouvert && (
            <motion.div
              ref={popRef}
              className="menu-pop mois-pop"
              role="dialog"
              aria-label="Choisir un mois"
              tabIndex={-1}
              onKeyDown={clavier}
              style={style}
              initial={{ opacity: 0, y: pos?.haut ? 6 : -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: ressort }}
              exit={{ opacity: 0, scale: 0.98, transition: sortie }}
            >
              <div className="mois-pop-tete">
                <button
                  type="button"
                  className="mois-fleche"
                  onClick={() => setAnnee((a) => a - 1)}
                  disabled={`${annee - 1}-12` < min}
                  aria-label="Année précédente"
                >
                  <Icon name="chevron-left" size={16} />
                </button>
                <strong>{annee}</strong>
                <button
                  type="button"
                  className="mois-fleche"
                  onClick={() => setAnnee((a) => a + 1)}
                  disabled={`${annee + 1}-01` > borneMax}
                  aria-label="Année suivante"
                >
                  <Icon name="chevron-right" size={16} />
                </button>
              </div>
              <div className="mois-grille">
                {ABREGES.map((ab, i) => {
                  const m = `${annee}-${String(i + 1).padStart(2, "0")}`;
                  const choisi = m === valeur;
                  return (
                    <button
                      type="button"
                      key={m}
                      className={
                        "mois-case" +
                        (choisi ? " choisi" : "") +
                        (m === moisCourant() ? " aujourdhui" : "")
                      }
                      disabled={m < min || m > borneMax}
                      onClick={() => {
                        aller(m, m >= base ? 1 : -1);
                        fermer();
                      }}
                    >
                      {choisi && <motion.span layoutId={idSel} className="mois-case-fond" transition={ressort} />}
                      <span className="mois-case-txt">{ab}</span>
                      {avecDonnees.has(m) && <span className="mois-case-point" />}
                    </button>
                  );
                })}
              </div>
              <div className="mois-pop-pied">
                {tous && (
                  <button
                    type="button"
                    className={"btn sm" + (estTous ? " primary" : "")}
                    onClick={() => {
                      onChange("tous");
                      fermer();
                    }}
                  >
                    {tous}
                  </button>
                )}
                <button
                  type="button"
                  className="btn sm ghost"
                  onClick={() => {
                    aller(moisCourant(), moisCourant() >= base ? 1 : -1);
                    fermer();
                  }}
                >
                  Ce mois-ci
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}

/** Sélecteur d'année : ‹ 2026 ›. */
export function SelecteurAnnee({
  valeur,
  onChange,
  min,
  max,
}: {
  valeur: number;
  onChange: (a: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div className="mois-nav">
      <button
        type="button"
        className="mois-fleche"
        onClick={() => onChange(valeur - 1)}
        disabled={valeur <= min}
        aria-label="Année précédente"
      >
        <Icon name="chevron-left" size={16} />
      </button>
      <span className="mois-lib statique">
        <Icon name="calendar" size={15} />
        {valeur}
      </span>
      <button
        type="button"
        className="mois-fleche"
        onClick={() => onChange(valeur + 1)}
        disabled={valeur >= max}
        aria-label="Année suivante"
      >
        <Icon name="chevron-right" size={16} />
      </button>
    </div>
  );
}
