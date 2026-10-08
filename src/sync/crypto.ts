// Chiffrement des fichiers de synchronisation : AES-256-GCM (WebCrypto) sur du
// JSON compressé en gzip. Code strictement identique côté PC (WebView2) et
// côté iPhone (Safari) : les deux appareils parlent exactement le même format.
//
// Format d'un fichier : "BPS1" (4 o) | IV (12 o) | texte chiffré + tag GCM.
// L'en-tête "BPS1" est authentifié (données additionnelles GCM).

export type Octets = Uint8Array<ArrayBuffer>;

const MAGIC = new Uint8Array([0x42, 0x50, 0x53, 0x31]); // "BPS1"
const IV_LEN = 12;
const TAILLE_CLE = 32;
const PREFIXE_CODE = "bpsync1:";

/** Copie défensive vers un tampon `ArrayBuffer` simple (exigé par WebCrypto/Blob). */
export function octets(x: Uint8Array): Octets {
  return new Uint8Array(x);
}

export function genererCleBrute(): Octets {
  return crypto.getRandomValues(new Uint8Array(TAILLE_CLE));
}

/** Importe la clé brute. Côté iPhone on la garde non extractible. */
export async function importerCle(brute: Uint8Array, extractible = false): Promise<CryptoKey> {
  if (brute.length !== TAILLE_CLE) throw new Error("Clé de synchronisation invalide.");
  return crypto.subtle.importKey("raw", octets(brute), { name: "AES-GCM" }, extractible, [
    "encrypt",
    "decrypt",
  ]);
}

export async function chiffrer(cle: CryptoKey, donnees: Uint8Array): Promise<Octets> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: MAGIC }, cle, octets(donnees))
  );
  const out = new Uint8Array(MAGIC.length + IV_LEN + ct.length);
  out.set(MAGIC, 0);
  out.set(iv, MAGIC.length);
  out.set(ct, MAGIC.length + IV_LEN);
  return out;
}

export async function dechiffrer(cle: CryptoKey, blob: Uint8Array): Promise<Octets> {
  const entete = MAGIC.length + IV_LEN;
  if (blob.length < entete + 16 || !MAGIC.every((b, i) => blob[i] === b)) {
    throw new Error("Fichier de synchronisation non reconnu.");
  }
  const iv = octets(blob.subarray(MAGIC.length, entete));
  const ct = octets(blob.subarray(entete));
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: MAGIC }, cle, ct)
    );
  } catch {
    throw new Error(
      "Déchiffrement impossible : ce fichier a été chiffré avec une autre clé (appareils à ré-appairer)."
    );
  }
}

async function transformer(d: Uint8Array, flux: CompressionStream | DecompressionStream): Promise<Octets> {
  const sortie = new Blob([octets(d)]).stream().pipeThrough(flux);
  return new Uint8Array(await new Response(sortie).arrayBuffer());
}

/** Objet → JSON → gzip → chiffré. */
export async function emballer(cle: CryptoKey, obj: unknown): Promise<Octets> {
  const json = new TextEncoder().encode(JSON.stringify(obj));
  return chiffrer(cle, await transformer(json, new CompressionStream("gzip")));
}

/** Chiffré → gzip → JSON → objet. */
export async function deballer<T = unknown>(cle: CryptoKey, blob: Uint8Array): Promise<T> {
  const zip = await dechiffrer(cle, blob);
  const json = await transformer(zip, new DecompressionStream("gzip"));
  return JSON.parse(new TextDecoder().decode(json)) as T;
}

// ---------------------------------------------------------------------------
// Encodages
// ---------------------------------------------------------------------------

export function versBase64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) {
    s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

export function depuisBase64(s: string): Octets {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function versBase64Url(b: Uint8Array): string {
  return versBase64(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function depuisBase64Url(s: string): Octets {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return depuisBase64(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
}

// ---------------------------------------------------------------------------
// Appairage
// ---------------------------------------------------------------------------

/** Contenu du QR code d'appairage affiché par le PC. */
export function codeAppairage(brute: Uint8Array): string {
  return PREFIXE_CODE + versBase64Url(brute);
}

/** Lit un code d'appairage (QR scanné ou collé). Renvoie null s'il est invalide. */
export function lireCodeAppairage(code: string): Octets | null {
  const c = code.trim().replace(/\s+/g, "");
  if (!c.toLowerCase().startsWith(PREFIXE_CODE)) return null;
  try {
    const brute = depuisBase64Url(c.slice(PREFIXE_CODE.length));
    return brute.length === TAILLE_CLE ? brute : null;
  } catch {
    return null;
  }
}

/** Empreinte courte de la clé (« A1B2-C3D4 »), affichée sur les deux appareils pour vérifier l'appairage. */
export async function empreinte(brute: Uint8Array): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", octets(brute)));
  const hex = Array.from(h.subarray(0, 4), (x) => x.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4)}`;
}
