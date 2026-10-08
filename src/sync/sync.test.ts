import { describe, expect, it } from "vitest";
import {
  chiffrer,
  codeAppairage,
  deballer,
  dechiffrer,
  emballer,
  empreinte,
  genererCleBrute,
  importerCle,
  lireCodeAppairage,
} from "./crypto";
import { saisiesEnAttente, transactionsFusionnees } from "./fusion";
import {
  instantaneValide,
  origineSaisie,
  saisieValide,
  uuidDepuisOrigine,
  type Instantane,
  type SaisieMobile,
} from "./protocole";
import type { Transaction } from "../db/types";

const UUID_A = "11111111-2222-4333-8444-555555555555";
const UUID_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function saisie(uuid: string, date = "2026-10-05", montant = 12.5): SaisieMobile {
  return {
    v: 1,
    uuid,
    cree_le: `${date}T10:00:00.000Z`,
    type: "depense",
    montant,
    date,
    description: "Boulangerie",
    compte_id: 1,
    categorie_id: 3,
    photo: null,
  };
}

function tx(id: number, date: string, auto_origine: string | null = null): Transaction {
  return {
    id,
    type: "depense",
    montant: 10,
    date,
    description: "x",
    compte_id: 1,
    compte_dest_id: null,
    categorie_id: null,
    created_at: `${date}T08:00:00.000Z`,
    a_confirmer: 0,
    auto_origine,
    pointee: 0,
    justificatif_path: null,
  };
}

function instantane(transactions: Transaction[], integrees: string[] = []): Instantane {
  return {
    v: 1,
    genere_le: "2026-10-06T00:00:00.000Z",
    devise: "TND",
    profil: {
      revenuMensuel: 0,
      jourPaie: 1,
      comptePrincipalId: 1,
      tauxEpargneCible: 15,
      configure: true,
      modeRevenu: "fixe",
      revenuBas: 0,
      revenuHaut: 0,
    },
    comptes: [],
    categories: [],
    transactions,
    charges: [],
    budgets: [],
    objectifs: [],
    regles: [],
    saisies_integrees: integrees,
  };
}

describe("chiffrement de synchronisation", () => {
  it("aller-retour objet → fichier → objet", async () => {
    const cle = await importerCle(genererCleBrute());
    const obj = { a: 1, texte: "Épargne 1 200,00 TND", liste: [1, 2, 3] };
    const blob = await emballer(cle, obj);
    expect(Array.from(blob.subarray(0, 4))).toEqual([0x42, 0x50, 0x53, 0x31]); // "BPS1"
    expect(await deballer(cle, blob)).toEqual(obj);
  });

  it("refuse un fichier chiffré avec une autre clé", async () => {
    const k1 = await importerCle(genererCleBrute());
    const k2 = await importerCle(genererCleBrute());
    const blob = await chiffrer(k1, new TextEncoder().encode("secret"));
    await expect(dechiffrer(k2, blob)).rejects.toThrow(/autre clé/);
  });

  it("détecte une altération du fichier (intégrité GCM)", async () => {
    const cle = await importerCle(genererCleBrute());
    const blob = await chiffrer(cle, new TextEncoder().encode("secret"));
    blob[blob.length - 1] ^= 0xff;
    await expect(dechiffrer(cle, blob)).rejects.toThrow();
  });

  it("refuse un fichier qui n'est pas au format", async () => {
    const cle = await importerCle(genererCleBrute());
    await expect(dechiffrer(cle, new TextEncoder().encode("pas un fichier bpsync"))).rejects.toThrow(
      /non reconnu/
    );
  });

  it("deux chiffrements du même contenu diffèrent (IV aléatoire)", async () => {
    const cle = await importerCle(genererCleBrute());
    const d = new TextEncoder().encode("même contenu");
    const a = await chiffrer(cle, d);
    const b = await chiffrer(cle, d);
    expect(a).not.toEqual(b);
  });
});

describe("appairage", () => {
  it("code d'appairage : aller-retour et empreinte identique", async () => {
    const brute = genererCleBrute();
    const code = codeAppairage(brute);
    expect(code.startsWith("bpsync1:")).toBe(true);
    const relue = lireCodeAppairage(`  ${code}\n`);
    expect(relue).toEqual(brute);
    expect(await empreinte(relue!)).toBe(await empreinte(brute));
    expect(await empreinte(brute)).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/);
  });

  it("rejette les codes invalides", () => {
    expect(lireCodeAppairage("bonjour")).toBeNull();
    expect(lireCodeAppairage("bpsync1:abc")).toBeNull(); // mauvaise longueur
    expect(lireCodeAppairage("")).toBeNull();
  });

  it("une clé importée depuis le code déchiffre ce que le PC a chiffré", async () => {
    const brute = genererCleBrute();
    const cotePc = await importerCle(brute, true);
    const coteTel = await importerCle(lireCodeAppairage(codeAppairage(brute))!);
    const blob = await emballer(cotePc, { ok: true });
    expect(await deballer(coteTel, blob)).toEqual({ ok: true });
  });
});

describe("protocole", () => {
  it("origine ⇄ uuid", () => {
    expect(uuidDepuisOrigine(origineSaisie(UUID_A))).toBe(UUID_A);
    expect(uuidDepuisOrigine("charge:12")).toBeNull();
    expect(uuidDepuisOrigine(null)).toBeNull();
  });

  it("valide les saisies", () => {
    expect(saisieValide(saisie(UUID_A))).toBe(true);
    expect(saisieValide({ ...saisie(UUID_A), montant: -5 })).toBe(false);
    expect(saisieValide({ ...saisie(UUID_A), montant: Number.NaN })).toBe(false);
    expect(saisieValide({ ...saisie(UUID_A), uuid: "../../etc" })).toBe(false);
    expect(saisieValide({ ...saisie(UUID_A), date: "05/10/2026" })).toBe(false);
    expect(saisieValide(null)).toBe(false);
  });

  it("valide l'instantané", () => {
    expect(instantaneValide(instantane([]))).toBe(true);
    expect(instantaneValide({ v: 2 })).toBe(false);
  });
});

describe("fusion des saisies en attente", () => {
  it("écarte les saisies déjà intégrées (accusé ou transaction présente)", () => {
    const inst = instantane([tx(7, "2026-10-04", origineSaisie(UUID_B))], [UUID_A]);
    const attente = saisiesEnAttente([saisie(UUID_A), saisie(UUID_B), saisie("cccccccc-dddd-4eee-8fff-000000000000")], inst);
    expect(attente.map((s) => s.uuid)).toEqual(["cccccccc-dddd-4eee-8fff-000000000000"]);
  });

  it("sans instantané, tout est en attente", () => {
    expect(saisiesEnAttente([saisie(UUID_A)], null)).toHaveLength(1);
  });

  it("fusionne avec ids provisoires négatifs, triées par date décroissante", () => {
    const inst = instantane([tx(1, "2026-10-01"), tx(2, "2026-10-08")]);
    const liste = transactionsFusionnees(inst, [saisie(UUID_A, "2026-10-05")]);
    expect(liste.map((t) => t.date)).toEqual(["2026-10-08", "2026-10-05", "2026-10-01"]);
    const provisoire = liste[1];
    expect(provisoire.id).toBeLessThan(0);
    expect(provisoire.auto_origine).toBe(origineSaisie(UUID_A));
  });
});
