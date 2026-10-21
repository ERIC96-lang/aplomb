import { NavLink, useLocation, useOutlet } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { aplomb, page, ressort } from "../lib/motion";
import { getVersion } from "@tauri-apps/api/app";
import { useAppData } from "../state/AppDataContext";
import { useTheme } from "../state/ThemeContext";
import { useLock } from "../state/LockContext";
import { moisCourant } from "../lib/format";
import { detecterRecurrences } from "../lib/recurrence";
import { statutsBudgets } from "../lib/budgets";
import { Icon, type IconName } from "./Icon";
import { CommandPalette } from "./CommandPalette";
import { ConfirmBar } from "./ConfirmBar";
import { UpdateBanner } from "./UpdateBanner";

interface NavItem {
  to: string;
  ico: IconName;
  label: string;
  end?: boolean;
  badge?: string;
}

// Regroupement thématique pour désencombrer la barre latérale.
const GROUPES: { titre?: string; items: NavItem[] }[] = [
  {
    items: [
      { to: "/", ico: "dashboard", label: "Tableau de bord", end: true },
      { to: "/analyse", ico: "bulb", label: "Analyse" },
    ],
  },
  {
    titre: "Opérations",
    items: [
      { to: "/comptes", ico: "bank", label: "Comptes" },
      { to: "/transactions", ico: "card", label: "Transactions" },
      { to: "/charges", ico: "repeat", label: "Charges fixes", badge: "charges" },
      { to: "/suggestions", ico: "sparkles", label: "Suggestions", badge: "suggestions" },
    ],
  },
  {
    titre: "Planification",
    items: [
      { to: "/budgets", ico: "coins", label: "Budgets", badge: "budgets" },
      { to: "/objectifs", ico: "target", label: "Objectifs" },
      { to: "/previsions", ico: "trending-up", label: "Prévisions" },
      { to: "/echeancier", ico: "calendar", label: "Échéancier" },
    ],
  },
  {
    titre: "Documents",
    items: [
      { to: "/factures", ico: "receipt", label: "Factures" },
      { to: "/import", ico: "upload", label: "Importer" },
      { to: "/rapports", ico: "report", label: "Rapports" },
    ],
  },
];

/** Lien de navigation : le fond actif et son fil vertical glissent d'un lien à l'autre. */
function LienNav({ to, ico, label, end, badge = 0 }: Omit<NavItem, "badge"> & { badge?: number }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
      {({ isActive }) => (
        <>
          {isActive && <motion.span layoutId="nav-fil" className="nav-pill" transition={aplomb} />}
          <span className="ico" aria-hidden="true">
            <Icon name={ico} size={18} />
          </span>
          <span>{label}</span>
          <AnimatePresence>
            {badge > 0 && (
              <motion.span
                key="badge"
                className="nav-badge"
                aria-label={`${badge} à traiter`}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={ressort}
              >
                {badge}
              </motion.span>
            )}
          </AnimatePresence>
        </>
      )}
    </NavLink>
  );
}

export function Layout() {
  const location = useLocation();
  const outlet = useOutlet();
  const mainRef = useRef<HTMLElement>(null);
  const { echeances, transactions, suggestions, budgets, categories } = useAppData();
  const { theme, toggle } = useTheme();
  const { pinDefini, verrouiller } = useLock();
  const [version, setVersion] = useState("");
  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  const badges = useMemo(() => {
    const mois = moisCourant();
    const enRetard = echeances.filter((e) => e.mois === mois && e.statut === "en_retard").length;
    const traitees = new Set(
      suggestions.filter((s) => s.statut !== "proposee").map((s) => s.signature)
    );
    const nbSuggestions = detecterRecurrences(transactions, echeances, traitees).length;
    const nbBudgetsDepasses = statutsBudgets(budgets, categories, transactions, mois).filter(
      (s) => s.etat === "depasse"
    ).length;
    return { charges: enRetard, suggestions: nbSuggestions, budgets: nbBudgetsDepasses };
  }, [echeances, transactions, suggestions, budgets, categories]);

  return (
    <div className="app">
      <a href="#contenu" className="skip-link">Aller au contenu</a>
      <aside className="sidebar">
        <div className="brand">
          {/* Le logo oscille puis se met d'aplomb, comme un fil à plomb. */}
          <motion.span
            className="logo"
            style={{ transformOrigin: "50% -60%" }}
            initial={{ rotate: -14 }}
            animate={{ rotate: 0 }}
            transition={{ type: "spring", stiffness: 120, damping: 7, mass: 0.8 }}
            whileHover={{ rotate: [0, -9, 6, -3, 1, 0], transition: { duration: 1.1 } }}
          >
            <Icon name="wallet" size={19} />
          </motion.span>
          <span>Aplomb</span>
        </div>
        <nav className="sidebar-nav" aria-label="Navigation principale">
          {GROUPES.map((g, gi) => (
            <div className="nav-group" key={g.titre ?? gi}>
              {g.titre && <div className="nav-group-label">{g.titre}</div>}
              {g.items.map((n) => (
                <LienNav
                  key={n.to}
                  {...n}
                  badge={n.badge ? (badges as Record<string, number>)[n.badge] : 0}
                />
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <LienNav to="/aide" ico="help" label="Aide" />
          <LienNav to="/parametres" ico="settings" label="Paramètres" />
          {pinDefini && (
            <button className="theme-toggle" onClick={verrouiller}>
              <Icon name="lock" size={16} />
              Verrouiller
            </button>
          )}
          <button className="theme-toggle" onClick={toggle}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={theme}
                style={{ display: "inline-flex" }}
                initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
                animate={{ rotate: 0, opacity: 1, scale: 1 }}
                exit={{ rotate: 90, opacity: 0, scale: 0.6 }}
                transition={ressort}
              >
                <Icon name={theme === "dark" ? "moon" : "sun"} size={16} />
              </motion.span>
            </AnimatePresence>
            {theme === "dark" ? "Sombre" : "Clair"}
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-dim)" }}>changer</span>
          </button>
          {version && (
            <div style={{ textAlign: "center", fontSize: 10.5, color: "var(--text-dim)", marginTop: 2 }}>
              version {version}
            </div>
          )}
        </div>
      </aside>
      <main className="main" id="contenu" ref={mainRef}>
        <UpdateBanner />
        <ConfirmBar />
        <AnimatePresence mode="wait" onExitComplete={() => mainRef.current?.scrollTo({ top: 0 })}>
          <motion.div
            key={location.pathname}
            className="page-anim"
            variants={page}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {outlet}
          </motion.div>
        </AnimatePresence>
      </main>
      <CommandPalette />
    </div>
  );
}
