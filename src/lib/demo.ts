import { addMonths, format } from "date-fns";
import { getDb } from "../db/index";
import {
  creerChargeFixe,
  creerCompte,
  creerEcheance,
  creerObjectif,
  creerTransaction,
  definirBudget,
  listCategories,
  listComptes,
  majEcheance,
} from "../db/repo";
import { statutPaye } from "./echeances";
import { ecrireProfil } from "./profil";

function catId(cats: { id: number; nom: string }[], nom: string): number | null {
  return cats.find((c) => c.nom === nom)?.id ?? null;
}

function rnd(min: number, max: number): number {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
}

/**
 * Remplit l'app avec ~4 mois de données réalistes pour visualiser toutes les
 * fonctionnalités (courbes, répartition, charges fixes, suggestions, rapports).
 * Idempotent-friendly : crée les comptes seulement s'il n'y en a pas.
 */
export async function genererDonneesDemo(): Promise<void> {
  let comptes = await listComptes();
  if (comptes.length === 0) {
    await creerCompte({ nom: "Compte courant", type: "courant", solde_initial: 1800, date_creation: format(addMonths(new Date(), -6), "yyyy-MM-dd") });
    await creerCompte({ nom: "Livret épargne", type: "epargne", solde_initial: 5000, date_creation: format(addMonths(new Date(), -6), "yyyy-MM-dd") });
    comptes = await listComptes();
  }
  const courant = comptes.find((c) => c.type === "courant") ?? comptes[0];
  const epargne = comptes.find((c) => c.type === "epargne") ?? comptes[1] ?? comptes[0];
  const cats = await listCategories();

  // Profil de démo (alimente Prévisions et l'auto-génération du salaire).
  ecrireProfil({
    revenuMensuel: 2600,
    jourPaie: 1,
    comptePrincipalId: courant.id,
    tauxEpargneCible: 15,
    configure: true,
    modeRevenu: "fixe",
    revenuBas: 0,
    revenuHaut: 0,
  });

  // Charges fixes (avec échéances liées les mois passés).
  const loyer = await creerChargeFixe({
    nom: "Loyer", montant_attendu: 850, compte_id: courant.id,
    categorie_id: catId(cats, "Logement"), jour_echeance: 5, actif: 1, periodicite: "mensuelle",
  });
  const assurance = await creerChargeFixe({
    nom: "Assurance habitation", montant_attendu: 22, compte_id: courant.id,
    categorie_id: catId(cats, "Logement"), jour_echeance: 10, actif: 1, periodicite: "mensuelle",
  });

  // Budgets mensuels par catégorie.
  const budgetsDemo: [string, number][] = [
    ["Alimentation", 350],
    ["Transport", 90],
    ["Loisirs", 120],
    ["Abonnements", 30],
  ];
  for (const [nom, plafond] of budgetsDemo) {
    const id = catId(cats, nom);
    if (id != null) await definirBudget(id, plafond);
  }

  // Objectifs d'épargne de démo.
  await creerObjectif({ nom: "Vacances d'été", montant_cible: 2500, montant_actuel: 900, date_cible: null, couleur: "#2dd4bf" });
  await creerObjectif({ nom: "Épargne de précaution", montant_cible: 6000, montant_actuel: 5000, date_cible: null, couleur: "#6d6bf5" });

  const now = new Date();

  for (let i = 3; i >= 0; i--) {
    const mois = format(addMonths(now, -i), "yyyy-MM");
    const j = (d: number) => `${mois}-${String(d).padStart(2, "0")}`;
    const estMoisPasse = i > 0;

    // Salaire
    await creerTransaction({ type: "revenu", montant: 2600, date: j(1), description: "Salaire", compte_id: courant.id, compte_dest_id: null, categorie_id: catId(cats, "Revenus") });

    // Virement vers épargne
    await creerTransaction({ type: "virement", montant: 300, date: j(2), description: "Épargne mensuelle", compte_id: courant.id, compte_dest_id: epargne.id, categorie_id: null });

    // Charges fixes -> transaction + échéance liée (payée les mois passés)
    for (const cf of [
      { id: loyer, montant: 850, jour: 5, nom: "Loyer", justif: true },
      { id: assurance, montant: 22, jour: 10, nom: "Assurance habitation", justif: false },
    ]) {
      if (estMoisPasse) {
        const txId = await creerTransaction({ type: "depense", montant: cf.montant, date: j(cf.jour), description: cf.nom, compte_id: courant.id, compte_dest_id: null, categorie_id: catId(cats, "Logement") });
        await creerEcheance(cf.id, mois, "a_venir");
        const db = await getDb();
        const ech = await db.select<{ id: number }[]>(
          "SELECT id FROM charge_fixe_echeances WHERE charge_fixe_id = ? AND mois = ?",
          [cf.id, mois]
        );
        if (ech[0]) {
          await majEcheance(ech[0].id, {
            transaction_id: txId,
            justificatif_path: cf.justif ? "justificatifs/demo/loyer.pdf" : null,
            statut: statutPaye(cf.justif ? "justificatifs/demo/loyer.pdf" : null),
          });
        }
      }
    }

    // Abonnements récurrents (non liés -> alimentent les Suggestions)
    await creerTransaction({ type: "depense", montant: 13.49, date: j(15), description: "Netflix", compte_id: courant.id, compte_dest_id: null, categorie_id: catId(cats, "Abonnements") });
    await creerTransaction({ type: "depense", montant: 10.99, date: j(12), description: "Spotify", compte_id: courant.id, compte_dest_id: null, categorie_id: catId(cats, "Abonnements") });

    // Dépenses variables
    for (const d of [3, 9, 17, 24, 28]) {
      await creerTransaction({ type: "depense", montant: rnd(28, 95), date: j(d), description: "Courses", compte_id: courant.id, compte_dest_id: null, categorie_id: catId(cats, "Alimentation") });
    }
    await creerTransaction({ type: "depense", montant: rnd(45, 70), date: j(8), description: "Carburant / transports", compte_id: courant.id, compte_dest_id: null, categorie_id: catId(cats, "Transport") });
    await creerTransaction({ type: "depense", montant: rnd(20, 60), date: j(20), description: "Restaurant / loisirs", compte_id: courant.id, compte_dest_id: null, categorie_id: catId(cats, "Loisirs") });
    if (i % 2 === 0) {
      await creerTransaction({ type: "depense", montant: rnd(15, 45), date: j(22), description: "Pharmacie", compte_id: courant.id, compte_dest_id: null, categorie_id: catId(cats, "Santé") });
    }
  }
}

/**
 * Réinitialisation complète : efface TOUTES les données (y compris comptes,
 * factures et profil). Les catégories par défaut sont conservées.
 */
export async function reinitialiserDonnees(): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM charge_fixe_echeances");
  await db.execute("DELETE FROM suggestions_recurrence");
  await db.execute("DELETE FROM charges_fixes");
  await db.execute("DELETE FROM budgets");
  await db.execute("DELETE FROM objectifs");
  await db.execute("DELETE FROM factures");
  await db.execute("DELETE FROM transactions");
  await db.execute("DELETE FROM comptes");
  try {
    localStorage.removeItem("profil");
  } catch {
    /* ignore */
  }
}
