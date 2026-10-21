import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export interface PositionPopover {
  top: number;
  left: number;
  /** Ouvert au-dessus du déclencheur (manque de place en dessous). */
  haut: boolean;
}

/**
 * Logique commune des fenêtres flottantes (menus, sélecteur de mois) rendues
 * dans <body> : position sous le déclencheur (ou au-dessus), recalcul au
 * défilement/redimensionnement, fermeture au clic extérieur.
 */
export function usePopover(aligne: "gauche" | "droite" = "gauche", largeur?: number) {
  const [ouvert, setOuvert] = useState(false);
  const [pos, setPos] = useState<PositionPopover | null>(null);
  const declRef = useRef<HTMLElement | null>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const fermer = useCallback((rendreFocus = true) => {
    setOuvert(false);
    if (rendreFocus) declRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!ouvert || !declRef.current) return;
    const placer = () => {
      if (!declRef.current) return;
      const r = declRef.current.getBoundingClientRect();
      const h = popRef.current?.offsetHeight ?? 260;
      const w = popRef.current?.offsetWidth ?? largeur ?? 220;
      const haut = r.bottom + 6 + h > window.innerHeight - 8 && r.top - 6 - h > 8;
      let left = aligne === "droite" ? r.right - w : r.left;
      left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
      setPos({ top: haut ? r.top - 6 - h : r.bottom + 6, left, haut });
    };
    placer();
    const raf = requestAnimationFrame(placer); // une fois la taille réelle connue
    window.addEventListener("resize", placer);
    window.addEventListener("scroll", placer, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", placer);
      window.removeEventListener("scroll", placer, true);
    };
  }, [ouvert, aligne, largeur]);

  useEffect(() => {
    if (!ouvert) {
      setPos(null);
      return;
    }
    const surClic = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || declRef.current?.contains(t)) return;
      fermer(false);
    };
    document.addEventListener("mousedown", surClic);
    popRef.current?.focus({ preventScroll: true });
    return () => document.removeEventListener("mousedown", surClic);
  }, [ouvert, fermer]);

  const style = {
    top: pos?.top ?? -9999,
    left: pos?.left ?? -9999,
    minWidth: largeur,
    transformOrigin: pos?.haut ? "bottom" : "top",
  } as const;

  return { ouvert, setOuvert, fermer, declRef, popRef, pos, style };
}
