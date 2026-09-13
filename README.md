# Budget Perso

Application de bureau **100 % locale** de gestion de budget personnel.
Aucune connexion en ligne, aucune synchronisation bancaire, aucun compte utilisateur.

Tauri v2 + React + TypeScript + SQLite.

## Fonctionnalités (v1)

- **Comptes** multiples (courant, épargne, autre) avec solde par compte et vue globale.
- **Transactions** : revenu, dépense, **virement** entre comptes (jamais compté comme revenu/dépense).
- Saisie de **dates passées** sans friction (ressaisie d'historique).
- **Charges fixes** : échéances mensuelles générées automatiquement, statuts
  (à venir / en retard / payée sans justificatif / payée avec justificatif),
  règlement par transaction liée et **justificatif PDF copié en local**.
- **Détection automatique** de charges récurrentes (algorithme simple, à valider/ignorer).
- **Alertes système** : échéance imminente sans saisie, charge payée sans justificatif.
- **Projections** de fin de mois par compte et globales.
- **Tableau de bord** : totaux, reste à vivre, répartition par catégorie (Recharts).
- **Export CSV** et accès direct au dossier de données pour la sauvegarde.

## Prérequis

- [Node.js](https://nodejs.org) 18+
- [Rust](https://rustup.rs) (toolchain MSVC sous Windows) + **VS Build Tools** (workload « Desktop C++ »)
- WebView2 (préinstallé sur Windows 11)

## Développement

```bash
npm install
npm run icons     # génère les icônes de l'app (une seule fois)
npm run app:dev   # lance l'app en mode développement (Tauri + Vite)
```

## Build de production

```bash
npm run app:build
```

Le binaire et l'installateur sont générés dans `src-tauri/target/release/`.

## Où sont mes données ?

- Base SQLite : dossier de données de l'app (`AppData` sous Windows), fichier `budget.db`.
- Justificatifs : `justificatifs/AAAA/MM-nom-charge.pdf` dans ce même dossier.
- Exports CSV : sous-dossier `exports/`.

Paramètres → « Ouvrir le dossier de données » pour le copier en sauvegarde.
Évite de le placer dans un dossier synchronisé publiquement (OneDrive / Google Drive).
