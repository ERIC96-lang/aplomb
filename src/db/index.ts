import Database from "@tauri-apps/plugin-sql";

let _db: Database | null = null;
let _chargement: Promise<Database> | null = null;

/** Charge (une seule fois) la base SQLite locale. Les migrations sont gérées côté Rust. */
export async function getDb(): Promise<Database> {
  if (_db) return _db;
  // Mémorise la promesse de chargement pour que des appels concurrents (ex. le
  // Promise.all du démarrage) partagent un seul Database.load — les migrations
  // Rust sont donc terminées avant la moindre requête.
  if (!_chargement) {
    _chargement = (async () => {
      const db = await Database.load("sqlite:budget.db");
      // Ceinture et bretelles : sqlx active déjà foreign_keys, on le confirme.
      await db.execute("PRAGMA foreign_keys = ON;");
      _db = db;
      await consoliderBase();
      return db;
    })().catch((e) => {
      _chargement = null; // permet une nouvelle tentative après un échec
      throw e;
    });
  }
  return _chargement;
}

/**
 * Reporte le journal SQLite (fichier -wal) dans la base puis le vide.
 *
 * L'app se ferme sans fermer proprement sa connexion : sans cela, la base
 * principale ne serait jamais mise à jour (la petite taille de la base ne
 * déclenche pas le report automatique) et toutes les modifications ne
 * vivraient que dans le journal — dont la perte rend la base illisible
 * (incident du 8 oct. 2026). Sans effet si la base est occupée : on réessaiera.
 */
export async function consoliderBase(): Promise<void> {
  if (!_db) return;
  try {
    await _db.execute("PRAGMA wal_checkpoint(TRUNCATE);");
  } catch (e) {
    console.warn("Consolidation de la base différée", e);
  }
}

/** True si l'erreur indique une base de données endommagée. */
export function estBaseEndommagee(erreur: string): boolean {
  return /malformed|corrupt|disk image|not a database/i.test(erreur);
}
