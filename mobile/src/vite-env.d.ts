/// <reference types="vite/client" />

interface Navigator {
  /** iOS : vrai quand l'app est lancée depuis l'écran d'accueil. */
  readonly standalone?: boolean;
}
