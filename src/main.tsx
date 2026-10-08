import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// Polices auto-hébergées (100 % local, aucun appel réseau).
import "@fontsource-variable/inter";
import "@fontsource-variable/plus-jakarta-sans";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
