import { addDays, addMonths, format, lastDayOfMonth, parseISO, startOfDay } from "date-fns";
import type { ChargeFixe } from "../db/types";

export interface Occurrence {
  charge: ChargeFixe;
  date: string; // 'YYYY-MM-DD'
  mois: string; // 'YYYY-MM'
}

function dateAuJour(base: Date, jour: number): Date {
  const dernier = lastDayOfMonth(base).getDate();
  const j = Math.min(jour, dernier);
  return parseISO(`${format(base, "yyyy-MM")}-${String(j).padStart(2, "0")}`);
}

/**
 * Occurrences futures des charges fixes actives sur `horizonMois`, selon leur
 * périodicité (mensuelle / hebdomadaire / trimestrielle / annuelle).
 */
export function prochainesOccurrences(
  charges: ChargeFixe[],
  horizonMois = 6,
  from = new Date()
): Occurrence[] {
  const debut = startOfDay(from);
  const fin = addMonths(debut, horizonMois);
  const occ: Occurrence[] = [];

  for (const c of charges) {
    if (c.actif !== 1) continue;

    if (c.periodicite === "hebdomadaire") {
      let d = debut;
      for (let i = 0; i < horizonMois * 5 + 5; i++) {
        if (d > fin) break;
        occ.push({ charge: c, date: format(d, "yyyy-MM-dd"), mois: format(d, "yyyy-MM") });
        d = addDays(d, 7);
      }
      continue;
    }

    const pas = c.periodicite === "trimestrielle" ? 3 : c.periodicite === "annuelle" ? 12 : 1;
    for (let m = 0; m <= horizonMois; m += pas) {
      const base = addMonths(debut, m);
      const d = dateAuJour(base, c.jour_echeance);
      if (d < debut || d > fin) continue;
      occ.push({ charge: c, date: format(d, "yyyy-MM-dd"), mois: format(d, "yyyy-MM") });
    }
  }

  return occ.sort((a, b) => a.date.localeCompare(b.date));
}

/** Regroupe les occurrences par mois 'YYYY-MM'. */
export function grouperParMois(occ: Occurrence[]): Map<string, Occurrence[]> {
  const map = new Map<string, Occurrence[]>();
  for (const o of occ) {
    const arr = map.get(o.mois) ?? [];
    arr.push(o);
    map.set(o.mois, arr);
  }
  return map;
}
