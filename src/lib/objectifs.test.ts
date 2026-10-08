import { describe, it, expect } from "vitest";
import { montantActuelObjectif, objectifLieCompte, projectionAtteinte, rythmeMensuelObjectif } from "./objectifs";
import type { Compte, Objectif, Transaction } from "../db/types";

const compte = (id: number, solde_initial = 0): Compte => ({
  id, nom: `C${id}`, type: "epargne", solde_initial, date_creation: "2026-01-01", archive: 0,
});

const tx = (p: Partial<Transaction> & { type: Transaction["type"]; montant: number }): Transaction => ({
  id: Math.random(), date: "2026-01-10", description: null, compte_id: 1, compte_dest_id: null,
  categorie_id: null, created_at: "", a_confirmer: 0, auto_origine: null, pointee: 0, justificatif_path: null, ...p,
});

const obj = (p: Partial<Objectif> = {}): Objectif => ({
  id: 1, nom: "Objectif", montant_cible: 5000, montant_actuel: 1200, date_cible: null,
  couleur: "#000", cree_le: "", compte_id: null, ...p,
});

describe("montantActuelObjectif", () => {
  it("renvoie le montant saisi pour un objectif manuel", () => {
    expect(montantActuelObjectif(obj(), [], [])).toBe(1200);
  });

  it("calcule le solde du compte lié (initial + mouvements)", () => {
    const comptes = [compte(1, 500)];
    const txs = [
      tx({ type: "revenu", montant: 300, compte_id: 1 }),
      tx({ type: "depense", montant: 50, compte_id: 1 }),
    ];
    // 500 + 300 - 50 = 750
    expect(montantActuelObjectif(obj({ compte_id: 1 }), comptes, txs)).toBe(750);
  });

  it("ne descend jamais sous zéro", () => {
    const comptes = [compte(1, 0)];
    const txs = [tx({ type: "depense", montant: 200, compte_id: 1 })];
    expect(montantActuelObjectif(obj({ compte_id: 1 }), comptes, txs)).toBe(0);
  });

  it("se replie sur la valeur stockée si le compte lié n'existe plus", () => {
    expect(montantActuelObjectif(obj({ compte_id: 99, montant_actuel: 42 }), [compte(1)], [])).toBe(42);
  });

  it("objectifLieCompte vrai seulement si le compte existe", () => {
    expect(objectifLieCompte(obj({ compte_id: 1 }), [compte(1)])).toBe(true);
    expect(objectifLieCompte(obj({ compte_id: 99 }), [compte(1)])).toBe(false);
    expect(objectifLieCompte(obj({ compte_id: null }), [compte(1)])).toBe(false);
  });
});

describe("projectionAtteinte (ne doit jamais planter — cause de l'écran blanc)", () => {
  const base = new Date("2026-01-15T12:00:00");

  it("objectif atteint", () => {
    expect(projectionAtteinte(0, 100, true, base)).toMatch(/atteint/i);
  });

  it("rythme nul ou négatif → message d'estimation, pas de crash", () => {
    expect(projectionAtteinte(1000, 0, false, base)).toMatch(/insuffisant/i);
    expect(projectionAtteinte(1000, -50, false, base)).toMatch(/insuffisant/i);
  });

  it("épargne NaN → message, pas de crash (NaN <= 0 est faux !)", () => {
    expect(() => projectionAtteinte(1000, NaN, false, base)).not.toThrow();
    expect(projectionAtteinte(1000, NaN, false, base)).toMatch(/insuffisant/i);
  });

  it("rythme infime → date hors plage évitée, pas de RangeError", () => {
    expect(() => projectionAtteinte(5000, 0.0001, false, base)).not.toThrow();
    expect(projectionAtteinte(5000, 0.0001, false, base)).toMatch(/100 ans/);
  });

  it("cas normal → renvoie une date lisible", () => {
    const s = projectionAtteinte(1200, 400, false, base); // 3 mois
    expect(s).toMatch(/~3 mois/);
  });
});

describe("objectifs alimentés par les versements", () => {
  const comptes = [compte(1, 0), compte(3, 2000)]; // 3 = compte épargne déjà garni
  const vers = (montant: number, date: string, p: Partial<Transaction> = {}) =>
    tx({ type: "virement", montant, date, compte_id: 1, compte_dest_id: 3, ...p });
  const o = (p: Partial<Objectif> = {}) =>
    obj({ id: 1, compte_id: 3, mode_suivi: "versements", montant_actuel: 0, cree_le: "2026-09-12T10:00:00Z", ...p });

  it("compte les virements vers le compte depuis la création, pas l'argent déjà présent", () => {
    const txs = [vers(500, "2026-08-01"), vers(150, "2026-10-08")];
    expect(montantActuelObjectif(o(), comptes, txs)).toBe(150);
  });

  it("ajoute le montant de départ et déduit les retraits", () => {
    const txs = [vers(150, "2026-10-08"), tx({ type: "virement", montant: 40, date: "2026-10-09", compte_id: 3, compte_dest_id: 1 })];
    expect(montantActuelObjectif(o({ montant_actuel: 100 }), comptes, txs)).toBe(210);
  });

  it("compte partagé : chaque objectif ne reçoit que ses virements ; les non affectés vont au plus ancien", () => {
    const a = o({ id: 1, cree_le: "2026-09-01T00:00:00Z" });
    const b = o({ id: 2, cree_le: "2026-09-20T00:00:00Z" });
    const tous = [a, b];
    const txs = [vers(100, "2026-10-01"), vers(60, "2026-10-02", { objectif_id: 2 }), vers(30, "2026-10-03", { objectif_id: 1 })];
    expect(montantActuelObjectif(a, comptes, txs, tous)).toBe(130); // 100 non affecté + 30 affecté
    expect(montantActuelObjectif(b, comptes, txs, tous)).toBe(60);
  });

  it("garde l'ancien comportement (solde) pour un objectif lié sans mode explicite", () => {
    expect(montantActuelObjectif(obj({ compte_id: 3, montant_actuel: 0 }), comptes, [vers(150, "2026-10-08")])).toBe(2150);
  });

  it("rythme mensuel réel des versements", () => {
    const txs = [vers(150, "2026-10-08")];
    const r = rythmeMensuelObjectif(o(), txs, [], new Date("2026-10-12T00:00:00Z"));
    expect(r).toBeGreaterThan(140); // ~150 sur ~30 jours
    expect(r).toBeLessThan(160);
    expect(rythmeMensuelObjectif(obj(), txs)).toBeNull(); // manuel
  });
});
