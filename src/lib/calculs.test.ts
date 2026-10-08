import { describe, it, expect } from "vitest";
import {
  soldeCompte,
  soldeCompteAvecInitial,
  soldeGlobal,
  totauxMois,
  repartitionDepenses,
  moisDisponibles,
  variationPct,
} from "./calculs";
import type { Categorie, Compte, Transaction, TxType } from "../db/types";

let seq = 1;
function tx(p: Partial<Transaction> & { type: TxType; montant: number }): Transaction {
  return {
    id: seq++,
    date: "2026-03-10",
    description: null,
    compte_id: 1,
    compte_dest_id: null,
    categorie_id: null,
    created_at: "2026-03-10T00:00:00Z",
    a_confirmer: 0,
    auto_origine: null, pointee: 0, justificatif_path: null,
    ...p,
  };
}
const compte = (id: number, solde_initial = 0): Compte => ({
  id,
  nom: `C${id}`,
  type: "courant",
  solde_initial,
  date_creation: "2026-01-01",
  archive: 0,
});

describe("soldeCompte", () => {
  it("additionne revenus, soustrait dépenses sur le compte", () => {
    const t = [
      tx({ type: "revenu", montant: 1000, compte_id: 1 }),
      tx({ type: "depense", montant: 300, compte_id: 1 }),
      tx({ type: "depense", montant: 50, compte_id: 2 }), // autre compte
    ];
    expect(soldeCompte(1, t)).toBe(700);
    expect(soldeCompte(2, t)).toBe(-50);
  });

  it("traite le virement : sortant du source, entrant sur la destination", () => {
    const t = [tx({ type: "virement", montant: 200, compte_id: 1, compte_dest_id: 2 })];
    expect(soldeCompte(1, t)).toBe(-200);
    expect(soldeCompte(2, t)).toBe(200);
  });

  it("intègre le solde initial", () => {
    const t = [tx({ type: "depense", montant: 100, compte_id: 1 })];
    expect(soldeCompteAvecInitial(compte(1, 500), t)).toBe(400);
  });
});

describe("soldeGlobal", () => {
  it("un virement entre comptes est neutre sur le solde global", () => {
    const comptes = [compte(1, 1000), compte(2, 0)];
    const t = [tx({ type: "virement", montant: 300, compte_id: 1, compte_dest_id: 2 })];
    expect(soldeGlobal(comptes, t)).toBe(1000);
  });

  it("somme revenus/dépenses sur tous les comptes", () => {
    const comptes = [compte(1, 100), compte(2, 200)];
    const t = [
      tx({ type: "revenu", montant: 500, compte_id: 1 }),
      tx({ type: "depense", montant: 50, compte_id: 2 }),
    ];
    expect(soldeGlobal(comptes, t)).toBe(750);
  });
});

describe("totauxMois", () => {
  const t = [
    tx({ type: "revenu", montant: 2000, date: "2026-03-01", compte_id: 1 }),
    tx({ type: "depense", montant: 500, date: "2026-03-15", compte_id: 1 }),
    tx({ type: "virement", montant: 300, date: "2026-03-05", compte_id: 1, compte_dest_id: 2 }),
    tx({ type: "depense", montant: 999, date: "2026-02-20", compte_id: 1 }), // autre mois
  ];

  it("exclut totalement les virements des totaux", () => {
    const r = totauxMois(t, "2026-03");
    expect(r.revenus).toBe(2000);
    expect(r.depenses).toBe(500);
    expect(r.solde).toBe(1500);
  });

  it("filtre par mois", () => {
    expect(totauxMois(t, "2026-02").depenses).toBe(999);
  });

  it("filtre par compte", () => {
    const r = totauxMois(t, "2026-03", 2);
    expect(r.revenus).toBe(0);
    expect(r.depenses).toBe(0);
  });
});

describe("repartitionDepenses", () => {
  const cats: Categorie[] = [
    { id: 10, nom: "Alimentation", type: "depense", couleur: "#f00" },
    { id: 11, nom: "Transport", type: "depense", couleur: "#0f0" },
  ];
  it("agrège les dépenses par catégorie, triées décroissant, virements exclus", () => {
    const t = [
      tx({ type: "depense", montant: 100, date: "2026-03-01", categorie_id: 10 }),
      tx({ type: "depense", montant: 40, date: "2026-03-02", categorie_id: 10 }),
      tx({ type: "depense", montant: 60, date: "2026-03-03", categorie_id: 11 }),
      tx({ type: "virement", montant: 500, date: "2026-03-04", compte_id: 1, compte_dest_id: 2 }),
    ];
    const r = repartitionDepenses(t, cats, "2026-03");
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ categorie_id: 10, montant: 140 });
    expect(r[1]).toMatchObject({ categorie_id: 11, montant: 60 });
  });
});

describe("moisDisponibles", () => {
  it("renvoie les mois distincts triés du plus récent au plus ancien", () => {
    const t = [
      tx({ type: "depense", montant: 1, date: "2026-01-10" }),
      tx({ type: "depense", montant: 1, date: "2026-03-10" }),
      tx({ type: "depense", montant: 1, date: "2026-01-20" }),
    ];
    expect(moisDisponibles(t)).toEqual(["2026-03", "2026-01"]);
  });
});

describe("variationPct", () => {
  it("calcule une variation normale", () => {
    expect(variationPct(110, 100)).toBeCloseTo(10);
    expect(variationPct(50, -100)).toBeCloseTo(150);
  });
  it("ignore une base nulle ou un reliquat de virgule flottante", () => {
    expect(variationPct(1560, 0)).toBeNull();
    expect(variationPct(1560, 5.9e-8)).toBeNull();
    expect(variationPct(1560, -0.004)).toBeNull();
  });
  it("masque les variations sans signification (> 999 %)", () => {
    expect(variationPct(1560, 1)).toBeNull();
    expect(variationPct(Number.NaN, 10)).toBeNull();
  });
});
