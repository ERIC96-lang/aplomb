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

const SCHEMA_V7: &str = r#"
ALTER TABLE transactions ADD COLUMN pointee INTEGER NOT NULL DEFAULT 0;
ALTER TABLE transactions ADD COLUMN justificatif_path TEXT;
"#;

const SCHEMA_V8: &str = r#"
ALTER TABLE objectifs ADD COLUMN compte_id INTEGER REFERENCES comptes(id) ON DELETE SET NULL;
"#;

// Répare les bases historiquement incohérentes : des lignes orphelines
// (transactions/charges pointant vers des comptes supprimés, échéances vers des
// charges/transactions disparues) violaient les clés étrangères. Avec
// foreign_keys=ON (activé par défaut par sqlx), la moindre écriture au démarrage
// échouait alors en « (code: 787) FOREIGN KEY constraint failed ». On neutralise
// les références mortes (NULL quand la colonne l'autorise) et on supprime les
// charges rattachées à un compte inexistant. Sans effet sur une base saine.
const SCHEMA_V9: &str = r#"
UPDATE charge_fixe_echeances SET transaction_id = NULL WHERE transaction_id IS NOT NULL AND transaction_id NOT IN (SELECT id FROM transactions);
DELETE FROM charge_fixe_echeances WHERE charge_fixe_id NOT IN (SELECT id FROM charges_fixes);
DELETE FROM charges_fixes WHERE compte_id NOT IN (SELECT id FROM comptes);
DELETE FROM charge_fixe_echeances WHERE charge_fixe_id NOT IN (SELECT id FROM charges_fixes);
UPDATE transactions SET compte_id = NULL WHERE compte_id IS NOT NULL AND compte_id NOT IN (SELECT id FROM comptes);
UPDATE transactions SET compte_dest_id = NULL WHERE compte_dest_id IS NOT NULL AND compte_dest_id NOT IN (SELECT id FROM comptes);
UPDATE transactions SET categorie_id = NULL WHERE categorie_id IS NOT NULL AND categorie_id NOT IN (SELECT id FROM categories);
UPDATE budgets SET categorie_id = NULL WHERE categorie_id IS NOT NULL AND categorie_id NOT IN (SELECT id FROM categories);
"#;

// Objectifs alimentés par les versements : mode de suivi explicite (les
// objectifs déjà liés à un compte gardent le suivi du solde) et affectation
// d'un virement à un objectif précis quand plusieurs partagent un compte.
const SCHEMA_V10: &str = r#"
ALTER TABLE objectifs ADD COLUMN mode_suivi TEXT NOT NULL DEFAULT 'manuel';
UPDATE objectifs SET mode_suivi = 'solde' WHERE compte_id IS NOT NULL;
ALTER TABLE transactions ADD COLUMN objectif_id INTEGER REFERENCES objectifs(id) ON DELETE SET NULL;
"#;

// --- Windows Hello (déverrouillage biométrique) ---------------------------
#[cfg(windows)]
mod hello {
    use windows::core::HSTRING;
    use windows::Foundation::IAsyncOperation;
    use windows::Security::Credentials::UI::{
        UserConsentVerificationResult, UserConsentVerifier, UserConsentVerifierAvailability,
    };
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::WinRT::IUserConsentVerifierInterop;

    pub fn disponible() -> bool {
        UserConsentVerifier::CheckAvailabilityAsync()
            .and_then(|op| op.get())
            .map(|a| a == UserConsentVerifierAvailability::Available)
            .unwrap_or(false)
    }

    /// Demande Windows Hello **ancrée à la fenêtre de l'app** (`hwnd_raw`) : la
    /// boîte de dialogue s'affiche par-dessus l'écran verrouillé, pas dans une
    /// fenêtre détachée. Repli sur la variante sans parent si l'interop échoue.
    pub fn verifier(hwnd_raw: isize, message: &str) -> bool {
        let msg = HSTRING::from(message);

        if hwnd_raw != 0 {
            if let Ok(interop) =
                windows::core::factory::<UserConsentVerifier, IUserConsentVerifierInterop>()
            {
                let hwnd = HWND(hwnd_raw as *mut core::ffi::c_void);
                let r = unsafe {
                    interop
                        .RequestVerificationForWindowAsync::<
                            HWND,
                            IAsyncOperation<UserConsentVerificationResult>,
                        >(hwnd, &msg)
                }
                .and_then(|op| op.get())
                .map(|res| res == UserConsentVerificationResult::Verified);
                if let Ok(v) = r {
                    return v;
                }
            }
        }

        UserConsentVerifier::RequestVerificationAsync(&msg)
            .and_then(|op| op.get())
            .map(|res| res == UserConsentVerificationResult::Verified)
            .unwrap_or(false)
    }
}

// --- OCR de reçus (moteur natif Windows.Media.Ocr — 100 % local, hors-ligne) ---
#[cfg(windows)]
mod ocr {
    use windows::core::HSTRING;
    use windows::Globalization::Language;
    use windows::Graphics::Imaging::BitmapDecoder;
    use windows::Media::Ocr::OcrEngine;
    use windows::Storage::{FileAccessMode, StorageFile};

    fn moteur() -> Result<OcrEngine, String> {
        // Français en priorité, repli sur les langues du profil utilisateur.
        if let Ok(lang) = Language::CreateLanguage(&HSTRING::from("fr")) {
            if let Ok(engine) = OcrEngine::TryCreateFromLanguage(&lang) {
                return Ok(engine);
            }
        }
        OcrEngine::TryCreateFromUserProfileLanguages().map_err(|_| {
            "OCR indisponible : ajoute le module de reconnaissance de texte (français) \
             dans Paramètres Windows › Heure et langue › Langue."
                .to_string()
        })
    }

    pub fn lire(chemin: &str) -> Result<String, String> {
        // Les API WinRT exigent un chemin absolu à antislashs.
        let path = HSTRING::from(chemin.replace('/', "\\"));
        let file = StorageFile::GetFileFromPathAsync(&path)
            .map_err(|e| e.to_string())?
            .get()
            .map_err(|e| e.to_string())?;
        let stream = file
            .OpenAsync(FileAccessMode::Read)
            .map_err(|e| e.to_string())?
            .get()
            .map_err(|e| e.to_string())?;
        let decoder = BitmapDecoder::CreateAsync(&stream)
            .map_err(|e| e.to_string())?
            .get()
            .map_err(|e| e.to_string())?;
        let bitmap = decoder
            .GetSoftwareBitmapAsync()
            .map_err(|e| e.to_string())?
            .get()
            .map_err(|e| e.to_string())?;
        let engine = moteur()?;
        let result = engine
            .RecognizeAsync(&bitmap)
            .map_err(|e| e.to_string())?
            .get()
            .map_err(|e| e.to_string())?;
        // On reconstruit ligne par ligne (Text() aplatit toute la mise en page).
        let mut sortie = String::new();
        if let Ok(lignes) = result.Lines() {
            for ligne in lignes {
                if let Ok(t) = ligne.Text() {
                    sortie.push_str(&t.to_string());
                    sortie.push('\n');
                }
            }
        }
        if sortie.trim().is_empty() {
            sortie = result.Text().map_err(|e| e.to_string())?.to_string();
        }
        Ok(sortie)
    }
}

#[tauri::command]
async fn ocr_texte_image(chemin: String) -> Result<String, String> {
    #[cfg(windows)]
    {
        tauri::async_runtime::spawn_blocking(move || ocr::lire(&chemin))
            .await
            .map_err(|e| e.to_string())?
    }
    #[cfg(not(windows))]
    {
        let _ = chemin;
        Err("La lecture de reçu n'est disponible que sous Windows.".into())
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
async fn hello_verifier(window: tauri::WebviewWindow, message: String) -> bool {
    #[cfg(windows)]
    {
        // HWND de la fenêtre de l'app → la demande Hello s'ancre dessus.
        let hwnd_raw = window.hwnd().map(|h| h.0 as isize).unwrap_or(0);
        tauri::async_runtime::spawn_blocking(move || hello::verifier(hwnd_raw, &message))
            .await
            .unwrap_or(false)
    }
    #[cfg(not(windows))]
    {
        let _ = (window, message);
        false
    }
}

// --- Chiffrement des sauvegardes (AES-256-GCM, clé dans le trousseau Windows) ---
mod crypto {
    use aes_gcm::aead::{Aead, KeyInit};
    use aes_gcm::{Aes256Gcm, Nonce};
    use base64::{engine::general_purpose::STANDARD, Engine};
    use rand::rngs::OsRng;
    use rand::RngCore;

    const SERVICE: &str = "com.eric.budgetperso";
    const COMPTE: &str = "backup-key";
    /// Clé partagée avec l'iPhone (synchronisation chiffrée de bout en bout).
    const COMPTE_SYNC: &str = "sync-key";

    /// Lit la clé d'un compte du trousseau, ou la crée si elle n'existe pas.
    fn cle_pour(compte: &str) -> Result<[u8; 32], String> {
        let entry = keyring::Entry::new(SERVICE, compte).map_err(|e| e.to_string())?;
        match entry.get_password() {
            Ok(b64) => {
                let v = STANDARD.decode(b64).map_err(|e| e.to_string())?;
                if v.len() != 32 {
                    return Err("clé invalide dans le trousseau".into());
                }
                let mut k = [0u8; 32];
                k.copy_from_slice(&v);
                Ok(k)
            }
            Err(_) => nouvelle_cle(compte),
        }
    }

    fn nouvelle_cle(compte: &str) -> Result<[u8; 32], String> {
        let entry = keyring::Entry::new(SERVICE, compte).map_err(|e| e.to_string())?;
        let mut k = [0u8; 32];
        OsRng.fill_bytes(&mut k);
        entry.set_password(&STANDARD.encode(k)).map_err(|e| e.to_string())?;
        Ok(k)
    }

    fn cle() -> Result<[u8; 32], String> {
        cle_pour(COMPTE)
    }

    /// Clé de synchronisation mobile (base64), créée au premier appel.
    pub fn cle_sync() -> Result<String, String> {
        Ok(STANDARD.encode(cle_pour(COMPTE_SYNC)?))
    }

    /// Remplace la clé de synchronisation (l'iPhone devra être ré-appairé).
    pub fn renouveler_cle_sync() -> Result<String, String> {
        Ok(STANDARD.encode(nouvelle_cle(COMPTE_SYNC)?))
    }

    pub fn chiffrer(source: &str, dest: &str) -> Result<(), String> {
        let data = std::fs::read(source).map_err(|e| e.to_string())?;
        let cipher = Aes256Gcm::new_from_slice(&cle()?).map_err(|e| e.to_string())?;
        let mut nonce = [0u8; 12];
        OsRng.fill_bytes(&mut nonce);
        let ct = cipher
            .encrypt(Nonce::from_slice(&nonce), data.as_ref())
            .map_err(|e| e.to_string())?;
        let mut out = nonce.to_vec();
        out.extend(ct);
        std::fs::write(dest, out).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn dechiffrer(source: &str, dest: &str) -> Result<(), String> {
        let blob = std::fs::read(source).map_err(|e| e.to_string())?;
        if blob.len() < 13 {
            return Err("fichier chiffré invalide".into());
        }
        let (nonce, ct) = blob.split_at(12);
        let cipher = Aes256Gcm::new_from_slice(&cle()?).map_err(|e| e.to_string())?;
        let pt = cipher
            .decrypt(Nonce::from_slice(nonce), ct)
            .map_err(|_| "déchiffrement impossible (mauvaise clé ou fichier corrompu)".to_string())?;
        std::fs::write(dest, pt).map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[tauri::command]
fn chiffrer_fichier(source: String, dest: String) -> Result<(), String> {
    crypto::chiffrer(&source, &dest)
}

#[tauri::command]
fn dechiffrer_fichier(source: String, dest: String) -> Result<(), String> {
    crypto::dechiffrer(&source, &dest)
}

#[tauri::command]
fn sync_cle() -> Result<String, String> {
    crypto::cle_sync()
}

#[tauri::command]
fn sync_cle_renouveler() -> Result<String, String> {
    crypto::renouveler_cle_sync()
}

/// Dossier OneDrive personnel de l'utilisateur (variables posées par le client OneDrive).
#[tauri::command]
fn dossier_onedrive() -> Option<String> {
    ["OneDriveConsumer", "OneDrive"]
        .iter()
        .filter_map(|v| std::env::var(v).ok())
        .find(|p| !p.is_empty() && std::path::Path::new(p).is_dir())
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
        // La base remplacée est mise de côté avec son journal (paire « x » /
        // « x-wal » toujours ouvrable par SQLite), jamais supprimée.
        let cote = dir.join("budget.db.avant-restauration");
        let _ = std::fs::remove_file(&cote);
        let _ = std::fs::remove_file(dir.join("budget.db.avant-restauration-wal"));
        let _ = std::fs::rename(&db, &cote);
        let _ = std::fs::rename(
            dir.join("budget.db-wal"),
            dir.join("budget.db.avant-restauration-wal"),
        );
        let _ = std::fs::remove_file(dir.join("budget.db-shm"));
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
        Migration {
            version: 7,
            description: "pointage + justificatif sur transactions",
            sql: SCHEMA_V7,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "objectif lie a un compte",
            sql: SCHEMA_V8,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "reparation des references orphelines (fk)",
            sql: SCHEMA_V9,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "objectifs alimentes par les versements",
            sql: SCHEMA_V10,
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
            ouvrir_chemin,
            chiffrer_fichier,
            dechiffrer_fichier,
            sync_cle,
            sync_cle_renouveler,
            dossier_onedrive,
            ocr_texte_image
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de l'application Tauri");
}
