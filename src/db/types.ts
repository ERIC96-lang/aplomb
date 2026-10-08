export type CompteType = "courant" | "epargne" | "autre";

export interface Compte {
  id: number;
  nom: string;
  type: CompteType;
  solde_initial: number;
  date_creation: string; // 'YYYY-MM-DD'
  archive: number; // 0 | 1
}

export type TxType = "revenu" | "depense" | "virement";

export interface Transaction {
  id: number;
  type: TxType;
  montant: number;
  date: string; // 'YYYY-MM-DD'
  description: string | null;
  compte_id: number | null; // compte principal / source si virement
  compte_dest_id: number | null; // destination si virement
  categorie_id: number | null;
  created_at: string;
  a_confirmer: number; // 1 = générée automatiquement, en attente de validation
  auto_origine: string | null; // ex. "salaire", "charge:12"
  pointee: number; // 1 = rapprochée avec le relevé bancaire
  justificatif_path: string | null; // PDF joint (chemin relatif)
  /** Objectif alimenté par ce virement (si plusieurs objectifs suivent le même compte). */
  objectif_id?: number | null;
}

export type CategorieType = "revenu" | "depense";

export interface Categorie {
  id: number;
  nom: string;
  type: CategorieType;
  couleur: string;
}

export type Periodicite = "mensuelle" | "hebdomadaire" | "trimestrielle" | "annuelle";

export interface ChargeFixe {
  id: number;
  nom: string;
  montant_attendu: number;
  compte_id: number;
  categorie_id: number | null;
  jour_echeance: number; // 1..31
  actif: number; // 0 | 1
  periodicite: Periodicite;
}

export type EcheanceStatut =
  | "a_venir"
  | "en_retard"
  | "payee_sans_justif"
  | "payee_avec_justif"
  /** Payée hors des comptes suivis (ex. PayPal) : réglée, mais sans dépense dans l'app. */
  | "reglee_ailleurs";

export interface Echeance {
  id: number;
  charge_fixe_id: number;
  mois: string; // 'YYYY-MM'
  statut: EcheanceStatut;
  transaction_id: number | null;
  justificatif_path: string | null;
}

export type SuggestionStatut = "proposee" | "acceptee" | "ignoree";

export interface SuggestionRecurrence {
  id: number;
  signature: string;
  categorie_id: number | null;
  libelle: string | null;
  montant_moyen: number;
  jour_moyen: number;
  nb_occurrences: number;
  transaction_ids: string; // JSON: "[1,2,3]"
  statut: SuggestionStatut;
  derniere_detection: string;
}

export interface Budget {
  id: number;
  categorie_id: number;
  montant_plafond: number;
}

export interface RegleCategorisation {
  id: number;
  motcle: string;
  categorie_id: number;
}

export interface Objectif {
  id: number;
  nom: string;
  montant_cible: number;
  montant_actuel: number;
  date_cible: string | null; // 'YYYY-MM-DD'
  couleur: string;
  cree_le: string;
  compte_id: number | null; // compte suivi (modes « solde » et « versements »)
  /** Absent dans les données antérieures à la v10 : déduit de compte_id. */
  mode_suivi?: ModeSuivi;
}

/** manuel : saisie à la main ; solde : solde du compte ; versements : mouvements du compte depuis la création. */
export type ModeSuivi = "manuel" | "solde" | "versements";

export type FactureType = "recu" | "facture";

export interface LigneFacture {
  designation: string;
  quantite: number;
  prix_unitaire: number;
}

/** Contenu structuré d'une facture, sérialisé en JSON dans `factures.donnees`. */
export interface FactureData {
  type: FactureType;
  numero: string;
  date: string;
  // Émetteur
  emetteur_nom: string;
  emetteur_infos: string; // adresse / SIRET / contact (multi-lignes)
  // Client
  client_nom: string;
  client_infos: string;
  // Lignes
  lignes: LigneFacture[];
  tva_taux: number; // en %
  notes: string;
  paye: boolean;
}

export interface Facture {
  id: number;
  numero: string;
  type: FactureType;
  date: string;
  montant_total: number;
  donnees: string; // JSON FactureData
  cree_le: string;
}

/** Candidat de récurrence calculé à la volée (pas encore persisté). */
export interface CandidatRecurrence {
  signature: string;
  categorie_id: number | null;
  libelle: string;
  montant_moyen: number;
  jour_moyen: number;
  nb_occurrences: number;
  transaction_ids: number[];
  mois: string[]; // liste des 'YYYY-MM' couverts
}
