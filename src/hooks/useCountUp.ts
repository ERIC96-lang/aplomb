import { useEffect, useRef, useState } from "react";

const reduit = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Fait défiler une valeur numérique jusqu'à `value` : depuis 0 à l'apparition,
 * puis depuis l'ancienne valeur à chaque changement. Respecte « réduire les
 * animations » (valeur affichée directement).
 */
export function useCountUp(value: number, duration = 900): number {
  const [display, setDisplay] = useState(() => (reduit() ? value : 0));
  const fromRef = useRef(reduit() ? value : 0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    if (reduit()) {
      fromRef.current = to;
      setDisplay(to);
      return;
    }
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutQuart : démarre vite, se pose en douceur.
      const eased = 1 - Math.pow(1 - t, 4);
      const v = from + (to - from) * eased;
      fromRef.current = v;
      setDisplay(t < 1 ? v : to);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  return display;
}
