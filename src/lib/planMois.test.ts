import { describe, it, expect } from "vitest";
import { planDuMois } from "./planMois";
import type { Budget, Categorie, ChargeFixe, Echeance, Transaction } from "../db/types";
import { projeterFinDeMois } from "./projection";
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

describe("charges réglées hors comptes (PayPal…)", () => {
  const today = new Date("2026-06-15T12:00:00");
  const loyer = charge({ id: 1, montant_attendu: 800, jour_echeance: 25 });
  const internet = charge({ id: 2, montant_attendu: 40, jour_echeance: 20 });
  const ech = (charge_fixe_id: number, statut: Echeance["statut"]): Echeance => ({
    id: charge_fixe_id, charge_fixe_id, mois: "2026-06", statut, transaction_id: null, justificatif_path: null,
  });

  it("plan du mois : la charge réglée ailleurs ne pèse plus sur les comptes", () => {
    const plan = planDuMois(
      { transactions: [], chargesFixes: [loyer, internet], budgets: [], categories: [], profil: profil(),
        echeances: [ech(1, "a_venir"), ech(2, "reglee_ailleurs")] },
      "2026-06", today
    );
    expect(plan.chargesMoisTotal).toBe(800);
    expect(plan.chargesRestantesTotal).toBe(800);
    expect(plan.echeancesSemaine).toBe(0); // internet (le 20) n'est plus à surveiller
    expect(plan.resteAvantVariable).toBe(1200);
  });

  it("plan du mois : une charge déjà payée n'est plus « restante » mais reste dans le total", () => {
    const plan = planDuMois(
      { transactions: [], chargesFixes: [loyer, internet], budgets: [], categories: [], profil: profil(),
        echeances: [ech(1, "payee_sans_justif"), ech(2, "a_venir")] },
      "2026-06", today
    );
    expect(plan.chargesMoisTotal).toBe(840);
    expect(plan.chargesRestantesTotal).toBe(40);
  });

  it("projection de fin de mois : la charge réglée ailleurs n'est plus déduite", () => {
    const compte = { id: 1, nom: "Courant", type: "courant" as const, solde_initial: 1000, date_creation: "2026-01-01", archive: 0 };
    const [p] = projeterFinDeMois([compte], [], [loyer, internet], [ech(1, "a_venir"), ech(2, "reglee_ailleurs")], "2026-06");
    expect(p.chargesRestantes).toBe(800);
    expect(p.soldeProjete).toBe(200);
  });
});
