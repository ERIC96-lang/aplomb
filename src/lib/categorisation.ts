import type { RegleCategorisation } from "../db/types";

/**
 * Renvoie l'id de catégorie de la première règle dont le mot-clé est contenu
 * dans la description (insensible à la casse), ou null.
 */
export function categoriePourDescription(
  regles: RegleCategorisation[],
  description: string | null
): number | null {
  const d = (description ?? "").toLowerCase();
  if (!d) return null;
  const r = regles.find((x) => x.motcle && d.includes(x.motcle));
  return r ? r.categorie_id : null;
}

// Petits mots à ignorer quand on devine le marchand dans une description.
const STOP = new Set([
  "avec", "pour", "chez", "les", "des", "une", "aux", "par", "sur", "sous",
  "carte", "paiement", "achat", "cb", "virement", "prlv", "prelevement",
  "facture", "abonnement", "mensuel", "paypal", "sepa",
]);

/**
 * Devine un mot-clé de règle à partir d'une description libre : on enlève les
 * chiffres et la ponctuation, on écarte les mots outils, et on garde le mot le
 * plus long (souvent le nom du marchand). Renvoie "" si rien d'exploitable.
 */
export function motCleDepuisDescription(description: string | null): string {
  const mots = (description ?? "")
    .toLowerCase()
    .replace(/[0-9]/g, " ")
    .replace(/[^a-zàâäéèêëïîôöùûüç\s-]/gi, " ")
    .split(/\s+/)
    .map((m) => m.trim())
    .filter((m) => m.length >= 4 && !STOP.has(m));
  if (mots.length === 0) {
    const brut = (description ?? "").trim().toLowerCase();
    return brut.length >= 3 ? brut.slice(0, 24) : "";
  }
  return mots.sort((a, b) => b.length - a.length)[0];
}
