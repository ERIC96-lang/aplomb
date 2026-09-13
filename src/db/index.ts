import Database from "@tauri-apps/plugin-sql";

let _db: Database | null = null;

/** Charge (une seule fois) la base SQLite locale. Les migrations sont gérées côté Rust. */
export async function getDb(): Promise<Database> {
  if (_db) return _db;
  _db = await Database.load("sqlite:budget.db");
  // Active les contraintes de clés étrangères (désactivées par défaut sous SQLite).
  await _db.execute("PRAGMA foreign_keys = ON;");
  return _db;
}
