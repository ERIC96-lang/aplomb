import type { Transition, Variants } from "motion/react";

// Langage d'animation d'Aplomb : « le fil à plomb ». Les éléments descendent
// légèrement et se posent avec un ressort amorti, comme un plomb qui trouve
// son équilibre. Calme, sans rebond appuyé. Le respect de « réduire les
// animations » est global : <MotionConfig reducedMotion="user"> dans App
// (+ media query CSS pour les animations CSS).

/** Ressort d'aplomb : se pose avec un très léger dépassement. */
export const aplomb: Transition = { type: "spring", stiffness: 210, damping: 24, mass: 0.9 };
/** Ressort vif pour les petits éléments (repères, pastilles, boutons). */
export const ressort: Transition = { type: "spring", stiffness: 460, damping: 36, mass: 0.7 };
export const sortie: Transition = { duration: 0.16, ease: [0.4, 0, 1, 1] };

/** Transition entre pages : la page descend de quelques pixels et se pose. */
export const page: Variants = {
  initial: { opacity: 0, y: -14 },
  animate: { opacity: 1, y: 0, transition: { ...aplomb, opacity: { duration: 0.28 } } },
  exit: { opacity: 0, transition: sortie },
};
