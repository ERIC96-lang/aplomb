import type { Transaction } from "../db/types";

// ---------------------------------------------------------------------------
// Parsing CSV
// ---------------------------------------------------------------------------

export function detecterDelimiteur(texte: string): string {
  const premiere = texte.split(/\r?\n/)[0] ?? "";
  const candidats = [";", ",", "\t", "|"];
  let best = ";";
  let max = -1;
  for (const d of candidats) {
    const n = premiere.split(d).length;
    if (n > max) {
      max = n;
      best = d;
    }
  }
  return best;
}

export function parseCSV(texte: string, delim: string): string[][] {
  const rows: string[][] = [];
  let champ = "";
  let ligne: string[] = [];
  let dansGuillemets = false;
  const t = texte.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (dansGuillemets) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          champ += '"';
          i++;
        } else dansGuillemets = false;
      } else champ += c;
    } else if (c === '"') {
      dansGuillemets = true;
    } else if (c === delim) {
      ligne.push(champ);
      champ = "";
    } else if (c === "\n") {
      ligne.push(champ);
      rows.push(ligne);
      ligne = [];
      champ = "";
    } else {
      champ += c;
    }
  }
  if (champ !== "" || ligne.length > 0) {
    ligne.push(champ);
    rows.push(ligne);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// ---------------------------------------------------------------------------
// Montants & dates
// ---------------------------------------------------------------------------

export function parseMontant(s: string): number | null {
  if (!s) return null;
  let v = s.trim().replace(/\s/g, "").replace(/[€$£]/g, "");
  const negParen = /^\(.*\)$/.test(v);
  v = v.replace(/[()]/g, "");
  // Retire séparateur de milliers, garde le dernier séparateur décimal.
  if (v.includes(",") && v.includes(".")) {
    // le dernier des deux est le décimal
    if (v.lastIndexOf(",") > v.lastIndexOf(".")) v = v.replace(/\./g, "").replace(",", ".");
    else v = v.replace(/,/g, "");
  } else {
    v = v.replace(",", ".");
  }
  const n = parseFloat(v);
  if (isNaN(n)) return null;
  return negParen ? -Math.abs(n) : n;
}

export type FormatDate = "auto" | "iso" | "fr" | "us";

export function parseDate(s: string, fmt: FormatDate = "auto"): string | null {
  if (!s) return null;
  const t = s.trim();
  // ISO YYYY-MM-DD (ou avec /)
  const iso = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso && (fmt === "auto" || fmt === "iso")) {
    return `${iso[1]}-${pad(iso[2])}-${pad(iso[3])}`;
  }
  // DD/MM/YYYY (fr) ou MM/DD/YYYY (us)
  const m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (m) {
    const an = m[3].length === 2 ? `20${m[3]}` : m[3];
    const jour = fmt === "us" ? m[2] : m[1];
    const mois = fmt === "us" ? m[1] : m[2];
    return `${an}-${pad(mois)}-${pad(jour)}`;
  }
  return null;
}

function pad(s: string): string {
  return s.padStart(2, "0");
}

// ---------------------------------------------------------------------------
// Parsing OFX (SGML simplifié)
// ---------------------------------------------------------------------------

export interface LigneImport {
  date: string; // YYYY-MM-DD
  montant: number;
  description: string;
}

export function parseOFX(texte: string): LigneImport[] {
  const lignes: LigneImport[] = [];
  const blocs = texte.split(/<STMTTRN>/i).slice(1);
  for (const b of blocs) {
    const bloc = b.split(/<\/STMTTRN>/i)[0];
    const dt = champOfx(bloc, "DTPOSTED");
    const mt = champOfx(bloc, "TRNAMT");
    const name = champOfx(bloc, "NAME") || champOfx(bloc, "MEMO") || "";
    if (!dt || !mt) continue;
    const annee = dt.slice(0, 4);
    const mois = dt.slice(4, 6);
    const jour = dt.slice(6, 8);
    const montant = parseMontant(mt);
    if (montant == null || annee.length !== 4) continue;
    lignes.push({
      date: `${annee}-${mois}-${jour}`,
      montant,
      description: name.trim(),
    });
  }
  return lignes;
}

function champOfx(bloc: string, tag: string): string {
  const m = bloc.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, "i"));
  return m ? m[1].trim() : "";
}

// ---------------------------------------------------------------------------
// Dédoublonnage
// ---------------------------------------------------------------------------

/** Vrai si une transaction identique (même compte, date, montant, description) existe déjà. */
export function estDoublon(
  existantes: Transaction[],
  compteId: number,
  date: string,
  montant: number,
  description: string
): boolean {
  return existantes.some(
    (t) =>
      t.compte_id === compteId &&
      t.date === date &&
      Math.abs(t.montant - montant) < 0.005 &&
      (t.description ?? "").trim().toLowerCase() === description.trim().toLowerCase()
  );
}
