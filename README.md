# Aplomb

Application de **gestion de budget personnel** : une app de bureau Windows qui garde
vos données chez vous, et une app compagnon iPhone pour consulter et saisir en déplacement.

- **Bureau** : Tauri v2 + React + TypeScript + SQLite.
- **iPhone** : application web installable (PWA), publiée sur
  <https://eric96-lang.github.io/aplomb/>.

Aucune connexion bancaire, aucun compte utilisateur, aucun serveur : la synchronisation
avec l'iPhone passe par le OneDrive de l'utilisateur, **chiffrée de bout en bout**.

## Fonctionnalités

**Suivi** — comptes multiples et vue globale ; transactions (revenus, dépenses, virements
entre comptes jamais comptés comme revenu ou dépense) ; pointage et rapprochement ;
justificatifs joints ; import CSV / OFX avec dédoublonnage ; scan de reçus (OCR natif Windows).

**Pilotage** — charges fixes et échéancier ; budgets par catégorie avec alertes ; objectifs
d'épargne (dont suivi automatique d'un compte) ; prévisions avec revenu variable ;
assistant « Plan du mois » ; analyse et points clés ; catégorisation qui apprend.

**Documents** — factures, reçus et rapports PDF.

**Sécurité** — code PIN et Windows Hello ; sauvegardes quotidiennes chiffrées
(AES-256-GCM, clé dans le trousseau Windows) ; restauration de secours en un clic si la
base est endommagée.

**App iPhone** — soldes, budgets, plan du mois, objectifs et opérations ; saisie rapide
avec photo du ticket ; verrouillage par code et Face ID (WebAuthn) ; fonctionne hors ligne.

## Synchronisation iPhone

Le PC reste la source de vérité. Le dossier `Aplomb Sync` du OneDrive contient :

- `instantane.bpsync` — l'état publié par le PC, lu par le téléphone ;
- `saisies/<uuid>.bpsync` — une saisie par fichier, déposée par le téléphone puis
  intégrée par le PC (opération idempotente).

Chaque fichier est chiffré en AES-256-GCM (WebCrypto, compressé en gzip) avec une clé
partagée par QR code lors de l'appairage. Le protocole est commun aux deux applications
(`src/sync/`).

## Prérequis

- [Node.js](https://nodejs.org) 20+
- [Rust](https://rustup.rs) (toolchain MSVC sous Windows) + **VS Build Tools**
  (workload « Desktop C++ »)
- WebView2 (préinstallé sur Windows 11)

## Développement

```bash
npm install
npm run app:dev       # app de bureau (Tauri + Vite)
npm run mobile:dev    # app iPhone (http://localhost:5174/aplomb/)
npm test              # tests (Vitest)
```

## Publication

```bash
npm run app:build         # installeur signé (variables TAURI_SIGNING_PRIVATE_KEY*)
npm run release:prepare   # installeur au nom stable + latest.json pour la mise à jour auto
npm run mobile:publier    # build de la PWA et publication sur GitHub Pages (gh-pages)
```

## Où sont les données ?

Dans le dossier de données de l'app (`%APPDATA%\com.eric.budgetperso`) : base SQLite
`budget.db`, justificatifs, exports CSV et sauvegardes chiffrées (`sauvegardes/`).
