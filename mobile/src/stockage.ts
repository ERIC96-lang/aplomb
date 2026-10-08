// Stockage local du téléphone (IndexedDB) : petite base clé → valeur.
// La clé de chiffrement y est conservée comme CryptoKey NON extractible, et
// l'instantané du PC y reste sous sa forme chiffrée (déchiffré à l'ouverture).

const NOM_BASE = "budget-perso-mobile";
const MAGASIN = "kv";

export const CLES = {
  cle: "cle",
  empreinte: "empreinte",
  instantane: "instantane",
  etag: "instantane-etag",
  saisies: "saisies",
  derniereSync: "derniere-sync",
} as const;

let base: Promise<IDBDatabase> | null = null;

function ouvrir(): Promise<IDBDatabase> {
  base ??= new Promise((ok, ko) => {
    const r = indexedDB.open(NOM_BASE, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(MAGASIN);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
  return base;
}

async function operation<T>(
  mode: IDBTransactionMode,
  action: (m: IDBObjectStore) => IDBRequest
): Promise<T> {
  const db = await ouvrir();
  return new Promise<T>((ok, ko) => {
    const t = db.transaction(MAGASIN, mode);
    const r = action(t.objectStore(MAGASIN));
    t.oncomplete = () => ok(r.result as T);
    t.onerror = () => ko(t.error);
    t.onabort = () => ko(t.error);
  });
}

export function lire<T>(cle: string): Promise<T | undefined> {
  return operation<T | undefined>("readonly", (m) => m.get(cle));
}

export async function ecrire(cle: string, valeur: unknown): Promise<void> {
  await operation("readwrite", (m) => m.put(valeur, cle));
}

export async function supprimer(cle: string): Promise<void> {
  await operation("readwrite", (m) => m.delete(cle));
}

export async function toutEffacer(): Promise<void> {
  await operation("readwrite", (m) => m.clear());
}

/** Demande au système de ne pas purger les données de l'app (au mieux). */
export function demanderPersistance(): void {
  navigator.storage?.persist?.().catch(() => {});
}
