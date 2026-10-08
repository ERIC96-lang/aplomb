import { useState } from "react";
import { Icon } from "../../src/components/Icon";
import { useToast } from "../../src/state/ToastContext";
import { ClavierPin } from "./ClavierPin";
import { Feuille } from "./composants";
import { useVerrou } from "./verrou";

export type ModeCode = "creer" | "changer" | "desactiver";

type Etape = "actuel" | "nouveau" | "confirmer" | "faceid";

const TITRES: Record<ModeCode, string> = {
  creer: "Verrouiller l'app",
  changer: "Changer le code",
  desactiver: "Désactiver le verrouillage",
};

/** Création, modification ou désactivation du code (+ proposition Face ID). */
export function ReglageCode({ mode, onFin }: { mode: ModeCode; onFin: () => void }) {
  const { conf, faceIdDispo, activer, changerCode, verifierCode, desactiver, activerFaceId } = useVerrou();
  const toast = useToast();
  const [etape, setEtape] = useState<Etape>(mode === "creer" ? "nouveau" : "actuel");
  const [premier, setPremier] = useState("");
  const [refus, setRefus] = useState(0);
  const [busy, setBusy] = useState(false);

  async function actuel(c: string) {
    if (!(await verifierCode(c))) {
      setRefus((r) => r + 1);
      return;
    }
    if (mode === "desactiver") {
      desactiver();
      toast("Verrouillage désactivé");
      onFin();
    } else setEtape("nouveau");
  }

  function nouveau(c: string) {
    setPremier(c);
    setEtape("confirmer");
  }

  async function confirmer(c: string) {
    if (c !== premier) {
      toast("Les deux codes ne correspondent pas");
      setPremier("");
      setRefus((r) => r + 1);
      setEtape("nouveau");
      return;
    }
    if (mode === "creer") {
      await activer(c);
      if (faceIdDispo) setEtape("faceid");
      else {
        toast("Verrouillage activé");
        onFin();
      }
    } else {
      await changerCode(c);
      toast("Code modifié");
      onFin();
    }
  }

  function faceId() {
    setBusy(true);
    // Appel direct depuis le toucher : iOS l'exige pour Face ID.
    activerFaceId()
      .then(() => {
        toast("Verrouillage et Face ID activés");
        onFin();
      })
      .catch(() => {
        toast("Face ID n'a pas été activé ; le code reste actif");
        setBusy(false);
      });
  }

  const consignes: Record<Etape, string> = {
    actuel: "Saisissez votre code actuel.",
    nouveau: "Choisissez un code de 4 à 6 chiffres.",
    confirmer: "Saisissez à nouveau ce code pour le confirmer.",
    faceid: "",
  };

  return (
    <Feuille titre={TITRES[mode]} onFermer={onFin}>
      {etape === "faceid" ? (
        <div className="m-verif">
          <div className="m-vide" style={{ padding: 0 }}>
            <div className="ico">
              <Icon name="face-id" size={24} />
            </div>
          </div>
          <strong style={{ display: "block", fontSize: 17 }}>Déverrouiller avec Face ID ?</strong>
          <p className="m-note" style={{ marginTop: 8 }}>
            Plus besoin de taper le code : un regard suffit. Le code reste disponible en secours.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
            <button className="m-bouton" onClick={faceId} disabled={busy}>
              <Icon name="face-id" size={18} /> Activer Face ID
            </button>
            <button
              className="m-bouton secondaire"
              onClick={() => {
                toast("Verrouillage activé");
                onFin();
              }}
              disabled={busy}
            >
              Plus tard
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="m-note" style={{ textAlign: "center", fontSize: 14 }}>
            {consignes[etape]}
          </p>
          <ClavierPin
            key={etape}
            longueur={etape === "nouveau" ? null : etape === "confirmer" ? premier.length : conf.longueur}
            onCode={etape === "actuel" ? actuel : etape === "nouveau" ? nouveau : confirmer}
            refus={refus}
          />
        </>
      )}
    </Feuille>
  );
}
