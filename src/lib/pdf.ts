import { jsPDF } from "jspdf";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
import { formatDate, formatMontant } from "./format";
import type { FactureData, LigneFacture, Transaction } from "../db/types";

const ACCENT: [number, number, number] = [109, 107, 245];
const TEXTE: [number, number, number] = [30, 34, 51];
const GRIS: [number, number, number] = [130, 140, 160];

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

function enTete(doc: jsPDF, titre: string, sousTitre: string) {
  doc.setFillColor(...ACCENT);
  doc.rect(0, 0, 210, 6, "F");
  doc.setTextColor(...TEXTE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.text(titre, 20, 28);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...GRIS);
  doc.text(sousTitre, 20, 36);
}

function tampon(doc: jsPDF, texte: string, x: number, y: number) {
  doc.setDrawColor(52, 199, 123);
  doc.setTextColor(52, 199, 123);
  doc.setLineWidth(1.2);
  doc.roundedRect(x, y, 46, 16, 3, 3, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(texte, x + 23, y + 11, { align: "center" });
}

/** Reçu / quittance de paiement à partir d'une transaction. */
export async function genererRecuTransaction(
  tx: Transaction,
  compteNom: string,
  categorieNom: string | null
): Promise<boolean> {
  const doc = new jsPDF();
  const numero = `RECU-${tx.id.toString().padStart(5, "0")}`;
  enTete(doc, "REÇU", `N° ${numero}  ·  ${formatDate(tx.date)}`);

  // Encadré détails
  doc.setDrawColor(225, 228, 235);
  doc.setLineWidth(0.4);
  doc.roundedRect(20, 50, 170, 82, 3, 3, "S");

  const lignes: [string, string][] = [
    ["Type", tx.type === "revenu" ? "Revenu" : tx.type === "depense" ? "Dépense" : "Virement"],
    ["Montant", formatMontant(tx.montant)],
    ["Date", formatDate(tx.date)],
    ["Compte", compteNom],
    ["Catégorie", categorieNom ?? "—"],
    ["Description", tx.description ?? "—"],
  ];
  let y = 62;
  for (const [k, v] of lignes) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...GRIS);
    doc.text(k.toUpperCase(), 28, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...TEXTE);
    doc.text(String(v), 80, y);
    y += 12;
  }

  tampon(doc, "PAYÉ", 132, 150);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRIS);
  doc.text("Document généré par Budget Perso — usage personnel.", 20, 285);

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
  enTete(doc, estRecu ? "REÇU" : "FACTURE", `N° ${data.numero}  ·  ${formatDate(data.date)}`);

  // Émetteur (droite)
  doc.setFontSize(10);
  doc.setTextColor(...TEXTE);
  doc.setFont("helvetica", "bold");
  doc.text(data.emetteur_nom || "—", 190, 24, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRIS);
  doc.setFontSize(9);
  splitLignes(doc, data.emetteur_infos, 190, 30, 4.5, "right");

  // Client
  doc.setTextColor(...GRIS);
  doc.setFontSize(9);
  doc.text("FACTURÉ À", 20, 56);
  doc.setTextColor(...TEXTE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(data.client_nom || "—", 20, 63);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRIS);
  splitLignes(doc, data.client_infos, 20, 69, 4.5, "left");

  // Tableau des lignes
  let y = 92;
  doc.setFillColor(245, 247, 252);
  doc.rect(20, y - 6, 170, 9, "F");
  doc.setTextColor(...GRIS);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("DÉSIGNATION", 24, y);
  doc.text("QTÉ", 120, y, { align: "right" });
  doc.text("P.U.", 150, y, { align: "right" });
  doc.text("TOTAL", 186, y, { align: "right" });
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...TEXTE);
  doc.setFontSize(10);
  for (const l of data.lignes) {
    const totalLigne = l.quantite * l.prix_unitaire;
    doc.text(l.designation || "—", 24, y, { maxWidth: 90 });
    doc.text(String(l.quantite), 120, y, { align: "right" });
    doc.text(formatMontant(l.prix_unitaire), 150, y, { align: "right" });
    doc.text(formatMontant(totalLigne), 186, y, { align: "right" });
    y += 8;
    doc.setDrawColor(235, 238, 244);
    doc.line(20, y - 3, 190, y - 3);
  }

  // Totaux
  const t = totaux(data);
  y += 6;
  const droite = (label: string, val: string, gras = false) => {
    doc.setFont("helvetica", gras ? "bold" : "normal");
    doc.setFontSize(gras ? 12 : 10);
    doc.setTextColor(...(gras ? TEXTE : GRIS));
    doc.text(label, 140, y, { align: "right" });
    doc.setTextColor(...TEXTE);
    doc.text(val, 186, y, { align: "right" });
    y += gras ? 9 : 7;
  };
  droite("Total HT", formatMontant(t.ht));
  droite(`TVA (${data.tva_taux} %)`, formatMontant(t.tva));
  droite("Total TTC", formatMontant(t.ttc), true);

  if (data.paye) tampon(doc, "PAYÉ", 24, y - 4);

  // Notes + pied
  if (data.notes) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...GRIS);
    doc.text("Notes :", 20, 250);
    splitLignes(doc, data.notes, 20, 256, 4.5, "left");
  }
  doc.setFontSize(9);
  doc.setTextColor(...GRIS);
  doc.text("Document généré par Budget Perso.", 20, 285);

  return sauvegarder(doc, `${data.numero || "facture"}.pdf`);
}

function splitLignes(
  doc: jsPDF,
  texte: string,
  x: number,
  y: number,
  interligne: number,
  align: "left" | "right"
) {
  const lignes = (texte || "").split("\n");
  lignes.forEach((l, i) => doc.text(l, x, y + i * interligne, { align }));
}

export function ligneVide(): LigneFacture {
  return { designation: "", quantite: 1, prix_unitaire: 0 };
}
