import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { QrCode } from "./QrCode";
import { useToast } from "../state/ToastContext";
import { useAppData } from "../state/AppDataContext";
import {
  EVENEMENT_SYNC,
  URL_APP_MOBILE,
  dossierParDefaut,
  ecrireConfSync,
  infosAppairage,
  lireConfSync,
  renouvelerCleSync,
  synchroniserMobile,
} from "../lib/syncMobile";

interface Appairage {
  code: string;
  empreinte: string;
}

function ilYa(iso: string | null): string {
  if (!iso) return "jamais";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: fr });
  } catch {
    return "—";
  }
}

/** Carte « Application iPhone » des Paramètres : activation, état, appairage. */
export function SyncMobileCard() {
  const toast = useToast();
  const { rafraichir } = useAppData();
  const [conf, setConf] = useState(lireConfSync);
  const [busy, setBusy] = useState(false);
  const [appairage, setAppairage] = useState<Appairage | null>(null);
  const [codeVisible, setCodeVisible] = useState(false);
  const [, setTic] = useState(0);

  useEffect(() => {
    const maj = () => setConf(lireConfSync());
    window.addEventListener(EVENEMENT_SYNC, maj);
    const id = setInterval(() => setTic((x) => x + 1), 30_000); // rafraîchit « il y a … »
    return () => {
      window.removeEventListener(EVENEMENT_SYNC, maj);
      clearInterval(id);
    };
  }, []);

  async function synchroniser(annoncer = true) {
    setBusy(true);
    try {
      const r = await synchroniserMobile();
      if (r.integrees > 0) await rafraichir();
      if (annoncer) {
        toast(
          r.integrees > 0
            ? `${r.integrees} saisie${r.integrees > 1 ? "s" : ""} de l'iPhone intégrée${r.integrees > 1 ? "s" : ""}`
            : "Synchronisation effectuée"
        );
      }
    } catch (e) {
      toast(`Synchronisation impossible : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function activer() {
    let dossier = conf.dossier ?? (await dossierParDefaut());
    if (!dossier) {
      const choix = await open({
        directory: true,
        title: "Choisissez un dossier synchronisé par OneDrive",
      });
      if (typeof choix !== "string") return;
      dossier = choix;
    }
    ecrireConfSync({ actif: true, dossier, erreur: null });
    await synchroniser(false);
    setAppairage(await infosAppairage());
  }

  async function changerDossier() {
    const choix = await open({ directory: true, defaultPath: conf.dossier ?? undefined });
    if (typeof choix !== "string") return;
    ecrireConfSync({ dossier: choix });
    await synchroniser();
  }

  async function renouveler() {
    if (
      !window.confirm(
        "Générer une nouvelle clé de synchronisation ? L'iPhone actuellement appairé ne pourra plus synchroniser tant qu'il n'aura pas scanné le nouveau code."
      )
    )
      return;
    try {
      setAppairage(await renouvelerCleSync());
      await synchroniser(false);
    } catch (e) {
      toast(`Impossible de renouveler la clé : ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="flex-between" style={{ marginBottom: 6 }}>
        <h2 style={{ margin: 0 }}>Application iPhone</h2>
        {conf.actif && (
          <span className={`sync-etat ${conf.erreur ? "ko" : "ok"}`}>
            <span className="point" aria-hidden="true" />
            {conf.erreur ? "À vérifier" : "Active"}
          </span>
        )}
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
        Consultez vos soldes et saisissez une dépense depuis votre iPhone. Les échanges passent
        par votre OneDrive, <strong>chiffrés de bout en bout</strong> : seuls ce PC et votre
        téléphone détiennent la clé.
      </p>

      {!conf.actif ? (
        <button className="btn primary" onClick={activer} disabled={busy}>
          <Icon name="repeat" size={16} /> Activer la synchronisation
        </button>
      ) : (
        <>
          <div className="sync-grille">
            <div>
              <div className="sync-lib">Dossier OneDrive</div>
              <div className="sync-val" title={conf.dossier ?? ""}>
                {conf.dossier}
              </div>
            </div>
            <div>
              <div className="sync-lib">Dernière synchronisation</div>
              <div className="sync-val">{ilYa(conf.derniere)}</div>
            </div>
          </div>
          {conf.erreur && (
            <p className="sync-erreur">
              <Icon name="alert" size={15} /> {conf.erreur}
            </p>
          )}
          <div className="flex" style={{ flexWrap: "wrap", marginTop: 14 }}>
            <button className="btn primary" onClick={() => synchroniser()} disabled={busy}>
              <Icon name="repeat" size={16} /> {busy ? "Synchronisation…" : "Synchroniser maintenant"}
            </button>
            <button
              className="btn"
              onClick={async () => setAppairage(await infosAppairage())}
              disabled={busy}
            >
              <Icon name="lock" size={16} /> Appairer un iPhone
            </button>
            <button className="btn" onClick={changerDossier} disabled={busy}>
              <Icon name="folder" size={16} /> Changer de dossier
            </button>
            <button className="btn" onClick={() => ecrireConfSync({ actif: false })} disabled={busy}>
              Désactiver
            </button>
          </div>
        </>
      )}

      {appairage && (
        <Modal
          titre="Appairer votre iPhone"
          onClose={() => {
            setAppairage(null);
            setCodeVisible(false);
          }}
          footer={
            <>
              <button className="btn danger" onClick={renouveler}>
                Nouvelle clé
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  setAppairage(null);
                  setCodeVisible(false);
                }}
              >
                Terminé
              </button>
            </>
          }
        >
          <div className="appairage">
            <div className="appairage-etape">
              <div className="appairage-num">1</div>
              <div className="appairage-texte">
                <strong>Installez l'application</strong>
                <p>
                  Scannez ce code avec l'appareil photo de l'iPhone, ouvrez le lien dans{" "}
                  <strong>Safari</strong>, puis touchez <strong>Partager → Sur l'écran d'accueil</strong>.
                </p>
              </div>
              <QrCode valeur={URL_APP_MOBILE} taille={132} label="Adresse de l'application iPhone" />
            </div>
            <div className="appairage-etape">
              <div className="appairage-num">2</div>
              <div className="appairage-texte">
                <strong>Appairez-la à ce PC</strong>
                <p>
                  Ouvrez l'app depuis l'écran d'accueil, touchez <strong>Appairer</strong> et scannez
                  ce code. Vérifiez que l'iPhone affiche la même empreinte :
                </p>
                <div className="appairage-empreinte">{appairage.empreinte}</div>
                {codeVisible ? (
                  <code className="appairage-code">{appairage.code}</code>
                ) : (
                  <button className="appairage-lien" onClick={() => setCodeVisible(true)}>
                    Le scan ne fonctionne pas ? Afficher le code
                  </button>
                )}
              </div>
              <QrCode valeur={appairage.code} taille={168} label="Code d'appairage" />
            </div>
            <p className="appairage-note">
              <Icon name="lock" size={14} /> Ce second code est la clé de vos données : ne le
              photographiez pas et ne le partagez pas.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
