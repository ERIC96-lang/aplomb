import { useCountUp } from "../hooks/useCountUp";
import { formatMontant } from "../lib/format";
import { Icon, type IconName } from "./Icon";

interface Props {
  label: string;
  value: number;
  icon: IconName;
  tone?: "pos" | "neg" | "neutral";
  delta?: number | null; // variation en % vs période précédente
  hint?: string;
  invertDelta?: boolean; // pour les dépenses : hausse = mauvais
}

export function StatCard({ label, value, icon, tone = "neutral", delta, hint, invertDelta }: Props) {
  const animated = useCountUp(value);
  const toneCls = tone === "pos" ? "pos" : tone === "neg" ? "neg" : "";

  let deltaEl = null;
  if (delta != null && isFinite(delta)) {
    const positif = delta >= 0;
    const bon = invertDelta ? !positif : positif;
    const cls = Math.abs(delta) < 0.5 ? "flat" : bon ? "up" : "down";
    const fleche = Math.abs(delta) < 0.5 ? "→" : positif ? "▲" : "▼";
    deltaEl = (
      <span className={`delta ${cls}`}>
        {fleche} {Math.abs(delta).toFixed(0)} %
      </span>
    );
  }

  return (
    <div className="stat animate-in">
      <div className="stat-top">
        <span className="label">{label}</span>
        <span className="stat-ico">
          <Icon name={icon} size={17} />
        </span>
      </div>
      <div className={`value num ${toneCls}`}>{formatMontant(animated)}</div>
      <div className="hint flex" style={{ gap: 8 }}>
        {deltaEl}
        {hint && <span>{hint}</span>}
      </div>
    </div>
  );
}
