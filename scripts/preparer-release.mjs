// Prépare une release GitHub pour l'updater Tauri.
// - copie l'installeur NSIS sous un nom stable (sans version) : budget-perso_x64-setup.exe
// - lit la signature (.sig) produite par le build signé
// - génère latest.json (manifeste lu par l'app)
//
// Usage : node scripts/preparer-release.mjs ["notes de version"]
// Prérequis : avoir lancé `npm run app:build` avec les variables de signature.

import { readFileSync, writeFileSync, copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const OWNER_REPO = "ERIC96-lang/budget-perso";
const NOM_STABLE = "budget-perso_x64-setup.exe";

const conf = JSON.parse(readFileSync(join(RACINE, "src-tauri/tauri.conf.json"), "utf8"));
const version = conf.version;
const notes = process.argv[2] || `Version ${version} de Budget Perso.`;

const nsisDir = join(RACINE, "src-tauri/target/release/bundle/nsis");
const fichiers = readdirSync(nsisDir);
// On dérive l'installeur depuis la signature du bon build (contient la version).
const sig = fichiers.find((f) => f.includes(version) && f.endsWith("_x64-setup.exe.sig"));
const setup = sig ? sig.replace(/\.sig$/, "") : undefined;
if (!setup || !sig || !fichiers.includes(setup)) {
  console.error(`Installeur/signature pour la version ${version} introuvable. As-tu lancé un build SIGNÉ ?`);
  process.exit(1);
}

const signature = readFileSync(join(nsisDir, sig), "utf8").trim();

const outDir = join(RACINE, "release");
mkdirSync(outDir, { recursive: true });
copyFileSync(join(nsisDir, setup), join(outDir, NOM_STABLE));

const latest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature,
      url: `https://github.com/${OWNER_REPO}/releases/latest/download/${NOM_STABLE}`,
    },
  },
};
writeFileSync(join(outDir, "latest.json"), JSON.stringify(latest, null, 2));

console.log("Release préparée dans:", outDir);
console.log(" -", NOM_STABLE);
console.log(" - latest.json (version " + version + ")");
console.log("\nÀ publier sur GitHub (Release marquée « latest ») :");
console.log("  1. Crée une Release (tag ex. v" + version + ")");
console.log("  2. Téléverse CES DEUX fichiers : " + NOM_STABLE + " et latest.json");
