import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  Budget,
  Categorie,
  ChargeFixe,
  Compte,
  Echeance,
  Objectif,
  SuggestionRecurrence,
  Transaction,
} from "../db/types";
import {
  listBudgets,
  listCategories,
  listChargesFixes,
  listComptes,
  listObjectifs,
  listSuggestions,
  listTransactions,
} from "../db/repo";
import { synchroniserEcheances } from "../lib/echeances";
import { genererAuto } from "../lib/auto";
import { sauvegardeAutoQuotidienne } from "../lib/backup";
import {
  construireAlertes,
  construireAlertesBudgets,
  envoyerAlertes,
} from "../lib/notifications";
import { getDevise, setDevise as appliquerDevise } from "../lib/format";
import { programmerPublication, synchroniserMobile } from "../lib/syncMobile";
import { consoliderBase } from "../db";

/** Intervalle de relève des saisies de l'iPhone (le dossier OneDrive est local : coût négligeable). */
const INTERVALLE_SYNC_MS = 90_000;
const INTERVALLE_CONSOLIDATION_MS = 120_000;

interface AppData {
  comptes: Compte[];
  categories: Categorie[];
  transactions: Transaction[];
  chargesFixes: ChargeFixe[];
  echeances: Echeance[];
  suggestions: SuggestionRecurrence[];
  budgets: Budget[];
  objectifs: Objectif[];
  devise: string;
  changerDevise: (code: string) => void;
  pret: boolean;
  erreur: string | null;
  rafraichir: () => Promise<void>;
}

const Ctx = createContext<AppData | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [categories, setCategories] = useState<Categorie[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [chargesFixes, setChargesFixes] = useState<ChargeFixe[]>([]);
  const [echeances, setEcheances] = useState<Echeance[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionRecurrence[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [objectifs, setObjectifs] = useState<Objectif[]>([]);
  const [devise, setDeviseState] = useState<string>(getDevise());
  const [pret, setPret] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const changerDevise = useCallback((code: string) => {
    appliquerDevise(code);
    setDeviseState(code);
  }, []);

  const rafraichir = useCallback(async () => {
    const [cpt, cat, tx, cf, ech, sug, bud, obj] = await Promise.all([
      listComptes(),
      listCategories(),
      listTransactions(),
      listChargesFixes(),
      synchroniserEcheances(), // garantit les échéances du mois + statuts à jour
      listSuggestions(),
      listBudgets(),
      listObjectifs(),
    ]);
    setComptes(cpt);
    setCategories(cat);
    setTransactions(tx);
    setChargesFixes(cf);
    setEcheances(ech);
    setSuggestions(sug);
    setBudgets(bud);
    setObjectifs(obj);
    // Toute modification est republiée vers l'iPhone (si la synchro est activée).
    programmerPublication();
  }, []);

  // Consolidation régulière du journal SQLite dans la base (voir consoliderBase).
  useEffect(() => {
    if (!pret) return;
    const id = setInterval(() => void consoliderBase(), INTERVALLE_CONSOLIDATION_MS);
    const enArrierePlan = () => {
      if (document.visibilityState === "hidden") void consoliderBase();
    };
    document.addEventListener("visibilitychange", enArrierePlan);
    window.addEventListener("blur", enArrierePlan);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", enArrierePlan);
      window.removeEventListener("blur", enArrierePlan);
    };
  }, [pret]);

  // Relève périodique des saisies de l'iPhone + au retour sur la fenêtre.
  useEffect(() => {
    if (!pret) return;
    const relever = () =>
      synchroniserMobile()
        .then((r) => (r.integrees > 0 ? rafraichir() : undefined))
        .catch(() => {});
    void relever();
    const id = setInterval(relever, INTERVALLE_SYNC_MS);
    window.addEventListener("focus", relever);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", relever);
    };
  }, [pret, rafraichir]);

  useEffect(() => {
    (async () => {
      try {
        await rafraichir();
        setPret(true);
        // Sauvegarde automatique quotidienne (silencieuse).
        void sauvegardeAutoQuotidienne();
        // Génération automatique des récurrences dues (salaire, charges).
        const nb = await genererAuto();
        if (nb > 0) await rafraichir();
        // Alertes système au démarrage (après le premier chargement).
        const [charges, ech, tx, cats, buds] = await Promise.all([
          listChargesFixes(),
          synchroniserEcheances(),
          listTransactions(),
          listCategories(),
          listBudgets(),
        ]);
        await envoyerAlertes([
          ...construireAlertes(charges, ech),
          ...construireAlertesBudgets(buds, cats, tx),
        ]);
      } catch (e) {
        console.error(e);
        setErreur(e instanceof Error ? e.message : String(e));
        setPret(true);
      }
    })();
  }, [rafraichir]);

  const value = useMemo<AppData>(
    () => ({
      comptes,
      categories,
      transactions,
      chargesFixes,
      echeances,
      suggestions,
      budgets,
      objectifs,
      devise,
      changerDevise,
      pret,
      erreur,
      rafraichir,
    }),
    [comptes, categories, transactions, chargesFixes, echeances, suggestions, budgets, objectifs, devise, changerDevise, pret, erreur, rafraichir]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppData(): AppData {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAppData doit être utilisé dans AppDataProvider");
  return ctx;
}
