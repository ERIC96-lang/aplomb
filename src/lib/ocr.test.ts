import { describe, it, expect } from "vitest";
import { parseRecu } from "./ocr";

describe("parseRecu", () => {
  it("extrait le total, la date et le marchand d'un ticket type", () => {
    const t = [
      "CARREFOUR MARKET",
      "12 RUE DE PARIS",
      "Baguette        1,10",
      "Lait            0,95",
      "SOUS-TOTAL      2,05",
      "TOTAL           2,05 EUR",
      "CB              2,05",
      "15/06/2026 14:32",
    ].join("\n");
    const r = parseRecu(t);
    expect(r.montant).toBe(2.05);
    expect(r.date).toBe("2026-06-15");
    expect(r.description).toBe("CARREFOUR MARKET");
  });

  it("privilégie la ligne TOTAL même si une ligne article est plus grande n'existe pas", () => {
    const t = "MONOPRIX\nArticle A 3,50\nArticle B 12,00\nTOTAL 15,50\n03.01.26";
    const r = parseRecu(t);
    expect(r.montant).toBe(15.5);
    expect(r.date).toBe("2026-01-03");
  });

  it("gère l'absence de total en prenant le plus gros montant", () => {
    const t = "BOULANGERIE\nPain 1,20\nCafe 2,80";
    const r = parseRecu(t);
    expect(r.montant).toBe(2.8);
  });

  it("tolère une espace après le séparateur décimal (OCR: « 10, 70 »)", () => {
    const t = "SUPER U\nCafe 4, 20\nTOTAL 10, 70 EUR\nLe 21/09/2026";
    const r = parseRecu(t);
    expect(r.montant).toBe(10.7);
    expect(r.date).toBe("2026-09-21");
  });

  it("renvoie null proprement si rien n'est reconnu", () => {
    const r = parseRecu("");
    expect(r.montant).toBeNull();
    expect(r.date).toBeNull();
    expect(r.description).toBeNull();
  });
});
