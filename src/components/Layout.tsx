import { NavLink, Outlet } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
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

export function Layout() {
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
          <span className="logo">
            <Icon name="wallet" size={19} />
          </span>
          <span>Aplomb</span>
        </div>
        <nav className="sidebar-nav" aria-label="Navigation principale">
          {GROUPES.map((g, gi) => (
            <div className="nav-group" key={g.titre ?? gi}>
              {g.titre && <div className="nav-group-label">{g.titre}</div>}
              {g.items.map((n) => {
                const b = n.badge ? (badges as Record<string, number>)[n.badge] : 0;
                return (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    end={n.end}
                    className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
                  >
                    <span className="ico" aria-hidden="true">
                      <Icon name={n.ico} size={18} />
                    </span>
                    <span>{n.label}</span>
                    {b > 0 && <span className="nav-badge" aria-label={`${b} à traiter`}>{b}</span>}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <NavLink
            to="/aide"
            className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
          >
            <span className="ico" aria-hidden="true">
              <Icon name="help" size={18} />
            </span>
            <span>Aide</span>
          </NavLink>
          <NavLink
            to="/parametres"
            className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
          >
            <span className="ico" aria-hidden="true">
              <Icon name="settings" size={18} />
            </span>
            <span>Paramètres</span>
          </NavLink>
          {pinDefini && (
            <button className="theme-toggle" onClick={verrouiller}>
              <Icon name="lock" size={16} />
              Verrouiller
            </button>
          )}
          <button className="theme-toggle" onClick={toggle}>
            <Icon name={theme === "dark" ? "moon" : "sun"} size={16} />
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
      <main className="main" id="contenu">
        <UpdateBanner />
        <ConfirmBar />
        <Outlet />
      </main>
      <CommandPalette />
    </div>
  );
}
