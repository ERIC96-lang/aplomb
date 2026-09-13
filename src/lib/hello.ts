import { invoke } from "@tauri-apps/api/core";

/** Windows Hello est-il disponible et configuré sur ce PC ? */
export async function helloDisponible(): Promise<boolean> {
  try {
    return await invoke<boolean>("hello_disponible");
  } catch {
    return false;
  }
}

/** Demande une vérification Windows Hello (PIN Windows / empreinte / visage). */
export async function helloVerifier(message: string): Promise<boolean> {
  try {
    return await invoke<boolean>("hello_verifier", { message });
  } catch {
    return false;
  }
}
