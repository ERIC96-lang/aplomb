import { useState } from "react";
import { Icon } from "../../../src/components/Icon";
import { Appairage } from "../Appairage";

function estInstallee(): boolean {
  return navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
}

/** Premier lancement : installation sur l'écran d'accueil puis appairage avec le PC. */
export function Accueil() {
  const [appairage, setAppairage] = useState(false);
  const installee = estInstallee();

  return (
    <div className="m-accueil">
      <div className="m-logo" aria-hidden="true">
        <Icon name="wallet" size={34} strokeWidth={2.2} />
      </div>
      <div>
        <h1>Aplomb</h1>
        <p className="intro">
          Vos soldes, vos budgets et la saisie de vos dépenses, où que vous soyez. Les données
          viennent de votre PC, chiffrées de bout en bout.
        </p>
      </div>

      {!installee && (
        <div className="m-encart" role="note">
          <Icon name="alert" size={18} style={{ marginTop: 2 }} />
          <div>
            <strong>Installez d'abord l'application.</strong> Touchez le bouton{" "}
            <strong>Partager</strong> de Safari puis <strong>Sur l'écran d'accueil</strong>, et
            ouvrez Aplomb depuis son icône. L'appairage doit se faire dans l'app installée.
          </div>
        </div>
      )}

      <div className="m-etapes">
        <div className="m-etape">
          <span className="num">1</span>
          <div className="txt">
            Sur le PC, ouvrez <strong>Paramètres → Application iPhone</strong> et activez la
            synchronisation.
          </div>
        </div>
        <div className="m-etape">
          <span className="num">2</span>
          <div className="txt">
            Touchez <strong>Appairer un iPhone</strong>, puis scannez le second QR code avec ce
            téléphone.
          </div>
        </div>
        <div className="m-etape">
          <span className="num">3</span>
          <div className="txt">
            Vérifiez que <strong>l'empreinte</strong> est la même sur les deux écrans.
          </div>
        </div>
      </div>

      <div className="m-pousse" />
      <button className="m-bouton" onClick={() => setAppairage(true)}>
        <Icon name="camera" size={18} /> Scanner le code d'appairage
      </button>

      {appairage && <Appairage onTermine={() => setAppairage(false)} onAnnuler={() => setAppairage(false)} />}
    </div>
  );
}
