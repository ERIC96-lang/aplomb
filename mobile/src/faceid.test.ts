import { describe, expect, it } from "vitest";
import { derVersBrut, lireIndicateurs, verifierAssertion } from "./faceid";
import { versBase64Url } from "../../src/sync/crypto";

const RP = "eric96-lang.github.io";
const ORIGINE = "https://eric96-lang.github.io";

/** Format brut r‖s (WebCrypto) → DER (ce que renvoie un authentificateur WebAuthn). */
function brutVersDer(brut: Uint8Array): Uint8Array {
  const entier = (v: Uint8Array) => {
    let i = 0;
    while (i < v.length - 1 && v[i] === 0) i++;
    let t = v.subarray(i);
    if (t[0] & 0x80) t = Uint8Array.from([0, ...t]); // bit de signe
    return Uint8Array.from([0x02, t.length, ...t]);
  };
  const r = entier(brut.subarray(0, 32));
  const s = entier(brut.subarray(32));
  return Uint8Array.from([0x30, r.length + s.length, ...r, ...s]);
}

async function sha256(d: Uint8Array) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(d)));
}

/** Simule un authentificateur : produit une assertion signée. */
async function assertion(opts: { flags?: number; origine?: string; rp?: string; type?: string } = {}) {
  const paire = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", paire.publicKey));
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const authData = new Uint8Array(37);
  authData.set(await sha256(new TextEncoder().encode(opts.rp ?? RP)), 0);
  authData[32] = opts.flags ?? 0x05; // UP + UV
  const clientDataJSON = new TextEncoder().encode(
    JSON.stringify({ type: opts.type ?? "webauthn.get", challenge: versBase64Url(challenge), origin: opts.origine ?? ORIGINE })
  );
  const signe = new Uint8Array([...authData, ...(await sha256(clientDataJSON))]);
  const brut = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, paire.privateKey, signe));
  return { spki, authData, clientDataJSON, signature: brutVersDer(brut), challenge, origin: ORIGINE, rpId: RP };
}

describe("Face ID (WebAuthn)", () => {
  it("accepte une assertion valide (signature, défi, origine, UV)", async () => {
    expect(await verifierAssertion(await assertion())).toBe(true);
  });

  it("refuse sans vérification de l'utilisateur (Face ID non effectué)", async () => {
    expect(await verifierAssertion(await assertion({ flags: 0x01 }))).toBe(false);
  });

  it("refuse un défi rejoué", async () => {
    const a = await assertion();
    expect(await verifierAssertion({ ...a, challenge: crypto.getRandomValues(new Uint8Array(32)) })).toBe(false);
  });

  it("refuse une autre origine ou un autre site", async () => {
    expect(await verifierAssertion(await assertion({ origine: "https://pirate.example" }))).toBe(false);
    expect(await verifierAssertion(await assertion({ rp: "pirate.example" }))).toBe(false);
  });

  it("refuse une signature d'une autre clé ou altérée", async () => {
    const a = await assertion();
    const b = await assertion();
    expect(await verifierAssertion({ ...a, spki: b.spki })).toBe(false);
    const altere = new Uint8Array(a.authData);
    altere[36] ^= 1; // compteur modifié après signature
    expect(await verifierAssertion({ ...a, authData: altere })).toBe(false);
  });

  it("refuse un type de requête inattendu", async () => {
    expect(await verifierAssertion(await assertion({ type: "webauthn.create" }))).toBe(false);
  });

  it("lit les indicateurs UP/UV", () => {
    const d = new Uint8Array(37);
    d[32] = 0x05;
    expect(lireIndicateurs(d)).toEqual({ up: true, uv: true });
    d[32] = 0x01;
    expect(lireIndicateurs(d)).toEqual({ up: true, uv: false });
  });

  it("convertit une signature DER avec zéros de tête", () => {
    const brut = new Uint8Array(64);
    brut[0] = 0x80; // r avec bit de signe → 0x00 ajouté en DER
    brut[33] = 0x7f; // s commençant par un zéro → raccourci en DER
    expect(derVersBrut(brutVersDer(brut))).toEqual(brut);
  });
});
