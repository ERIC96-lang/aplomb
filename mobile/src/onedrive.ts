// Accès OneDrive (Microsoft Graph) depuis le téléphone. Chargé à la demande :
// MSAL n'est téléchargé que si la synchro OneDrive est configurée.
//
// Connexion par redirection (les fenêtres surgissantes sont peu fiables dans
// une app installée sur l'écran d'accueil d'iOS).

import {
  InteractionRequiredAuthError,
  PublicClientApplication,
} from "@azure/msal-browser";
import { ONEDRIVE_CLIENT_ID } from "./config";
import {
  DOSSIER_SAISIES,
  EXTENSION,
  FICHIER_INSTANTANE,
  NOM_DOSSIER_SYNC,
} from "../../src/sync/protocole";

const PORTEES = ["Files.ReadWrite"];
const GRAPH = "https://graph.microsoft.com/v1.0/me/drive/root:";

/** Erreur « rien à faire » : le PC n'a encore rien publié. */
export class InstantaneAbsent extends Error {}

function chemin(...parties: string[]): string {
  return [NOM_DOSSIER_SYNC, ...parties].map(encodeURIComponent).join("/");
}

let client: Promise<PublicClientApplication> | null = null;

/** Client MSAL initialisé ; traite au passage un éventuel retour de connexion. */
function msal(): Promise<PublicClientApplication> {
  client ??= (async () => {
    const pca = new PublicClientApplication({
      auth: {
        clientId: ONEDRIVE_CLIENT_ID,
        authority: "https://login.microsoftonline.com/consumers",
        redirectUri: new URL(import.meta.env.BASE_URL, location.origin).href,
        postLogoutRedirectUri: null,
      },
      cache: { cacheLocation: "localStorage" },
    });
    await pca.initialize();
    const retour = await pca.handleRedirectPromise();
    const compte = retour?.account ?? pca.getActiveAccount() ?? pca.getAllAccounts()[0] ?? null;
    if (compte) pca.setActiveAccount(compte);
    return pca;
  })();
  return client;
}

/** Adresse du compte Microsoft connecté, ou null. */
export async function compteConnecte(): Promise<string | null> {
  const a = (await msal()).getActiveAccount();
  return a ? a.username || a.name || "Compte Microsoft" : null;
}

/** Ouvre la page de connexion Microsoft (l'app est rechargée au retour). */
export async function connecter(): Promise<void> {
  await (await msal()).loginRedirect({ scopes: PORTEES, prompt: "select_account" });
}

/** Oublie la session OneDrive sur ce téléphone. */
export async function deconnecter(): Promise<void> {
  const pca = await msal();
  pca.setActiveAccount(null);
  await pca.clearCache();
}

async function jeton(): Promise<string> {
  const pca = await msal();
  const compte = pca.getActiveAccount();
  if (!compte) throw new Error("Connectez-vous à OneDrive dans les Réglages.");
  try {
    return (await pca.acquireTokenSilent({ scopes: PORTEES, account: compte })).accessToken;
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) {
      await pca.acquireTokenRedirect({ scopes: PORTEES, account: compte });
      throw new Error("Reconnexion à OneDrive…");
    }
    throw e;
  }
}

async function graph(url: string, init: RequestInit = {}): Promise<Response> {
  const t = await jeton();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${t}`);
  return fetch(url, { ...init, headers });
}

/** Dépose une saisie chiffrée dans `saisies/` (le PC la relèvera). */
export async function deposerSaisie(uuid: string, contenu: Uint8Array<ArrayBuffer>): Promise<void> {
  const r = await graph(`${GRAPH}/${chemin(DOSSIER_SAISIES, uuid + EXTENSION)}:/content`, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: contenu,
  });
  if (!r.ok) throw new Error(`OneDrive a refusé l'envoi d'une saisie (erreur ${r.status}).`);
}

/**
 * Télécharge l'instantané publié par le PC s'il a changé depuis `etagConnu`.
 * Renvoie null s'il est inchangé.
 */
export async function lireInstantane(
  etagConnu: string | null
): Promise<{ etag: string; contenu: Uint8Array<ArrayBuffer> } | null> {
  const r = await graph(`${GRAPH}/${chemin(FICHIER_INSTANTANE)}`);
  if (r.status === 404) throw new InstantaneAbsent("Le PC n'a encore rien publié.");
  if (!r.ok) throw new Error(`OneDrive est indisponible (erreur ${r.status}).`);
  const meta = (await r.json()) as { eTag?: string; "@microsoft.graph.downloadUrl"?: string };
  const etag = meta.eTag ?? "";
  if (etag && etag === etagConnu) return null;
  const url = meta["@microsoft.graph.downloadUrl"];
  if (!url) throw new Error("Lien de téléchargement OneDrive manquant.");
  const d = await fetch(url);
  if (!d.ok) throw new Error(`Téléchargement impossible (erreur ${d.status}).`);
  return { etag, contenu: new Uint8Array(await d.arrayBuffer()) };
}
