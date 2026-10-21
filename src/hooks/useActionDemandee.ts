import { useEffect, useRef } from "react";
import { useLocation, useNavigate, type NavigateFunction } from "react-router-dom";
import { ACTIONS_RAPIDES, type ActionId } from "../lib/navigation";

/** Demande transmise à une page via la navigation (menu « Nouveau », palette). */
export interface DemandeNav {
  action?: ActionId;
  /** Transaction à ouvrir dès l'arrivée. */
  transaction?: number;
  /** Compte sur lequel filtrer (Transactions). */
  compte?: number;
}

/** Ouvre la page de l'action et lui demande de l'exécuter à l'arrivée. */
export function demanderAction(navigate: NavigateFunction, id: ActionId) {
  const a = ACTIONS_RAPIDES.find((x) => x.id === id);
  if (a) navigate(a.to, { state: { action: id } satisfies DemandeNav });
}

/**
 * Exécute la demande reçue via la navigation, une seule fois : l'état de
 * navigation est vidé aussitôt. Seule la page visée la traite : la page qu'on
 * quitte, encore montée le temps de son animation de sortie, l'ignore.
 */
export function useDemandeNavigation(gerer: (d: DemandeNav) => void) {
  const location = useLocation();
  const navigate = useNavigate();
  const gererRef = useRef(gerer);
  gererRef.current = gerer;
  const monChemin = useRef(location.pathname);
  const demande = location.state as DemandeNav | null;

  useEffect(() => {
    if (location.pathname !== monChemin.current) return;
    if (!demande || Object.values(demande).every((v) => v === undefined)) return;
    navigate(location.pathname + location.search, { replace: true, state: null });
    gererRef.current(demande);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demande]);
}
