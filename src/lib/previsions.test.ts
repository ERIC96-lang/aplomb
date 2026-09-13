import { describe, it, expect } from "vitest";
import { estimerRevenus, calculerPrevisions } from "./previsions";
import type { Compte, Transaction } from "../db/types";
import type { Profil } from "./profil";

const profilBase: Profil = {
  revenuMensuel: 2600, jourPaie: 1, comptePrincipalId: 1, tauxEpargneCible: 15,
  configure: true, modeRevenu: "fixe", revenuBas: 0, revenuHaut: 0,
};

describe("estimerRevenus", () => {
  it("mode fixe : bas = attendu = haut = revenu du profil", () => {
    const e = estimerRevenus([], profilBase);
    expect(e).toEqual({ bas: 2600, attendu: 2600, haut: 2600 });
  });
  it("mode fourchette : reprend bas/haut du profil", () => {
    const e = estimerRevenus([], { ...profilBase, modeRevenu: "fourchette", revenuBas: 2200, revenuHaut: 3000 });
    expect(e).toEqual({ bas: 2200, attendu: 2600, haut: 3000 });
  });
});

describe("calculerPrevisions", () => {
  const comptes: Compte[] = [
    { id: 1, nom: "Courant", type: "courant", solde_initial: 1000, date_creation: "2026-01-01", archive: 0 },
  ];
  it("projette l'horizon demandé, reste à vivre = revenus - charges - variables", () => {
    const tx: Transaction[] = [];
    const p = calculerPrevisions(comptes, tx, [], [], 2000, 6);
    expect(p.mois).toHaveLength(6);
    // pas de charges ni d'historique -> variables = 0, reste = revenus
    expect(p.mois[0].revenus).toBe(2000);
    expect(p.mois[0].charges).toBe(0);
    expect(p.mois[0].resteAVivre).toBe(2000);
    // solde projeté cumulatif : commence au solde global + reste
    expect(p.mois[0].soldeProjete).toBe(1000 + 2000);
    expect(p.mois[1].soldeProjete).toBe(1000 + 4000);
  });
});
