import { format } from "date-fns";
import {
  creerTransaction,
  existeAuto,
  listCategories,
  listChargesFixes,
  listEcheances,
  majEcheance,
} from "../db/repo";
import { dateEcheance, statutPaye } from "./echeances";
import { lireProfil } from "./profil";

/**
 * Génère automatiquement, au lancement, les transactions récurrentes dues :
 *  - le salaire du mois (depuis le profil) si le jour de paie est atteint ;
 *  - les charges fixes mensuelles échues non encore saisies.
 * Toutes sont marquées « à confirmer » (a_confirmer = 1) pour revue.
 * Renvoie le nombre de transactions créées.
 */
export async function genererAuto(today = new Date()): Promise<number> {
  const mois = format(today, "yyyy-MM");
  let n = 0;

  // --- Salaire (profil) ---
  const profil = lireProfil();
  if (
    profil.configure &&
    profil.revenuMensuel > 0 &&
    profil.comptePrincipalId != null &&
    today.getDate() >= profil.jourPaie &&
    !(await existeAuto("salaire", mois))
  ) {
    const cats = await listCategories();
    const rev = cats.find((c) => c.type === "revenu");
    const jour = Math.min(profil.jourPaie, 28);
    await creerTransaction({
      type: "revenu",
      montant: profil.revenuMensuel,
      date: `${mois}-${String(jour).padStart(2, "0")}`,
      description: "Salaire",
      compte_id: profil.comptePrincipalId,
      compte_dest_id: null,
      categorie_id: rev?.id ?? null,
      a_confirmer: true,
      auto_origine: "salaire",
    });
    n++;
  }

  // --- Charges fixes mensuelles échues ---
  const charges = await listChargesFixes();
  const echeances = await listEcheances();
  const chargeById = new Map(charges.map((c) => [c.id, c]));

  for (const e of echeances) {
    if (e.mois !== mois || e.transaction_id != null) continue;
    const c = chargeById.get(e.charge_fixe_id);
    if (!c || c.periodicite !== "mensuelle") continue;
    const d = dateEcheance(e.mois, c.jour_echeance);
    if (d > today) continue; // pas encore échue
    const origine = `charge:${c.id}`;
    if (await existeAuto(origine, mois)) continue;

    const txId = await creerTransaction({
      type: "depense",
      montant: c.montant_attendu,
      date: format(d, "yyyy-MM-dd"),
      description: c.nom,
      compte_id: c.compte_id,
      compte_dest_id: null,
      categorie_id: c.categorie_id,
      a_confirmer: true,
      auto_origine: origine,
    });
    await majEcheance(e.id, { transaction_id: txId, statut: statutPaye(e.justificatif_path) });
    n++;
  }

  return n;
}
