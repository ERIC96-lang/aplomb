// Déverrouillage par Face ID (ou Touch ID) via WebAuthn.
//
// Sur iPhone, une app web installée accède à la biométrie par le même mécanisme
// que les clés d'accès (« passkeys ») : on crée une fois un identifiant lié à
// l'appareil, puis chaque déverrouillage demande à iOS une signature qui n'est
// produite qu'après Face ID. On vérifie localement cette signature avec la clé
// publique enregistrée, le défi, l'origine et l'indicateur « utilisateur vérifié ».

import { depuisBase64, depuisBase64Url, octets, versBase64, versBase64Url } from "../../src/sync/crypto";

/** Identifiant Face ID enregistré sur ce téléphone. */
export interface CleFaceId {
  id: string; // identifiant de l'authentifiant (base64url)
  spki: string | null; // clé publique (base64, SPKI) — null si le navigateur ne la fournit pas
}

export async function faceIdDisponible(): Promise<boolean> {
  try {
    return (
      typeof PublicKeyCredential !== "undefined" &&
      (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
    );
  } catch {
    return false;
  }
}

function hasard(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n));
}

/**
 * Enregistre Face ID pour l'app. À appeler directement depuis un toucher :
 * iOS exige un geste de l'utilisateur, donc aucun `await` avant la demande.
 */
export async function enregistrerFaceId(): Promise<CleFaceId> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      rp: { id: location.hostname, name: "Aplomb" },
      user: { id: hasard(16), name: "Aplomb", displayName: "Aplomb — verrouillage" },
      challenge: hasard(32),
      pubKeyCredParams: [{ type: "public-key", alg: -7 }], // ES256 (P-256)
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "discouraged",
      },
      attestation: "none",
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("Face ID n'a pas pu être activé.");
  const reponse = cred.response as AuthenticatorAttestationResponse;
  const spki = typeof reponse.getPublicKey === "function" ? reponse.getPublicKey() : null;
  return {
    id: versBase64Url(new Uint8Array(cred.rawId)),
    spki: spki ? versBase64(new Uint8Array(spki)) : null,
  };
}

/** Demande Face ID et vérifie la réponse. Renvoie false si refusé ou invalide. */
export async function verifierFaceId(cle: CleFaceId): Promise<boolean> {
  const challenge = hasard(32);
  let cred: PublicKeyCredential | null;
  try {
    cred = (await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: location.hostname,
        allowCredentials: [{ type: "public-key", id: depuisBase64Url(cle.id), transports: ["internal"] }],
        userVerification: "required",
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
  } catch {
    return false; // annulé, échec biométrique ou geste requis
  }
  if (!cred) return false;
  const r = cred.response as AuthenticatorAssertionResponse;
  return verifierAssertion({
    spki: cle.spki ? depuisBase64(cle.spki) : null,
    authData: new Uint8Array(r.authenticatorData),
    clientDataJSON: new Uint8Array(r.clientDataJSON),
    signature: new Uint8Array(r.signature),
    challenge,
    origin: location.origin,
    rpId: location.hostname,
  });
}

/** Demande à iOS d'oublier l'identifiant (API « Signal », si disponible). */
export function oublierFaceId(cle: CleFaceId): void {
  const pkc = PublicKeyCredential as unknown as {
    signalUnknownCredential?: (o: { rpId: string; credentialId: string }) => Promise<void>;
  };
  pkc.signalUnknownCredential?.({ rpId: location.hostname, credentialId: cle.id }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Vérification (fonctions pures, testées)
// ---------------------------------------------------------------------------

async function sha256(d: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", octets(d)));
}

function egaux(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** Indicateurs des données d'authentification : présence (UP) et vérification (UV) de l'utilisateur. */
export function lireIndicateurs(authData: Uint8Array): { up: boolean; uv: boolean } {
  const f = authData[32] ?? 0;
  return { up: (f & 0x01) !== 0, uv: (f & 0x04) !== 0 };
}

/** Signature ECDSA au format DER (WebAuthn) → format brut r‖s de 64 octets (WebCrypto). */
export function derVersBrut(der: Uint8Array): Uint8Array<ArrayBuffer> {
  if (der[0] !== 0x30) throw new Error("Signature DER invalide");
  let p = 2;
  if (der[1] & 0x80) p = 2 + (der[1] & 0x7f);
  const lireEntier = (): Uint8Array => {
    if (der[p] !== 0x02) throw new Error("Signature DER invalide");
    const l = der[p + 1];
    const v = der.subarray(p + 2, p + 2 + l);
    p += 2 + l;
    let i = 0;
    while (i < v.length - 1 && v[i] === 0) i++; // zéros de tête (signe)
    const t = v.subarray(i);
    if (t.length > 32) throw new Error("Signature DER invalide");
    const out = new Uint8Array(32);
    out.set(t, 32 - t.length);
    return out;
  };
  const r = lireEntier();
  const s = lireEntier();
  const brut = new Uint8Array(64);
  brut.set(r, 0);
  brut.set(s, 32);
  return brut;
}

export async function verifierAssertion(a: {
  spki: Uint8Array | null;
  authData: Uint8Array;
  clientDataJSON: Uint8Array;
  signature: Uint8Array;
  challenge: Uint8Array;
  origin: string;
  rpId: string;
}): Promise<boolean> {
  try {
    const client = JSON.parse(new TextDecoder().decode(a.clientDataJSON)) as {
      type?: string;
      challenge?: string;
      origin?: string;
    };
    if (client.type !== "webauthn.get") return false;
    if (client.challenge !== versBase64Url(a.challenge)) return false;
    if (client.origin !== a.origin) return false;
    if (a.authData.length < 37) return false;
    if (!egaux(a.authData.subarray(0, 32), await sha256(new TextEncoder().encode(a.rpId)))) return false;
    const { up, uv } = lireIndicateurs(a.authData);
    if (!up || !uv) return false;
    if (!a.spki) return true; // clé publique indisponible : contrôles ci-dessus uniquement
    const cle = await crypto.subtle.importKey(
      "spki",
      octets(a.spki),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );
    const signe = new Uint8Array(a.authData.length + 32);
    signe.set(a.authData, 0);
    signe.set(await sha256(a.clientDataJSON), a.authData.length);
    return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, cle, derVersBrut(a.signature), signe);
  } catch {
    return false;
  }
}
