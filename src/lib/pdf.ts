import { jsPDF } from "jspdf";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
import { formatDate, formatMontant } from "./format";
import type { FactureData, LigneFacture, Transaction } from "../db/types";

// Documents PDF dans le langage « Le fil du mois » de l'app : encre chaude,
// crème, un fil (trait épais puis filet) sous l'en-tête, le plomb d'Aplomb en
// signature, et un bandeau de synthèse comme en tête des pages.

type RGB = [number, number, number];
const INK: RGB = [31, 28, 25]; // encre (titres, valeurs clés)
const INK2: RGB = [58, 53, 47]; // texte courant
const GRIS: RGB = [140, 133, 123]; // libellés discrets
const HAIR: RGB = [231, 226, 218]; // filets
const CREAM: RGB = [247, 245, 241]; // fonds doux
const CREAM2: RGB = [239, 235, 228];
const GREEN: RGB = [47, 143, 95];
const GREEN_BG: RGB = [228, 241, 233];
const RED: RGB = [193, 84, 63];
const RED_BG: RGB = [248, 233, 229];
const BLANC: RGB = [255, 255, 255];

const MX = 18; // marge gauche
const RX = 192; // marge droite
const L = RX - MX;

// Montant « sûr » pour PDF : Helvetica ne sait pas dessiner l'espace fine
// insécable (U+202F) qu'Intl fr-FR utilise comme séparateur de milliers.
const eur = (n: number) => formatMontant(n).replace(/[  ]/g, " ");

function rgb(hex: string | undefined, defaut: RGB = INK): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
  if (!m) return defaut;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

async function sauvegarder(doc: jsPDF, nomDefaut: string): Promise<boolean> {
  const chemin = await save({
    defaultPath: nomDefaut,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (!chemin) return false;
  const bytes = doc.output("arraybuffer");
  await writeFile(chemin, new Uint8Array(bytes));
  await openPath(chemin).catch(() => {});
  return true;
}

function filet(doc: jsPDF, x1: number, y: number, x2: number, couleur: RGB = HAIR, epaisseur = 0.3) {
  doc.setDrawColor(...couleur);
  doc.setLineWidth(epaisseur);
  doc.line(x1, y, x2, y);
}

/** Le « fil » : un trait d'encre épais puis un filet jusqu'à la marge. */
function fil(doc: jsPDF, y: number, part = 0.28) {
  const xFin = MX + L * part;
  doc.setFillColor(...INK);
  doc.roundedRect(MX, y - 0.6, xFin - MX, 1.2, 0.6, 0.6, "F");
  filet(doc, xFin + 1.5, y, RX, HAIR, 0.4);
}

/** Petit libellé gris, majuscule, légèrement espacé. */
function etiquette(doc: jsPDF, txt: string, x: number, y: number, align: "left" | "right" | "center" = "left") {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...GRIS);
  // jsPDF ne tient pas compte de l'espacement pour aligner à droite ou au
  // centre : l'espacement n'est appliqué qu'aux libellés alignés à gauche.
  doc.setCharSpace(align === "left" ? 0.55 : 0);
  doc.text(txt.toUpperCase(), x, y, { align });
  doc.setCharSpace(0);
}

/** Le plomb d'Aplomb : tuile d'encre, fil et plomb blancs. */
function marque(doc: jsPDF, x: number, y: number, t = 8) {
  doc.setFillColor(...INK);
  doc.roundedRect(x, y, t, t, t * 0.26, t * 0.26, "F");
  doc.setDrawColor(...BLANC);
  doc.setLineWidth(t * 0.07);
  doc.line(x + t / 2, y + t * 0.18, x + t / 2, y + t * 0.56);
  doc.setFillColor(...BLANC);
  doc.circle(x + t / 2, y + t * 0.68, t * 0.13, "F");
}

/** Pastille de statut (« Payé », « 32 % épargnés »…). */
function pastille(doc: jsPDF, txt: string, x: number, y: number, ton: "ok" | "risque" = "ok") {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  const w = doc.getTextWidth(txt.toUpperCase()) + 9;
  doc.setFillColor(...(ton === "ok" ? GREEN_BG : RED_BG));
  doc.roundedRect(x, y, w, 7, 3.5, 3.5, "F");
  doc.setFillColor(...(ton === "ok" ? GREEN : RED));
  doc.circle(x + 3.4, y + 3.5, 1, "F");
  doc.setTextColor(...(ton === "ok" ? GREEN : RED));
  doc.text(txt.toUpperCase(), x + 5.6, y + 4.8);
  return w;
}

/** Tampon « PAYÉ » encadré, à la manière d'un tampon encreur. */
function tampon(doc: jsPDF, x: number, y: number) {
  doc.setDrawColor(...GREEN);
  doc.setLineWidth(0.7);
  doc.roundedRect(x, y, 30, 11, 2, 2, "S");
  doc.setLineWidth(0.25);
  doc.roundedRect(x + 1.2, y + 1.2, 27.6, 8.6, 1.4, 1.4, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  doc.setTextColor(...GREEN);
  doc.text("P A Y É", x + 15, y + 7.7, { align: "center" });
}

function lignesTexte(doc: jsPDF, texte: string, x: number, y: number, interligne: number, align: "left" | "right") {
  (texte || "")
    .split("\n")
    .filter((l) => l.trim())
    .forEach((l, i) => doc.text(l, x, y + i * interligne, { align }));
}

/** Pied de page : filet, mention éventuelle, signature Aplomb et pagination. */
function pieds(doc: jsPDF, mention?: string) {
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    const y = 284;
    filet(doc, MX, y, RX);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...GRIS);
    if (mention) doc.text(mention, MX, y + 6, { maxWidth: 110 });
    marque(doc, RX - 42, y + 2.6, 4.4);
    doc.text(`Généré avec Aplomb${n > 1 ? `  ·  ${p}/${n}` : ""}`, RX, y + 6, { align: "right" });
  }
}

/**
 * En-tête : grand titre et références à gauche, émetteur à droite, puis le fil.
 * Renvoie l'ordonnée sous le fil.
 */
function entete(doc: jsPDF, titre: string, refs: string[], emetteurNom: string, emetteurInfos: string) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(...INK);
  doc.text(titre, MX, 30);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRIS);
  refs.forEach((r, i) => doc.text(r, MX, 38 + i * 4.8));

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(emetteurNom || "—", RX, 24, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...GRIS);
  lignesTexte(doc, emetteurInfos, RX, 30, 4.4, "right");

  const y = Math.max(50, 38 + refs.length * 4.8 + 3);
  fil(doc, y);
  return y + 10;
}

/** Bloc de détail aéré : libellé à gauche, valeur à droite, filets. */
function detail(doc: jsPDF, lignes: [string, string][], y: number) {
  for (const [k, v] of lignes) {
    etiquette(doc, k, MX, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(...INK2);
    doc.text(String(v), RX, y, { align: "right", maxWidth: 120 });
    y += 12;
    filet(doc, MX, y - 5, RX);
  }
  return y;
}

// ---------------------------------------------------------------------------

/** Reçu / quittance de paiement à partir d'une transaction. */
export async function genererRecuTransaction(
  tx: Transaction,
  compteNom: string,
  categorieNom: string | null
): Promise<boolean> {
  const doc = new jsPDF();
  const numero = `RECU-${tx.id.toString().padStart(5, "0")}`;
  let y = entete(doc, "Reçu", [`N° ${numero}`, `Émis le ${formatDate(tx.date)}`], "Reçu personnel", "Établi avec Aplomb");

  // Bandeau : le montant en grand, statut, sur fond crème.
  doc.setFillColor(...CREAM);
  doc.roundedRect(MX, y, L, 34, 4, 4, "F");
  etiquette(doc, tx.type === "revenu" ? "Montant reçu" : "Montant réglé", MX + 9, y + 10);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(...INK);
  doc.text(eur(tx.montant), MX + 9, y + 25);
  if (tx.type !== "virement") tampon(doc, RX - 42, y + 11.5);
  y += 50;

  detail(
    doc,
    [
      ["Type", tx.type === "revenu" ? "Revenu" : tx.type === "depense" ? "Dépense" : "Virement"],
      ["Date", formatDate(tx.date)],
      ["Compte", compteNom],
      ["Catégorie", categorieNom ?? "—"],
      ["Description", tx.description ?? "—"],
    ],
    y
  );

  pieds(doc);
  return sauvegarder(doc, `${numero}.pdf`);
}

function totaux(data: FactureData) {
  const ht = data.lignes.reduce((a, l) => a + l.quantite * l.prix_unitaire, 0);
  const tva = ht * (data.tva_taux / 100);
  return { ht, tva, ttc: ht + tva };
}

export function totalFacture(data: FactureData): number {
  return totaux(data).ttc;
}

/** Facture / reçu commercial complet. */
export async function genererFacturePdf(data: FactureData): Promise<boolean> {
  const doc = new jsPDF();
  const estRecu = data.type === "recu";
  let y = entete(
    doc,
    estRecu ? "Reçu" : "Facture",
    [`N° ${data.numero}`, `Émis le ${formatDate(data.date)}`],
    data.emetteur_nom,
    data.emetteur_infos
  );

  // Parties : « Pour » (client) dans un bloc crème, statut à droite.
  doc.setFillColor(...CREAM);
  doc.roundedRect(MX, y, 104, 30, 3.5, 3.5, "F");
  etiquette(doc, estRecu ? "Reçu de" : "Facturé à", MX + 7, y + 8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...INK);
  doc.text(data.client_nom || "—", MX + 7, y + 15, { maxWidth: 92 });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...GRIS);
  lignesTexte(doc, data.client_infos, MX + 7, y + 20.5, 4.2, "left");

  etiquette(doc, "Montant", RX, y + 8, "right");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.setTextColor(...INK);
  doc.text(eur(totaux(data).ttc), RX, y + 17, { align: "right" });
  if (data.paye) tampon(doc, RX - 30, y + 20);
  y += 44;

  // Lignes : en-tête crème, désignations sur plusieurs lignes si besoin.
  doc.setFillColor(...CREAM2);
  doc.roundedRect(MX, y - 6, L, 10, 2, 2, "F");
  etiquette(doc, "Désignation", MX + 5, y);
  etiquette(doc, "Qté", 122, y, "right");
  etiquette(doc, "Prix unit.", 154, y, "right");
  etiquette(doc, "Total", RX - 5, y, "right");
  y += 11;

  for (const l of data.lignes) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const lignes = doc.splitTextToSize(l.designation || "—", 84) as string[];
    if (y + lignes.length * 4.6 > 250) {
      doc.addPage();
      y = 26;
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...INK2);
    doc.text(lignes, MX + 5, y);
    doc.setTextColor(...GRIS);
    doc.text(String(l.quantite), 122, y, { align: "right" });
    doc.text(eur(l.prix_unitaire), 154, y, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...INK);
    doc.text(eur(l.quantite * l.prix_unitaire), RX - 5, y, { align: "right" });
    y += 5 + lignes.length * 4.6;
    filet(doc, MX, y - 4.5, RX);
  }

  // Totaux à droite, TTC en bandeau d'encre.
  const t = totaux(data);
  y += 6;
  const ligneTot = (lib: string, val: string) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...GRIS);
    doc.text(lib, 128, y);
    doc.setTextColor(...INK2);
    doc.text(val, RX - 5, y, { align: "right" });
    y += 7;
  };
  if (data.tva_taux > 0) {
    ligneTot("Total HT", eur(t.ht));
    ligneTot(`TVA ${data.tva_taux} %`, eur(t.tva));
  }
  doc.setFillColor(...INK);
  doc.roundedRect(122, y - 4, RX - 122, 14, 3, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...BLANC);
  doc.text(estRecu ? "TOTAL" : "TOTAL TTC", 128, y + 4.6);
  doc.setFontSize(13.5);
  doc.text(eur(t.ttc), RX - 5, y + 4.8, { align: "right" });
  y += 24;

  if (data.notes && data.notes.trim()) {
    etiquette(doc, "Notes", MX, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...INK2);
    doc.text(doc.splitTextToSize(data.notes, L) as string[], MX, y + 6);
  }

  const mention = data.tva_taux === 0 ? "TVA non applicable, art. 293 B du CGI." : undefined;
  pieds(doc, mention);
  return sauvegarder(doc, `${data.numero || "facture"}.pdf`);
}

/** Rapport financier (synthèse d'une période) en PDF. */
export async function genererRapportPdf(opts: {
  titre: string;
  periode: string;
  revenus: number;
  depenses: number;
  solde: number;
  repartition: { nom: string; montant: number; couleur?: string }[];
}): Promise<boolean> {
  const doc = new jsPDF();
  const date = formatDate(new Date().toISOString().slice(0, 10));

  // En-tête de marque : le plomb, « Aplomb », puis le titre.
  marque(doc, MX, 14, 9);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text("Aplomb", MX + 12, 20.2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...GRIS);
  doc.text(`Édité le ${date}`, RX, 20.2, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(...INK);
  doc.text(opts.titre, MX, 38);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...GRIS);
  doc.text(opts.periode.charAt(0).toUpperCase() + opts.periode.slice(1), MX, 45.5);
  fil(doc, 52);
  let y = 62;

  // Bandeau de synthèse : épargne en grand + statut, calcul à droite.
  const taux = opts.revenus > 0 ? Math.round((opts.solde / opts.revenus) * 100) : 0;
  const ok = opts.solde >= 0;
  doc.setFillColor(...CREAM);
  doc.roundedRect(MX, y, L, 46, 4, 4, "F");
  etiquette(doc, "Épargne de la période", MX + 9, y + 10);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(27);
  doc.setTextColor(...(ok ? INK : RED));
  doc.text(eur(opts.solde), MX + 9, y + 25);
  pastille(doc, opts.revenus > 0 ? `${taux} % épargnés` : ok ? "Équilibré" : "Déficitaire", MX + 9, y + 31, ok ? "ok" : "risque");

  // Calcul (encart blanc).
  const cx = 118;
  doc.setFillColor(...BLANC);
  doc.roundedRect(cx, y + 6, RX - 6 - cx, 34, 3, 3, "F");
  const calc = (lib: string, val: string, yy: number, gras = false) => {
    doc.setFont("helvetica", gras ? "bold" : "normal");
    doc.setFontSize(gras ? 10 : 9);
    doc.setTextColor(...(gras ? INK : GRIS));
    doc.text(lib, cx + 6, yy);
    doc.setTextColor(...INK);
    doc.text(val, RX - 12, yy, { align: "right" });
  };
  calc("Revenus", eur(opts.revenus), y + 15);
  calc("Dépenses", `- ${eur(opts.depenses)}`, y + 22.5);
  filet(doc, cx + 6, y + 27, RX - 12, INK, 0.35);
  calc("Épargne", eur(opts.solde), y + 34, true);
  y += 58;

  // Où va l'argent : barre revenus = 100 %, dépenses empilées par catégorie.
  const total = opts.repartition.reduce((a, r) => a + r.montant, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...INK);
  doc.text("Où va l'argent", MX, y);
  y += 7;
  const base = Math.max(opts.revenus, total, 1);
  let x = MX;
  doc.setFillColor(...CREAM2);
  doc.roundedRect(MX, y, L, 6, 3, 3, "F");
  for (const r of opts.repartition) {
    const w = (r.montant / base) * L;
    if (w < 0.4) continue;
    doc.setFillColor(...rgb(r.couleur, INK2));
    doc.rect(x, y, w, 6, "F");
    x += w;
  }
  y += 11;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...GRIS);
  doc.text(
    opts.revenus > 0
      ? `Les dépenses représentent ${Math.round((total / opts.revenus) * 100)} % des revenus de la période.`
      : "Aucun revenu sur la période.",
    MX,
    y
  );
  y += 12;

  // Détail par catégorie.
  doc.setFillColor(...CREAM2);
  doc.roundedRect(MX, y - 6, L, 10, 2, 2, "F");
  etiquette(doc, "Catégorie", MX + 5, y);
  etiquette(doc, "Montant", 156, y, "right");
  etiquette(doc, "Part", RX - 5, y, "right");
  y += 11;
  for (const r of opts.repartition) {
    if (y > 270) {
      doc.addPage();
      y = 26;
    }
    const part = total > 0 ? r.montant / total : 0;
    doc.setFillColor(...rgb(r.couleur, INK2));
    doc.circle(MX + 6.5, y - 1.3, 1.6, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...INK2);
    doc.text(r.nom, MX + 11, y, { maxWidth: 80 });
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...INK);
    doc.text(eur(r.montant), 156, y, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRIS);
    doc.text(`${Math.round(part * 100)} %`, RX - 5, y, { align: "right" });
    // Barre de part à la couleur de la catégorie.
    doc.setFillColor(...HAIR);
    doc.roundedRect(MX + 11, y + 2.4, 92, 1.4, 0.7, 0.7, "F");
    doc.setFillColor(...rgb(r.couleur, INK));
    doc.roundedRect(MX + 11, y + 2.4, Math.max(1, 92 * part), 1.4, 0.7, 0.7, "F");
    y += 12;
    filet(doc, MX, y - 4.5, RX);
  }
  if (opts.repartition.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...GRIS);
    doc.text("Aucune dépense sur la période.", MX + 5, y);
  }

  pieds(doc);
  return sauvegarder(doc, `rapport-${opts.periode.replace(/[^0-9A-Za-z]+/g, "-")}.pdf`);
}

export function ligneVide(): LigneFacture {
  return { designation: "", quantite: 1, prix_unitaire: 0 };
}
