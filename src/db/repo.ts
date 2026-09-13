import { getDb } from "./index";
import type {
  Budget,
  Categorie,
  ChargeFixe,
  Compte,
  Echeance,
  EcheanceStatut,
  Facture,
  FactureData,
  Objectif,
  Periodicite,
  RegleCategorisation,
  SuggestionRecurrence,
  Transaction,
} from "./types";

// ---------------------------------------------------------------------------
// COMPTES
// ---------------------------------------------------------------------------

export async function listComptes(inclureArchives = false): Promise<Compte[]> {
  const db = await getDb();
  const where = inclureArchives ? "" : "WHERE archive = 0";
  return db.select<Compte[]>(
    `SELECT * FROM comptes ${where} ORDER BY archive ASC, nom ASC`
  );
}

export async function creerCompte(
  c: Pick<Compte, "nom" | "type" | "solde_initial" | "date_creation">
): Promise<number> {
  const db = await getDb();
  const res = await db.execute(
    "INSERT INTO comptes (nom, type, solde_initial, date_creation) VALUES (?, ?, ?, ?)",
    [c.nom, c.type, c.solde_initial, c.date_creation]
  );
  return res.lastInsertId as number;
}

export async function majCompte(
  id: number,
  c: Pick<Compte, "nom" | "type" | "solde_initial">
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE comptes SET nom = ?, type = ?, solde_initial = ? WHERE id = ?",
    [c.nom, c.type, c.solde_initial, id]
  );
}

export async function archiverCompte(id: number, archive: boolean): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE comptes SET archive = ? WHERE id = ?", [
    archive ? 1 : 0,
    id,
  ]);
}

export async function supprimerCompte(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM comptes WHERE id = ?", [id]);
}

// ---------------------------------------------------------------------------
// CATEGORIES
// ---------------------------------------------------------------------------

export async function listCategories(): Promise<Categorie[]> {
  const db = await getDb();
  return db.select<Categorie[]>("SELECT * FROM categories ORDER BY type, nom");
}

export async function creerCategorie(
  c: Pick<Categorie, "nom" | "type" | "couleur">
): Promise<number> {
  const db = await getDb();
  const res = await db.execute(
    "INSERT INTO categories (nom, type, couleur) VALUES (?, ?, ?)",
    [c.nom, c.type, c.couleur]
  );
  return res.lastInsertId as number;
}

export async function majCategorie(
  id: number,
  c: Pick<Categorie, "nom" | "type" | "couleur">
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE categories SET nom = ?, type = ?, couleur = ? WHERE id = ?",
    [c.nom, c.type, c.couleur, id]
  );
}

export async function supprimerCategorie(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM categories WHERE id = ?", [id]);
}

// ---------------------------------------------------------------------------
// TRANSACTIONS
// ---------------------------------------------------------------------------

export async function listTransactions(): Promise<Transaction[]> {
  const db = await getDb();
  return db.select<Transaction[]>(
    "SELECT * FROM transactions ORDER BY date DESC, id DESC"
  );
}

export interface TransactionInput {
  type: Transaction["type"];
  montant: number;
  date: string;
  description: string | null;
  compte_id: number | null;
  compte_dest_id: number | null;
  categorie_id: number | null;
  a_confirmer?: boolean;
  auto_origine?: string | null;
}

export async function creerTransaction(t: TransactionInput): Promise<number> {
  const db = await getDb();
  const res = await db.execute(
    `INSERT INTO transactions
       (type, montant, date, description, compte_id, compte_dest_id, categorie_id, created_at, a_confirmer, auto_origine)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      t.type,
      t.montant,
      t.date,
      t.description,
      t.compte_id,
      t.compte_dest_id,
      t.categorie_id,
      new Date().toISOString(),
      t.a_confirmer ? 1 : 0,
      t.auto_origine ?? null,
    ]
  );
  return res.lastInsertId as number;
}

export async function confirmerTransaction(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE transactions SET a_confirmer = 0 WHERE id = ?", [id]);
}

export async function confirmerToutesTransactions(): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE transactions SET a_confirmer = 0 WHERE a_confirmer = 1");
}

/** Existe-t-il déjà une transaction auto pour cette origine et ce mois ? */
export async function existeAuto(origine: string, mois: string): Promise<boolean> {
  const db = await getDb();
  const r = await db.select<{ n: number }[]>(
    "SELECT COUNT(*) as n FROM transactions WHERE auto_origine = ? AND substr(date,1,7) = ?",
    [origine, mois]
  );
  return (r[0]?.n ?? 0) > 0;
}

/** Convertit tous les montants stockés par un taux (changement de devise). */
export async function convertirTousMontants(taux: number): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE transactions SET montant = montant * ?", [taux]);
  await db.execute("UPDATE comptes SET solde_initial = solde_initial * ?", [taux]);
  await db.execute("UPDATE charges_fixes SET montant_attendu = montant_attendu * ?", [taux]);
  await db.execute("UPDATE budgets SET montant_plafond = montant_plafond * ?", [taux]);
  await db.execute("UPDATE objectifs SET montant_cible = montant_cible * ?, montant_actuel = montant_actuel * ?", [taux, taux]);
}

export async function majTransaction(
  id: number,
  t: TransactionInput
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE transactions
       SET type = ?, montant = ?, date = ?, description = ?,
           compte_id = ?, compte_dest_id = ?, categorie_id = ?
     WHERE id = ?`,
    [
      t.type,
      t.montant,
      t.date,
      t.description,
      t.compte_id,
      t.compte_dest_id,
      t.categorie_id,
      id,
    ]
  );
}

export async function supprimerTransaction(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM transactions WHERE id = ?", [id]);
}

// ---------------------------------------------------------------------------
// CHARGES FIXES
// ---------------------------------------------------------------------------

export async function listChargesFixes(): Promise<ChargeFixe[]> {
  const db = await getDb();
  return db.select<ChargeFixe[]>("SELECT * FROM charges_fixes ORDER BY nom");
}

export interface ChargeFixeInput {
  nom: string;
  montant_attendu: number;
  compte_id: number;
  categorie_id: number | null;
  jour_echeance: number;
  actif: number;
  periodicite: Periodicite;
}

export async function creerChargeFixe(c: ChargeFixeInput): Promise<number> {
  const db = await getDb();
  const res = await db.execute(
    `INSERT INTO charges_fixes
       (nom, montant_attendu, compte_id, categorie_id, jour_echeance, actif, periodicite)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [c.nom, c.montant_attendu, c.compte_id, c.categorie_id, c.jour_echeance, c.actif, c.periodicite]
  );
  return res.lastInsertId as number;
}

export async function majChargeFixe(
  id: number,
  c: ChargeFixeInput
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE charges_fixes
       SET nom = ?, montant_attendu = ?, compte_id = ?, categorie_id = ?,
           jour_echeance = ?, actif = ?, periodicite = ?
     WHERE id = ?`,
    [c.nom, c.montant_attendu, c.compte_id, c.categorie_id, c.jour_echeance, c.actif, c.periodicite, id]
  );
}

export async function supprimerChargeFixe(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM charges_fixes WHERE id = ?", [id]);
}

// ---------------------------------------------------------------------------
// ECHEANCES
// ---------------------------------------------------------------------------

export async function listEcheances(): Promise<Echeance[]> {
  const db = await getDb();
  return db.select<Echeance[]>("SELECT * FROM charge_fixe_echeances");
}

export async function creerEcheance(
  charge_fixe_id: number,
  mois: string,
  statut: EcheanceStatut
): Promise<number> {
  const db = await getDb();
  const res = await db.execute(
    `INSERT OR IGNORE INTO charge_fixe_echeances (charge_fixe_id, mois, statut)
     VALUES (?, ?, ?)`,
    [charge_fixe_id, mois, statut]
  );
  return res.lastInsertId as number;
}

export async function majEcheance(
  id: number,
  patch: Partial<Pick<Echeance, "statut" | "transaction_id" | "justificatif_path">>
): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.statut !== undefined) {
    sets.push("statut = ?");
    vals.push(patch.statut);
  }
  if (patch.transaction_id !== undefined) {
    sets.push("transaction_id = ?");
    vals.push(patch.transaction_id);
  }
  if (patch.justificatif_path !== undefined) {
    sets.push("justificatif_path = ?");
    vals.push(patch.justificatif_path);
  }
  if (sets.length === 0) return;
  vals.push(id);
  await db.execute(
    `UPDATE charge_fixe_echeances SET ${sets.join(", ")} WHERE id = ?`,
    vals
  );
}

// ---------------------------------------------------------------------------
// SUGGESTIONS DE RECURRENCE
// ---------------------------------------------------------------------------

export async function listSuggestions(): Promise<SuggestionRecurrence[]> {
  const db = await getDb();
  return db.select<SuggestionRecurrence[]>(
    "SELECT * FROM suggestions_recurrence"
  );
}

// ---------------------------------------------------------------------------
// BUDGETS
// ---------------------------------------------------------------------------

export async function listBudgets(): Promise<Budget[]> {
  const db = await getDb();
  return db.select<Budget[]>("SELECT * FROM budgets");
}

/** Crée ou met à jour le plafond d'une catégorie. */
export async function definirBudget(
  categorie_id: number,
  montant_plafond: number
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO budgets (categorie_id, montant_plafond)
     VALUES (?, ?)
     ON CONFLICT(categorie_id) DO UPDATE SET montant_plafond = excluded.montant_plafond`,
    [categorie_id, montant_plafond]
  );
}

export async function supprimerBudget(categorie_id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM budgets WHERE categorie_id = ?", [categorie_id]);
}

// ---------------------------------------------------------------------------
// OBJECTIFS D'ÉPARGNE
// ---------------------------------------------------------------------------

export async function listObjectifs(): Promise<Objectif[]> {
  const db = await getDb();
  return db.select<Objectif[]>("SELECT * FROM objectifs ORDER BY cree_le DESC");
}

export interface ObjectifInput {
  nom: string;
  montant_cible: number;
  montant_actuel: number;
  date_cible: string | null;
  couleur: string;
}

export async function creerObjectif(o: ObjectifInput): Promise<number> {
  const db = await getDb();
  const res = await db.execute(
    `INSERT INTO objectifs (nom, montant_cible, montant_actuel, date_cible, couleur, cree_le)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [o.nom, o.montant_cible, o.montant_actuel, o.date_cible, o.couleur, new Date().toISOString()]
  );
  return res.lastInsertId as number;
}

export async function majObjectif(id: number, o: ObjectifInput): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE objectifs
       SET nom = ?, montant_cible = ?, montant_actuel = ?, date_cible = ?, couleur = ?
     WHERE id = ?`,
    [o.nom, o.montant_cible, o.montant_actuel, o.date_cible, o.couleur, id]
  );
}

export async function ajusterMontantObjectif(id: number, delta: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE objectifs SET montant_actuel = MAX(0, montant_actuel + ?) WHERE id = ?",
    [delta, id]
  );
}

export async function supprimerObjectif(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM objectifs WHERE id = ?", [id]);
}

// ---------------------------------------------------------------------------
// FACTURES / REÇUS
// ---------------------------------------------------------------------------

export async function listFactures(): Promise<Facture[]> {
  const db = await getDb();
  return db.select<Facture[]>("SELECT * FROM factures ORDER BY cree_le DESC");
}

export async function creerFacture(data: FactureData, montant_total: number): Promise<number> {
  const db = await getDb();
  const res = await db.execute(
    `INSERT INTO factures (numero, type, date, montant_total, donnees, cree_le)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [data.numero, data.type, data.date, montant_total, JSON.stringify(data), new Date().toISOString()]
  );
  return res.lastInsertId as number;
}

export async function supprimerFacture(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM factures WHERE id = ?", [id]);
}

// ---------------------------------------------------------------------------
// RÈGLES DE CATÉGORISATION
// ---------------------------------------------------------------------------

export async function listRegles(): Promise<RegleCategorisation[]> {
  const db = await getDb();
  return db.select<RegleCategorisation[]>("SELECT * FROM regles_categorisation ORDER BY motcle");
}

export async function creerRegle(motcle: string, categorie_id: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO regles_categorisation (motcle, categorie_id) VALUES (?, ?)",
    [motcle.trim().toLowerCase(), categorie_id]
  );
}

export async function supprimerRegle(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM regles_categorisation WHERE id = ?", [id]);
}

/** Applique les règles aux transactions (dépenses) sans catégorie. Renvoie le nb modifié. */
export async function appliquerReglesExistant(): Promise<number> {
  const db = await getDb();
  const regles = await listRegles();
  const sansCat = await db.select<{ id: number; description: string | null }[]>(
    "SELECT id, description FROM transactions WHERE categorie_id IS NULL AND type = 'depense'"
  );
  let n = 0;
  for (const t of sansCat) {
    const desc = (t.description ?? "").toLowerCase();
    const regle = regles.find((r) => desc.includes(r.motcle));
    if (regle) {
      await db.execute("UPDATE transactions SET categorie_id = ? WHERE id = ?", [
        regle.categorie_id,
        t.id,
      ]);
      n++;
    }
  }
  return n;
}

// ---------------------------------------------------------------------------
// SAUVEGARDE / RESTAURATION
// ---------------------------------------------------------------------------

/** Crée une copie cohérente de la base vers un chemin absolu (VACUUM INTO). */
export async function sauvegarderBaseVers(cheminAbsolu: string): Promise<void> {
  const db = await getDb();
  await db.execute(`VACUUM INTO ?`, [cheminAbsolu]);
}

export async function enregistrerDecisionSuggestion(
  s: {
    signature: string;
    categorie_id: number | null;
    libelle: string;
    montant_moyen: number;
    jour_moyen: number;
    nb_occurrences: number;
    transaction_ids: number[];
    statut: "acceptee" | "ignoree";
  }
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO suggestions_recurrence
       (signature, categorie_id, libelle, montant_moyen, jour_moyen,
        nb_occurrences, transaction_ids, statut, derniere_detection)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(signature) DO UPDATE SET
        statut = excluded.statut,
        derniere_detection = excluded.derniere_detection`,
    [
      s.signature,
      s.categorie_id,
      s.libelle,
      s.montant_moyen,
      s.jour_moyen,
      s.nb_occurrences,
      JSON.stringify(s.transaction_ids),
      s.statut,
      new Date().toISOString(),
    ]
  );
}
