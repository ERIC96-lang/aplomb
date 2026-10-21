import type { IconName } from "../components/Icon";

// Source unique de la navigation : barre latérale, palette Ctrl+K et menu
// « Nouveau » s'appuient sur ces listes, pour des libellés et icônes identiques.

export interface Rubrique {
  to: string;
  ico: IconName;
  label: string;
  end?: boolean;
  /** Clé d'un compteur « à traiter » affiché en pastille. */
  badge?: "charges" | "suggestions" | "budgets";
  /** Mots-clés supplémentaires pour la recherche de la palette. */
  motscles?: string;
}

export interface Groupe {
  id: string;
  titre?: string;
  items: Rubrique[];
}

export const GROUPES: Groupe[] = [
  {
    id: "accueil",
    items: [
      { to: "/", ico: "dashboard", label: "Tableau de bord", end: true, motscles: "accueil synthèse" },
      { to: "/analyse", ico: "bulb", label: "Analyse", motscles: "points clés conseils" },
    ],
  },
  {
    id: "operations",
    titre: "Opérations",
    items: [
      { to: "/comptes", ico: "bank", label: "Comptes", motscles: "solde banque" },
      { to: "/transactions", ico: "card", label: "Transactions", motscles: "dépenses revenus virements" },
      { to: "/charges", ico: "repeat", label: "Charges fixes", badge: "charges", motscles: "abonnements loyer échéances" },
      { to: "/suggestions", ico: "sparkles", label: "Suggestions", badge: "suggestions", motscles: "récurrences" },
    ],
  },
  {
    id: "planification",
    titre: "Planification",
    items: [
      { to: "/budgets", ico: "coins", label: "Budgets", badge: "budgets", motscles: "plafonds" },
      { to: "/objectifs", ico: "target", label: "Objectifs", motscles: "épargne" },
      { to: "/previsions", ico: "trending-up", label: "Prévisions", motscles: "projection scénarios" },
      { to: "/echeancier", ico: "calendar", label: "Échéancier", motscles: "à venir" },
    ],
  },
  {
    id: "documents",
    titre: "Documents",
    items: [
      { to: "/factures", ico: "receipt", label: "Factures & reçus", motscles: "pdf" },
      { to: "/import", ico: "upload", label: "Importer", motscles: "csv ofx relevé" },
      { to: "/rapports", ico: "report", label: "Rapports", motscles: "pdf imprimer bilan" },
    ],
  },
];

export const PIED: Rubrique[] = [
  { to: "/aide", ico: "help", label: "Aide", motscles: "centre d'aide questions" },
  { to: "/parametres", ico: "settings", label: "Paramètres", motscles: "réglages profil catégories sauvegarde" },
];

export const TOUTES_RUBRIQUES: Rubrique[] = [...GROUPES.flatMap((g) => g.items), ...PIED];

/** Action « Nouveau … » : ouvre une page en demandant une action à l'arrivée. */
export interface ActionRapide {
  id: ActionId;
  label: string;
  ico: IconName;
  to: string;
  description?: string;
}

export type ActionId =
  | "depense"
  | "revenu"
  | "virement"
  | "scanner"
  | "charge"
  | "objectif"
  | "compte";

export const ACTIONS_RAPIDES: ActionRapide[] = [
  { id: "depense", label: "Dépense", ico: "trending-down", to: "/transactions", description: "Saisir une dépense" },
  { id: "revenu", label: "Revenu", ico: "trending-up", to: "/transactions", description: "Saisir un revenu" },
  { id: "virement", label: "Virement", ico: "repeat", to: "/transactions", description: "Entre deux comptes" },
  { id: "scanner", label: "Scanner un reçu", ico: "camera", to: "/transactions", description: "Lire une photo ou un PDF" },
  { id: "charge", label: "Charge fixe", ico: "calendar", to: "/charges", description: "Loyer, abonnement…" },
  { id: "objectif", label: "Objectif", ico: "target", to: "/objectifs", description: "Un projet d'épargne" },
  { id: "compte", label: "Compte", ico: "bank", to: "/comptes", description: "Banque, livret, espèces" },
];
