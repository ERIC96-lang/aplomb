import { useEffect, useState } from "react";
import { useAppData } from "../state/AppDataContext";
import { useToast } from "../state/ToastContext";
import { useLock } from "../state/LockContext";
import { verifierPin } from "../lib/pin";
import { Modal } from "../components/Modal";
import { Icon } from "../components/Icon";
import {
  appliquerReglesExistant,
  creerCategorie,
  creerRegle,
  listRegles,
  majCategorie,
  supprimerCategorie,
  supprimerRegle,
} from "../db/repo";
import {
  creerSauvegarde,
  exporterCsv,
  ouvrirDossierDonnees,
  ouvrirDossierSauvegardes,
  preparerRestauration,
} from "../lib/backup";
import type { RegleCategorisation } from "../db/types";
import { genererDonneesDemo, reinitialiserDonnees } from "../lib/demo";
import { convertirTousMontants } from "../db/repo";
import { recupererTaux } from "../lib/fx";
import { convertirProfil, ecrireProfil, lireProfil, type ModeRevenu } from "../lib/profil";
import { genererAuto } from "../lib/auto";
import { DEVISES, formatMontant } from "../lib/format";
import type { Categorie, CategorieType } from "../db/types";

const COULEURS = [
  "#ef4444", "#f59e0b", "#eab308", "#84cc16", "#22c55e", "#10b981",
  "#14b8a6", "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899", "#64748b",
];

export function Parametres() {
  const { categories, transactions, comptes, devise, changerDevise, rafraichir } = useAppData();
  const toast = useToast();
  const { pinDefini, delaiAutoLock, setDelaiAutoLock, helloDispo, biometrie, setBiometrie } = useLock();
  const [edit, setEdit] = useState<Categorie | "new" | null>(null);
  const [pinMode, setPinMode] = useState<"create" | "disable" | null>(null);
  const [convCible, setConvCible] = useState<string | null>(null);

  // Profil
  const [prof] = useState(() => lireProfil());
  const [revenu, setRevenu] = useState(prof.revenuMensuel ? String(prof.revenuMensuel) : "");
  const [jourPaie, setJourPaie] = useState(String(prof.jourPaie));
  const [comptePrincipal, setComptePrincipal] = useState<number | "">(prof.comptePrincipalId ?? "");
  const [tauxEpargne, setTauxEpargne] = useState(String(prof.tauxEpargneCible));
  const [modeRevenu, setModeRevenu] = useState<ModeRevenu>(prof.modeRevenu);
  const [revenuBas, setRevenuBas] = useState(prof.revenuBas ? String(prof.revenuBas) : "");
  const [revenuHaut, setRevenuHaut] = useState(prof.revenuHaut ? String(prof.revenuHaut) : "");

  // Règles de catégorisation
  const [regles, setRegles] = useState<RegleCategorisation[]>([]);
  const [regleMot, setRegleMot] = useState("");
  const [regleCat, setRegleCat] = useState<number | "">("");
  const rechargerRegles = () => listRegles().then(setRegles);
  useEffect(() => {
    rechargerRegles();
  }, []);
  const catNom = new Map(categories.map((c) => [c.id, c.nom]));

  async function ajouterRegle() {
    if (!regleMot.trim() || regleCat === "") return;
    await creerRegle(regleMot, Number(regleCat));
    setRegleMot("");
    setRegleCat("");
    await rechargerRegles();
    toast("Règle ajoutée");
  }

  async function enregistrerProfil() {
    ecrireProfil({
      revenuMensuel: parseFloat(revenu.replace(",", ".")) || 0,
      jourPaie: Math.min(31, Math.max(1, parseInt(jourPaie, 10) || 1)),
      comptePrincipalId: comptePrincipal === "" ? null : Number(comptePrincipal),
      tauxEpargneCible: parseFloat(tauxEpargne.replace(",", ".")) || 0,
      configure: true,
      modeRevenu,
      revenuBas: parseFloat(revenuBas.replace(",", ".")) || 0,
      revenuHaut: parseFloat(revenuHaut.replace(",", ".")) || 0,
    });
    const n = await genererAuto();
    await rafraichir();
    toast(n > 0 ? "Profil enregistré · transactions générées" : "Profil enregistré");
  }

  async function exporter() {
    try {
      await exporterCsv(transactions, comptes, categories);
      toast("Export CSV créé");
    } catch (e) {
      toast("Échec de l'export");
      console.error(e);
    }
  }

  const [busyDemo, setBusyDemo] = useState(false);

  async function chargerDemo() {
    setBusyDemo(true);
    try {
      await genererDonneesDemo();
      await rafraichir();
      toast("Données de démonstration ajoutées");
    } catch (e) {
      console.error(e);
      toast("Échec de la génération");
    }
    setBusyDemo(false);
  }

  async function reset() {
    if (!window.confirm("Tout réinitialiser ? Cela efface TOUTES tes données : comptes, transactions, charges, budgets, objectifs, factures et profil. (Seules les catégories par défaut sont conservées.) Action irréversible.")) return;
    setBusyDemo(true);
    try {
      await reinitialiserDonnees();
      await rafraichir();
      toast("Données réinitialisées");
    } catch (e) {
      console.error(e);
      toast("Échec de la réinitialisation");
    }
    setBusyDemo(false);
  }

  const revenus = categories.filter((c) => c.type === "revenu");
  const depenses = categories.filter((c) => c.type === "depense");

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Paramètres</h1>
          <div className="sub">Catégories, sauvegarde et export de tes données</div>
        </div>
      </div>

      {/* Profil */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h2>Mon profil</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: -8 }}>
          Renseigne ton revenu et ton jour de paie : l'app génère automatiquement ton salaire chaque mois
          et projette tes prochains mois dans les <strong>Prévisions</strong>.
        </p>
        <div className="row">
          <div className="field">
            <label>Revenu mensuel net</label>
            <input className="input" inputMode="decimal" value={revenu} onChange={(e) => setRevenu(e.target.value)} placeholder="ex. 2600" />
          </div>
          <div className="field">
            <label>Jour de paie</label>
            <input className="input" type="number" min={1} max={31} value={jourPaie} onChange={(e) => setJourPaie(e.target.value)} />
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label>Compte principal (versement du salaire)</label>
            <select className="select" value={comptePrincipal} onChange={(e) => setComptePrincipal(e.target.value === "" ? "" : Number(e.target.value))}>
              <option value="">—</option>
              {comptes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Taux d'épargne visé (%)</label>
            <input className="input" inputMode="decimal" value={tauxEpargne} onChange={(e) => setTauxEpargne(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label>Type de revenu (pour les prévisions)</label>
          <div className="segmented">
            <button type="button" className={modeRevenu === "fixe" ? "active" : ""} onClick={() => setModeRevenu("fixe")}>
              Fixe
            </button>
            <button type="button" className={modeRevenu === "moyenne" ? "active" : ""} onClick={() => setModeRevenu("moyenne")}>
              Moyenne réelle
            </button>
            <button type="button" className={modeRevenu === "fourchette" ? "active" : ""} onClick={() => setModeRevenu("fourchette")}>
              Fourchette
            </button>
          </div>
          <span className="muted" style={{ fontSize: 12 }}>
            {modeRevenu === "fixe" && "Les prévisions utilisent ton revenu mensuel ci-dessus."}
            {modeRevenu === "moyenne" && "Les prévisions s'appuient sur la moyenne de tes revenus réellement encaissés (6 derniers mois) — idéal si ça varie."}
            {modeRevenu === "fourchette" && "Définis un revenu prudent et optimiste : les prévisions proposeront des scénarios."}
          </span>
        </div>

        {modeRevenu === "fourchette" && (
          <div className="row">
            <div className="field">
              <label>Revenu prudent (bas)</label>
              <input className="input" inputMode="decimal" value={revenuBas} onChange={(e) => setRevenuBas(e.target.value)} placeholder="ex. 2200" />
            </div>
            <div className="field">
              <label>Revenu optimiste (haut)</label>
              <input className="input" inputMode="decimal" value={revenuHaut} onChange={(e) => setRevenuHaut(e.target.value)} placeholder="ex. 3000" />
            </div>
          </div>
        )}

        <button className="btn primary" onClick={enregistrerProfil}>
          <Icon name="check" size={16} /> Enregistrer mon profil
        </button>
      </div>

      {/* Devise */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h2>Devise de l'application</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: -8 }}>
          Change la devise d'affichage de tous les montants (soldes, graphiques, rapports).
          Les valeurs saisies ne sont pas converties, seul le symbole change.
        </p>
        <div className="flex" style={{ gap: 12 }}>
          <select
            className="select"
            style={{ maxWidth: 280 }}
            value={devise}
            onChange={(e) => e.target.value !== devise && setConvCible(e.target.value)}
          >
            {DEVISES.map((d) => (
              <option key={d.code} value={d.code}>
                {d.nom}
              </option>
            ))}
          </select>
          <span className="chip" style={{ background: "var(--brand-grad-soft)", color: "var(--accent)" }}>
            Aperçu : {formatMontant(1234.5)}
          </span>
        </div>
      </div>

      {/* Catégories */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="flex-between">
          <h2 style={{ margin: 0 }}>Catégories</h2>
          <button className="btn sm primary" onClick={() => setEdit("new")}>
            <Icon name="plus" size={15} /> Ajouter
          </button>
        </div>

        <div className="section-title">Dépenses</div>
        <CategorieList items={depenses} onEdit={setEdit} />
        <div className="section-title">Revenus</div>
        <CategorieList items={revenus} onEdit={setEdit} />
      </div>

      {/* Règles de catégorisation */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="flex-between">
          <h2 style={{ margin: 0 }}>Catégorisation automatique</h2>
          <button
            className="btn sm"
            onClick={async () => {
              const n = await appliquerReglesExistant();
              await rafraichir();
              toast(n > 0 ? `${n} transaction(s) catégorisée(s)` : "Rien à catégoriser");
            }}
          >
            Appliquer aux dépenses sans catégorie
          </button>
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
          Associe un mot-clé à une catégorie : les transactions importées (et les dépenses sans
          catégorie) sont classées automatiquement. Ex. « netflix » → Abonnements.
        </p>
        <div className="flex" style={{ gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <input
            className="input"
            style={{ maxWidth: 220 }}
            placeholder="Mot-clé (ex. carrefour)"
            value={regleMot}
            onChange={(e) => setRegleMot(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ajouterRegle()}
          />
          <select
            className="select"
            style={{ maxWidth: 200 }}
            value={regleCat}
            onChange={(e) => setRegleCat(e.target.value === "" ? "" : Number(e.target.value))}
          >
            <option value="">Catégorie…</option>
            {depenses.map((c) => (
              <option key={c.id} value={c.id}>{c.nom}</option>
            ))}
          </select>
          <button className="btn primary" onClick={ajouterRegle} disabled={!regleMot.trim() || regleCat === ""}>
            <Icon name="plus" size={15} /> Ajouter
          </button>
        </div>
        {regles.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>Aucune règle pour l'instant.</p>
        ) : (
          <div className="flex" style={{ flexWrap: "wrap", gap: 8 }}>
            {regles.map((r) => (
              <span key={r.id} className="chip" style={{ background: "var(--surface-2)" }}>
                <strong>{r.motcle}</strong> → {catNom.get(r.categorie_id) ?? "?"}
                <button
                  className="icon-btn"
                  style={{ fontSize: 15, marginLeft: 4 }}
                  onClick={async () => {
                    await supprimerRegle(r.id);
                    await rechargerRegles();
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Sauvegarde & export */}
      <div className="grid grid-2">
        <div className="card">
          <h2>Sauvegarde</h2>
          <p className="muted" style={{ fontSize: 13 }}>
            Toutes tes données (base SQLite + justificatifs PDF) sont stockées
            localement dans le dossier de données de l'app. Pense à copier ce
            dossier régulièrement sur un disque externe ou une clé USB.
          </p>
          <button
            className="btn"
            onClick={async () => {
              const d = await ouvrirDossierDonnees();
              toast(`Dossier : ${d}`);
            }}
          >
            <Icon name="folder" size={16} /> Ouvrir le dossier de données
          </button>
        </div>
        <div className="card">
          <h2>Export CSV</h2>
          <p className="muted" style={{ fontSize: 13 }}>
            Exporte toutes tes transactions dans un fichier CSV (compatible Excel /
            LibreOffice), utile comme sauvegarde de secours lisible.
          </p>
          <button className="btn" onClick={exporter}>
            <Icon name="download" size={16} /> Exporter en CSV
          </button>
        </div>
      </div>

      {/* Sauvegarde & restauration */}
      <div className="card" style={{ marginTop: 20 }}>
        <h2>Sauvegarde & restauration de la base</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: -8 }}>
          Crée une copie complète et <strong>chiffrée</strong> de ta base (AES-256, clé dans le
          trousseau Windows) — sûre à copier sur une clé USB ou le cloud. Une sauvegarde
          automatique est aussi faite une fois par jour (15 dernières conservées). La
          restauration remplace tes données actuelles par une sauvegarde choisie, au prochain lancement.
        </p>
        <div className="flex" style={{ gap: 10, flexWrap: "wrap" }}>
          <button
            className="btn primary"
            onClick={async () => {
              try {
                const nom = await creerSauvegarde();
                toast(`Sauvegarde créée : ${nom}`);
              } catch {
                toast("Échec de la sauvegarde");
              }
            }}
          >
            <Icon name="download" size={16} /> Sauvegarder maintenant
          </button>
          <button className="btn" onClick={() => ouvrirDossierSauvegardes()}>
            <Icon name="folder" size={16} /> Dossier des sauvegardes
          </button>
          <button
            className="btn danger"
            onClick={async () => {
              const ok = await preparerRestauration();
              if (!ok) return;
              window.alert(
                "Sauvegarde chargée. L'application va se fermer : rouvre-la pour terminer la restauration. Tes données actuelles seront remplacées."
              );
            }}
          >
            <Icon name="alert" size={16} /> Restaurer une sauvegarde…
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2>Sécurité — code PIN</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: -8 }}>
          Protège l'ouverture de l'application par un code PIN de 4 à 6 chiffres, demandé
          à chaque lancement. Le code est stocké sous forme chiffrée (jamais en clair).
        </p>
        {pinDefini ? (
          <div className="flex" style={{ gap: 10 }}>
            <span className="chip" style={{ background: "rgba(52,211,153,.15)", color: "var(--green)" }}>
              <Icon name="lock" size={13} /> PIN activé
            </span>
            <button className="btn" onClick={() => setPinMode("create")}>
              <Icon name="edit" size={15} /> Modifier le code
            </button>
            <button className="btn danger" onClick={() => setPinMode("disable")}>
              <Icon name="trash" size={15} /> Désactiver
            </button>
            <div className="flex" style={{ gap: 8, marginLeft: "auto" }}>
              <span className="muted" style={{ fontSize: 13 }}>Auto-verrouillage</span>
              <select
                className="select"
                style={{ width: 150 }}
                value={delaiAutoLock}
                onChange={(e) => setDelaiAutoLock(Number(e.target.value))}
              >
                <option value={0}>Désactivé</option>
                <option value={1}>Après 1 min</option>
                <option value={5}>Après 5 min</option>
                <option value={15}>Après 15 min</option>
                <option value={30}>Après 30 min</option>
              </select>
            </div>
          </div>
        ) : (
          <button className="btn primary" onClick={() => setPinMode("create")}>
            <Icon name="lock" size={16} /> Activer le code PIN
          </button>
        )}
        {pinDefini && helloDispo && (
          <label className="flex" style={{ cursor: "pointer", marginTop: 14 }}>
            <input
              type="checkbox"
              checked={biometrie}
              onChange={(e) => setBiometrie(e.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            Autoriser le déverrouillage par <strong>Windows Hello</strong> (empreinte / visage / PIN Windows)
          </label>
        )}
        {pinDefini && !helloDispo && (
          <p className="dim" style={{ fontSize: 12, marginTop: 12 }}>
            Windows Hello n'est pas disponible ou configuré sur ce PC.
          </p>
        )}
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2>Démonstration</h2>
        <p className="muted" style={{ fontSize: 13 }}>
          Remplis l'app avec ~4 mois de données d'exemple pour visualiser les courbes,
          rapports et suggestions. À effacer quand tu veux avant de saisir tes vraies données.
        </p>
        <div className="flex" style={{ gap: 10 }}>
          <button className="btn primary" onClick={chargerDemo} disabled={busyDemo}>
            <Icon name="sparkles" size={16} /> Charger des données de démo
          </button>
          <button className="btn danger" onClick={reset} disabled={busyDemo}>
            <Icon name="trash" size={16} /> Réinitialiser les données
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2>À propos</h2>
        <p className="muted" style={{ fontSize: 13 }}>
          Budget Perso v1 — application 100 % locale. Aucune donnée n'est envoyée
          en ligne, aucune connexion bancaire. Confidentialité : évite de placer le
          dossier de données dans un emplacement synchronisé publiquement
          (OneDrive / Google Drive).
        </p>
      </div>

      {edit && (
        <CategorieForm
          categorie={edit === "new" ? null : edit}
          onClose={() => setEdit(null)}
          onSaved={async () => {
            setEdit(null);
            await rafraichir();
            toast("Catégorie enregistrée");
          }}
          onDelete={async (id) => {
            await supprimerCategorie(id);
            setEdit(null);
            await rafraichir();
            toast("Catégorie supprimée");
          }}
        />
      )}

      {pinMode && (
        <PinModal mode={pinMode} onClose={() => setPinMode(null)} toast={toast} />
      )}

      {convCible && (
        <ConversionModal
          base={devise}
          cible={convCible}
          onClose={() => setConvCible(null)}
          onChanger={changerDevise}
          onRafraichir={rafraichir}
          toast={toast}
        />
      )}
    </>
  );
}

function ConversionModal({
  base,
  cible,
  onClose,
  onChanger,
  onRafraichir,
  toast,
}: {
  base: string;
  cible: string;
  onClose: () => void;
  onChanger: (code: string) => void;
  onRafraichir: () => Promise<void>;
  toast: (m: string) => void;
}) {
  const [taux, setTaux] = useState("");
  const [etat, setEtat] = useState<"charge" | "ok" | "hors">("charge");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let annule = false;
    recupererTaux(base, cible).then((t) => {
      if (annule) return;
      if (t != null) {
        setTaux(String(Math.round(t * 1e6) / 1e6));
        setEtat("ok");
      } else {
        setEtat("hors");
      }
    });
    return () => {
      annule = true;
    };
  }, [base, cible]);

  const tauxNum = parseFloat(taux.replace(",", "."));
  const valide = tauxNum > 0;

  async function convertir() {
    if (!valide) return;
    setBusy(true);
    await convertirTousMontants(tauxNum);
    convertirProfil(tauxNum);
    onChanger(cible);
    await onRafraichir();
    setBusy(false);
    toast("Montants convertis");
    onClose();
  }

  function sansConversion() {
    onChanger(cible);
    toast("Devise changée (sans conversion)");
    onClose();
  }

  return (
    <Modal
      titre={`Passer en ${cible}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={sansConversion} disabled={busy}>
            Changer sans convertir
          </button>
          <button className="btn primary" onClick={convertir} disabled={busy || !valide}>
            Convertir et changer
          </button>
        </>
      }
    >
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Convertir recalcule <strong>tous tes montants</strong> ({base} → {cible}) : soldes,
        transactions, charges, budgets, objectifs. Sinon, seul le symbole change.
      </p>
      <div className="field">
        <label>Taux de change (1 {base} = ? {cible})</label>
        <input
          className="input"
          inputMode="decimal"
          value={taux}
          onChange={(e) => setTaux(e.target.value)}
          placeholder={etat === "charge" ? "Récupération du taux en ligne…" : "ex. 655.957"}
        />
        <span className="muted" style={{ fontSize: 12 }}>
          {etat === "charge" && "Récupération du taux du jour…"}
          {etat === "ok" && "Taux du jour récupéré en ligne (modifiable)."}
          {etat === "hors" && "Hors-ligne : saisis le taux manuellement."}
        </span>
      </div>
      {valide && (
        <div className="chip" style={{ background: "var(--brand-grad-soft)", color: "var(--accent)" }}>
          Aperçu : 100 {base} = {(tauxNum * 100).toLocaleString("fr-FR")} {cible}
        </div>
      )}
    </Modal>
  );
}

function PinModal({
  mode,
  onClose,
  toast,
}: {
  mode: "create" | "disable";
  onClose: () => void;
  toast: (m: string) => void;
}) {
  const { definir, supprimer } = useLock();
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const digits = (s: string) => s.replace(/\D/g, "").slice(0, 6);

  async function submit() {
    setErreur(null);
    if (mode === "create") {
      if (pin.length < 4) return setErreur("Le code doit faire 4 à 6 chiffres.");
      if (pin !== pin2) return setErreur("Les deux codes ne correspondent pas.");
      setBusy(true);
      await definir(pin);
      setBusy(false);
      toast("Code PIN activé");
      onClose();
    } else {
      setBusy(true);
      const ok = await verifierPin(pin);
      setBusy(false);
      if (!ok) return setErreur("Code actuel incorrect.");
      supprimer();
      toast("Code PIN désactivé");
      onClose();
    }
  }

  return (
    <Modal
      titre={mode === "create" ? "Définir un code PIN" : "Désactiver le code PIN"}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn primary" onClick={submit} disabled={busy}>
            {mode === "create" ? "Enregistrer" : "Désactiver"}
          </button>
        </>
      }
    >
      {mode === "create" ? (
        <>
          <div className="field">
            <label>Nouveau code (4 à 6 chiffres)</label>
            <input
              className="input"
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(digits(e.target.value))}
              autoFocus
            />
          </div>
          <div className="field">
            <label>Confirmer le code</label>
            <input
              className="input"
              type="password"
              inputMode="numeric"
              value={pin2}
              onChange={(e) => setPin2(digits(e.target.value))}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
        </>
      ) : (
        <div className="field">
          <label>Saisis ton code actuel pour confirmer</label>
          <input
            className="input"
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(digits(e.target.value))}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>
      )}
      {erreur && <div style={{ color: "var(--red)", fontSize: 13, fontWeight: 600 }}>{erreur}</div>}
    </Modal>
  );
}

function CategorieList({
  items,
  onEdit,
}: {
  items: Categorie[];
  onEdit: (c: Categorie) => void;
}) {
  if (items.length === 0) return <p className="muted">Aucune.</p>;
  return (
    <div className="flex" style={{ flexWrap: "wrap", gap: 8 }}>
      {items.map((c) => (
        <button
          key={c.id}
          className="chip"
          style={{ background: c.couleur + "22", color: c.couleur, cursor: "pointer", border: "none" }}
          onClick={() => onEdit(c)}
        >
          <span className="dot" style={{ background: c.couleur }} />
          {c.nom}
        </button>
      ))}
    </div>
  );
}

function CategorieForm({
  categorie,
  onClose,
  onSaved,
  onDelete,
}: {
  categorie: Categorie | null;
  onClose: () => void;
  onSaved: () => void;
  onDelete: (id: number) => void;
}) {
  const [nom, setNom] = useState(categorie?.nom ?? "");
  const [type, setType] = useState<CategorieType>(categorie?.type ?? "depense");
  const [couleur, setCouleur] = useState(categorie?.couleur ?? COULEURS[9]);

  async function submit() {
    if (!nom.trim()) return;
    if (categorie) await majCategorie(categorie.id, { nom: nom.trim(), type, couleur });
    else await creerCategorie({ nom: nom.trim(), type, couleur });
    onSaved();
  }

  return (
    <Modal
      titre={categorie ? "Modifier la catégorie" : "Nouvelle catégorie"}
      onClose={onClose}
      footer={
        <>
          {categorie && (
            <button
              className="btn danger"
              style={{ marginRight: "auto" }}
              onClick={() => onDelete(categorie.id)}
            >
              Supprimer
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn primary" onClick={submit} disabled={!nom.trim()}>
            Enregistrer
          </button>
        </>
      }
    >
      <div className="field">
        <label>Nom</label>
        <input
          className="input"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          autoFocus
        />
      </div>
      <div className="field">
        <label>Type</label>
        <div className="segmented">
          <button
            type="button"
            className={type === "depense" ? "active" : ""}
            onClick={() => setType("depense")}
          >
            Dépense
          </button>
          <button
            type="button"
            className={type === "revenu" ? "active" : ""}
            onClick={() => setType("revenu")}
          >
            Revenu
          </button>
        </div>
      </div>
      <div className="field">
        <label>Couleur</label>
        <div className="flex" style={{ flexWrap: "wrap", gap: 8 }}>
          {COULEURS.map((col) => (
            <button
              key={col}
              type="button"
              onClick={() => setCouleur(col)}
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: col,
                border: couleur === col ? "3px solid var(--text)" : "2px solid #fff",
                boxShadow: "0 0 0 1px var(--border)",
                cursor: "pointer",
              }}
            />
          ))}
        </div>
      </div>
    </Modal>
  );
}
