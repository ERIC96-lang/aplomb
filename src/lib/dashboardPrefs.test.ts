import { describe, it, expect } from "vitest";
import { normaliser, SECTIONS } from "./dashboardPrefs";

const TOUTES = SECTIONS.map((s) => s.id);

describe("normaliser (préférences dashboard)", () => {
  it("renvoie l'ordre complet par défaut quand rien n'est stocké", () => {
    expect(normaliser(null).ordre).toEqual(TOUTES);
    expect(normaliser(null).masquees).toEqual([]);
  });

  it("préserve l'ordre stocké et ajoute les nouvelles sections à la fin", () => {
    const p = normaliser({ ordre: ["projection", "stats"] });
    expect(p.ordre[0]).toBe("projection");
    expect(p.ordre[1]).toBe("stats");
    // toutes les sections présentes, sans doublon
    expect(new Set(p.ordre)).toEqual(new Set(TOUTES));
    expect(p.ordre.length).toBe(TOUTES.length);
  });

  it("ignore les ids inconnus dans l'ordre et les masquées", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = normaliser({ ordre: ["stats", "zzz" as any], masquees: ["flux", "www" as any] });
    expect(p.ordre).not.toContain("zzz");
    expect(p.masquees).toEqual(["flux"]);
    expect(p.ordre.length).toBe(TOUTES.length);
  });
});
