import { lastDayOfMonth, parseISO, isAfter } from "date-fns";
import type { ChargeFixe, Echeance, EcheanceStatut } from "../db/types";
import { creerEcheance, listChargesFixes, listEcheances, majEcheance } from "../db/repo";
import { moisCourant } from "./format";

/** Date d'échéance réelle d'une charge pour un mois (borne au dernier jour). */
export function dateEcheance(mois: string, jour: number): Date {
  const premier = parseISO(`${mois}-01`);
  const dernier = lastDayOfMonth(premier).getDate();
  const j = Math.min(jour, dernier);
  return parseISO(`${mois}-${String(j).padStart(2, "0")}`);
}

function statutNonPaye(mois: string, jour: number, today: Date): EcheanceStatut {
  return isAfter(today, dateEcheance(mois, jour)) ? "en_retard" : "a_venir";
}

export function statutPaye(justificatif: string | null): EcheanceStatut {
  return justificatif ? "payee_avec_justif" : "payee_sans_justif";
}

/**
 * Au lancement : garantit qu'une échéance existe pour chaque charge active du
 * mois courant, et rafraîchit le statut des échéances non payées (à venir /
 * en retard). Ne touche jamais aux échéances déjà réglées.
 * Renvoie la liste des échéances à jour.
 */
export async function synchroniserEcheances(
  mois = moisCourant(),
  today = new Date()
): Promise<Echeance[]> {
  const charges = await listChargesFixes();
  let echeances = await listEcheances();

  const existeMois = new Set(
    echeances.filter((e) => e.mois === mois).map((e) => e.charge_fixe_id)
  );

  const chargesById = new Map<number, ChargeFixe>(charges.map((c) => [c.id, c]));

  // 1. Création des échéances manquantes du mois pour les charges MENSUELLES
  //    actives (les autres périodicités sont gérées via l'échéancier).
  for (const c of charges) {
    if (c.actif !== 1) continue;
    if (c.periodicite !== "mensuelle") continue;
    if (existeMois.has(c.id)) continue;
    await creerEcheance(c.id, mois, statutNonPaye(mois, c.jour_echeance, today));
  }

  // 2. Rafraîchit le statut des échéances non payées (tous mois confondus).
  echeances = await listEcheances();
  for (const e of echeances) {
    const paye =
      e.statut === "payee_sans_justif" || e.statut === "payee_avec_justif";
    if (paye || e.transaction_id != null) continue;
    const c = chargesById.get(e.charge_fixe_id);
    if (!c) continue;
    const nouveau = statutNonPaye(e.mois, c.jour_echeance, today);
    if (nouveau !== e.statut) {
      await majEcheance(e.id, { statut: nouveau });
    }
  }

  return listEcheances();
}
