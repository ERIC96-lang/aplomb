import { useRef, useState } from "react";
import { Icon } from "../../../src/components/Icon";
import { useToast } from "../../../src/state/ToastContext";
import { NOM_DOSSIER_SYNC } from "../../../src/sync/protocole";
import { Appairage } from "../Appairage";
import { VERSION_MOBILE } from "../config";
import { Entete, ilYaCourt } from "../composants";
import { useEtat } from "../etat";
import { ReglageCode, type ModeCode } from "../ReglageCode";
import { DELAIS, useVerrou } from "../verrou";

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function Reglages() {
  const {
    empreinte,
    inst,
    attente,
    sync,
    onedrive,
    synchroniser,
    importerFichier,
    partagerSaisies,
    connecterOneDrive,
    deconnecterOneDrive,
    oublierTout,
  } = useEtat();
  const toast = useToast();
  const fichier = useRef<HTMLInputElement>(null);
  const [appairage, setAppairage] = useState(false);
  const [modeCode, setModeCode] = useState<ModeCode | null>(null);
  const verrou = useVerrou();
  const aEnvoyer = attente.filter((s) => !s.envoyee).length;

  async function importer(f: File | undefined) {
    if (!f) return;
    try {
      await importerFichier(f);
      toast("Données du PC importées");
    } catch (e) {
      toast(message(e));
    } finally {
      if (fichier.current) fichier.current.value = "";
    }
  }

  async function envoyer() {
    try {
      const n = await partagerSaisies();
      toast(n === 0 ? "Aucune saisie à envoyer" : `${n} saisie${n > 1 ? "s" : ""} prête${n > 1 ? "s" : ""} à être relevée${n > 1 ? "s" : ""} par le PC`);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return; // partage annulé
      toast(message(e));
    }
  }

  async function oublier() {
    if (
      !window.confirm(
        aEnvoyer > 0
          ? `Effacer toutes les données de ce téléphone ? ${aEnvoyer} saisie(s) pas encore envoyée(s) seront perdues.`
          : "Effacer toutes les données de ce téléphone et oublier ce PC ? Vos données restent intactes sur le PC."
      )
    )
      return;
    await oublierTout();
    verrou.desactiver();
    toast("Données effacées de ce téléphone");
  }

  function basculerFaceId() {
    if (verrou.conf.faceId) {
      verrou.retirerFaceId();
      toast("Face ID désactivé");
      return;
    }
    // Appel direct depuis le toucher : iOS l'exige pour Face ID.
    verrou
      .activerFaceId()
      .then(() => toast("Face ID activé"))
      .catch(() => toast("Face ID n'a pas été activé"));
  }

  return (
    <>
      <Entete titre="Réglages" />
      <div className="m-page">
        <div className="m-groupe-titre">Ce téléphone</div>
        <div className="m-groupe">
          <div className="m-reglage">
            <span className="ico">
              <Icon name="lock" size={16} />
            </span>
            <div className="corps">
              <div className="titre">Appairé avec votre PC</div>
              <div className="sous">
                Empreinte <span className="m-empreinte">{empreinte}</span>
              </div>
            </div>
          </div>
          <button className="m-reglage" onClick={() => setAppairage(true)}>
            <span className="ico">
              <Icon name="camera" size={16} />
            </span>
            <div className="corps">
              <div className="titre">Appairer à nouveau</div>
              <div className="sous">Après un changement de clé sur le PC</div>
            </div>
            <Icon name="chevron-right" size={16} style={{ color: "var(--text-dim)" }} />
          </button>
        </div>

        <div className="m-groupe-titre">Sécurité</div>
        <div className="m-groupe">
          {!verrou.conf.actif ? (
            <button className="m-reglage" onClick={() => setModeCode("creer")}>
              <span className="ico">
                <Icon name="lock" size={16} />
              </span>
              <div className="corps">
                <div className="titre">Verrouiller l'app</div>
                <div className="sous">
                  Code{verrou.faceIdDispo ? " et Face ID" : ""} à chaque ouverture
                </div>
              </div>
              <Icon name="chevron-right" size={16} style={{ color: "var(--text-dim)" }} />
            </button>
          ) : (
            <>
              {verrou.faceIdDispo && (
                <button className="m-reglage" onClick={basculerFaceId}>
                  <span className="ico">
                    <Icon name="face-id" size={16} />
                  </span>
                  <div className="corps">
                    <div className="titre">Face ID</div>
                    <div className="sous">
                      {verrou.conf.faceId ? "Déverrouillage par un regard" : "Toucher pour activer"}
                    </div>
                  </div>
                  <span className={`m-interrupteur ${verrou.conf.faceId ? "on" : ""}`} aria-hidden="true" />
                </button>
              )}
              <label className="m-reglage">
                <span className="ico">
                  <Icon name="calendar" size={16} />
                </span>
                <div className="corps">
                  <div className="titre">Verrouiller</div>
                </div>
                <select
                  className="m-select-discret"
                  value={verrou.conf.delaiMin}
                  onChange={(e) => verrou.changerDelai(Number(e.target.value))}
                  aria-label="Délai de verrouillage"
                >
                  {DELAIS.map((d) => (
                    <option key={d.min} value={d.min}>
                      {d.libelle}
                    </option>
                  ))}
                </select>
              </label>
              <button className="m-reglage" onClick={() => setModeCode("changer")}>
                <span className="ico">
                  <Icon name="edit" size={16} />
                </span>
                <div className="corps">
                  <div className="titre">Changer le code</div>
                </div>
                <Icon name="chevron-right" size={16} style={{ color: "var(--text-dim)" }} />
              </button>
              <button className="m-reglage danger" onClick={() => setModeCode("desactiver")}>
                <div className="corps">
                  <div className="titre">Désactiver le verrouillage</div>
                </div>
              </button>
            </>
          )}
        </div>

        <div className="m-groupe-titre">Synchronisation OneDrive</div>
        {onedrive.disponible ? (
          <div className="m-groupe">
            <div className="m-reglage">
              <span className="ico">
                <Icon name="repeat" size={16} />
              </span>
              <div className="corps">
                <div className="titre">{onedrive.compte ? "Connecté" : "Non connecté"}</div>
                <div className="sous">{onedrive.compte ?? "Synchronisation automatique et chiffrée"}</div>
              </div>
            </div>
            {onedrive.compte ? (
              <>
                <button className="m-reglage" onClick={() => synchroniser()} disabled={sync.enCours}>
                  <span className="ico">
                    <Icon name="download" size={16} />
                  </span>
                  <div className="corps">
                    <div className="titre">{sync.enCours ? "Synchronisation…" : "Synchroniser maintenant"}</div>
                    <div className="sous">Dernière synchronisation {ilYaCourt(sync.derniere)}</div>
                  </div>
                </button>
                <button className="m-reglage danger" onClick={() => deconnecterOneDrive()}>
                  <div className="corps">
                    <div className="titre">Se déconnecter de OneDrive</div>
                  </div>
                </button>
              </>
            ) : (
              <button className="m-reglage" onClick={() => connecterOneDrive().catch((e) => toast(message(e)))}>
                <span className="ico">
                  <Icon name="lock" size={16} />
                </span>
                <div className="corps">
                  <div className="titre">Se connecter à OneDrive</div>
                  <div className="sous">Avec le compte Microsoft utilisé sur le PC</div>
                </div>
                <Icon name="chevron-right" size={16} style={{ color: "var(--text-dim)" }} />
              </button>
            )}
          </div>
        ) : (
          <p className="m-note">
            La synchronisation automatique sera disponible prochainement. En attendant, échangez les
            fichiers avec le PC via l'app Fichiers (ci-dessous).
          </p>
        )}
        {sync.erreur && (
          <div className="m-encart" role="status">
            <Icon name="alert" size={17} style={{ marginTop: 2 }} />
            <div>{sync.erreur}</div>
          </div>
        )}

        <div className="m-groupe-titre">Échange manuel</div>
        <div className="m-groupe">
          <button className="m-reglage" onClick={() => fichier.current?.click()}>
            <span className="ico">
              <Icon name="download" size={16} />
            </span>
            <div className="corps">
              <div className="titre">Importer les données du PC</div>
              <div className="sous">
                Fichier « instantane.bpsync » dans OneDrive › {NOM_DOSSIER_SYNC}
              </div>
            </div>
          </button>
          <button className="m-reglage" onClick={envoyer} disabled={aEnvoyer === 0}>
            <span className="ico">
              <Icon name="upload" size={16} />
            </span>
            <div className="corps">
              <div className="titre">
                Envoyer mes saisies{aEnvoyer > 0 ? ` (${aEnvoyer})` : ""}
              </div>
              <div className="sous">À enregistrer dans OneDrive › {NOM_DOSSIER_SYNC} › saisies</div>
            </div>
          </button>
        </div>
        <input
          ref={fichier}
          type="file"
          hidden
          onChange={(e) => importer(e.target.files?.[0])}
        />

        <div className="m-groupe-titre">À propos</div>
        <div className="m-groupe">
          <div className="m-reglage">
            <div className="corps">
              <div className="titre">Données du PC</div>
            </div>
            <span className="valeur">{inst ? ilYaCourt(inst.genere_le) : "—"}</span>
          </div>
          <div className="m-reglage">
            <div className="corps">
              <div className="titre">Version</div>
            </div>
            <span className="valeur">{VERSION_MOBILE}</span>
          </div>
        </div>
        <p className="m-note">
          Tout ce qui transite par OneDrive est chiffré (AES-256) avec une clé que seuls votre PC et
          ce téléphone possèdent.
        </p>

        <div className="m-groupe" style={{ marginTop: 6 }}>
          <button className="m-reglage danger" onClick={oublier}>
            <div className="corps">
              <div className="titre">Effacer les données de ce téléphone</div>
            </div>
          </button>
        </div>
      </div>

      {appairage && <Appairage onTermine={() => setAppairage(false)} onAnnuler={() => setAppairage(false)} />}
      {modeCode && <ReglageCode mode={modeCode} onFin={() => setModeCode(null)} />}
    </>
  );
}
