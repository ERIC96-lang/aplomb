import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { definirPin, pinActif, supprimerPin, verifierPin } from "../lib/pin";
import { helloDisponible } from "../lib/hello";

function lireDelai(): number {
  try {
    return Number(localStorage.getItem("autolock") ?? "0") || 0;
  } catch {
    return 0;
  }
}

interface LockCtx {
  pinDefini: boolean;
  verrouille: boolean;
  deverrouiller: (pin: string) => Promise<boolean>;
  deverrouillerDirect: () => void; // après succès Windows Hello
  verrouiller: () => void;
  definir: (pin: string) => Promise<void>;
  supprimer: () => void;
  delaiAutoLock: number; // minutes, 0 = désactivé
  setDelaiAutoLock: (min: number) => void;
  helloDispo: boolean;
  biometrie: boolean;
  setBiometrie: (v: boolean) => void;
}

const Ctx = createContext<LockCtx | null>(null);

export function LockProvider({ children }: { children: ReactNode }) {
  const [pinDefini, setPinDefini] = useState(pinActif());
  const [verrouille, setVerrouille] = useState(pinActif()); // verrouillé au lancement
  const [delaiAutoLock, setDelaiState] = useState(lireDelai());
  const [helloDispo, setHelloDispo] = useState(false);
  const [biometrie, setBiometrieState] = useState(() => {
    try {
      return localStorage.getItem("biometrie") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    helloDisponible().then(setHelloDispo);
  }, []);

  const setBiometrie = useCallback((v: boolean) => {
    setBiometrieState(v);
    try {
      localStorage.setItem("biometrie", v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const deverrouiller = useCallback(async (pin: string) => {
    const ok = await verifierPin(pin);
    if (ok) setVerrouille(false);
    return ok;
  }, []);

  const deverrouillerDirect = useCallback(() => setVerrouille(false), []);

  const verrouiller = useCallback(() => {
    if (pinActif()) setVerrouille(true);
  }, []);

  const setDelaiAutoLock = useCallback((min: number) => {
    setDelaiState(min);
    try {
      localStorage.setItem("autolock", String(min));
    } catch {
      /* ignore */
    }
  }, []);

  // Auto-verrouillage après inactivité.
  const timerRef = useRef<number>(0);
  useEffect(() => {
    if (!pinDefini || delaiAutoLock <= 0 || verrouille) return;
    const reset = () => {
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(
        () => setVerrouille(true),
        delaiAutoLock * 60_000
      );
    };
    const evts: (keyof WindowEventMap)[] = ["mousemove", "keydown", "click", "scroll"];
    evts.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      window.clearTimeout(timerRef.current);
      evts.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [pinDefini, delaiAutoLock, verrouille]);

  const definir = useCallback(async (pin: string) => {
    await definirPin(pin);
    setPinDefini(true);
    setVerrouille(false);
  }, []);

  const supprimer = useCallback(() => {
    supprimerPin();
    setPinDefini(false);
    setVerrouille(false);
  }, []);

  return (
    <Ctx.Provider
      value={{
        pinDefini,
        verrouille,
        deverrouiller,
        deverrouillerDirect,
        verrouiller,
        definir,
        supprimer,
        delaiAutoLock,
        setDelaiAutoLock,
        helloDispo,
        biometrie,
        setBiometrie,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useLock(): LockCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLock doit être utilisé dans LockProvider");
  return ctx;
}
