import { describe, it, expect } from "vitest";
import { genererInsights, type DonneesInsights } from "./insights";
import type { Categorie, Compte, Transaction, TxType } from "../db/types";

let seq = 1;
const tx = (montant: number, categorie_id: number, date: string, p: Partial<Transaction> = {}): Transaction => ({
  id: seq++, type: "depense" as TxType, montant, date, description: null, compte_id: 1,
  compte_dest_id: null, categorie_id, created_at: "", a_confirmer: 0, auto_origine: null, pointee: 0, justificatif_path: null, ...p,
});
const cats: Categorie[] = [
  { id: 1, nom: "Alimentation", type: "depense", couleur: "#f00" },
  { id: 2, nom: "Transport", type: "depense", couleur: "#0f0" },
];
const comptes: Compte[] = [
  { id: 1, nom: "Courant", type: "courant", solde_initial: 5000, date_creation: "2025-01-01", archive: 0 },
];

function donnees(transactions: Transaction[], budgets: DonneesInsights["budgets"] = []): DonneesInsights {
  return { comptes, transactions, categories: cats, chargesFixes: [], echeances: [], budgets, objectifs: [], suggestions: [] };
}

describe("genererInsights", () => {
  it("détecte une hausse de catégorie et un budget dépassé", () => {
    const t = [
      tx(100, 1, "2025-12-10"),
      tx(100, 1, "2026-01-10"),
      tx(100, 1, "2026-02-10"),
      tx(200, 1, "2026-03-10"),
    ];
    const ins = genererInsights(donnees(t, [{ id: 1, categorie_id: 1, montant_plafond: 100 }]), "2026-03");
    expect(ins.some((i) => i.id === "hausse-cat-1")).toBe(true);
    expect(ins.some((i) => i.id === "budgets-depasses" && i.niveau === "alerte")).toBe(true);
  });

  it("détecte un doublon (même compte, date, montant)", () => {
    const t = [
      tx(30, 2, "2026-03-05"),
      tx(30, 2, "2026-03-05"),
    ];
    const ins = genererInsights(donnees(t), "2026-03");
    expect(ins.some((i) => i.id.startsWith("doublon-"))).toBe(true);
  });

  it("détecte la hausse d'un prélèvement récurrent (même libellé)", () => {
    const t = [
      tx(10.99, 1, "2026-01-15", { description: "Netflix" }),
      tx(10.99, 1, "2026-02-15", { description: "Netflix" }),
      tx(13.49, 1, "2026-03-15", { description: "Netflix" }),
    ];
    const ins = genererInsights(donnees(t), "2026-03");
    expect(ins.some((i) => i.id.startsWith("hausse-abo-"))).toBe(true);
  });

  it("rien à signaler => liste vide", () => {
    expect(genererInsights(donnees([]), "2026-03")).toEqual([]);
  });
});
