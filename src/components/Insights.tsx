import { Link } from "react-router-dom";
import { Icon } from "./Icon";
import type { Insight, NiveauInsight } from "../lib/insights";

const COULEUR: Record<NiveauInsight, string> = {
  alerte: "var(--red)",
  attention: "var(--amber)",
  info: "var(--accent)",
  positif: "var(--green)",
};

export function InsightRow({ insight }: { insight: Insight }) {
  const c = COULEUR[insight.niveau];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "12px 14px",
        borderRadius: 12,
        border: "1px solid var(--border)",
        borderLeft: `3px solid ${c}`,
        background: "var(--surface-2)",
      }}
    >
      <span style={{ color: c, marginTop: 1 }}>
        <Icon name={insight.icon} size={18} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 650, fontSize: 14 }}>{insight.titre}</div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
          {insight.detail}
        </div>
      </div>
      {insight.lien && (
        <Link to={insight.lien.to} className="btn sm" style={{ flexShrink: 0 }}>
          {insight.lien.label}
        </Link>
      )}
    </div>
  );
}
