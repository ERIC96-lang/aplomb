use tauri_plugin_sql::{Migration, MigrationKind};

// Schéma initial de la base SQLite + jeu de catégories pré-rempli.
// Les migrations sont exécutées automatiquement au chargement de "sqlite:budget.db".
const SCHEMA_V1: &str = r#"
CREATE TABLE IF NOT EXISTS comptes (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    nom            TEXT    NOT NULL,
    type           TEXT    NOT NULL DEFAULT 'courant',
    solde_initial  REAL    NOT NULL DEFAULT 0,
    date_creation  TEXT    NOT NULL,
    archive        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS categories (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    nom      TEXT    NOT NULL,
    type     TEXT    NOT NULL DEFAULT 'depense',
    couleur  TEXT    NOT NULL DEFAULT '#6366f1'
);

CREATE TABLE IF NOT EXISTS transactions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    type           TEXT    NOT NULL,               -- revenu | depense | virement
    montant        REAL    NOT NULL,
    date           TEXT    NOT NULL,               -- 'YYYY-MM-DD'
    description    TEXT,
    compte_id      INTEGER,                        -- compte principal / source (virement)
    compte_dest_id INTEGER,                        -- destination (virement uniquement)
    categorie_id   INTEGER,
    created_at     TEXT    NOT NULL,
    FOREIGN KEY (compte_id)      REFERENCES comptes(id)    ON DELETE SET NULL,
    FOREIGN KEY (compte_dest_id) REFERENCES comptes(id)    ON DELETE SET NULL,
    FOREIGN KEY (categorie_id)   REFERENCES categories(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_tx_date        ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_tx_compte      ON transactions(compte_id);
CREATE INDEX IF NOT EXISTS idx_tx_compte_dest ON transactions(compte_dest_id);
CREATE INDEX IF NOT EXISTS idx_tx_categorie   ON transactions(categorie_id);

CREATE TABLE IF NOT EXISTS charges_fixes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    nom             TEXT    NOT NULL,
    montant_attendu REAL    NOT NULL,
    compte_id       INTEGER NOT NULL,
    categorie_id    INTEGER,
    jour_echeance   INTEGER NOT NULL DEFAULT 1,    -- 1..31
    actif           INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (compte_id)    REFERENCES comptes(id)    ON DELETE CASCADE,
    FOREIGN KEY (categorie_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS charge_fixe_echeances (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    charge_fixe_id    INTEGER NOT NULL,
    mois              TEXT    NOT NULL,            -- 'YYYY-MM'
    statut            TEXT    NOT NULL DEFAULT 'a_venir', -- a_venir | en_retard | payee_sans_justif | payee_avec_justif
    transaction_id    INTEGER,
    justificatif_path TEXT,
    UNIQUE (charge_fixe_id, mois),
    FOREIGN KEY (charge_fixe_id) REFERENCES charges_fixes(id) ON DELETE CASCADE,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id)  ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_ech_mois ON charge_fixe_echeances(mois);

CREATE TABLE IF NOT EXISTS suggestions_recurrence (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    signature          TEXT    NOT NULL UNIQUE,    -- clé de dédoublonnage
    categorie_id       INTEGER,
    libelle            TEXT,
    montant_moyen      REAL    NOT NULL,
    jour_moyen         INTEGER NOT NULL,
    nb_occurrences     INTEGER NOT NULL,
    transaction_ids    TEXT    NOT NULL,           -- JSON: [1,2,3]
    statut             TEXT    NOT NULL DEFAULT 'proposee', -- proposee | acceptee | ignoree
    derniere_detection TEXT    NOT NULL,
    FOREIGN KEY (categorie_id) REFERENCES categories(id) ON DELETE SET NULL
);
"#;

const SEED_CATEGORIES: &str = r#"
INSERT INTO categories (nom, type, couleur) VALUES
    ('Logement',     'depense', '#ef4444'),
    ('Alimentation', 'depense', '#f59e0b'),
    ('Transport',    'depense', '#3b82f6'),
    ('Abonnements',  'depense', '#8b5cf6'),
    ('Loisirs',      'depense', '#ec4899'),
    ('Santé',        'depense', '#10b981'),
    ('Épargne',      'depense', '#14b8a6'),
    ('Autre',        'depense', '#64748b'),
    ('Revenus',      'revenu',  '#22c55e');
"#;

const SCHEMA_BUDGETS: &str = r#"
CREATE TABLE IF NOT EXISTS budgets (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    categorie_id    INTEGER NOT NULL UNIQUE,
    montant_plafond REAL    NOT NULL,
    FOREIGN KEY (categorie_id) REFERENCES categories(id) ON DELETE CASCADE
);
"#;

const SCHEMA_V4: &str = r#"
ALTER TABLE charges_fixes ADD COLUMN periodicite TEXT NOT NULL DEFAULT 'mensuelle';

CREATE TABLE IF NOT EXISTS objectifs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    nom           TEXT    NOT NULL,
    montant_cible REAL    NOT NULL,
    montant_actuel REAL   NOT NULL DEFAULT 0,
    date_cible    TEXT,
    couleur       TEXT    NOT NULL DEFAULT '#6d6bf5',
    cree_le       TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS factures (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    numero        TEXT    NOT NULL,
    type          TEXT    NOT NULL DEFAULT 'facture',
    date          TEXT    NOT NULL,
    montant_total REAL    NOT NULL,
    donnees       TEXT    NOT NULL,
    cree_le       TEXT    NOT NULL
);
"#;

const SCHEMA_V5: &str = r#"
ALTER TABLE transactions ADD COLUMN a_confirmer INTEGER NOT NULL DEFAULT 0;
ALTER TABLE transactions ADD COLUMN auto_origine TEXT;
"#;

const SCHEMA_V6: &str = r#"
CREATE TABLE IF NOT EXISTS regles_categorisation (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    motcle       TEXT    NOT NULL,
    categorie_id INTEGER NOT NULL,
    FOREIGN KEY (categorie_id) REFERENCES categories(id) ON DELETE CASCADE
);
"#;

// --- Windows Hello (déverrouillage biométrique) ---------------------------
#[cfg(windows)]
mod hello {
    use windows::core::HSTRING;
    use windows::Security::Credentials::UI::{
        UserConsentVerificationResult, UserConsentVerifier, UserConsentVerifierAvailability,
    };

    pub fn disponible() -> bool {
        UserConsentVerifier::CheckAvailabilityAsync()
            .and_then(|op| op.get())
            .map(|a| a == UserConsentVerifierAvailability::Available)
            .unwrap_or(false)
    }

    pub fn verifier(message: &str) -> bool {
        let msg = HSTRING::from(message);
        UserConsentVerifier::RequestVerificationAsync(&msg)
            .and_then(|op| op.get())
            .map(|r| r == UserConsentVerificationResult::Verified)
            .unwrap_or(false)
    }
}

#[tauri::command]
async fn hello_disponible() -> bool {
    #[cfg(windows)]
    {
        tauri::async_runtime::spawn_blocking(hello::disponible)
            .await
            .unwrap_or(false)
    }
    #[cfg(not(windows))]
    {
        false
    }
}

#[tauri::command]
async fn hello_verifier(message: String) -> bool {
    #[cfg(windows)]
    {
        tauri::async_runtime::spawn_blocking(move || hello::verifier(&message))
            .await
            .unwrap_or(false)
    }
    #[cfg(not(windows))]
    {
        let _ = message;
        false
    }
}

/// Ouvre un dossier (ou un fichier) dans l'explorateur système.
/// Fiable sous Windows : passe par `explorer.exe` avec un chemin normalisé en
/// antislashs, contrairement au plugin opener qui échoue sur les « / ».
#[tauri::command]
fn ouvrir_chemin(chemin: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        let p = chemin.replace('/', "\\");
        std::process::Command::new("explorer")
            .arg(&p)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = chemin;
        Ok(())
    }
}

/// Applique une restauration en attente AVANT l'ouverture de la base :
/// si `restore.pending` existe dans le dossier de données, il remplace
/// `budget.db` (et supprime les fichiers WAL/SHM). Sans effet sinon.
fn appliquer_restauration() {
    #[cfg(windows)]
    {
        let Ok(appdata) = std::env::var("APPDATA") else {
            return;
        };
        let dir = std::path::Path::new(&appdata).join("com.eric.budgetperso");
        let pending = dir.join("restore.pending");
        if !pending.exists() {
            return;
        }
        let db = dir.join("budget.db");
        let _ = std::fs::remove_file(dir.join("budget.db-wal"));
        let _ = std::fs::remove_file(dir.join("budget.db-shm"));
        let _ = std::fs::remove_file(&db);
        let _ = std::fs::rename(&pending, &db);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    appliquer_restauration();

    let migrations = vec![
        Migration {
            version: 1,
            description: "creation du schema initial",
            sql: SCHEMA_V1,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "categories par defaut",
            sql: SEED_CATEGORIES,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "budgets par categorie",
            sql: SCHEMA_BUDGETS,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "periodicite, objectifs, factures",
            sql: SCHEMA_V4,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "transactions a confirmer (auto)",
            sql: SCHEMA_V5,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "regles de categorisation",
            sql: SCHEMA_V6,
            kind: MigrationKind::Up,
        },
    ];

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:budget.db", migrations)
                .build(),
        );

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .invoke_handler(tauri::generate_handler![
            hello_disponible,
            hello_verifier,
            ouvrir_chemin
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de l'application Tauri");
}
