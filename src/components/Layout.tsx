import { NavLink, Outlet } from "react-router-dom";
import { useMemo } from "react";
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

const NAV: { to: string; ico: IconName; label: string; end?: boolean; badge?: string }[] = [
  { to: "/", ico: "dashboard", label: "Tableau de bord", end: true },
  { to: "/comptes", ico: "bank", label: "Comptes" },
  { to: "/transactions", ico: "card", label: "Transactions" },
  { to: "/charges", ico: "repeat", label: "Charges fixes", badge: "charges" },
  { to: "/budgets", ico: "coins", label: "Budgets", badge: "budgets" },
  { to: "/objectifs", ico: "target", label: "Objectifs" },
  { to: "/previsions", ico: "trending-up", label: "Prévisions" },
  { to: "/echeancier", ico: "calendar", label: "Échéancier" },
  { to: "/suggestions", ico: "sparkles", label: "Suggestions", badge: "suggestions" },
  { to: "/factures", ico: "receipt", label: "Factures" },
  { to: "/import", ico: "upload", label: "Importer" },
  { to: "/rapports", ico: "report", label: "Rapports" },
  { to: "/parametres", ico: "settings", label: "Paramètres" },
];

export function Layout() {
  const { echeances, transactions, suggestions, budgets, categories } = useAppData();
  const { theme, toggle } = useTheme();
  const { pinDefini, verrouiller } = useLock();

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
      <aside className="sidebar">
        <div className="brand">
          <span className="logo">
            <Icon name="wallet" size={19} />
          </span>
          <span>
            Budget Perso
            <small>100 % local & privé</small>
          </span>
        </div>
        {NAV.map((n) => {
          const b = n.badge ? (badges as Record<string, number>)[n.badge] : 0;
          return (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
            >
              <span className="ico">
                <Icon name={n.ico} size={18} />
              </span>
              <span>{n.label}</span>
              {b > 0 && <span className="nav-badge">{b}</span>}
            </NavLink>
          );
        })}
        <div className="sidebar-foot">
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
        </div>
      </aside>
      <main className="main">
        <UpdateBanner />
        <ConfirmBar />
        <Outlet />
      </main>
      <CommandPalette />
    </div>
  );
}
