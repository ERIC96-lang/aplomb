import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppData } from "../state/AppDataContext";
import { Icon, type IconName } from "./Icon";
import { formatDate } from "../lib/format";

interface Item {
  id: string;
  label: string;
  sub?: string;
  icon: IconName;
  action: () => void;
}

const PAGES: { label: string; path: string; icon: IconName }[] = [
  { label: "Tableau de bord", path: "/", icon: "dashboard" },
  { label: "Comptes", path: "/comptes", icon: "bank" },
  { label: "Transactions", path: "/transactions", icon: "card" },
  { label: "Charges fixes", path: "/charges", icon: "repeat" },
  { label: "Budgets", path: "/budgets", icon: "coins" },
  { label: "Objectifs", path: "/objectifs", icon: "coins" },
  { label: "Prévisions", path: "/previsions", icon: "trending-up" },
  { label: "Échéancier", path: "/echeancier", icon: "calendar" },
  { label: "Suggestions", path: "/suggestions", icon: "sparkles" },
  { label: "Factures & reçus", path: "/factures", icon: "report" },
  { label: "Importer", path: "/import", icon: "download" },
  { label: "Rapports", path: "/rapports", icon: "report" },
  { label: "Paramètres", path: "/parametres", icon: "settings" },
];

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
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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

  const items = useMemo<Item[]>(() => {
    const ql = q.trim().toLowerCase();
    const pages = PAGES.filter((p) => !ql || p.label.toLowerCase().includes(ql)).map<Item>((p) => ({
      id: "p:" + p.path,
      label: p.label,
      icon: p.icon,
      sub: "Aller à",
      action: () => {
        navigate(p.path);
        setOpen(false);
      },
    }));

    let tx: Item[] = [];
    if (ql.length >= 1) {
      tx = transactions
        .filter((t) => {
          const desc = (t.description ?? "").toLowerCase();
          const cat = (t.categorie_id != null ? catNom.get(t.categorie_id) ?? "" : "").toLowerCase();
          return desc.includes(ql) || cat.includes(ql) || String(t.montant).includes(ql);
        })
        .slice(0, 6)
        .map<Item>((t) => ({
          id: "t:" + t.id,
          label: t.description || (t.categorie_id != null ? catNom.get(t.categorie_id) ?? "Transaction" : "Transaction"),
          sub: `${formatDate(t.date)} · ${compteNom.get(t.compte_id ?? -1) ?? ""}`,
          icon: t.type === "revenu" ? "trending-up" : t.type === "depense" ? "trending-down" : "card",
          action: () => {
            navigate("/transactions");
            setOpen(false);
          },
        }));
    }
    return [...pages, ...tx];
  }, [q, transactions, navigate, compteNom, catNom]);

  useEffect(() => {
    if (sel >= items.length) setSel(0);
  }, [items.length, sel]);

  if (!open) return null;

  return (
    <div className="cmdk-overlay" onClick={() => setOpen(false)}>
      <div className="cmdk" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="cmdk-input"
          placeholder="Rechercher une page, une transaction…"
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
              <div
                key={it.id}
                className={"cmdk-item" + (i === sel ? " on" : "")}
                onMouseEnter={() => setSel(i)}
                onClick={it.action}
              >
                <span className="cmdk-ico"><Icon name={it.icon} size={17} /></span>
                <span>{it.label}</span>
                {it.sub && <span className="cmdk-sub">{it.sub}</span>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
