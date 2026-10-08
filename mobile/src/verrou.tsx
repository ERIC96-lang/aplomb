import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { definirPin, pinActif, supprimerPin, verifierPin } from "../../src/lib/pin";
import {
  enregistrerFaceId,
  faceIdDisponible,
  oublierFaceId,
  verifierFaceId,
  type CleFaceId,
} from "./faceid";

/**
 * Verrouillage de l'app sur le téléphone : code (4 à 6 chiffres, haché PBKDF2,
 * jamais stocké en clair) + Face ID en option. C'est un verrou d'accès à l'app,
 * en complément du verrouillage de l'iPhone lui-même.
 */
export interface ConfVerrou {
  actif: boolean;
  longueur: number; // nombre de chiffres du code
  faceId: CleFaceId | null;
  delaiMin: number; // 0 = dès que l'app passe en arrière-plan
}

const CLE = "aplomb.verrou";
const CLE_ECHECS = "aplomb.verrou.echecs";
const DEFAUT: ConfVerrou = { actif: false, longueur: 4, faceId: null, delaiMin: 0 };

export const DELAIS = [
  { min: 0, libelle: "Immédiatement" },
  { min: 1, libelle: "Après 1 minute" },
  { min: 5, libelle: "Après 5 minutes" },
  { min: 15, libelle: "Après 15 minutes" },
];

function lireConf(): ConfVerrou {
  try {
    const r = localStorage.getItem(CLE);
    if (r) return { ...DEFAUT, ...JSON.parse(r) };
  } catch {
    /* ignore */
  }
  return { ...DEFAUT };
}

function ecrireConf(c: ConfVerrou): void {
  try {
    localStorage.setItem(CLE, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

interface Echecs {
  n: number;
  jusqua: number; // horodatage de fin de blocage
}

function lireEchecs(): Echecs {
  try {
    return { n: 0, jusqua: 0, ...JSON.parse(localStorage.getItem(CLE_ECHECS) ?? "{}") };
  } catch {
    return { n: 0, jusqua: 0 };
  }
}

function ecrireEchecs(e: Echecs): void {
  try {
    localStorage.setItem(CLE_ECHECS, JSON.stringify(e));
  } catch {
    /* ignore */
  }
}

/** Blocage progressif : 30 s à partir du 5e code faux, 5 min à partir du 10e. */
export function dureeBlocage(echecs: number): number {
  if (echecs >= 10) return 5 * 60_000;
  if (echecs >= 5) return 30_000;
  return 0;
}

interface Verrou {
  conf: ConfVerrou;
  verrouille: boolean;
  faceIdDispo: boolean;
  bloqueJusqua: number;
  activer(code: string): Promise<void>;
  changerCode(code: string): Promise<void>;
  verifierCode(code: string): Promise<boolean>;
  desactiver(): void;
  activerFaceId(): Promise<void>;
  retirerFaceId(): void;
  changerDelai(min: number): void;
  essayerCode(code: string): Promise<boolean>;
  essayerFaceId(): Promise<boolean>;
}

const Ctx = createContext<Verrou | null>(null);

export function VerrouProvider({ children }: { children: ReactNode }) {
  const [conf, setConf] = useState<ConfVerrou>(lireConf);
  const [verrouille, setVerrouille] = useState(() => lireConf().actif && pinActif());
  const [faceIdDispo, setFaceIdDispo] = useState(false);
  const [bloqueJusqua, setBloqueJusqua] = useState(() => lireEchecs().jusqua);
  const confRef = useRef(conf);
  confRef.current = conf;
  const cacheLe = useRef<number | null>(null);

  useEffect(() => {
    void faceIdDisponible().then(setFaceIdDispo);
  }, []);

  // Verrouillage au passage en arrière-plan (immédiat) ou au retour (après le délai).
  useEffect(() => {
    const surChangement = () => {
      const c = confRef.current;
      if (!c.actif) return;
      if (document.visibilityState === "hidden") {
        cacheLe.current = Date.now();
        // Immédiat : l'aperçu du sélecteur d'apps montre déjà l'écran verrouillé.
        if (c.delaiMin === 0) setVerrouille(true);
      } else if (cacheLe.current !== null && Date.now() - cacheLe.current >= c.delaiMin * 60_000) {
        setVerrouille(true);
      }
    };
    document.addEventListener("visibilitychange", surChangement);
    return () => document.removeEventListener("visibilitychange", surChangement);
  }, []);

  const majConf = useCallback((c: ConfVerrou) => {
    ecrireConf(c);
    setConf(c);
  }, []);

  const reussite = useCallback(() => {
    ecrireEchecs({ n: 0, jusqua: 0 });
    setBloqueJusqua(0);
    setVerrouille(false);
  }, []);

  const essayerCode = useCallback(
    async (code: string) => {
      const e = lireEchecs();
      if (Date.now() < e.jusqua) return false;
      if (await verifierPin(code)) {
        reussite();
        return true;
      }
      const n = e.n + 1;
      const jusqua = Date.now() + dureeBlocage(n);
      ecrireEchecs({ n, jusqua });
      setBloqueJusqua(jusqua);
      return false;
    },
    [reussite]
  );

  // Appelé directement depuis un toucher : la demande Face ID part sans attente.
  const essayerFaceId = useCallback(async () => {
    const cle = confRef.current.faceId;
    if (!cle) return false;
    const ok = await verifierFaceId(cle);
    if (ok) reussite();
    return ok;
  }, [reussite]);

  const activer = useCallback(
    async (code: string) => {
      await definirPin(code);
      majConf({ ...confRef.current, actif: true, longueur: code.length });
      ecrireEchecs({ n: 0, jusqua: 0 });
    },
    [majConf]
  );

  const changerCode = useCallback(
    async (code: string) => {
      await definirPin(code);
      majConf({ ...confRef.current, longueur: code.length });
    },
    [majConf]
  );

  const desactiver = useCallback(() => {
    if (confRef.current.faceId) oublierFaceId(confRef.current.faceId);
    supprimerPin();
    ecrireEchecs({ n: 0, jusqua: 0 });
    majConf({ ...DEFAUT });
    setBloqueJusqua(0);
    setVerrouille(false);
  }, [majConf]);

  const activerFaceId = useCallback(async () => {
    const cle = await enregistrerFaceId();
    majConf({ ...confRef.current, faceId: cle });
  }, [majConf]);

  const retirerFaceId = useCallback(() => {
    if (confRef.current.faceId) oublierFaceId(confRef.current.faceId);
    majConf({ ...confRef.current, faceId: null });
  }, [majConf]);

  const changerDelai = useCallback(
    (min: number) => majConf({ ...confRef.current, delaiMin: min }),
    [majConf]
  );

  const valeur: Verrou = {
    conf,
    verrouille: conf.actif && verrouille,
    faceIdDispo,
    bloqueJusqua,
    activer,
    changerCode,
    verifierCode: verifierPin,
    desactiver,
    activerFaceId,
    retirerFaceId,
    changerDelai,
    essayerCode,
    essayerFaceId,
  };
  return <Ctx.Provider value={valeur}>{children}</Ctx.Provider>;
}

export function useVerrou(): Verrou {
  const c = useContext(Ctx);
  if (!c) throw new Error("useVerrou doit être utilisé dans VerrouProvider");
  return c;
}
