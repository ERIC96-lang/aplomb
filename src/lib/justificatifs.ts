import { open } from "@tauri-apps/plugin-dialog";
import { copyFile, mkdir, exists, BaseDirectory } from "@tauri-apps/plugin-fs";
import { appDataDir, join } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "charge";
}

/**
 * Ouvre un sélecteur de PDF, COPIE le fichier choisi dans
 * `justificatifs/AAAA/MM-nom-charge.pdf` du dossier de données de l'app, et
 * renvoie le chemin RELATIF stocké en base (ou null si annulé).
 *
 * On copie plutôt que de mémoriser le chemin d'origine : si le fichier source
 * est déplacé/supprimé plus tard, le justificatif reste accessible.
 */
export async function choisirEtCopierJustificatif(
  nomCharge: string,
  mois: string
): Promise<string | null> {
  const source = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (!source || typeof source !== "string") return null;

  const annee = mois.slice(0, 4);
  const mm = mois.slice(5, 7);
  const dossierRel = `justificatifs/${annee}`;
  const relPath = `${dossierRel}/${mm}-${slug(nomCharge)}.pdf`;

  if (!(await exists(dossierRel, { baseDir: BaseDirectory.AppData }))) {
    await mkdir(dossierRel, { baseDir: BaseDirectory.AppData, recursive: true });
  }

  await copyFile(source, relPath, { toPathBaseDir: BaseDirectory.AppData });
  return relPath;
}

/** Chemin absolu d'un justificatif à partir de son chemin relatif stocké. */
export async function cheminAbsoluJustificatif(relPath: string): Promise<string> {
  const base = await appDataDir();
  return join(base, relPath);
}

/** Ouvre le justificatif avec le lecteur PDF du système. */
export async function ouvrirJustificatif(relPath: string): Promise<void> {
  const abs = await cheminAbsoluJustificatif(relPath);
  await openPath(abs);
}
