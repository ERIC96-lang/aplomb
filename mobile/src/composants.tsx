import { useEffect, type ReactNode } from "react";
import { Icon, type IconName } from "../../src/components/Icon";
import { useEtat } from "./etat";

/** « à l'instant », « il y a 5 min », « il y a 2 h », « hier », « le 3 oct. ». */
export function ilYaCourt(iso: string | null): string {
  if (!iso) return "jamais";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  if (h < 48) return "hier";
  return `le ${new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`;
}

/** Montant en grand : espace insécable normale (l'espace fine de fr-FR disparaît à cette taille). */
export function montantGrand(texte: string): string {
  return texte.replace(/\u202f/g, "\u00a0");
}

export function Entete({
  surtitre,
  titre,
  droite,
}: {
  surtitre?: string;
  titre: string;
  droite?: ReactNode;
}) {
  return (
    <header className="m-entete">
      <div className="m-entete-ligne">
        <div>
          {surtitre && <div className="m-surtitre">{surtitre}</div>}
          <h1 className="m-titre">{titre}</h1>
        </div>
        {droite}
      </div>
    </header>
  );
}

/** Feuille qui monte du bas de l'écran (saisie, confirmations). */
export function Feuille({
  titre,
  onFermer,
  children,
}: {
  titre: string;
  onFermer: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = avant;
    };
  }, []);
  return (
    <>
      <div className="m-voile" onClick={onFermer} />
      <div className="m-feuille" role="dialog" aria-modal="true" aria-label={titre}>
        <div className="m-poignee" />
        <div className="m-feuille-tete">
          <h2>{titre}</h2>
          <button className="m-fermer" onClick={onFermer} aria-label="Fermer">
            <Icon name="close" size={16} />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

export function Vide({ icone, titre, children }: { icone: IconName; titre: string; children?: ReactNode }) {
  return (
    <div className="m-vide">
      <div className="ico">
        <Icon name={icone} size={22} />
      </div>
      <strong>{titre}</strong>
      {children}
    </div>
  );
}

/** Puce d'état de la synchro (toucher : synchroniser, ou ouvrir les réglages). */
export function PuceSync({ onReglages }: { onReglages: () => void }) {
  const { sync, attente, onedrive, synchroniser } = useEtat();
  const aEnvoyer = attente.filter((s) => !s.envoyee).length;

  let classe = "";
  let texte = `À jour · ${ilYaCourt(sync.derniere)}`;
  if (sync.enCours) texte = "Synchronisation…";
  else if (sync.erreur) {
    classe = "erreur";
    texte = navigator.onLine ? "À vérifier" : "Hors ligne";
  } else if (aEnvoyer > 0) {
    classe = "attente";
    texte = `${aEnvoyer} à envoyer`;
  } else if (attente.length > 0) {
    classe = "attente";
    texte = `${attente.length} en cours`;
  } else if (!sync.derniere) {
    classe = "attente";
    texte = "Jamais synchronisé";
  }

  return (
    <button
      className={`m-etat ${classe}`}
      onClick={() => (onedrive.compte ? void synchroniser() : onReglages())}
      aria-label={`État de la synchronisation : ${texte}`}
    >
      {sync.enCours ? (
        <span className="m-tourne" style={{ display: "inline-flex" }}>
          <Icon name="repeat" size={13} />
        </span>
      ) : (
        <span className="point" aria-hidden="true" />
      )}
      {texte}
    </button>
  );
}
