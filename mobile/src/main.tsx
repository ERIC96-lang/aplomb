import React from "react";
import ReactDOM from "react-dom/client";
// Polices auto-hébergées, identiques à l'app PC.
import "@fontsource-variable/inter";
import "@fontsource-variable/plus-jakarta-sans";
import "../../src/styles.css";
import "./mobile.css";
import { ToastProvider } from "../../src/state/ToastContext";
import { EtatProvider } from "./etat";
import { VerrouProvider } from "./verrou";
import { App } from "./App";

// Thème : suit le réglage clair / sombre de l'iPhone.
const sombre = matchMedia("(prefers-color-scheme: dark)");
const appliquerTheme = () =>
  document.documentElement.setAttribute("data-theme", sombre.matches ? "dark" : "light");
appliquerTheme();
sombre.addEventListener("change", appliquerTheme);

// Hors ligne : service worker (production uniquement).
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ToastProvider>
      <EtatProvider>
        <VerrouProvider>
          <App />
        </VerrouProvider>
      </EtatProvider>
    </ToastProvider>
  </React.StrictMode>
);
