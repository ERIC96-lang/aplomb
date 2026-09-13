// Protection par code PIN local.
// Le PIN n'est JAMAIS stocké en clair : on conserve seulement un hash PBKDF2
// (SHA-256, sel aléatoire) dans le localStorage. C'est un simple verrou de
// confort pour une app locale, pas un coffre-fort.

const CLE = "pin";
const ITERATIONS = 150000;

function bufVersB64(buf: ArrayBuffer | Uint8Array): string {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s);
}

function b64VersBuf(b64: string): Uint8Array {
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

async function deriver(pin: string, sel: Uint8Array): Promise<string> {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey(
    "raw",
    enc.encode(pin) as unknown as BufferSource,
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: sel as unknown as BufferSource, iterations: ITERATIONS, hash: "SHA-256" },
    base,
    256
  );
  return bufVersB64(bits);
}

export function pinActif(): boolean {
  try {
    return !!localStorage.getItem(CLE);
  } catch {
    return false;
  }
}

export async function definirPin(pin: string): Promise<void> {
  const sel = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriver(pin, sel);
  localStorage.setItem(CLE, JSON.stringify({ sel: bufVersB64(sel), hash }));
}

export async function verifierPin(pin: string): Promise<boolean> {
  try {
    const raw = localStorage.getItem(CLE);
    if (!raw) return false;
    const { sel, hash } = JSON.parse(raw) as { sel: string; hash: string };
    const calcul = await deriver(pin, b64VersBuf(sel));
    return calcul === hash;
  } catch {
    return false;
  }
}

export function supprimerPin(): void {
  try {
    localStorage.removeItem(CLE);
  } catch {
    /* ignore */
  }
}
