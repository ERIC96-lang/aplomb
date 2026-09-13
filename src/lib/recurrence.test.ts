import { describe, it, expect } from "vitest";
import { detecterRecurrences } from "./recurrence";
import type { Echeance, Transaction, TxType } from "../db/types";

let seq = 1;
function tx(p: Partial<Transaction> & { type: TxType; montant: number; date: string }): Transaction {
  return {
    id: seq++, description: "Netflix", compte_id: 1, compte_dest_id: null,
    categorie_id: 5, created_at: "", a_confirmer: 0, auto_origine: null, ...p,
  };
}

describe("detecterRecurrences", () => {
  it("détecte une dépense récurrente sur 3 mois (catégorie, montant, jour proches)", () => {
    const t = [
      tx({ type: "depense", montant: 13.49, date: "2026-01-15" }),
      tx({ type: "depense", montant: 13.49, date: "2026-02-16" }),
      tx({ type: "depense", montant: 13.99, date: "2026-03-15" }),
    ];
    const c = detecterRecurrences(t, [], new Set());
    expect(c).toHaveLength(1);
    expect(c[0].nb_occurrences).toBe(3);
    expect(c[0].categorie_id).toBe(5);
  });

  it("ignore si moins de 3 mois distincts", () => {
    const t = [
      tx({ type: "depense", montant: 13.49, date: "2026-01-15" }),
      tx({ type: "depense", montant: 13.49, date: "2026-02-15" }),
    ];
    expect(detecterRecurrences(t, [], new Set())).toHaveLength(0);
  });

  it("exclut les transactions déjà liées à une échéance", () => {
    const t = [
      tx({ type: "depense", montant: 13.49, date: "2026-01-15" }),
      tx({ type: "depense", montant: 13.49, date: "2026-02-15" }),
      tx({ type: "depense", montant: 13.49, date: "2026-03-15" }),
    ];
    const echeances: Echeance[] = t.map((x, i) => ({
      id: i + 1, charge_fixe_id: 1, mois: x.date.slice(0, 7),
      statut: "payee_sans_justif", transaction_id: x.id, justificatif_path: null,
    }));
    expect(detecterRecurrences(t, echeances, new Set())).toHaveLength(0);
  });

  it("masque les signatures déjà traitées (ignorées/acceptées)", () => {
    const t = [
      tx({ type: "depense", montant: 13.49, date: "2026-01-15" }),
      tx({ type: "depense", montant: 13.49, date: "2026-02-15" }),
      tx({ type: "depense", montant: 13.49, date: "2026-03-15" }),
    ];
    const sig = detecterRecurrences(t, [], new Set())[0].signature;
    expect(detecterRecurrences(t, [], new Set([sig]))).toHaveLength(0);
  });
});
