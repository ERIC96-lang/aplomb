# Cahier des charges — Application de gestion de budget personnel

Document de travail — 12 septembre 2026

## 1. Vision produit en une phrase

Une application de bureau locale, sur ton PC, qui centralise tes comptes (courant, épargne...), suit tes charges fixes mensuelles avec leurs justificatifs, et t'alerte automatiquement quand quelque chose demande ton attention — sans dépendre d'aucun service en ligne ni connexion bancaire.

## 2. Utilisateur

Toi, en usage strictement personnel, en local. Pas de compte utilisateur, pas d'authentification web, pas de multi-tenant — toute la complexité liée à ça sur Recura ne s'applique pas ici. Point à garder en tête pour plus tard (hors périmètre v1) : si tu veux protéger l'accès à tes données financières, un simple code PIN ou mot de passe local au lancement de l'app pourra être ajouté en v2, sans complexité côté serveur puisqu'il n'y en a pas.

## 3. Comptes et vue globale

Plusieurs comptes gérés (ex. Courant, Épargne, éventuellement un troisième plus tard) : nom, type, solde initial à la création. Une vue globale agrège tous les comptes (total, évolution), et chaque compte a aussi sa propre vue filtrée. Un virement entre deux comptes (ex. Courant → Épargne) est un type de transaction à part entière : il ne doit **jamais** compter comme une dépense ou un revenu dans les totaux globaux, seulement comme un mouvement entre comptes — point d'attention technique important, détaillé en section 9.

## 4. Fonctionnalités de la version 1

**Saisie de transactions.** Montant, date, compte, catégorie, description, type (revenu, dépense, ou virement entre comptes avec compte source et compte destination). La saisie doit permettre de choisir une date dans le passé sans friction, pour te permettre de ressaisir quelques mois d'historique au démarrage — c'est ce qui donnera tout de suite de la matière à la détection de récurrence et aux projections plutôt que d'attendre 2-3 mois d'usage réel.

**Catégories.** Un jeu de catégories pré-remplies (Logement, Alimentation, Transport, Abonnements, Loisirs, Santé, Épargne, Revenus, Autre) modifiable et extensible.

**Charges fixes et traçabilité.** Une liste de charges fixes récurrentes (nom, montant attendu, compte associé, jour d'échéance dans le mois, catégorie, actif/inactif). Pour chaque mois, chaque charge fixe active génère une « échéance » avec un statut : à venir, en retard, payée sans justificatif, payée avec justificatif. Régler une échéance permet de lier une transaction existante ou d'en créer une, et d'attacher un fichier PDF (le reçu de loyer, par exemple) — l'app copie le fichier dans un dossier local dédié plutôt que de dépendre de son emplacement d'origine, pour ne jamais le perdre si tu déplaces ou renommes le fichier source.

**Détection automatique de charges récurrentes.** Algorithme simple (pas de machine learning) : parmi les dépenses qui ne sont pas déjà des charges fixes, regrouper celles de catégorie identique, de montant proche (± 5 à 10 %) et de jour du mois proche (± 3 à 5 jours), apparues sur au moins 2 à 3 mois consécutifs. L'app propose ces groupes comme candidats, jamais en création automatique silencieuse — tu valides ou ignores chaque suggestion.

**Alertes.** Notification système native (via le plugin de notifications Tauri) dans deux cas : une échéance de charge fixe approche sans qu'aucune transaction n'ait encore été saisie pour elle, ou un mois se termine avec une charge fixe payée mais sans justificatif attaché.

**Projections.** Solde de fin de mois estimé par compte et global, calculé à partir des charges fixes restantes du mois plus la moyenne des dépenses variables des 3 derniers mois dans chaque catégorie.

**Tableau de bord.** Vue globale et vue par compte : revenus, dépenses, solde, reste à vivre, répartition par catégorie en graphique, statut des charges fixes du mois en un coup d'œil.

## 5. Hors périmètre pour la version 1

Synchronisation bancaire automatique (API Bridge/Powens) ; application mobile compagnon ; budgets enveloppes avancés avec plafonds par catégorie et reports ; export fiscal ; protection par code PIN/mot de passe local ; multi-utilisateur. Toutes des pistes raisonnables pour une v2, une fois que l'usage quotidien de la v1 aura confirmé ce qui manque réellement.

## 6. Modèle de données simplifié

**Compte** : nom, type (courant, épargne, autre), solde initial, date de création.

**Categorie** : nom, type (revenu/dépense), couleur (pour les graphiques).

**Transaction** : compte (ou compte source + compte destination si virement), catégorie, montant, date, description, type (revenu, dépense, virement).

**ChargeFixe** : nom, montant attendu, compte associé, catégorie, jour d'échéance dans le mois, statut actif/inactif.

**ChargeFixeEcheance** : charge fixe associée, mois concerné, statut (à venir, en retard, payée sans justificatif, payée avec justificatif), transaction liée (optionnelle), chemin du fichier justificatif (optionnel).

**SuggestionRecurrence** : regroupement de transactions candidates, catégorie, montant moyen, jour moyen, statut (proposée, acceptée, ignorée) — table technique support de la détection automatique, pas forcément visible telle quelle dans l'interface.

## 7. Architecture technique recommandée

**Framework** : Tauri v2 — comparé à Electron, l'app finale pèsera environ 8-12 Mo contre 150-200 Mo, et consommera environ 42 Mo de RAM au repos contre 168 Mo, ce qui compte pour une app que tu laisses tourner en permanence. Les plugins officiels couvrent tout ce dont on a besoin en JavaScript/TypeScript, sans écrire de Rust toi-même : `tauri-plugin-sql` (SQLite), `tauri-plugin-fs` et `tauri-plugin-dialog` (sélection et copie de fichiers PDF), `tauri-plugin-notification` (alertes système).

**Frontend** : React + TypeScript, comme sur Recura — mêmes réflexes de développement, courbe d'apprentissage minimale.

**Stockage** : un fichier SQLite local (via `tauri-plugin-sql`) dans le dossier de données de l'application, et un sous-dossier `justificatifs/AAAA/MM-nom-charge.pdf` pour les reçus PDF, organisé par année et mois.

**Graphiques** : Recharts (déjà largement documenté, s'intègre facilement en React).

**Dates et récurrence** : `date-fns` pour tous les calculs de dates (jours d'échéance, comparaison de mois, moyennes glissantes).

## 8. Découpage indicatif pour construire avec Claude Code

Étape 1 — scaffold Tauri v2 + React + TypeScript, configuration de `tauri-plugin-sql` avec le schéma de base (comptes, catégories, transactions), CRUD de comptes et de transactions avec saisie de dates passées.

Étape 2 — tableau de bord global et par compte (totaux, reste à vivre, graphique de répartition par catégorie via Recharts), ressaisie de l'historique des derniers mois pour valider que les calculs sont justes.

Étape 3 — charges fixes : CRUD, génération des échéances du mois au lancement de l'app, statuts, association d'une transaction et upload/copie d'un justificatif PDF via `tauri-plugin-dialog` et `tauri-plugin-fs`.

Étape 4 — détection de récurrence (algorithme de regroupement), écran de suggestions à valider/ignorer, alertes via `tauri-plugin-notification`, calcul des projections de fin de mois.

Étape 5 — finitions : polish de l'interface, export CSV de secours, vérification multiplateforme si tu comptes utiliser l'app sur plus d'un ordinateur.

## 9. Points d'attention techniques

**Virements entre comptes.** À exclure explicitement des totaux de revenus/dépenses dans tous les calculs de dashboard et de projection — un bug classique de ce type d'app est de compter un virement Courant → Épargne comme une vraie dépense, ce qui fausse le reste à vivre.

**Portabilité des justificatifs.** Toujours copier le fichier PDF sélectionné dans le dossier de données de l'app plutôt que de stocker seulement son chemin d'origine — sinon un fichier déplacé ou supprimé casse le lien silencieusement.

**Sauvegarde.** Le fichier SQLite et le dossier de justificatifs concentrent toutes tes données financières sur un seul poste : prévoir tôt une fonction d'export ou de copie de sauvegarde (même un simple bouton « copier le dossier de données ») pour éviter une perte totale en cas de souci disque.

**Confidentialité.** Ces données sont sensibles : même sans protection par mot de passe en v1, s'assurer que le dossier de données n'est pas placé dans un emplacement synchronisé publiquement (attention si OneDrive/Google Drive est activé sur le dossier utilisateur par défaut).

## 10. Critères de succès de la version 1

Tu utilises l'app pendant un mois complet pour ta gestion réelle, tous tes comptes et charges fixes du mois sont correctement suivis avec leurs justificatifs, la détection de récurrence te propose au moins une charge fixe pertinente à partir de l'historique ressaisi, et la projection de fin de mois est cohérente avec ce que tu observes réellement sur tes comptes.
