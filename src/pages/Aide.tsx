import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon, type IconName } from "../components/Icon";

interface Item {
  titre: string;
  points: string[];
}
interface Section {
  id: string;
  titre: string;
  icone: IconName;
  intro?: string;
  items: Item[];
}

const SECTIONS: Section[] = [
  {
    id: "demarrage",
    titre: "Premiers pas",
    icone: "sparkles",
    intro: "Trois étapes suffisent pour une vue fidèle de vos finances.",
    items: [
      {
        titre: "1 — Créez vos comptes",
        points: [
          "Ouvrez Comptes et ajoutez chaque compte réel (courant, épargne, espèces…) avec son solde actuel.",
          "Ce solde de départ sert de base à tous les calculs de solde et de patrimoine.",
        ],
      },
      {
        titre: "2 — Enregistrez vos opérations",
        points: [
          "Dans Transactions, saisissez vos revenus et dépenses, ou importez un relevé bancaire (menu Importer).",
          "Classez chaque dépense dans une catégorie : c'est ce qui alimente les budgets, l'analyse et les rapports.",
        ],
      },
      {
        titre: "3 — Décrivez vos charges fixes",
        points: [
          "Dans Charges fixes, listez vos abonnements et prélèvements récurrents (loyer, énergie, assurances…).",
          "L'app projette alors automatiquement vos fins de mois et vous rappelle les échéances à venir.",
        ],
      },
      {
        titre: "Remplir l'app pour l'essayer",
        points: [
          "Paramètres → « Données de démo » insère un jeu d'exemples réaliste pour explorer toutes les fonctions.",
          "« Réinitialiser les données » repart d'une base vierge quand vous êtes prêt à saisir vos vrais chiffres.",
        ],
      },
    ],
  },
  {
    id: "comptes",
    titre: "Comptes & vue globale",
    icone: "bank",
    items: [
      {
        titre: "Gérer ses comptes",
        points: [
          "Chaque compte a un nom, un type et un solde initial ; le solde courant se met à jour avec les opérations.",
          "Le tableau de bord additionne tous les comptes pour afficher votre patrimoine global et son évolution.",
        ],
      },
      {
        titre: "Archiver plutôt que supprimer",
        points: [
          "Un compte fermé peut être archivé : il disparaît des écrans courants sans effacer son historique.",
          "La suppression définitive reste possible dans la section « Comptes archivés ».",
        ],
      },
    ],
  },
  {
    id: "transactions",
    titre: "Transactions",
    icone: "card",
    items: [
      {
        titre: "Revenus, dépenses et virements",
        points: [
          "Les virements déplacent de l'argent entre deux de vos comptes : ils n'apparaissent ni en revenu ni en dépense dans vos totaux.",
          "Une dépense catégorisée nourrit vos budgets et l'analyse ; pensez à toujours renseigner la catégorie.",
        ],
      },
      {
        titre: "Catégorisation qui apprend",
        points: [
          "Quand vous catégorisez une dépense à la main, l'app propose de retenir une règle « mot-clé → catégorie ».",
          "Les saisies et imports suivants sont alors pré-classés automatiquement. Les règles se gèrent dans Paramètres.",
        ],
      },
      {
        titre: "Pointage & rapprochement",
        points: [
          "Cochez la pastille ronde d'une transaction pour la marquer « pointée » (vérifiée sur votre relevé).",
          "En sélectionnant un compte précis, une barre compare le solde pointé au solde réel pour repérer un écart.",
        ],
      },
      {
        titre: "Justificatifs",
        points: [
          "Attachez un PDF à une transaction : il est copié dans vos données et rouvrable d'un clic (icône trombone).",
        ],
      },
      {
        titre: "Scanner un reçu (OCR)",
        points: [
          "Le bouton « Scanner un reçu » lit une photo de ticket et pré-remplit le montant et la date.",
          "La reconnaissance utilise le moteur intégré de Windows — aucun envoi sur Internet. Vérifiez toujours les champs proposés.",
        ],
      },
    ],
  },
  {
    id: "charges",
    titre: "Charges fixes & échéancier",
    icone: "repeat",
    items: [
      {
        titre: "Charges récurrentes",
        points: [
          "Donnez à chaque charge un montant et une périodicité (mensuelle, trimestrielle, annuelle…).",
          "L'échéancier en déduit un calendrier prévisionnel et peut générer automatiquement les opérations dues.",
        ],
      },
      {
        titre: "Charge payée hors de vos comptes (PayPal…)",
        points: [
          "Si vous réglez une charge depuis un moyen non suivi par l'app (PayPal, carte d'un tiers…), touchez « Réglée ailleurs » sur son échéance dans Charges fixes.",
          "L'échéance est marquée réglée, sans aucune dépense : vos soldes, budgets et projections ne bougent pas. Une dépense automatique « à confirmer » déjà créée pour elle est retirée.",
          "Vous pouvez y joindre le reçu PayPal comme justificatif, et « Annuler » si vous vous êtes trompé.",
        ],
      },
      {
        titre: "Rappels d'échéances",
        points: [
          "Les échéances proches ou en retard sont signalées par une pastille sur « Charges fixes » dans le menu.",
          "Elles figurent aussi dans la carte « Plan du mois » du tableau de bord.",
        ],
      },
      {
        titre: "Suggestions de récurrence",
        points: [
          "L'app repère les dépenses qui reviennent régulièrement et propose de les transformer en charge fixe, depuis l'écran Suggestions.",
        ],
      },
    ],
  },
  {
    id: "pilotage",
    titre: "Budgets, objectifs & prévisions",
    icone: "target",
    items: [
      {
        titre: "Budgets par catégorie",
        points: [
          "Fixez un plafond mensuel par catégorie. L'état passe d'« ok » à « attention » (≥ 80 %) puis « dépassé » (≥ 100 %).",
          "Un dépassement déclenche une alerte et une pastille sur « Budgets ».",
          "Le budget de la catégorie « Épargne » est un objectif, pas un plafond : il compte vos virements vers vos comptes épargne du mois et passe au vert quand la cible est atteinte (jamais « dépassé »).",
        ],
      },
      {
        titre: "Objectifs d'épargne",
        points: [
          "Définissez un montant à atteindre et choisissez comment il progresse : vos versements vers un compte, le solde d'un compte, ou un suivi manuel.",
          "« Mes versements » : chaque virement vers le compte choisi fait avancer l'objectif tout seul (un retrait le fait reculer), à partir de la création de l'objectif. La date d'atteinte est estimée sur votre rythme réel de versements.",
          "Plusieurs objectifs sur le même compte ? Le formulaire de virement vous demande lequel alimenter ; un virement sans choix va à l'objectif le plus ancien.",
        ],
      },
      {
        titre: "Prévisions & revenu variable",
        points: [
          "La page Prévisions projette vos prochains mois à partir des charges fixes et de vos habitudes.",
          "Si vos revenus varient, choisissez un mode (montant fixe, moyenne ou fourchette) pour obtenir des scénarios prudent / attendu / optimiste.",
        ],
      },
    ],
  },
  {
    id: "analyse",
    titre: "Analyse & points clés",
    icone: "bulb",
    items: [
      {
        titre: "Analyse",
        points: [
          "L'écran Analyse met en lumière les hausses et baisses par catégorie, les dépenses inhabituelles, les doublons et votre taux d'épargne.",
          "Les trois points les plus importants sont résumés sur le tableau de bord.",
        ],
      },
    ],
  },
  {
    id: "documents",
    titre: "Documents : factures, reçus & rapports",
    icone: "receipt",
    items: [
      {
        titre: "Factures & reçus",
        points: [
          "La page Factures génère une facture ou un reçu PDF complet (HT / TVA / TTC) et conserve l'historique.",
          "Vos coordonnées d'émetteur sont mémorisées pour les documents suivants.",
          "Depuis une transaction, vous pouvez aussi éditer un reçu de paiement en un clic.",
        ],
      },
      {
        titre: "Rapports",
        points: [
          "La page Rapports produit une synthèse (mensuelle, annuelle ou sur une période) avec la répartition des dépenses.",
          "Exportez-la en PDF ou imprimez-la directement.",
        ],
      },
    ],
  },
  {
    id: "import",
    titre: "Importer des relevés",
    icone: "upload",
    items: [
      {
        titre: "CSV & OFX",
        points: [
          "Importez un relevé au format CSV ou OFX, puis associez les colonnes (date, libellé, montant).",
          "Les doublons avec vos opérations existantes sont détectés pour éviter les saisies en double.",
        ],
      },
    ],
  },
  {
    id: "iphone",
    titre: "Application iPhone",
    icone: "repeat",
    intro: "Consultez vos finances et saisissez vos dépenses depuis l'iPhone ; le PC reste l'application principale.",
    items: [
      {
        titre: "Installer l'app sur l'iPhone",
        points: [
          "Paramètres → Application iPhone → « Activer la synchronisation », puis « Appairer un iPhone ».",
          "Scannez le premier QR code avec l'appareil photo de l'iPhone, ouvrez le lien dans Safari, puis Partager → « Sur l'écran d'accueil ».",
          "Ouvrez ensuite Aplomb depuis son icône : c'est dans l'app installée que se fait l'appairage.",
        ],
      },
      {
        titre: "Appairer le téléphone",
        points: [
          "Dans l'app iPhone, touchez « Scanner le code d'appairage » et visez le second QR code affiché par le PC.",
          "Vérifiez que l'empreinte (ex. A1B2-C3D4) est identique sur les deux écrans avant de confirmer.",
        ],
      },
      {
        titre: "Comment fonctionne la synchronisation",
        points: [
          "Les échanges passent par un dossier « Aplomb Sync » de votre OneDrive, chiffrés de bout en bout : seuls ce PC et votre téléphone possèdent la clé.",
          "Le PC publie l'état de vos comptes après chaque modification et relève les saisies du téléphone toutes les 90 secondes lorsqu'il est ouvert.",
          "L'iPhone se synchronise à l'ouverture de l'app ; ses saisies restent visibles (« À envoyer », puis « Envoyée ») jusqu'à leur intégration par le PC.",
        ],
      },
      {
        titre: "Saisir une dépense depuis l'iPhone",
        points: [
          "Touchez le bouton + : montant, libellé (la catégorie est devinée grâce à vos règles), compte et date.",
          "La photo du ticket est jointe à l'opération sur le PC, comme justificatif.",
          "Une saisie pas encore envoyée peut être annulée en la touchant dans Opérations ; ensuite, modifiez-la depuis le PC.",
        ],
      },
      {
        titre: "Verrouiller l'app iPhone (code et Face ID)",
        points: [
          "Dans l'app iPhone : Réglages → Sécurité → « Verrouiller l'app », puis choisissez un code de 4 à 6 chiffres.",
          "Activez ensuite Face ID : l'app se déverrouille d'un regard, le code reste disponible en secours.",
          "Choisissez quand l'app se verrouille : dès que vous la quittez, ou après 1, 5 ou 15 minutes.",
          "Après 5 codes erronés, la saisie est bloquée 30 secondes (5 minutes à partir du 10e). Code oublié : effacez les données du téléphone puis ré-appairez-le — vos comptes restent intacts sur le PC.",
        ],
      },
      {
        titre: "Changer de téléphone ou en cas de perte",
        points: [
          "Paramètres → Application iPhone → Appairer → « Nouvelle clé » : l'ancien téléphone ne peut plus rien déchiffrer.",
          "Appairez ensuite le nouveau téléphone avec le nouveau code.",
        ],
      },
    ],
  },
  {
    id: "perso",
    titre: "Personnalisation",
    icone: "settings",
    items: [
      {
        titre: "Tableau de bord sur mesure",
        points: [
          "Le bouton « Personnaliser » du tableau de bord permet de masquer, afficher et réordonner les sections.",
        ],
      },
      {
        titre: "Thème & devise",
        points: [
          "Basculez entre thème clair et sombre depuis la barre latérale.",
          "Choisissez votre devise dans Paramètres : tous les montants sont reformatés en conséquence.",
        ],
      },
      {
        titre: "Recherche rapide",
        points: [
          "Appuyez sur Ctrl + K n'importe où pour ouvrir la palette de recherche et naviguer instantanément.",
        ],
      },
    ],
  },
  {
    id: "securite",
    titre: "Sécurité & confidentialité",
    icone: "lock",
    items: [
      {
        titre: "Code PIN & Windows Hello",
        points: [
          "Protégez l'ouverture de l'app par un code PIN, et déverrouillez-la par empreinte ou visage via Windows Hello.",
          "Le PIN n'est jamais stocké en clair ; aucune récupération n'est possible s'il est oublié.",
        ],
      },
      {
        titre: "Verrouillage automatique",
        points: [
          "Réglez un délai d'inactivité après lequel l'app se verrouille toute seule.",
        ],
      },
      {
        titre: "Vos données vous appartiennent",
        points: [
          "Vos données restent sur votre ordinateur. Seule l'application iPhone, si vous l'activez, les fait transiter par votre OneDrive, chiffrées de bout en bout.",
          "Pour une protection renforcée du disque, activez BitLocker au niveau de Windows.",
        ],
      },
    ],
  },
  {
    id: "sauvegardes",
    titre: "Sauvegardes & restauration",
    icone: "download",
    items: [
      {
        titre: "Sauvegardes chiffrées",
        points: [
          "Une sauvegarde chiffrée est créée automatiquement chaque jour ; vous pouvez aussi en lancer une à tout moment dans Paramètres.",
          "Les fichiers sont chiffrés : conservez-en une copie sur un disque externe ou un cloud de confiance.",
        ],
      },
      {
        titre: "Restaurer",
        points: [
          "La restauration remplace vos données par une sauvegarde choisie ; elle s'applique au redémarrage de l'app.",
          "Pensez à faire une sauvegarde de l'état actuel avant de restaurer.",
        ],
      },
    ],
  },
  {
    id: "maj",
    titre: "Mises à jour",
    icone: "trending-up",
    items: [
      {
        titre: "Automatiques",
        points: [
          "L'app vérifie les nouvelles versions au démarrage et propose de les installer via une bannière en haut de l'écran.",
          "Le numéro de version s'affiche en bas de la barre latérale.",
        ],
      },
    ],
  },
];

export function Aide() {
  const [q, setQ] = useState("");

  const sections = useMemo(() => {
    const terme = q.trim().toLowerCase();
    if (!terme) return SECTIONS;
    return SECTIONS.map((s) => ({
      ...s,
      items: s.items.filter(
        (it) =>
          it.titre.toLowerCase().includes(terme) ||
          it.points.some((p) => p.toLowerCase().includes(terme)) ||
          s.titre.toLowerCase().includes(terme)
      ),
    })).filter((s) => s.items.length > 0);
  }, [q]);

  const ouvert = q.trim().length > 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Centre d'aide</h1>
          <div className="sub">Comprendre et tirer le meilleur d'Aplomb.</div>
        </div>
      </div>

      <div className="aide-search">
        <Icon name="help" size={18} />
        <input
          type="search"
          placeholder="Rechercher une fonctionnalité, un mot-clé…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Rechercher dans l'aide"
        />
      </div>

      {sections.length === 0 && (
        <div className="card aide-empty">
          <p>Aucun résultat pour « {q} ».</p>
          <p className="muted">Essayez un autre terme, ou parcourez les rubriques ci-dessous en effaçant la recherche.</p>
        </div>
      )}

      {sections.map((s) => (
        <section className="aide-sec" key={s.id}>
          <div className="aide-sec-head">
            <span className="aide-sec-ico">
              <Icon name={s.icone} size={18} />
            </span>
            <h2>{s.titre}</h2>
          </div>
          {s.intro && <p className="aide-sec-intro">{s.intro}</p>}
          {s.items.map((it, i) => (
            <details className="aide-item" key={it.titre} open={ouvert || (s.id === "demarrage" && i === 0)}>
              <summary>
                {it.titre}
                <span className="chev" aria-hidden="true">
                  <Icon name="chevron-down" size={16} />
                </span>
              </summary>
              <ul className="corps">
                {it.points.map((p, j) => (
                  <li key={j}>{p}</li>
                ))}
              </ul>
            </details>
          ))}
        </section>
      ))}

      <div className="aide-foot">
        <Icon name="bulb" size={15} />
        <span>
          Besoin d'ajuster une catégorie, une règle ou une sauvegarde ? Tout se passe dans{" "}
          <Link to="/parametres">Paramètres</Link>.
        </span>
      </div>
    </>
  );
}
