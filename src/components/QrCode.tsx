import { useMemo } from "react";
import qrcode from "qrcode-generator";

interface Props {
  valeur: string;
  taille?: number;
  /** Niveau de correction d'erreur (M par défaut : bon compromis densité / robustesse). */
  niveau?: "L" | "M" | "Q" | "H";
  label?: string;
}

/**
 * QR code en SVG, généré localement (aucun service en ligne). Toujours noir
 * sur blanc avec une marge, quel que soit le thème : c'est ce que les appareils
 * photo lisent le mieux.
 */
export function QrCode({ valeur, taille = 200, niveau = "M", label }: Props) {
  const { chemin, n } = useMemo(() => {
    const qr = qrcode(0, niveau);
    qr.addData(valeur);
    qr.make();
    const n = qr.getModuleCount();
    let d = "";
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (qr.isDark(y, x)) d += `M${x} ${y}h1v1h-1z`;
      }
    }
    return { chemin: d, n };
  }, [valeur, niveau]);

  const marge = 3;
  const vue = n + marge * 2;
  return (
    <svg
      className="qr"
      width={taille}
      height={taille}
      viewBox={`${-marge} ${-marge} ${vue} ${vue}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label ?? "QR code"}
    >
      <rect x={-marge} y={-marge} width={vue} height={vue} fill="#ffffff" />
      <path d={chemin} fill="#111111" />
    </svg>
  );
}
