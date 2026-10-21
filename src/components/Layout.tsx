import { NavLink, useLocation, useNavigate, useOutlet } from "react-router-dom";
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
import { ACTIONS_RAPIDES, GROUPES, PIED, type Groupe, type Rubrique } from "../lib/navigation";
import { demanderAction } from "../hooks/useActionDemandee";
import { Icon } from "./Icon";
import { Menu, type EntreeMenu } from "./ui/Menu";
import { CommandPalette, ouvrirPalette } from "./CommandPalette";
import { ConfirmBar } from "./ConfirmBar";
import { UpdateBanner } from "./UpdateBanner";

type Badges = Record<NonNullable<Rubrique["badge"]>, number>;

const CLE_MENU = "aplomb-menu"; // "compact" | "large" (absent : automatique)
const CLE_GROUPES = "aplomb-menu-groupes"; // groupes repliés

function lireLocal<T>(cle: string, defaut: T): T {
  try {
    const v = localStorage.getItem(cle);
    return v === null ? defaut : (JSON.parse(v) as T);
  } catch {
    return defaut;
  }
}
function ecrireLocal(cle: string, v: unknown) {
  try {
    localStorage.setItem(cle, JSON.stringify(v));
  } catch {
    /* stockage indisponible : réglage non mémorisé */
  }
}

/** Lien de navigation : le fond actif et son fil vertical glissent d'un lien à l'autre. */
function LienNav({ r, badge = 0, compacte }: { r: Rubrique; badge?: number; compacte: boolean }) {
  return (
    <NavLink
      to={r.to}
      end={r.end}
      className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
      title={compacte ? r.label + (badge > 0 ? ` (${badge} à traiter)` : "") : undefined}
    >
      {({ isActive }) => (
        <>
          {isActive && <motion.span layoutId="nav-fil" className="nav-pill" transition={aplomb} />}
          <span className="ico" aria-hidden="true">
            <Icon name={r.ico} size={18} />
          </span>
          <span className="nav-label">{r.label}</span>
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

/** Groupe de la barre latérale, repliable (titre cliquable, mémorisé). */
function GroupeNav({
  g,
  badges,
  replie,
  basculer,
  compacte,
}: {
  g: Groupe;
  badges: Badges;
  replie: boolean;
  basculer: () => void;
  compacte: boolean;
}) {
  const location = useLocation();
  const total = g.items.reduce((n, r) => n + (r.badge ? badges[r.badge] : 0), 0);
  const contientActif = g.items.some((r) =>
    r.end ? location.pathname === r.to : location.pathname.startsWith(r.to)
  );
  // En mode compact, tous les liens restent visibles (icônes seules).
  const ouvert = compacte || !replie || !g.titre;

  return (
    <div className="nav-group">
      {g.titre &&
        (compacte ? (
          <div className="nav-group-sep" aria-hidden="true" />
        ) : (
          <button type="button" className="nav-group-label" onClick={basculer} aria-expanded={ouvert}>
            <span>{g.titre}</span>
            {!ouvert && contientActif && (
              <span className="nav-group-actif" title="La page ouverte est dans ce groupe" />
            )}
            {!ouvert && total > 0 && <span className="nav-group-badge">{total}</span>}
            <motion.span className="nav-group-chev" animate={{ rotate: ouvert ? 0 : -90 }} transition={ressort}>
              <Icon name="chevron-down" size={14} />
            </motion.span>
          </button>
        ))}
      <AnimatePresence initial={false}>
        {ouvert && (
          <motion.div
            key="liens"
            className="nav-group-liens"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1, transition: aplomb }}
            exit={{ height: 0, opacity: 0, transition: { duration: 0.2 } }}
          >
            {g.items.map((r) => (
              <LienNav key={r.to} r={r} badge={r.badge ? badges[r.badge] : 0} compacte={compacte} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const outlet = useOutlet();
  const mainRef = useRef<HTMLElement>(null);
  const { echeances, transactions, suggestions, budgets, categories, comptes } = useAppData();
  const { theme, toggle } = useTheme();
  const { pinDefini, verrouiller } = useLock();
  const [version, setVersion] = useState("");
  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  // Barre latérale large ou compacte (icônes). Sans choix mémorisé, elle se
  // compacte d'elle-même sur les fenêtres étroites.
  const [choixMenu, setChoixMenu] = useState<"compact" | "large" | null>(() => lireLocal(CLE_MENU, null));
  const [etroit, setEtroit] = useState(() => window.innerWidth < 1100);
  useEffect(() => {
    const surResize = () => setEtroit(window.innerWidth < 1100);
    window.addEventListener("resize", surResize);
    return () => window.removeEventListener("resize", surResize);
  }, []);
  const compacte = choixMenu ? choixMenu === "compact" : etroit;
  function basculerMenu() {
    const suivant = compacte ? "large" : "compact";
    setChoixMenu(suivant);
    ecrireLocal(CLE_MENU, suivant);
  }

  const [replies, setReplies] = useState<string[]>(() => lireLocal(CLE_GROUPES, []));
  function basculerGroupe(id: string) {
    setReplies((r) => {
      const suivant = r.includes(id) ? r.filter((x) => x !== id) : [...r, id];
      ecrireLocal(CLE_GROUPES, suivant);
      return suivant;
    });
  }

  const badges = useMemo<Badges>(() => {
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

  // Menu « Nouveau » : mêmes actions que la palette Ctrl+K.
  const sansCompte = comptes.length === 0;
  const versAction = (a: (typeof ACTIONS_RAPIDES)[number], bloque: boolean): EntreeMenu => ({
    id: a.id,
    label: a.label,
    ico: a.ico,
    description: bloque ? "Crée d'abord un compte" : a.description,
    desactive: bloque,
    action: () => demanderAction(navigate, a.id),
  });
  const menuNouveau: EntreeMenu[] = [
    { titre: "Saisir" },
    ...ACTIONS_RAPIDES.slice(0, 4).map((a) => versAction(a, sansCompte)),
    { separateur: true },
    { titre: "Créer" },
    ...ACTIONS_RAPIDES.slice(4).map((a) => versAction(a, sansCompte && a.id === "charge")),
  ];

  return (
    <div className={"app" + (compacte ? " compacte" : "")}>
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
          <span className="nav-label">Aplomb</span>
          <button
            type="button"
            className="btn-icone brand-repli"
            onClick={basculerMenu}
            aria-label={compacte ? "Déplier le menu" : "Replier le menu"}
            title={compacte ? "Déplier le menu" : "Replier le menu"}
          >
            <Icon name="sidebar" size={17} />
          </button>
        </div>

        <div className="sidebar-actions">
          <Menu
            label="Nouveau"
            largeur={250}
            elements={menuNouveau}
            declencheur={({ ouvert, ...p }) => (
              <button
                type="button"
                {...p}
                className={"btn primary nouveau" + (ouvert ? " ouvert" : "")}
                title={compacte ? "Nouveau" : undefined}
              >
                <motion.span style={{ display: "inline-flex" }} animate={{ rotate: ouvert ? 45 : 0 }} transition={ressort}>
                  <Icon name="plus" size={17} />
                </motion.span>
                <span className="nav-label">Nouveau</span>
              </button>
            )}
          />
          <button
            type="button"
            className="recherche"
            onClick={ouvrirPalette}
            title="Rechercher (Ctrl+K)"
            aria-label="Rechercher une page, une action, une transaction"
          >
            <Icon name="search" size={16} />
            <span className="nav-label">Rechercher</span>
            <kbd className="nav-label">Ctrl K</kbd>
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Navigation principale">
          {GROUPES.map((g) => (
            <GroupeNav
              key={g.id}
              g={g}
              badges={badges}
              replie={replies.includes(g.id)}
              basculer={() => basculerGroupe(g.id)}
              compacte={compacte}
            />
          ))}
        </nav>
        <div className="sidebar-foot">
          {PIED.map((r) => (
            <LienNav key={r.to} r={r} compacte={compacte} />
          ))}
          {pinDefini && (
            <button className="theme-toggle" onClick={verrouiller} title={compacte ? "Verrouiller" : undefined}>
              <Icon name="lock" size={16} />
              <span className="nav-label">Verrouiller</span>
            </button>
          )}
          <button
            className="theme-toggle"
            onClick={toggle}
            title={compacte ? `Thème ${theme === "dark" ? "sombre" : "clair"} — changer` : undefined}
          >
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
            <span className="nav-label">{theme === "dark" ? "Sombre" : "Clair"}</span>
            <span className="nav-label" style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-dim)" }}>
              changer
            </span>
          </button>
          {version && <div className="sidebar-version">{compacte ? `v${version}` : `version ${version}`}</div>}
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
