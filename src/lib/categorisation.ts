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
