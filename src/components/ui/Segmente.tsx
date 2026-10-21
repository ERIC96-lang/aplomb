import { useId, type ReactNode } from "react";
import { motion } from "motion/react";
import { Icon, type IconName } from "../Icon";
import { ressort } from "../../lib/motion";

export interface OptionSegment<T extends string | number> {
  value: T;
  label: ReactNode;
  ico?: IconName;
  /** Compteur affiché à droite du libellé. */
  compte?: number;
}

/** Choix exclusif court (horizon, scénario, type) : la pastille glisse vers l'option choisie. */
export function Segmente<T extends string | number>({
  options,
  valeur,
  onChange,
  label,
}: {
  options: OptionSegment<T>[];
  valeur: T;
  onChange: (v: T) => void;
  label?: string;
}) {
  const id = useId();
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const actif = o.value === valeur;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={actif}
            className={actif ? "active" : ""}
            onClick={() => onChange(o.value)}
          >
            {actif && <motion.span layoutId={id} className="seg-pill" transition={ressort} />}
            <span className="seg-txt">
              {o.ico && <Icon name={o.ico} size={15} />}
              {o.label}
              {o.compte !== undefined && <span className="seg-compte">{o.compte}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export interface Onglet<T extends string> {
  value: T;
  label: string;
  ico?: IconName;
  compte?: number;
}

/** Sous-menu d'une page : onglets soulignés, le trait glisse vers l'onglet actif. */
export function Onglets<T extends string>({
  onglets,
  valeur,
  onChange,
  label,
}: {
  onglets: Onglet<T>[];
  valeur: T;
  onChange: (v: T) => void;
  label?: string;
}) {
  const id = useId();
  return (
    <div className="onglets" role="tablist" aria-label={label}>
      {onglets.map((o) => {
        const actif = o.value === valeur;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={actif}
            className={"onglet" + (actif ? " actif" : "")}
            onClick={() => onChange(o.value)}
          >
            {o.ico && <Icon name={o.ico} size={16} />}
            {o.label}
            {o.compte !== undefined && o.compte > 0 && <span className="onglet-compte">{o.compte}</span>}
            {actif && <motion.span layoutId={id} className="onglet-trait" transition={ressort} />}
          </button>
        );
      })}
    </div>
  );
}
