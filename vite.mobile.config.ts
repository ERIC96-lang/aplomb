// Build de l'app compagnon iPhone (PWA), publiée sur GitHub Pages.
// Partage les calculs et le protocole de synchro avec l'app de bureau (src/).
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const racine = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Fichiers de /public à mettre aussi en cache hors ligne.
const PUBLICS = ["manifest.webmanifest", "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png"];

/** Génère sw.js avec un identifiant de build et la liste exacte des fichiers à précharger. */
function serviceWorker(): Plugin {
  return {
    name: "bp-service-worker",
    apply: "build",
    generateBundle(_, bundle) {
      const fichiers = Object.keys(bundle).filter(
        (f) =>
          f !== "index.html" &&
          !f.endsWith(".map") &&
          // Polices : seuls les sous-ensembles latins servent en français.
          !/(cyrillic|greek|vietnamese)/.test(f)
      );
      const source = readFileSync(racine("./mobile/sw.template.js"), "utf8")
        .replace("__BUILD__", new Date().toISOString())
        .replace("__PRECACHE__", JSON.stringify([...fichiers, ...PUBLICS]));
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    },
  };
}

export default defineConfig({
  root: racine("./mobile"),
  base: "/aplomb/",
  plugins: [react(), serviceWorker()],
  build: {
    outDir: racine("./dist-mobile"),
    emptyOutDir: true,
    target: "safari16",
    chunkSizeWarningLimit: 800,
  },
  server: { port: 5174, strictPort: true },
});
