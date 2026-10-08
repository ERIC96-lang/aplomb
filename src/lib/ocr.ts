import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

export interface RecuScanne {
  montant: number | null;
  date: string | null; // 'YYYY-MM-DD'
  description: string | null;
  texte: string; // texte brut reconnu (pour vérification)
}

/** Montants (\d+,dd) présents dans une ligne, séparateurs de milliers gérés. */
function montantsDe(s: string): number[] {
  const norm = s.replace(/(\d)[ .](\d{3}\b)/g, "$1$2"); // « 1 234,56 » → « 1234,56 »
  // L'OCR insère parfois une espace après le séparateur décimal (« 10, 70 »).
  const re = /(\d{1,6})[.,]\s?(\d{2})(?!\d)/g;
  const out: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(norm))) out.push(parseFloat(`${m[1]}.${m[2]}`));
  return out;
}

function trouverMontant(lignes: string[]): number | null {
  // Priorité aux lignes « total » (hors sous-total / total HT / TVA).
  const totales = lignes.filter(
    (l) => /total|montant|net a payer|à payer|a payer/i.test(l) && !/sous|\bht\b|tva|avant/i.test(l)
  );
  const surTotales = totales.flatMap(montantsDe);
  if (surTotales.length) return Math.max(...surTotales);
  // Sinon, le plus gros montant du ticket (souvent le total).
  const tous = lignes.flatMap(montantsDe);
  return tous.length ? Math.max(...tous) : null;
}

function trouverDate(texte: string): string | null {
  const m = texte.match(/(\d{2})[/.\- ](\d{2})[/.\- ](\d{2,4})/);
  if (!m) return null;
  const d = m[1];
  const mo = m[2];
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  const dd = Number(d);
  const mm = Number(mo);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${y}-${mo}-${d}`;
}

/** Analyse le texte OCR d'un reçu → montant, date et libellé probables. */
export function parseRecu(texte: string): RecuScanne {
  const lignes = texte
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const description =
    lignes.find((l) => /[a-zàâäéèêëïîôöùûüç]/i.test(l) && l.replace(/[^a-z]/gi, "").length >= 3) ??
    null;
  return {
    montant: trouverMontant(lignes),
    date: trouverDate(texte),
    description: description ? description.slice(0, 60) : null,
    texte,
  };
}

/**
 * Ouvre un sélecteur d'image, lit le reçu via l'OCR natif Windows et renvoie
 * les champs devinés (ou null si l'utilisateur annule). Lève en cas d'échec OCR.
 */
export async function scannerRecu(): Promise<RecuScanne | null> {
  const chemin = await open({
    multiple: false,
    directory: false,
    filters: [
      { name: "Image", extensions: ["jpg", "jpeg", "png", "bmp", "tif", "tiff", "gif", "heic", "heif", "webp"] },
    ],
  });
  if (!chemin || typeof chemin !== "string") return null;
  const texte = await invoke<string>("ocr_texte_image", { chemin });
  return parseRecu(texte);
}
