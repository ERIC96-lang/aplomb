import { useEffect, useState, type ReactNode } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { relaunch } from "@tauri-apps/plugin-process";
import { estBaseEndommagee } from "./db";
import { derniereSauvegarde, preparerRestaurationDerniere } from "./lib/backup";
import { HashRouter, Route, Routes } from "react-router-dom";
import { AppDataProvider, useAppData } from "./state/AppDataContext";
import { ToastProvider } from "./state/ToastContext";
import { ThemeProvider } from "./state/ThemeContext";
import { LockProvider, useLock } from "./state/LockContext";
import { LockScreen } from "./components/LockScreen";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Analyse } from "./pages/Analyse";
import { Comptes } from "./pages/Comptes";
import { Transactions } from "./pages/Transactions";
import { ChargesFixes } from "./pages/ChargesFixes";
import { Budgets } from "./pages/Budgets";
import { Objectifs } from "./pages/Objectifs";
import { Previsions } from "./pages/Previsions";
import { Echeancier } from "./pages/Echeancier";
import { Suggestions } from "./pages/Suggestions";
import { Factures } from "./pages/Factures";
import { Import } from "./pages/Import";
import { Rapports } from "./pages/Rapports";
import { Parametres } from "./pages/Parametres";
import { Aide } from "./pages/Aide";
import { Icon } from "./components/Icon";

/** Base endommagée : propose de restaurer la sauvegarde automatique la plus récente. */
function RestaurationSecours() {
  const [derniere, setDerniere] = useState<{ nom: string; date: Date } | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [echec, setEchec] = useState<string | null>(null);

  useEffect(() => {
    derniereSauvegarde().then(setDerniere);
  }, []);

  if (derniere === undefined) return null;
  if (derniere === null) {
    return <p className="muted">Aucune sauvegarde automatique n'a été trouvée.</p>;
  }

  async function restaurer() {
    setBusy(true);
    try {
      if (await preparerRestaurationDerniere()) await relaunch();
    } catch (e) {
      setEchec(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 18 }}>
      <p className="muted" style={{ fontSize: 13.5 }}>
        La base semble endommagée. Vous pouvez la remplacer par la sauvegarde automatique du{" "}
        <strong>{format(derniere.date, "d MMMM yyyy 'à' HH:mm", { locale: fr })}</strong>. La base
        actuelle est conservée à part, rien n'est supprimé.
      </p>
      <button className="btn primary" onClick={restaurer} disabled={busy}>
        {busy ? "Restauration…" : "Restaurer cette sauvegarde et redémarrer"}
      </button>
      {echec && <p style={{ color: "var(--red)", fontSize: 13 }}>{echec}</p>}
    </div>
  );
}

function Gate({ children }: { children: ReactNode }) {
  const { pret, erreur } = useAppData();
  if (erreur) {
    return (
      <div className="center-screen">
        <div style={{ maxWidth: 480, textAlign: "center" }}>
          <div style={{ color: "var(--amber)", marginBottom: 8 }}>
            <Icon name="alert" size={40} strokeWidth={1.5} />
          </div>
          <h2>Impossible d'ouvrir la base de données</h2>
          <p className="muted">{erreur}</p>
          {estBaseEndommagee(erreur) && <RestaurationSecours />}
        </div>
      </div>
    );
  }
  if (!pret) return <div className="center-screen">Chargement…</div>;
  return <>{children}</>;
}

function LockGate({ children }: { children: ReactNode }) {
  const { pinDefini, verrouille } = useLock();
  if (pinDefini && verrouille) return <LockScreen />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ThemeProvider>
      <LockProvider>
        <LockGate>
          <AppDataProvider>
            <ToastProvider>
              <Gate>
                <HashRouter>
                  <Routes>
                    <Route element={<Layout />}>
                      <Route index element={<Dashboard />} />
                      <Route path="analyse" element={<Analyse />} />
                      <Route path="comptes" element={<Comptes />} />
                      <Route path="transactions" element={<Transactions />} />
                      <Route path="charges" element={<ChargesFixes />} />
                      <Route path="budgets" element={<Budgets />} />
                      <Route path="objectifs" element={<Objectifs />} />
                      <Route path="previsions" element={<Previsions />} />
                      <Route path="echeancier" element={<Echeancier />} />
                      <Route path="suggestions" element={<Suggestions />} />
                      <Route path="factures" element={<Factures />} />
                      <Route path="import" element={<Import />} />
                      <Route path="rapports" element={<Rapports />} />
                      <Route path="parametres" element={<Parametres />} />
                      <Route path="aide" element={<Aide />} />
                    </Route>
                  </Routes>
                </HashRouter>
              </Gate>
            </ToastProvider>
          </AppDataProvider>
        </LockGate>
      </LockProvider>
    </ThemeProvider>
  );
}
