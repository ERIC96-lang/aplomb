import { useState } from "react";
import { Icon } from "../../src/components/Icon";
import { useToast } from "../../src/state/ToastContext";
import { empreinte, lireCodeAppairage } from "../../src/sync/crypto";
import { Feuille } from "./composants";
import { useEtat } from "./etat";
import { Scanner } from "./Scanner";

/**
 * Parcours d'appairage : scan du QR affiché par le PC, puis vérification de
 * l'empreinte (elle doit être identique sur les deux écrans) avant d'enregistrer
 * la clé.
 */
export function Appairage({ onTermine, onAnnuler }: { onTermine: () => void; onAnnuler: () => void }) {
  const { appairer } = useEtat();
  const toast = useToast();
  const [verif, setVerif] = useState<{ code: string; empreinte: string } | null>(null);
  const [busy, setBusy] = useState(false);

  function lu(texte: string): boolean {
    const brute = lireCodeAppairage(texte);
    if (!brute) {
      toast("Ce QR code n'est pas un code d'appairage Aplomb.");
      return false;
    }
    void empreinte(brute).then((e) => setVerif({ code: texte, empreinte: e }));
    return true;
  }

  async function confirmer() {
    if (!verif) return;
    setBusy(true);
    try {
      await appairer(verif.code);
      toast("iPhone appairé avec votre PC");
      onTermine();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  if (!verif) {
    return (
      <Scanner
        onCode={lu}
        onFermer={onAnnuler}
        consigne="Visez le second QR code affiché sur le PC (Paramètres → Application iPhone → Appairer)."
      />
    );
  }

  return (
    <Feuille titre="Vérifiez l'empreinte" onFermer={onAnnuler}>
      <div className="m-verif">
        <div className="m-vide" style={{ padding: 0 }}>
          <div className="ico">
            <Icon name="lock" size={22} />
          </div>
        </div>
        <div className="m-empreinte">{verif.empreinte}</div>
        <p className="m-note" style={{ marginTop: 10 }}>
          Ce code doit être <strong>identique</strong> à celui affiché sur le PC. S'il diffère,
          recommencez le scan.
        </p>
      </div>
      <button className="m-bouton" onClick={confirmer} disabled={busy}>
        <Icon name="check" size={18} /> Identique, appairer
      </button>
      <button className="m-bouton secondaire" onClick={() => setVerif(null)} disabled={busy}>
        Recommencer le scan
      </button>
    </Feuille>
  );
}
