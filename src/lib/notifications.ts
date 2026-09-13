import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { differenceInCalendarDays, parseISO } from "date-fns";
import type { Budget, Categorie, ChargeFixe, Echeance, Transaction } from "../db/types";
import { dateEcheance } from "./echeances";
import { statutsBudgets } from "./budgets";
import { formatMois, formatMontant, moisCourant } from "./format";

const JOURS_AVANT_ALERTE = 3;

async function assurerPermission(): Promise<boolean> {
  let granted = await isPermissionGranted();
  if (!granted) {
    const p = await requestPermission();
    granted = p === "granted";
  }
  return granted;
}

/** Évite de renvoyer deux fois la même alerte (mémoire locale par clé). */
function dejaEnvoyee(cle: string): boolean {
  try {
    return localStorage.getItem(`alerte:${cle}`) === "1";
  } catch {
    return false;
  }
}
function marquerEnvoyee(cle: string): void {
  try {
    localStorage.setItem(`alerte:${cle}`, "1");
  } catch {
    /* ignore */
  }
}

function moisPrecedent(mois: string): string {
  const d = parseISO(`${mois}-01`);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export interface Alerte {
  titre: string;
  corps: string;
  cle: string;
}

/**
 * Construit la liste des alertes pertinentes :
 *  1. une échéance de charge fixe approche (≤ 3 j) sans transaction saisie ;
 *  2. le mois précédent s'est terminé avec une charge payée sans justificatif.
 */
export function construireAlertes(
  charges: ChargeFixe[],
  echeances: Echeance[],
  today = new Date()
): Alerte[] {
  const alertes: Alerte[] = [];
  const mois = moisCourant(today);
  const moisPrec = moisPrecedent(mois);
  const chargesById = new Map(charges.map((c) => [c.id, c]));

  for (const e of echeances) {
    const c = chargesById.get(e.charge_fixe_id);
    if (!c) continue;

    // 1. Échéance imminente du mois courant, non réglée.
    if (e.mois === mois && e.statut === "a_venir" && e.transaction_id == null) {
      const jours = differenceInCalendarDays(
        dateEcheance(e.mois, c.jour_echeance),
        today
      );
      if (jours >= 0 && jours <= JOURS_AVANT_ALERTE) {
        alertes.push({
          titre: "Échéance à venir",
          corps:
            jours === 0
              ? `${c.nom} est due aujourd'hui — aucune transaction saisie.`
              : `${c.nom} est due dans ${jours} j — aucune transaction saisie.`,
          cle: `imminente:${e.id}:${mois}`,
        });
      }
    }

    // 2. Charge du mois précédent payée mais sans justificatif.
    if (e.mois === moisPrec && e.statut === "payee_sans_justif") {
      alertes.push({
        titre: "Justificatif manquant",
        corps: `${c.nom} (${formatMois(moisPrec)}) est payée mais sans justificatif attaché.`,
        cle: `justif:${e.id}`,
      });
    }
  }

  return alertes;
}

/**
 * Alertes de budget : une catégorie dont les dépenses du mois dépassent le
 * plafond fixé.
 */
export function construireAlertesBudgets(
  budgets: Budget[],
  categories: Categorie[],
  transactions: Transaction[],
  today = new Date()
): Alerte[] {
  const mois = moisCourant(today);
  const statuts = statutsBudgets(budgets, categories, transactions, mois);
  const alertes: Alerte[] = [];
  for (const s of statuts) {
    if (s.etat === "depasse") {
      alertes.push({
        titre: "Budget dépassé",
        corps: `${s.nom} : ${formatMontant(s.depense)} dépensés sur ${formatMontant(s.plafond)} (${mois}).`,
        cle: `budget:${s.categorie_id}:${mois}`,
      });
    }
  }
  return alertes;
}

/** Envoie les alertes non encore notifiées via le système. */
export async function envoyerAlertes(alertes: Alerte[]): Promise<number> {
  const nouvelles = alertes.filter((a) => !dejaEnvoyee(a.cle));
  if (nouvelles.length === 0) return 0;
  if (!(await assurerPermission())) return 0;
  for (const a of nouvelles) {
    sendNotification({ title: a.titre, body: a.corps });
    marquerEnvoyee(a.cle);
  }
  return nouvelles.length;
}
