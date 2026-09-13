import { useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Icon } from "./Icon";

export function UpdateBanner() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [etat, setEtat] = useState<"idle" | "install" | "fait">("idle");
  const [masque, setMasque] = useState(false);

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const u = await check();
        if (!annule && u?.available) setUpdate(u);
      } catch {
        /* hors-ligne / pas d'endpoint : on ignore */
      }
    })();
    return () => {
      annule = true;
    };
  }, []);

  if (!update || masque) return null;

  async function installer() {
    if (!update) return;
    setEtat("install");
    try {
      await update.downloadAndInstall();
      setEtat("fait");
      await relaunch();
    } catch (e) {
      console.error(e);
      setEtat("idle");
    }
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        marginBottom: 20,
        borderRadius: 12,
        background: "var(--brand-grad-soft)",
        border: "1px solid var(--border-strong)",
      }}
    >
      <span style={{ color: "var(--accent)" }}>
        <Icon name="download" size={20} />
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700 }}>
          Mise à jour disponible — version {update.version}
        </div>
        <div className="muted" style={{ fontSize: 12.5 }}>
          {etat === "install"
            ? "Téléchargement et installation en cours…"
            : etat === "fait"
            ? "Installé, redémarrage…"
            : update.body
            ? update.body.slice(0, 140)
            : "Une nouvelle version de Budget Perso est prête à être installée."}
        </div>
      </div>
      {etat === "idle" && (
        <>
          <button className="btn sm" onClick={() => setMasque(true)}>
            Plus tard
          </button>
          <button className="btn sm primary" onClick={installer}>
            <Icon name="download" size={14} /> Installer et redémarrer
          </button>
        </>
      )}
    </div>
  );
}
