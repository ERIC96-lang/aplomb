import { describe, it, expect } from "vitest";
import { statutsBudgets } from "./budgets";
import type { Budget, Categorie, Transaction, TxType } from "../db/types";

let seq = 1;
const tx = (montant: number, categorie_id: number, date = "2026-03-10", type: TxType = "depense"): Transaction => ({
  id: seq++, type, montant, date, description: null, compte_id: 1, compte_dest_id: null,
  categorie_id, created_at: "", a_confirmer: 0, auto_origine: null,
});
const cats: Categorie[] = [
  { id: 1, nom: "Alimentation", type: "depense", couleur: "#f00" },
  { id: 2, nom: "Loisirs", type: "depense", couleur: "#0f0" },
  { id: 3, nom: "Transport", type: "depense", couleur: "#00f" },
];
const budgets: Budget[] = [
  { id: 1, categorie_id: 1, montant_plafond: 100 },
  { id: 2, categorie_id: 2, montant_plafond: 100 },
  { id: 3, categorie_id: 3, montant_plafond: 100 },
];

describe("statutsBudgets", () => {
  it("classe ok / attention (>=80%) / dépassé (>=100%)", () => {
    const t = [
      tx(50, 1), // ok
      tx(85, 2), // attention
      tx(120, 3), // dépassé
    ];
    const s = statutsBudgets(budgets, cats, t, "2026-03");
    const parCat = new Map(s.map((x) => [x.categorie_id, x]));
    expect(parCat.get(1)!.etat).toBe("ok");
    expect(parCat.get(2)!.etat).toBe("attention");
    expect(parCat.get(3)!.etat).toBe("depasse");
    expect(parCat.get(3)!.reste).toBe(-20);
  });

  it("ne compte que les dépenses du mois concerné", () => {
    const t = [tx(200, 1, "2026-02-10")];
    expect(statutsBudgets(budgets, cats, t, "2026-03").find((x) => x.categorie_id === 1)!.depense).toBe(0);
  });

  it("trie par ratio décroissant", () => {
    const t = [tx(30, 1), tx(90, 2), tx(60, 3)];
    const s = statutsBudgets(budgets, cats, t, "2026-03");
    expect(s[0].categorie_id).toBe(2);
  });
});
