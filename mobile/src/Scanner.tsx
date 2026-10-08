import { useEffect, useRef, useState } from "react";
import { Icon } from "../../src/components/Icon";

interface Props {
  /** Appelé à chaque QR lu ; renvoyer true pour arrêter le scan, false pour continuer. */
  onCode: (texte: string) => boolean;
  onFermer: () => void;
  consigne: string;
}

/**
 * Lecteur de QR code plein écran : caméra arrière + décodage local (jsQR).
 * Rien ne quitte le téléphone. Repli sur une saisie manuelle du code.
 */
export function Scanner({ onCode, onFermer, consigne }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const rappel = useRef(onCode);
  rappel.current = onCode;
  const [erreur, setErreur] = useState<string | null>(null);
  const [manuel, setManuel] = useState(false);
  const [texte, setTexte] = useState("");

  useEffect(() => {
    if (manuel) return;
    let flux: MediaStream | null = null;
    let arret = false;
    let minuteur = 0;
    let dernierRejet = "";

    (async () => {
      try {
        const { default: jsQR } = await import("jsqr");
        flux = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (arret) return;
        const v = video.current!;
        v.srcObject = flux;
        await v.play();
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

        const lire = () => {
          if (arret) return;
          if (v.readyState >= 2 && v.videoWidth) {
            const r = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight));
            canvas.width = Math.round(v.videoWidth * r);
            canvas.height = Math.round(v.videoHeight * r);
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
            if (code?.data && code.data !== dernierRejet) {
              if (rappel.current(code.data)) {
                arret = true;
                return;
              }
              dernierRejet = code.data;
            }
          }
          minuteur = window.setTimeout(lire, 160);
        };
        lire();
      } catch (e) {
        const nom = e instanceof DOMException ? e.name : "";
        setErreur(
          nom === "NotAllowedError"
            ? "L'accès à l'appareil photo a été refusé. Vous pouvez saisir le code à la main."
            : "Appareil photo indisponible. Vous pouvez saisir le code à la main."
        );
      }
    })();

    return () => {
      arret = true;
      clearTimeout(minuteur);
      flux?.getTracks().forEach((t) => t.stop());
    };
  }, [manuel]);

  return (
    <div className="m-scanner">
      {!manuel && <video ref={video} playsInline muted autoPlay />}
      {!manuel && !erreur && <div className="m-viseur" aria-hidden="true" />}
      <div className="m-scanner-haut">
        <button className="m-fermer" onClick={onFermer} aria-label="Fermer">
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="m-scanner-bas">
        {manuel ? (
          <>
            <div>Collez ou saisissez le code d'appairage affiché sous le QR code du PC.</div>
            <textarea
              className="m-input"
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
              placeholder="bpsync1:…"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <button className="m-bouton" onClick={() => rappel.current(texte)} disabled={!texte.trim()}>
              Valider le code
            </button>
            <button className="m-bouton secondaire" onClick={() => setManuel(false)}>
              Revenir au scan
            </button>
          </>
        ) : (
          <>
            <div>{erreur ?? consigne}</div>
            <button className="m-bouton secondaire" onClick={() => setManuel(true)}>
              Saisir le code à la main
            </button>
          </>
        )}
      </div>
    </div>
  );
}
