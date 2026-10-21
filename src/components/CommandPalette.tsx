import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { aplomb, ressort, sortie } from "../lib/motion";
import { useAppData } from "../state/AppDataContext";
import { Icon, type IconName } from "./Icon";
import { formatDate } from "../lib/format";
import { ACTIONS_RAPIDES, TOUTES_RUBRIQUES } from "../lib/navigation";
import { demanderAction } from "../hooks/useActionDemandee";

interface Item {
  id: string;
  section: string;
  label: string;
  sub?: string;
  icon: IconName;
  action: () => void;
}

const OUVRIR = "aplomb:palette";
/** Ouvre la palette depuis n'importe où (bouton « Rechercher » de la barre latérale). */
export function ouvrirPalette() {
  window.dispatchEvent(new Event(OUVRIR));
}

/** Recherche sans accents ni casse. */
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { transactions, comptes, categories } = useAppData();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    const surOuvrir = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OUVRIR, surOuvrir);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OUVRIR, surOuvrir);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const compteNom = useMemo(() => new Map(comptes.map((c) => [c.id, c.nom])), [comptes]);
  const catNom = useMemo(() => new Map(categories.map((c) => [c.id, c.nom])), [categories]);

  // Mêmes libellés et icônes que la barre latérale et le menu « Nouveau ».
  const items = useMemo<Item[]>(() => {
    const ql = norm(q.trim());
    const correspond = (...textes: (string | undefined)[]) =>
      !ql || textes.some((t) => t && norm(t).includes(ql));
    const fermerPuis = (f: () => void) => () => {
      setOpen(false);
      f();
    };

    const actions = ACTIONS_RAPIDES.filter((a) =>
      correspond(a.label, a.description, "nouveau nouvelle ajouter"),
    )
      .filter((a) => comptes.length > 0 || a.id === "compte" || a.id === "objectif")
      .map<Item>((a) => ({
        id: "a:" + a.id,
        section: "Actions",
        label: a.id === "scanner" ? a.label : `Nouveau · ${a.label}`,
        sub: a.description,
        icon: a.ico,
        action: fermerPuis(() => demanderAction(navigate, a.id)),
      }));

    const pages = TOUTES_RUBRIQUES.filter((r) => correspond(r.label, r.motscles)).map<Item>((r) => ({
      id: "p:" + r.to,
      section: "Pages",
      label: r.label,
      sub: "Aller à",
      icon: r.ico,
      action: fermerPuis(() => navigate(r.to)),
    }));

    let tx: Item[] = [];
    if (ql.length >= 1) {
      tx = transactions
        .filter((t) =>
          correspond(
            t.description ?? "",
            t.categorie_id != null ? catNom.get(t.categorie_id) : "",
            String(t.montant),
          ),
        )
        .slice(0, 6)
        .map<Item>((t) => ({
          id: "t:" + t.id,
          section: "Transactions",
          label:
            t.description ||
            (t.categorie_id != null ? (catNom.get(t.categorie_id) ?? "Transaction") : "Transaction"),
          sub: `${formatDate(t.date)} · ${compteNom.get(t.compte_id ?? -1) ?? ""}`,
          icon: t.type === "revenu" ? "trending-up" : t.type === "depense" ? "trending-down" : "card",
          action: fermerPuis(() => navigate("/transactions", { state: { transaction: t.id } })),
        }));
    }
    // Sans recherche, les pages d'abord ; en cherchant, les actions restent en tête.
    return ql ? [...actions, ...pages, ...tx] : [...pages, ...actions];
  }, [q, transactions, navigate, compteNom, catNom, comptes.length]);

  useEffect(() => {
    if (sel >= items.length) setSel(0);
  }, [items.length, sel]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="cmdk"
          className="cmdk-overlay"
          onClick={() => setOpen(false)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.15 } }}
          exit={{ opacity: 0, transition: sortie }}
        >
          <motion.div
            className="cmdk"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: -18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: aplomb }}
            exit={{ opacity: 0, y: -8, scale: 0.98, transition: sortie }}
          >
            <input
              ref={inputRef}
              className="cmdk-input"
              placeholder="Rechercher une page, une action, une transaction…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setSel((s) => Math.min(items.length - 1, s + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setSel((s) => Math.max(0, s - 1));
                } else if (e.key === "Enter") {
                  items[sel]?.action();
                }
              }}
            />
            <div className="cmdk-list">
              {items.length === 0 ? (
                <div className="cmdk-empty">Aucun résultat</div>
              ) : (
                items.map((it, i) => (
                  <Fragment key={it.id}>
                    {(i === 0 || items[i - 1].section !== it.section) && (
                      <div className="cmdk-section">{it.section}</div>
                    )}
                    <div
                      className={"cmdk-item" + (i === sel ? " on" : "")}
                      onMouseEnter={() => setSel(i)}
                      onClick={it.action}
                    >
                      {i === sel && (
                        <motion.span layoutId="cmdk-sel" className="cmdk-sel" transition={ressort} />
                      )}
                      <span className="cmdk-ico">
                        <Icon name={it.icon} size={17} />
                      </span>
                      <span>{it.label}</span>
                      {it.sub && <span className="cmdk-sub">{it.sub}</span>}
                    </div>
                  </Fragment>
                ))
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
