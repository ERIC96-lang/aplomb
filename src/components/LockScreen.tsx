import { useCallback, useEffect, useRef, useState } from "react";
import { useLock } from "../state/LockContext";
import { helloVerifier } from "../lib/hello";
import { Icon } from "./Icon";

const MAX = 6;
const MIN = 4;

export function LockScreen() {
  const { deverrouiller, deverrouillerDirect, helloDispo, biometrie } = useLock();
  const [pin, setPin] = useState("");
  const [erreur, setErreur] = useState(false);
  const [busy, setBusy] = useState(false);

  const tenterHello = useCallback(async () => {
    const ok = await helloVerifier("Déverrouiller Budget Perso");
    if (ok) deverrouillerDirect();
    return ok;
  }, [deverrouillerDirect]);

  // Propose Windows Hello automatiquement au lancement si activé.
  const dejaTente = useRef(false);
  useEffect(() => {
    if (helloDispo && biometrie && !dejaTente.current) {
      dejaTente.current = true;
      void tenterHello();
    }
  }, [helloDispo, biometrie, tenterHello]);

  const valider = useCallback(
    async (code: string) => {
      if (code.length < MIN) return;
      setBusy(true);
      const ok = await deverrouiller(code);
      setBusy(false);
      if (!ok) {
        setErreur(true);
        setPin("");
        setTimeout(() => setErreur(false), 450);
      }
    },
    [deverrouiller]
  );

  const ajouter = useCallback(
    (d: string) => {
      setPin((p) => {
        if (p.length >= MAX) return p;
        const next = p + d;
        if (next.length === MAX) void valider(next);
        return next;
      });
    },
    [valider]
  );

  const effacer = useCallback(() => setPin((p) => p.slice(0, -1)), []);

  // Support du clavier physique.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) ajouter(e.key);
      else if (e.key === "Backspace") effacer();
      else if (e.key === "Enter") void valider(pin);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ajouter, effacer, valider, pin]);

  return (
    <div className="lock">
      <div className={"lock-card" + (erreur ? " shake" : "")}>
        <div className="lock-logo">
          <Icon name="wallet" size={26} />
        </div>
        <h2 style={{ margin: "0 0 4px" }}>Budget Perso</h2>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          {erreur ? "Code incorrect, réessaie" : "Saisis ton code PIN"}
        </p>

        <div className="pin-dots">
          {Array.from({ length: MAX }).map((_, i) => (
            <span key={i} className={"pin-dot" + (i < pin.length ? " on" : "")} />
          ))}
        </div>

        <div className="keypad">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button key={d} className="key" onClick={() => ajouter(d)} disabled={busy}>
              {d}
            </button>
          ))}
          <button className="key wide" onClick={effacer} disabled={busy} aria-label="Effacer">
            ⌫
          </button>
          <button className="key" onClick={() => ajouter("0")} disabled={busy}>
            0
          </button>
          <button
            className="key wide"
            onClick={() => valider(pin)}
            disabled={busy || pin.length < MIN}
            aria-label="Valider"
            style={{ color: "var(--accent)" }}
          >
            <Icon name="check" size={20} />
          </button>
        </div>

        {helloDispo && biometrie && (
          <button className="btn" style={{ width: "100%", justifyContent: "center", marginTop: 16 }} onClick={tenterHello}>
            <Icon name="lock" size={15} /> Déverrouiller avec Windows Hello
          </button>
        )}
      </div>
    </div>
  );
}
