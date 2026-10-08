import { describe, it, expect } from "vitest";
import { planDuMois } from "./planMois";
import type { Budget, Categorie, ChargeFixe, Transaction } from "../db/types";
import type { Profil } from "./profil";

const profil = (p: Partial<Profil> = {}): Profil => ({
  revenuMensuel: 2000, jourPaie: 1, comptePrincipalId: null, tauxEpargneCible: 15,
  configure: true, modeRevenu: "fixe", revenuBas: 0, revenuHaut: 0, ...p,
});

const charge = (p: Partial<ChargeFixe> & { montant_attendu: number; jour_echeance: number }): ChargeFixe => ({
  id: Math.random(), nom: "C", compte_id: 1, categorie_id: null, actif: 1, periodicite: "mensuelle", ...p,
});

const tx = (p: Partial<Transaction> & { type: Transaction["type"]; montant: number }): Transaction => ({
  id: Math.random(), date: "2026-06-10", description: null, compte_id: 1, compte_dest_id: null,
  categorie_id: null, created_at: "", a_confirmer: 0, auto_origine: null, pointee: 0, justificatif_path: null, ...p,
});

describe("planDuMois", () => {
  const today = new Date("2026-06-15T12:00:00");

  it("totalise les charges du mois et distingue celles à venir", () => {
    const charges = [
      charge({ montant_attendu: 800, jour_echeance: 5 }),  // déjà passée (le 05)
      charge({ montant_attendu: 40, jour_echeance: 20 }),  // à venir (le 20)
    ];
    const plan = planDuMois(
      { transactions: [], chargesFixes: charges, budgets: [], categories: [], profil: profil() },
      "2026-06", today
    );
    expect(plan.chargesMoisTotal).toBe(840);
    expect(plan.chargesMoisCount).toBe(2);
    expect(plan.chargesRestantesTotal).toBe(40);
    expect(plan.chargesRestantesCount).toBe(1);
    expect(plan.echeancesSemaine).toBe(1); // le 20 est dans les 7 jours après le 15
    expect(plan.revenuAttendu).toBe(2000);
    expect(plan.resteAvantVariable).toBe(1160); // 2000 - 840
  });

  it("compte les transactions à confirmer et les budgets en alerte", () => {
    const cats: Categorie[] = [{ id: 1, nom: "Courses", type: "depense", couleur: "#000" }];
    const budgets: Budget[] = [{ id: 1, categorie_id: 1, montant_plafond: 100 }];
    const txs = [
      tx({ type: "revenu", montant: 2000, a_confirmer: 1 }),
      tx({ type: "depense", montant: 150, categorie_id: 1, date: "2026-06-08" }), // dépasse le budget
    ];
    const plan = planDuMois(
      { transactions: txs, chargesFixes: [], budgets, categories: cats, profil: profil() },
      "2026-06", today
    );
    expect(plan.aConfirmer).toBe(1);
    expect(plan.budgetsAlerte).toBe(1);
    expect(plan.budgetsTotal).toBe(100);
  });
});
