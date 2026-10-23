import { useId } from "react";
import { motion } from "motion/react";

/** Mini-courbe (tendance sur quelques mois), tracée à l'apparition. */
export function Sparkline({
  valeurs,
  couleur = "var(--accent)",
  hauteur = 34,
}: {
  valeurs: number[];
  couleur?: string;
  hauteur?: number;
}) {
  const id = "spark" + useId().replace(/:/g, "");
  if (valeurs.length < 2) return null;
  const L = 120;
  const min = Math.min(...valeurs);
  const max = Math.max(...valeurs);
  const etendue = max - min || 1;
  const pts = valeurs.map((v, i) => [
    (i / (valeurs.length - 1)) * L,
    hauteur - 3 - ((v - min) / etendue) * (hauteur - 6),
  ]);
  const ligne = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const aire = `${ligne} L${L} ${hauteur} L0 ${hauteur} Z`;
  const [dx, dy] = pts[pts.length - 1];

  return (
    <svg className="db-spark" viewBox={`0 0 ${L} ${hauteur}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={couleur} stopOpacity={0.22} />
          <stop offset="100%" stopColor={couleur} stopOpacity={0} />
        </linearGradient>
      </defs>
      <motion.path
        d={aire}
        fill={`url(#${id})`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { delay: 0.5, duration: 0.6 } }}
      />
      <motion.path
        d={ligne}
        fill="none"
        stroke={couleur}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1, transition: { duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.2 } }}
      />
      {/* Point final : trait de longueur nulle à bout rond, qui reste rond malgré l'étirement. */}
      <motion.path
        d={`M${dx} ${dy} L${dx} ${dy}`}
        stroke={couleur}
        strokeWidth={6}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { delay: 1.1, duration: 0.3 } }}
      />
    </svg>
  );
}
