import { useEffect, useRef, useState } from "react";
import { Icon } from "../../src/components/Icon";
import { ClavierPin } from "./ClavierPin";
import { useEtat } from "./etat";
import { useVerrou } from "./verrou";

/** Écran verrouillé, posé par-dessus l'app (qui reste montée : aucune saisie perdue). */
export function EcranVerrou() {
  const { conf, essayerCode, essayerFaceId, bloqueJusqua, desactiver } = useVerrou();
  const { oublierTout } = useEtat();
  const [refus, setRefus] = useState(0);
  const [maintenant, setMaintenant] = useState(Date.now());
  const dejaPropose = useRef(false);

  // Propose Face ID dès l'affichage (iOS peut exiger un toucher : le bouton reste là).
  useEffect(() => {
    if (conf.faceId && !dejaPropose.current) {
      dejaPropose.current = true;
      void essayerFaceId();
    }
  }, [conf.faceId, essayerFaceId]);

  const bloque = bloqueJusqua > maintenant;
  useEffect(() => {
    if (!bloque) return;
    const t = setInterval(() => setMaintenant(Date.now()), 500);
    return () => clearInterval(t);
  }, [bloque]);

  async function code(c: string) {
    if (!(await essayerCode(c))) {
      setMaintenant(Date.now());
      setRefus((r) => r + 1);
    }
  }

  async function oublie() {
    if (
      !window.confirm(
        "Effacer toutes les données de ce téléphone ? Vos comptes restent intacts sur le PC : il suffira de ré-appairer l'iPhone. Les saisies pas encore envoyées seront perdues."
      )
    )
      return;
    await oublierTout();
    desactiver();
  }

  const secondes = Math.ceil((bloqueJusqua - maintenant) / 1000);

  return (
    <div className="m-verrou" role="dialog" aria-modal="true" aria-label="Aplomb est verrouillé">
      <div className="m-logo" aria-hidden="true">
        <Icon name="wallet" size={30} strokeWidth={2.2} />
      </div>
      <h2>Aplomb est verrouillé</h2>
      <p className="m-verrou-sous" aria-live="polite">
        {bloque
          ? `Trop d'essais. Réessayez dans ${secondes > 60 ? `${Math.ceil(secondes / 60)} min` : `${secondes} s`}.`
          : "Saisissez votre code"}
      </p>
      <ClavierPin
        longueur={conf.longueur}
        onCode={code}
        desactive={bloque}
        refus={refus}
        toucheGauche={
          conf.faceId ? (
            <button className="m-touche vide" onClick={() => void essayerFaceId()} aria-label="Déverrouiller avec Face ID">
              <Icon name="face-id" size={30} strokeWidth={1.8} />
            </button>
          ) : undefined
        }
      />
      <button className="m-bouton discret" onClick={oublie}>
        Code oublié ?
      </button>
    </div>
  );
}
