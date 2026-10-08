import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Compte, Transaction } from "../../src/db/types";
import {
  deballer,
  emballer,
  empreinte as calculerEmpreinte,
  importerCle,
  lireCodeAppairage,
} from "../../src/sync/crypto";
import { saisiesEnAttente, transactionsFusionnees, uuidsIntegres } from "../../src/sync/fusion";
import {
  VERSION_PROTOCOLE,
  instantaneValide,
  nomFichierSaisie,
  type Instantane,
  type SaisieMobile,
} from "../../src/sync/protocole";
import { setDevise } from "../../src/lib/format";
import { ONEDRIVE_CLIENT_ID } from "./config";
import { CLES, demanderPersistance, ecrire, lire, supprimer, toutEffacer } from "./stockage";

/** Saisie conservée sur le téléphone jusqu'à ce que le PC l'ait intégrée. */
export interface SaisieLocale extends SaisieMobile {
  envoyee: boolean;
}

export type NouvelleSaisie = Pick<
  SaisieMobile,
  "type" | "montant" | "date" | "description" | "compte_id" | "categorie_id" | "photo"
>;

export interface EtatSync {
  enCours: boolean;
  derniere: string | null;
  erreur: string | null;
}

interface Etat {
  pret: boolean;
  appaire: boolean;
  empreinte: string | null;
  inst: Instantane | null;
  saisies: SaisieLocale[];
  /** Saisies pas encore intégrées par le PC. */
  attente: SaisieLocale[];
  /** Transactions du PC + saisies en attente (ids négatifs). */
  transactions: Transaction[];
  comptes: Compte[];
  sync: EtatSync;
  onedrive: { disponible: boolean; compte: string | null };
  appairer(code: string): Promise<string>;
  oublierTout(): Promise<void>;
  ajouterSaisie(s: NouvelleSaisie): Promise<void>;
  annulerSaisie(uuid: string): Promise<void>;
  synchroniser(): Promise<void>;
  importerFichier(f: File): Promise<void>;
  partagerSaisies(): Promise<number>;
  connecterOneDrive(): Promise<void>;
  deconnecterOneDrive(): Promise<void>;
}

const Ctx = createContext<Etat | null>(null);

function versProtocole(s: SaisieLocale): SaisieMobile {
  return {
    v: s.v,
    uuid: s.uuid,
    cree_le: s.cree_le,
    type: s.type,
    montant: s.montant,
    date: s.date,
    description: s.description,
    compte_id: s.compte_id,
    categorie_id: s.categorie_id,
    photo: s.photo,
  };
}

function messageErreur(e: unknown): string {
  if (!navigator.onLine || (e instanceof TypeError && /load failed|fetch/i.test(e.message))) {
    return "Hors connexion : vos saisies partiront à la prochaine synchronisation.";
  }
  return e instanceof Error ? e.message : String(e);
}

const MSG_RIEN_PUBLIE =
  "Le PC n'a encore rien publié : activez la synchronisation dans Paramètres → Application iPhone.";

export function EtatProvider({ children }: { children: ReactNode }) {
  const [pret, setPret] = useState(false);
  const [empreinte, setEmpreinte] = useState<string | null>(null);
  const [inst, setInst] = useState<Instantane | null>(null);
  const [saisies, setSaisies] = useState<SaisieLocale[]>([]);
  const [sync, setSync] = useState<EtatSync>({ enCours: false, derniere: null, erreur: null });
  const [onedrive, setOnedrive] = useState({ disponible: !!ONEDRIVE_CLIENT_ID, compte: null as string | null });

  const cleRef = useRef<CryptoKey | null>(null);
  const saisiesRef = useRef<SaisieLocale[]>([]);
  const etagRef = useRef<string | null>(null);
  const enCoursRef = useRef(false);

  /** Met à jour la file locale (état + persistance). */
  const majSaisies = useCallback(async (f: (l: SaisieLocale[]) => SaisieLocale[]) => {
    const suivante = f(saisiesRef.current);
    saisiesRef.current = suivante;
    setSaisies(suivante);
    await ecrire(CLES.saisies, suivante);
  }, []);

  /** Adopte un nouvel instantané et purge les saisies que le PC a intégrées. */
  const appliquerInstantane = useCallback(
    async (i: Instantane) => {
      setDevise(i.devise);
      setInst(i);
      const faites = uuidsIntegres(i);
      if (saisiesRef.current.some((s) => faites.has(s.uuid))) {
        await majSaisies((l) => l.filter((s) => !faites.has(s.uuid)));
      }
    },
    [majSaisies]
  );

  const marquerSynchro = useCallback(async (erreur: string | null = null) => {
    const maintenant = new Date().toISOString();
    await ecrire(CLES.derniereSync, maintenant);
    setSync({ enCours: false, derniere: maintenant, erreur });
  }, []);

  // Chargement initial.
  useEffect(() => {
    (async () => {
      demanderPersistance();
      const [cle, emp, blob, locales, derniere, etag] = await Promise.all([
        lire<CryptoKey>(CLES.cle),
        lire<string>(CLES.empreinte),
        lire<Uint8Array<ArrayBuffer>>(CLES.instantane),
        lire<SaisieLocale[]>(CLES.saisies),
        lire<string>(CLES.derniereSync),
        lire<string>(CLES.etag),
      ]);
      cleRef.current = cle ?? null;
      etagRef.current = etag ?? null;
      saisiesRef.current = locales ?? [];
      setSaisies(saisiesRef.current);
      setEmpreinte(emp ?? null);
      setSync((s) => ({ ...s, derniere: derniere ?? null }));
      if (cle && blob) {
        try {
          const i = await deballer<unknown>(cle, blob);
          if (instantaneValide(i)) await appliquerInstantane(i);
        } catch (e) {
          console.error("Instantané local illisible", e);
        }
      }
      if (ONEDRIVE_CLIENT_ID) {
        try {
          const od = await import("./onedrive");
          setOnedrive({ disponible: true, compte: await od.compteConnecte() });
        } catch (e) {
          setSync((s) => ({ ...s, erreur: messageErreur(e) }));
        }
      }
      setPret(true);
    })();
  }, [appliquerInstantane]);

  const synchroniser = useCallback(async () => {
    const cle = cleRef.current;
    if (!cle || !ONEDRIVE_CLIENT_ID || enCoursRef.current) return;
    enCoursRef.current = true;
    setSync((s) => ({ ...s, enCours: true, erreur: null }));
    try {
      const od = await import("./onedrive");
      if (!(await od.compteConnecte())) throw new Error("Connectez-vous à OneDrive dans les Réglages.");

      // 1. Envoi des saisies (un fichier chacune : aucun conflit possible).
      for (const s of saisiesRef.current.filter((x) => !x.envoyee)) {
        await od.deposerSaisie(s.uuid, await emballer(cle, versProtocole(s)));
        await majSaisies((l) => l.map((x) => (x.uuid === s.uuid ? { ...x, envoyee: true } : x)));
      }

      // 2. Réception de l'état publié par le PC (seulement s'il a changé).
      let avertissement: string | null = null;
      try {
        const r = await od.lireInstantane(etagRef.current);
        if (r) {
          const i = await deballer<unknown>(cle, r.contenu);
          if (!instantaneValide(i)) throw new Error("Données du PC illisibles : mettez à jour les deux apps.");
          await ecrire(CLES.instantane, r.contenu);
          await ecrire(CLES.etag, r.etag);
          etagRef.current = r.etag;
          await appliquerInstantane(i);
        }
      } catch (e) {
        if (!(e instanceof od.InstantaneAbsent)) throw e;
        avertissement = MSG_RIEN_PUBLIE;
      }
      await marquerSynchro(avertissement);
    } catch (e) {
      setSync((s) => ({ ...s, enCours: false, erreur: messageErreur(e) }));
    } finally {
      enCoursRef.current = false;
    }
  }, [appliquerInstantane, majSaisies, marquerSynchro]);

  // Synchro automatique : à l'ouverture et à chaque retour au premier plan.
  const appaire = empreinte !== null;
  useEffect(() => {
    if (!pret || !appaire || !onedrive.compte) return;
    void synchroniser();
    const auRetour = () => {
      if (document.visibilityState === "visible") void synchroniser();
    };
    document.addEventListener("visibilitychange", auRetour);
    return () => document.removeEventListener("visibilitychange", auRetour);
  }, [pret, appaire, onedrive.compte, synchroniser]);

  const appairer = useCallback(
    async (code: string) => {
      const brute = lireCodeAppairage(code);
      if (!brute) throw new Error("Ce code n'est pas un code d'appairage Aplomb.");
      const cle = await importerCle(brute, false);
      const emp = await calculerEmpreinte(brute);
      await ecrire(CLES.cle, cle);
      await ecrire(CLES.empreinte, emp);
      if (empreinte && empreinte !== emp) {
        // Nouvelle clé : l'ancien instantané n'est plus lisible, et les saisies
        // seront ré-envoyées chiffrées avec la nouvelle (intégration idempotente).
        await supprimer(CLES.instantane);
        await supprimer(CLES.etag);
        etagRef.current = null;
        setInst(null);
        await majSaisies((l) => l.map((s) => ({ ...s, envoyee: false })));
      }
      cleRef.current = cle;
      setEmpreinte(emp);
      return emp;
    },
    [empreinte, majSaisies]
  );

  const oublierTout = useCallback(async () => {
    if (ONEDRIVE_CLIENT_ID) {
      try {
        await (await import("./onedrive")).deconnecter();
      } catch {
        /* ignore */
      }
    }
    await toutEffacer();
    cleRef.current = null;
    etagRef.current = null;
    saisiesRef.current = [];
    setSaisies([]);
    setInst(null);
    setEmpreinte(null);
    setOnedrive((o) => ({ ...o, compte: null }));
    setSync({ enCours: false, derniere: null, erreur: null });
  }, []);

  const ajouterSaisie = useCallback(
    async (n: NouvelleSaisie) => {
      const s: SaisieLocale = {
        v: VERSION_PROTOCOLE,
        uuid: crypto.randomUUID(),
        cree_le: new Date().toISOString(),
        ...n,
        envoyee: false,
      };
      await majSaisies((l) => [s, ...l]);
      void synchroniser();
    },
    [majSaisies, synchroniser]
  );

  const annulerSaisie = useCallback(
    async (uuid: string) => {
      await majSaisies((l) => l.filter((s) => s.uuid !== uuid || s.envoyee));
    },
    [majSaisies]
  );

  const importerFichier = useCallback(
    async (f: File) => {
      const cle = cleRef.current;
      if (!cle) throw new Error("Appairez d'abord ce téléphone avec votre PC.");
      const contenu = new Uint8Array(await f.arrayBuffer());
      const i = await deballer<unknown>(cle, contenu);
      if (!instantaneValide(i)) throw new Error("Ce fichier ne contient pas de données Aplomb.");
      await ecrire(CLES.instantane, contenu);
      await supprimer(CLES.etag);
      etagRef.current = null;
      await appliquerInstantane(i);
      await marquerSynchro();
    },
    [appliquerInstantane, marquerSynchro]
  );

  const partagerSaisies = useCallback(async () => {
    const cle = cleRef.current;
    if (!cle) throw new Error("Appairez d'abord ce téléphone avec votre PC.");
    const aEnvoyer = saisiesRef.current.filter((s) => !s.envoyee);
    if (aEnvoyer.length === 0) return 0;
    const fichiers = await Promise.all(
      aEnvoyer.map(
        async (s) =>
          new File([await emballer(cle, versProtocole(s))], nomFichierSaisie(s.uuid), {
            type: "application/octet-stream",
          })
      )
    );
    if (navigator.canShare?.({ files: fichiers })) {
      await navigator.share({ files: fichiers });
    } else {
      for (const f of fichiers) {
        const url = URL.createObjectURL(f);
        const a = document.createElement("a");
        a.href = url;
        a.download = f.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }
    }
    const envoyes = new Set(aEnvoyer.map((s) => s.uuid));
    await majSaisies((l) => l.map((s) => (envoyes.has(s.uuid) ? { ...s, envoyee: true } : s)));
    return aEnvoyer.length;
  }, [majSaisies]);

  const connecterOneDrive = useCallback(async () => {
    await (await import("./onedrive")).connecter();
  }, []);

  const deconnecterOneDrive = useCallback(async () => {
    await (await import("./onedrive")).deconnecter();
    setOnedrive((o) => ({ ...o, compte: null }));
  }, []);

  const transactions = useMemo(() => transactionsFusionnees(inst, saisies), [inst, saisies]);
  const attente = useMemo(() => saisiesEnAttente(saisies, inst), [saisies, inst]);
  const comptes = useMemo(() => (inst?.comptes ?? []).filter((c) => !c.archive), [inst]);

  const valeur: Etat = {
    pret,
    appaire,
    empreinte,
    inst,
    saisies,
    attente,
    transactions,
    comptes,
    sync,
    onedrive,
    appairer,
    oublierTout,
    ajouterSaisie,
    annulerSaisie,
    synchroniser,
    importerFichier,
    partagerSaisies,
    connecterOneDrive,
    deconnecterOneDrive,
  };
  return <Ctx.Provider value={valeur}>{children}</Ctx.Provider>;
}

export function useEtat(): Etat {
  const c = useContext(Ctx);
  if (!c) throw new Error("useEtat doit être utilisé dans EtatProvider");
  return c;
}
