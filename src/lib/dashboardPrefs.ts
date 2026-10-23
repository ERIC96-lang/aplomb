/**
 * Préférences de personnalisation du tableau de bord : ordre et visibilité des
 * sections, persistés en localStorage (par appareil, comme le thème/la devise).
 */

export type SectionId = "apercu" | "indicateurs" | "evolution" | "repartition" | "suivi";

export interface SectionMeta {
  id: SectionId;
  label: string;
}

/** Ordre par défaut + libellés lisibles (source de vérité de la liste des sections). */
export const SECTIONS: SectionMeta[] = [
  { id: "apercu", label: "Aperçu du mois (solde, statut, fil du mois)" },
  { id: "indicateurs", label: "Indicateurs (revenus, dépenses, épargne, budgets)" },
  { id: "evolution", label: "Évolution + à faire et prochaines échéances" },
  { id: "repartition", label: "Dépenses par catégorie + budgets" },
  { id: "suivi", label: "Points clés + dernières opérations" },
];

export interface DashboardPrefs {
  ordre: SectionId[];
  masquees: SectionId[];
}

const CLE = "budgetperso.dashboard.prefs";

const DEFAUT: DashboardPrefs = {
  ordre: SECTIONS.map((s) => s.id),
  masquees: [],
};

/**
 * Réconcilie des préférences stockées avec la liste courante des sections :
 * on garde l'ordre connu, on ajoute les nouvelles sections à la fin, et on
 * jette les ids devenus obsolètes. Robuste aux montées de version.
 */
export function normaliser(p: Partial<DashboardPrefs> | null): DashboardPrefs {
  const valides = new Set(SECTIONS.map((s) => s.id));
  const ordreStocke = (p?.ordre ?? []).filter((id): id is SectionId => valides.has(id as SectionId));
  const manquantes = SECTIONS.map((s) => s.id).filter((id) => !ordreStocke.includes(id));
  const masquees = (p?.masquees ?? []).filter((id): id is SectionId => valides.has(id as SectionId));
  return { ordre: [...ordreStocke, ...manquantes], masquees };
}

export function chargerDashboardPrefs(): DashboardPrefs {
  try {
    const brut = localStorage.getItem(CLE);
    if (!brut) return { ...DEFAUT };
    return normaliser(JSON.parse(brut));
  } catch {
    return { ...DEFAUT };
  }
}

export function sauverDashboardPrefs(p: DashboardPrefs): void {
  try {
    localStorage.setItem(CLE, JSON.stringify(p));
  } catch {
    /* stockage indisponible : on ignore */
  }
}

export function reinitDashboardPrefs(): DashboardPrefs {
  try {
    localStorage.removeItem(CLE);
  } catch {
    /* ignore */
  }
  return { ...DEFAUT };
}
