import { fetch } from "@tauri-apps/plugin-http";

/**
 * Récupère le taux de conversion `base` -> `cible` via l'API publique
 * open.er-api.com (gratuite, sans clé). Renvoie null si hors-ligne / erreur.
 */
export async function recupererTaux(base: string, cible: string): Promise<number | null> {
  if (base === cible) return 1;
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${base}`, { method: "GET" });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: string; rates?: Record<string, number> };
    if (data.result !== "success" || !data.rates) return null;
    const taux = data.rates[cible];
    return typeof taux === "number" ? taux : null;
  } catch {
    return null;
  }
}
