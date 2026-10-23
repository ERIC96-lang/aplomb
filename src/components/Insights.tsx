import { Link } from "react-router-dom";
import { Icon } from "./Icon";
import type { Insight, NiveauInsight } from "../lib/insights";

export const COULEUR_INSIGHT: Record<NiveauInsight, string> = {
  alerte: "var(--red)",
  attention: "var(--amber)",
  info: "var(--blue)",
  positif: "var(--green)",
};

export function InsightRow({ insight }: { insight: Insight }) {
  return (
    <div className="pg-insight" style={{ ["--ton" as string]: COULEUR_INSIGHT[insight.niveau] }}>
      <span className="pg-insight-ico">
        <Icon name={insight.icon} size={17} />
      </span>
      <div className="pg-insight-txt">
        <div className="pg-insight-titre">{insight.titre}</div>
        <div className="pg-insight-detail">{insight.detail}</div>
      </div>
      {insight.lien && (
        <Link to={insight.lien.to} className="pg-insight-lien">
          {insight.lien.label} <Icon name="chevron-right" size={14} />
        </Link>
      )}
    </div>
  );
}
