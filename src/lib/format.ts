import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

export interface Devise {
  code: string;
  nom: string;
}

/** Devises proposées dans les paramètres. */
export const DEVISES: Devise[] = [
  { code: "EUR", nom: "Euro (€)" },
  { code: "USD", nom: "Dollar US ($)" },
  { code: "GBP", nom: "Livre sterling (£)" },
  { code: "CHF", nom: "Franc suisse (CHF)" },
  { code: "CAD", nom: "Dollar canadien (CA$)" },
  { code: "XOF", nom: "Franc CFA (FCFA)" },
  { code: "MAD", nom: "Dirham marocain (MAD)" },
  { code: "TND", nom: "Dinar tunisien (DT)" },
  { code: "JPY", nom: "Yen japonais (¥)" },
];

function lireDevise(): string {
  try {
    const c = localStorage.getItem("devise");
    if (c) return c;
  } catch {
    /* ignore */
  }
  return "EUR";
}

function construire(code: string): Intl.NumberFormat {
  // 2 décimales fixes pour TOUTES les devises : sinon certaines (TND, KWD…)
  // s'affichent avec 3 décimales, et « 700 » devient « 700,000 » — illisible.
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

let _code = lireDevise();
let _fmt = construire(_code);

export function getDevise(): string {
  return _code;
}

export function setDevise(code: string): void {
  _code = code;
  _fmt = construire(code);
  try {
    localStorage.setItem("devise", code);
  } catch {
    /* ignore */
  }
}

export function formatMontant(v: number): string {
  return _fmt.format(v);
}

/** Montant signé avec + / - explicite (pour l'affichage des mouvements). */
export function formatMontantSigne(v: number): string {
  const s = _fmt.format(Math.abs(v));
  if (v > 0) return `+ ${s}`;
  if (v < 0) return `- ${s}`;
  return s;
}

export function formatDate(iso: string): string {
  try {
    return format(parseISO(iso), "dd MMM yyyy", { locale: fr });
  } catch {
    return iso;
  }
}

export function formatMois(mois: string): string {
  // mois au format 'YYYY-MM'
  try {
    return format(parseISO(`${mois}-01`), "MMMM yyyy", { locale: fr });
  } catch {
    return mois;
  }
}

/** 'YYYY-MM' du mois courant. */
export function moisCourant(d = new Date()): string {
  return format(d, "yyyy-MM");
}

/** 'YYYY-MM-DD' du jour. */
export function aujourdhui(d = new Date()): string {
  return format(d, "yyyy-MM-dd");
}
