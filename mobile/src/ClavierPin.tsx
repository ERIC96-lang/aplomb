import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "../../src/components/Icon";

const MIN = 4;
const MAX = 6;

interface Props {
  /** Longueur attendue (validation automatique), ou null pour 4 à 6 chiffres avec bouton Valider. */
  longueur: number | null;
  onCode: (code: string) => void | Promise<void>;
  desactive?: boolean;
  /** Incrémenter pour secouer les points et vider la saisie (code refusé). */
  refus?: number;
  /** Touche en bas à gauche (ex. Face ID). */
  toucheGauche?: ReactNode;
}

/** Points + pavé numérique façon iOS. */
export function ClavierPin({ longueur, onCode, desactive, refus = 0, toucheGauche }: Props) {
  const [code, setCode] = useState("");
  const [secoue, setSecoue] = useState(false);

  useEffect(() => {
    if (!refus) return;
    setCode("");
    setSecoue(true);
    const t = setTimeout(() => setSecoue(false), 420);
    return () => clearTimeout(t);
  }, [refus]);

  const max = longueur ?? MAX;

  function taper(chiffre: string) {
    if (desactive || code.length >= max) return;
    const suivant = code + chiffre;
    setCode(suivant);
    if (longueur !== null && suivant.length === longueur) {
      setTimeout(() => void onCode(suivant), 90); // laisse voir le dernier point
    }
  }

  const touches = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

  return (
    <div className="m-clavier-bloc">
      <div className={`m-points ${secoue ? "m-secoue" : ""}`} aria-label={`${code.length} chiffre(s) saisi(s)`}>
        {Array.from({ length: max }, (_, i) => (
          <span key={i} className={i < code.length ? "plein" : ""} />
        ))}
      </div>
      <div className="m-clavier" role="group" aria-label="Pavé numérique">
        {touches.map((t) => (
          <button key={t} className="m-touche" onClick={() => taper(t)} disabled={desactive}>
            {t}
          </button>
        ))}
        {toucheGauche ?? <span className="m-touche vide" aria-hidden="true" />}
        <button className="m-touche" onClick={() => taper("0")} disabled={desactive}>
          0
        </button>
        <button
          className="m-touche vide"
          onClick={() => setCode((c) => c.slice(0, -1))}
          aria-label="Effacer"
          disabled={desactive || code.length === 0}
        >
          <Icon name="chevron-left" size={26} />
        </button>
      </div>
      {longueur === null && (
        <button
          className="m-bouton"
          onClick={() => void onCode(code)}
          disabled={desactive || code.length < MIN}
          style={{ marginTop: 6 }}
        >
          Valider
        </button>
      )}
    </div>
  );
}
