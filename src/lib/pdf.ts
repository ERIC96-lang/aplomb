import { jsPDF } from "jspdf";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
import { formatDate, formatMontant } from "./format";
import type { FactureData, LigneFacture, Transaction } from "../db/types";

// Palette monochrome premium (accord avec le nouveau design de l'app).
const INK: [number, number, number] = [26, 24, 21]; // encre (titres, valeurs clés)
const INK2: [number, number, number] = [58, 54, 48]; // texte courant
const GRIS: [number, number, number] = [140, 133, 123]; // libellés discrets
const HAIR: [number, number, number] = [229, 225, 218]; // filets
const CREAM: [number, number, number] = [246, 244, 240]; // fonds doux
const GREEN: [number, number, number] = [47, 143, 95];
const GREEN_BG: [number, number, number] = [231, 242, 235];

const MX = 20; // marge gauche
const RX = 190; // marge droite

// Montant « sûr » pour PDF : Helvetica ne sait pas dessiner l'espace fine
// insécable (U+202F) qu'Intl fr-FR utilise comme séparateur de milliers.
const eur = (n: number) => formatMontant(n).replace(/[  ]/g, " ");

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

function hair(doc: jsPDF, x1: number, y: number, x2: number) {
  doc.setDrawColor(...HAIR);
  doc.setLineWidth(0.3);
  doc.line(x1, y, x2, y);
}

/** Petit libellé gris, majuscule, légèrement tracké (premium). */
function label(
  doc: jsPDF,
  txt: string,
  x: number,
  y: number,
  align: "left" | "right" = "left"
) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...GRIS);
  doc.setCharSpace(0.6);
  doc.text(txt.toUpperCase(), x, y, { align });
  doc.setCharSpace(0);
}

/** Pastille de statut douce (ex. « PAYÉ » vert). */
function badge(doc: jsPDF, txt: string, x: number, y: number) {
  const w = 26;
  const h = 8;
  doc.setFillColor(...GREEN_BG);
  doc.roundedRect(x, y, w, h, 2.5, 2.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...GREEN);
  doc.setCharSpace(0.5);
  doc.text(txt.toUpperCase(), x + w / 2, y + 5.5, { align: "center" });
  doc.setCharSpace(0);
}

function pied(doc: jsPDF, mention?: string) {
  const y = 283;
  hair(doc, MX, y, RX);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GRIS);
  if (mention) doc.text(mention, MX, y + 6, { maxWidth: 120 });
  doc.text("Document généré par Aplomb", RX, y + 6, { align: "right" });
}

function splitLignes(
  doc: jsPDF,
  texte: string,
  x: number,
  y: number,
  interligne: number,
  align: "left" | "right"
) {
  (texte || "")
    .split("\n")
    .forEach((l, i) => l.trim() && doc.text(l, x, y + i * interligne, { align }));
}

/** En-tête de document : titre à gauche, émetteur à droite, filet de séparation. */
function enteteDoc(
  doc: jsPDF,
  titre: string,
  sousLignes: string[],
  emetteurNom: string,
  emetteurInfos: string
) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(...INK);
  doc.setCharSpace(0.4);
  doc.text(titre, MX, 30);
  doc.setCharSpace(0);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...GRIS);
  sousLignes.forEach((l, i) => doc.text(l, MX, 38 + i * 5, { align: "left" }));

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  doc.setTextColor(...INK);
  doc.text(emetteurNom || "—", RX, 28, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRIS);
  splitLignes(doc, emetteurInfos, RX, 34, 4.6, "right");

  hair(doc, MX, 54, RX);
}

/** Reçu / quittance de paiement à partir d'une transaction. */
export async function genererRecuTransaction(
  tx: Transaction,
  compteNom: string,
  categorieNom: string | null
): Promise<boolean> {
  const doc = new jsPDF();
  const numero = `RECU-${tx.id.toString().padStart(5, "0")}`;
  enteteDoc(doc, "Reçu", [`N° ${numero}`, `Émis le ${formatDate(tx.date)}`], "Aplomb", "Reçu personnel");

  // Montant mis en avant dans un bloc doux.
  doc.setFillColor(...CREAM);
  doc.roundedRect(MX, 64, RX - MX, 26, 4, 4, "F");
  label(doc, "Montant", MX + 8, 74);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...INK);
  doc.text(eur(tx.montant), MX + 8, 85);
  if (tx.type !== "virement") badge(doc, "Payé", RX - 34, 71);

  // Détails, en lignes aérées séparées par des filets.
  const lignes: [string, string][] = [
    ["Type", tx.type === "revenu" ? "Revenu" : tx.type === "depense" ? "Dépense" : "Virement"],
    ["Date", formatDate(tx.date)],
    ["Compte", compteNom],
    ["Catégorie", categorieNom ?? "—"],
    ["Description", tx.description ?? "—"],
  ];
  let y = 104;
  for (const [k, v] of lignes) {
    label(doc, k, MX, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...INK2);
    doc.text(String(v), RX, y, { align: "right", maxWidth: 120 });
    y += 13;
    hair(doc, MX, y - 5, RX);
  }

  pied(doc);
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
  enteteDoc(
    doc,
    estRecu ? "Reçu" : "Facture",
    [`N° ${data.numero}`, `Émis le ${formatDate(data.date)}`],
    data.emetteur_nom,
    data.emetteur_infos
  );

  // Client
  label(doc, "Facturé à", MX, 66);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...INK);
  doc.text(data.client_nom || "—", MX, 73);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRIS);
  splitLignes(doc, data.client_infos, MX, 79, 4.6, "left");

  if (data.paye) badge(doc, "Payé", RX - 26, 68);

  // Tableau des lignes — bandeau d'en-tête crème.
  let y = 100;
  doc.setFillColor(...CREAM);
  doc.roundedRect(MX, y - 6, RX - MX, 10, 2, 2, "F");
  label(doc, "Désignation", MX + 4, y);
  label(doc, "Qté", 120, y, "right");
  label(doc, "P.U.", 150, y, "right");
  label(doc, "Total", RX - 4, y, "right");
  y += 12;

  for (const l of data.lignes) {
    const totalLigne = l.quantite * l.prix_unitaire;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...INK2);
    doc.text(l.designation || "—", MX + 4, y, { maxWidth: 88 });
    doc.setTextColor(...GRIS);
    doc.text(String(l.quantite), 120, y, { align: "right" });
    doc.text(eur(l.prix_unitaire), 150, y, { align: "right" });
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.text(eur(totalLigne), RX - 4, y, { align: "right" });
    y += 10;
    hair(doc, MX, y - 4, RX);
  }

  // Totaux (bloc à droite).
  const t = totaux(data);
  y += 8;
  const ligneTot = (lab: string, val: string) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...GRIS);
    doc.text(lab, 150, y, { align: "right" });
    doc.setTextColor(...INK2);
    doc.text(val, RX - 4, y, { align: "right" });
    y += 7;
  };
  if (data.tva_taux > 0) {
    ligneTot("Total HT", eur(t.ht));
    ligneTot(`TVA (${data.tva_taux} %)`, eur(t.tva));
  }
  // TTC dans un bloc doux mis en avant.
  y += 1;
  doc.setFillColor(...CREAM);
  doc.roundedRect(112, y - 5, RX - 112, 14, 3, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...INK);
  doc.text(estRecu ? "Total" : "Total TTC", 120, y + 3.5);
  doc.setFontSize(14);
  doc.text(eur(t.ttc), RX - 4, y + 3.5, { align: "right" });
  y += 20;

  // Notes.
  if (data.notes && data.notes.trim()) {
    label(doc, "Notes", MX, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...INK2);
    splitLignes(doc, data.notes, MX, y + 6, 4.8, "left");
  }

  const mention = data.tva_taux === 0 ? "TVA non applicable, art. 293 B du CGI." : undefined;
  pied(doc, mention);
  return sauvegarder(doc, `${data.numero || "facture"}.pdf`);
}

/** Rapport financier (synthèse d'une période) en PDF. */
export async function genererRapportPdf(opts: {
  titre: string;
  periode: string;
  revenus: number;
  depenses: number;
  solde: number;
  repartition: { nom: string; montant: number }[];
}): Promise<boolean> {
  const doc = new jsPDF();
  enteteDoc(doc, "Rapport", [opts.titre, opts.periode], "Aplomb", "Synthèse personnelle");

  // Blocs de synthèse.
  const taux = opts.revenus > 0 ? Math.round((opts.solde / opts.revenus) * 100) : 0;
  const blocs: [string, string][] = [
    ["Revenus", eur(opts.revenus)],
    ["Dépenses", eur(opts.depenses)],
    ["Épargne", eur(opts.solde)],
    ["Taux d'épargne", `${taux} %`],
  ];
  const gap = 4;
  const w = (RX - MX - gap * 3) / 4;
  blocs.forEach(([lab, val], i) => {
    const x = MX + i * (w + gap);
    doc.setFillColor(...CREAM);
    doc.roundedRect(x, 62, w, 26, 3, 3, "F");
    label(doc, lab, x + 6, 71);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...INK);
    doc.text(val, x + 6, 82);
  });

  // Répartition des dépenses.
  let y = 106;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...INK);
  doc.text("Répartition des dépenses", MX, y);
  y += 10;
  doc.setFillColor(...CREAM);
  doc.roundedRect(MX, y - 6, RX - MX, 10, 2, 2, "F");
  label(doc, "Catégorie", MX + 4, y);
  label(doc, "Montant", 150, y, "right");
  label(doc, "%", RX - 4, y, "right");
  y += 12;

  const total = opts.repartition.reduce((a, r) => a + r.montant, 0) || 1;
  for (const r of opts.repartition) {
    if (y > 268) {
      doc.addPage();
      y = 24;
    }
    const pct = Math.round((r.montant / total) * 100);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...INK2);
    doc.text(r.nom, MX + 4, y, { maxWidth: 90 });
    doc.setTextColor(...INK);
    doc.text(eur(r.montant), 150, y, { align: "right" });
    doc.setTextColor(...GRIS);
    doc.text(`${pct} %`, RX - 4, y, { align: "right" });
    // Barre de part discrète.
    doc.setFillColor(...HAIR);
    doc.roundedRect(MX + 4, y + 2.2, 90, 1.4, 0.7, 0.7, "F");
    doc.setFillColor(...INK);
    doc.roundedRect(MX + 4, y + 2.2, Math.max(1, (90 * pct) / 100), 1.4, 0.7, 0.7, "F");
    y += 11;
    hair(doc, MX, y - 4, RX);
  }

  pied(doc);
  return sauvegarder(doc, `rapport-${opts.periode.replace(/[^0-9A-Za-z]+/g, "-")}.pdf`);
}

export function ligneVide(): LigneFacture {
  return { designation: "", quantite: 1, prix_unitaire: 0 };
}
