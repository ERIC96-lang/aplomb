import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTheme } from "../state/ThemeContext";
import { formatMontant } from "../lib/format";
import type { PointFlux, PointSolde } from "../lib/series";
import type { PartCategorie } from "../lib/calculs";

// Résout les couleurs du thème courant (re-lues à chaque changement de thème).
export function useChartColors() {
  const { theme } = useTheme();
  return useMemo(() => {
    const s = getComputedStyle(document.documentElement);
    const v = (n: string) => s.getPropertyValue(n).trim();
    return {
      accent: v("--accent") || "#6d6bf5",
      accent2: v("--accent-2") || "#a78bfa",
      teal: v("--teal") || "#2dd4bf",
      green: v("--green") || "#34d399",
      red: v("--red") || "#fb7185",
      blue: v("--blue") || "#60a5fa",
      text: v("--text") || "#eef1f8",
      muted: v("--text-muted") || "#8a93aa",
      grid: v("--border") || "rgba(255,255,255,.07)",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);
}

function fmtCourt(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1000) return `${(v / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  return String(Math.round(v));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TooltipMontant({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rc-tooltip">
      <div className="rc-label">{label}</div>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((p: any, i: number) => (
        <div className="rc-row" key={i}>
          <span className="dot" style={{ background: p.color || p.stroke || p.fill }} />
          <span style={{ color: "var(--text-muted)" }}>{p.name} :</span>
          <span style={{ marginLeft: "auto", fontWeight: 700 }}>
            {formatMontant(Number(p.value))}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Courbe de solde (area dégradé) ---------------- */
export function SoldeAreaChart({ data }: { data: PointSolde[] }) {
  const c = useChartColors();
  return (
    <div style={{ height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 8, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="soldeGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c.accent} stopOpacity={0.5} />
              <stop offset="100%" stopColor={c.accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: c.muted, fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fill: c.muted, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={46}
            tickFormatter={fmtCourt}
          />
          <Tooltip content={<TooltipMontant />} />
          <Area
            type="monotone"
            dataKey="solde"
            name="Solde"
            stroke={c.accent}
            strokeWidth={2.5}
            fill="url(#soldeGrad)"
            dot={false}
            activeDot={{ r: 5, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------------- Flux revenus / dépenses / épargne ---------------- */
export function FluxBarChart({ data }: { data: PointFlux[] }) {
  const c = useChartColors();
  return (
    <div style={{ height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 8, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: c.muted, fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fill: c.muted, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={46}
            tickFormatter={fmtCourt}
          />
          <Tooltip content={<TooltipMontant />} cursor={{ fill: c.grid, opacity: 0.4 }} />
          <Bar dataKey="revenus" name="Revenus" fill={c.green} radius={[5, 5, 0, 0]} maxBarSize={26} />
          <Bar dataKey="depenses" name="Dépenses" fill={c.red} radius={[5, 5, 0, 0]} maxBarSize={26} />
          <Line
            type="monotone"
            dataKey="epargne"
            name="Épargne"
            stroke={c.teal}
            strokeWidth={2.5}
            dot={{ r: 3, fill: c.teal, strokeWidth: 0 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------------- Donut catégories avec total au centre ---------------- */
export function CategorieDonut({
  data,
  total,
}: {
  data: PartCategorie[];
  total: number;
}) {
  return (
    <div style={{ position: "relative", height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="montant"
            nameKey="nom"
            innerRadius={68}
            outerRadius={100}
            paddingAngle={2}
            stroke="none"
          >
            {data.map((r) => (
              <Cell key={String(r.categorie_id)} fill={r.couleur} />
            ))}
          </Pie>
          <Tooltip content={<TooltipMontant />} />
        </PieChart>
      </ResponsiveContainer>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          pointerEvents: "none",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Total
          </div>
          <div className="num" style={{ fontSize: 20, fontWeight: 750 }}>
            {formatMontant(total)}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Barres horizontales de catégories ---------------- */
export function CategorieBars({ data }: { data: PartCategorie[] }) {
  const max = Math.max(1, ...data.map((d) => d.montant));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {data.map((r) => (
        <div key={String(r.categorie_id)}>
          <div className="flex-between" style={{ marginBottom: 5 }}>
            <span className="flex" style={{ gap: 8, fontSize: 13 }}>
              <span className="dot" style={{ background: r.couleur }} />
              {r.nom}
            </span>
            <span className="num" style={{ fontWeight: 650, fontSize: 13 }}>
              {formatMontant(r.montant)}
            </span>
          </div>
          <div className="progress">
            <span style={{ width: `${(r.montant / max) * 100}%`, background: r.couleur }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Jauge (reste à vivre / progression) ---------------- */
export function Gauge({
  ratio,
  centerLabel,
  centerValue,
}: {
  ratio: number; // 0..1
  centerLabel: string;
  centerValue: string;
}) {
  const c = useChartColors();
  const clamped = Math.max(0, Math.min(1, ratio));
  const r = 80;
  const circ = Math.PI * r; // demi-cercle
  const offset = circ * (1 - clamped);
  return (
    <div style={{ position: "relative", width: "100%", maxWidth: 240, margin: "0 auto" }}>
      <svg viewBox="0 0 200 110" width="100%">
        <defs>
          <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={c.accent} />
            <stop offset="100%" stopColor={c.teal} />
          </linearGradient>
        </defs>
        <path className="gauge-track" d="M 20 100 A 80 80 0 0 1 180 100" strokeWidth={14} />
        <path
          className="gauge-fill"
          d="M 20 100 A 80 80 0 0 1 180 100"
          strokeWidth={14}
          strokeDasharray={circ}
          strokeDashoffset={offset}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          bottom: 4,
          left: 0,
          right: 0,
          textAlign: "center",
        }}
      >
        <div className="num" style={{ fontSize: 22, fontWeight: 750 }}>
          {centerValue}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{centerLabel}</div>
      </div>
    </div>
  );
}

/* ---------------- Heatmap façon calendrier ---------------- */
export function Heatmap({ data }: { data: number[] }) {
  const c = useChartColors();
  const max = Math.max(1, ...data);
  return (
    <div className="heatmap">
      {data.map((v, i) => {
        const intensity = v / max;
        const bg =
          v === 0
            ? "var(--surface-2)"
            : `color-mix(in srgb, ${c.accent} ${Math.round(20 + intensity * 80)}%, transparent)`;
        return (
          <div
            key={i}
            className="heat-cell"
            style={{ background: bg }}
            title={`Jour ${i + 1} : ${formatMontant(v)}`}
          />
        );
      })}
    </div>
  );
}
