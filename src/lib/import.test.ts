import { describe, it, expect } from "vitest";
import {
  detecterDelimiteur,
  parseCSV,
  parseMontant,
  parseDate,
  parseOFX,
  estDoublon,
} from "./import";
import type { Transaction } from "../db/types";

describe("parseMontant", () => {
  it("gère les formats FR et US et les espaces", () => {
    expect(parseMontant("1 234,56")).toBeCloseTo(1234.56);
    expect(parseMontant("1,234.56")).toBeCloseTo(1234.56);
    expect(parseMontant("-12,30")).toBeCloseTo(-12.3);
    expect(parseMontant("42")).toBe(42);
    expect(parseMontant("12.5 €")).toBeCloseTo(12.5);
  });
  it("gère les parenthèses comme négatif", () => {
    expect(parseMontant("(50,00)")).toBeCloseTo(-50);
  });
  it("renvoie null si invalide", () => {
    expect(parseMontant("abc")).toBeNull();
    expect(parseMontant("")).toBeNull();
  });
});

describe("parseDate", () => {
  it("ISO", () => expect(parseDate("2026-03-07")).toBe("2026-03-07"));
  it("FR JJ/MM/AAAA", () => expect(parseDate("07/03/2026", "fr")).toBe("2026-03-07"));
  it("US MM/JJ/AAAA", () => expect(parseDate("03/07/2026", "us")).toBe("2026-03-07"));
  it("année sur 2 chiffres", () => expect(parseDate("07/03/26", "fr")).toBe("2026-03-07"));
  it("null si non reconnu", () => expect(parseDate("bonjour")).toBeNull());
});

describe("parseCSV", () => {
  it("détecte le délimiteur ;", () => {
    expect(detecterDelimiteur("a;b;c\n1;2;3")).toBe(";");
  });
  it("parse en respectant les guillemets", () => {
    const rows = parseCSV('date;lib;montant\n2026-03-01;"Courses; Carrefour";-40,00', ";");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual(["2026-03-01", "Courses; Carrefour", "-40,00"]);
  });
  it("ignore les lignes vides", () => {
    expect(parseCSV("a;b\n\n1;2\n", ";")).toHaveLength(2);
  });
});

describe("parseOFX", () => {
  it("extrait les STMTTRN", () => {
    const ofx = `<OFX><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260307120000<TRNAMT>-25.50<NAME>SNCF</STMTTRN>
    <STMTTRN><DTPOSTED>20260308<TRNAMT>1500.00<MEMO>SALAIRE</STMTTRN></OFX>`;
    const l = parseOFX(ofx);
    expect(l).toHaveLength(2);
    expect(l[0]).toMatchObject({ date: "2026-03-07", montant: -25.5, description: "SNCF" });
    expect(l[1]).toMatchObject({ date: "2026-03-08", montant: 1500, description: "SALAIRE" });
  });
});

describe("estDoublon", () => {
  const existantes: Transaction[] = [
    {
      id: 1, type: "depense", montant: 40, date: "2026-03-01", description: "Courses",
      compte_id: 1, compte_dest_id: null, categorie_id: null, created_at: "", a_confirmer: 0, auto_origine: null, pointee: 0, justificatif_path: null,
    },
  ];
  it("détecte un doublon identique (compte/date/montant/desc)", () => {
    expect(estDoublon(existantes, 1, "2026-03-01", 40, "courses")).toBe(true);
  });
  it("pas un doublon si compte ou montant diffère", () => {
    expect(estDoublon(existantes, 2, "2026-03-01", 40, "Courses")).toBe(false);
    expect(estDoublon(existantes, 1, "2026-03-01", 41, "Courses")).toBe(false);
  });
});
