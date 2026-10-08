import { describe, it, expect } from "vitest";
import { pointsSoldeJournalier } from "./series";
import type { Compte, Transaction } from "../db/types";

const comptes: Compte[] = [
  { id: 1, nom: "Courant", type: "courant", solde_initial: 1000, date_creation: "2026-01-01", archive: 0 },
  { id: 2, nom: "Épargne", type: "epargne", solde_initial: 0, date_creation: "2026-01-01", archive: 0 },
];
let seq = 1;
const tx = (p: Partial<Transaction> & { type: Transaction["type"]; montant: number; date: string }): Transaction => ({
  id: seq++, description: null, compte_id: 1, compte_dest_id: null, categorie_id: null,
  created_at: "", a_confirmer: 0, auto_origine: null, pointee: 0, justificatif_path: null, ...p,
});

describe("pointsSoldeJournalier (cumul en un passage)", () => {
  const t = [
    tx({ type: "revenu", montant: 500, date: "2026-03-05", compte_id: 1 }),
    tx({ type: "depense", montant: 200, date: "2026-03-10", compte_id: 1 }),
    tx({ type: "virement", montant: 300, date: "2026-03-15", compte_id: 1, compte_dest_id: 2 }),
  ];

  it("solde global : cumul correct, virement neutre", () => {
    const pts = pointsSoldeJournalier(comptes, t, null, "2026-03");
    const at = (jour: number) => pts[jour - 1].solde;
    expect(at(4)).toBe(1000); // avant tout
    expect(at(5)).toBe(1500); // + revenu
    expect(at(10)).toBe(1300); // - dépense
    expect(at(31)).toBe(1300); // virement neutre au global
  });

  it("solde d'un compte : le virement sort du courant, entre sur l'épargne", () => {
    const courant = pointsSoldeJournalier(comptes, t, 1, "2026-03");
    const epargne = pointsSoldeJournalier(comptes, t, 2, "2026-03");
    expect(courant[30].solde).toBe(1000 + 500 - 200 - 300); // 1000
    expect(epargne[30].solde).toBe(300);
  });
});
