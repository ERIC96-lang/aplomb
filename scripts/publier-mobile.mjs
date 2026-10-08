// Publie l'app compagnon iPhone (PWA) sur GitHub Pages.
// - build `dist-mobile/` (vite.mobile.config.ts) ;
// - pousse son contenu seul sur la branche `gh-pages` (historique remplacé à
//   chaque publication : la branche ne contient que le site, pas le code) ;
// - active GitHub Pages sur cette branche si ce n'est pas déjà fait.
//
// Usage : npm run mobile:publier

import { execSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEPOT = "ERIC96-lang/aplomb";
const URL_SITE = "https://eric96-lang.github.io/aplomb/";

const executer = (cmd, cwd = RACINE) => execSync(cmd, { cwd, stdio: "inherit" });
const lire = (cmd, cwd = RACINE) => execSync(cmd, { cwd, encoding: "utf8" }).trim();

executer("npx vite build --config vite.mobile.config.ts");

const nom = lire("git config --get user.name");
const email = lire("git config --get user.email");
const distant = lire("git remote get-url origin");

const tmp = mkdtempSync(join(tmpdir(), "bp-pages-"));
try {
  cpSync(join(RACINE, "dist-mobile"), tmp, { recursive: true });
  writeFileSync(join(tmp, ".nojekyll"), ""); // servir les fichiers tels quels
  const id = `-c user.name="${nom}" -c user.email="${email}"`;
  executer("git init -q -b gh-pages", tmp);
  executer("git add -A", tmp);
  executer(
    `git ${id} commit -q -m "Publication de l'app iPhone" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`,
    tmp
  );
  executer(`git push -f "${distant}" gh-pages`, tmp);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

try {
  lire(`gh api repos/${DEPOT}/pages`);
} catch {
  executer(`gh api -X POST repos/${DEPOT}/pages -f "source[branch]=gh-pages" -f "source[path]=/"`);
}

console.log(`\nApp iPhone publiée : ${URL_SITE}`);
console.log("(GitHub Pages peut mettre une à deux minutes à servir la nouvelle version.)");
