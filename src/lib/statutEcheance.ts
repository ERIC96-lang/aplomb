import type { EcheanceStatut } from "../db/types";

/**
 * Échéance réglée : payée depuis un compte suivi (avec ou sans justificatif),
 * ou « réglée hors comptes » (ex. via PayPal) — dans ce dernier cas aucune
 * dépense n'existe dans l'app et les soldes ne sont pas touchés.
 */
export function estReglee(statut: EcheanceStatut): boolean {
  return statut === "payee_sans_justif" || statut === "payee_avec_justif" || statut === "reglee_ailleurs";
}
