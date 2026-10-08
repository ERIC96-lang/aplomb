import { useMemo, useState } from "react";
import { differenceInCalendarMonths } from "date-fns";
import { useAppData } from "../state/AppDataContext";
import { useToast } from "../state/ToastContext";
import { Modal } from "../components/Modal";
import { Icon } from "../components/Icon";
import {
  ajusterMontantObjectif,
  creerObjectif,
  majObjectif,
  supprimerObjectif,
  type ObjectifInput,
} from "../db/repo";
import { pointsFluxMensuel } from "../lib/series";
import {
  comptePartage,
  debutObjectif,
  modeSuivi,
  montantActuelObjectif,
  objectifLieCompte,
  projectionAtteinte,
  rythmeMensuelObjectif,
} from "../lib/objectifs";
import { formatMontant, formatDate, getDevise } from "../lib/format";
import type { Compte, ModeSuivi, Objectif } from "../db/types";

const COULEURS = ["#6d6bf5", "#2dd4bf", "#34d399", "#f59e0b", "#ec4899", "#60a5fa", "#a78bfa"];

export function Objectifs() {
  const { objectifs, comptes, transactions, rafraichir } = useAppData();
  const toast = useToast();
  const [edit, setEdit] = useState<Objectif | "new" | null>(null);

  // Épargne mensuelle moyenne (3 derniers mois) : projection des objectifs manuels.
  const epargneMoyenne = useMemo(() => {
    const flux = pointsFluxMensuel(transactions, undefined, 3);
    const m = flux.reduce((a, f) => a + f.epargne, 0) / (flux.length || 1);
    return Number.isFinite(m) ? m : 0;
  }, [transactions]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Objectifs d'épargne</h1>
          <div className="sub">
            {epargneMoyenne > 0
              ? `Épargne moyenne récente : ${formatMontant(epargneMoyenne)} / mois`
              : "Fixe-toi des objectifs chiffrés et suis leur progression"}
          </div>
        </div>
        <button className="btn primary" onClick={() => setEdit("new")}>
          <Icon name="plus" size={16} /> Nouvel objectif
        </button>
      </div>

      {objectifs.length === 0 ? (
        <div className="card empty">
          <div className="big">
            <Icon name="coins" size={44} strokeWidth={1.5} />
          </div>
          <p>Aucun objectif. Crée-en un (vacances, épargne de précaution, achat…) pour suivre ta progression.</p>
        </div>
      ) : (
        <div className="grid grid-auto">
          {objectifs.map((o) => (
            <ObjectifCard
              key={o.id}
              o={o}
              comptes={comptes}
              montantActuel={montantActuelObjectif(o, comptes, transactions, objectifs)}
              lieCompte={objectifLieCompte(o, comptes)}
              partage={comptePartage(o, objectifs)}
              rythme={rythmeMensuelObjectif(o, transactions, objectifs) ?? epargneMoyenne}
              rythmeReel={modeSuivi(o) !== "manuel"}
              onEdit={() => setEdit(o)}
              onChange={rafraichir}
              toast={toast}
            />
          ))}
        </div>
      )}

      {edit && (
        <ObjectifForm
          objectif={edit === "new" ? null : edit}
          comptes={comptes}
          onClose={() => setEdit(null)}
          onSaved={async () => {
            setEdit(null);
            await rafraichir();
            toast("Objectif enregistré");
          }}
          onDelete={async (id) => {
            await supprimerObjectif(id);
            setEdit(null);
            await rafraichir();
            toast("Objectif supprimé");
          }}
        />
      )}
    </>
  );
}

function ObjectifCard({
  o,
  comptes,
  montantActuel,
  lieCompte,
  partage,
  rythme,
  rythmeReel,
  onEdit,
  onChange,
  toast,
}: {
  o: Objectif;
  comptes: Compte[];
  montantActuel: number;
  lieCompte: boolean;
  partage: boolean;
  rythme: number;
  rythmeReel: boolean;
  onEdit: () => void;
  onChange: () => Promise<void>;
  toast: (m: string) => void;
}) {
  const [ajout, setAjout] = useState("");
  const mode = modeSuivi(o);
  const compteNom = lieCompte ? comptes.find((c) => c.id === o.compte_id)?.nom ?? null : null;
  const ratio = o.montant_cible > 0 ? Math.min(1, montantActuel / o.montant_cible) : 0;
  const atteint = montantActuel >= o.montant_cible;
  const reste = Math.max(0, o.montant_cible - montantActuel);

  // Projection : au rythme réel des versements (objectif suivi) ou de l'épargne moyenne.
  const projection = useMemo(() => projectionAtteinte(reste, rythme, atteint), [atteint, rythme, reste]);

  // Si une date cible est fixée : effort mensuel requis.
  const effortRequis = useMemo(() => {
    if (!o.date_cible || atteint) return null;
    const diff = differenceInCalendarMonths(new Date(o.date_cible), new Date());
    if (!Number.isFinite(diff)) return null; // date cible invalide → pas d'effort affiché
    const mois = Math.max(1, diff);
    return reste / mois;
  }, [o.date_cible, atteint, reste]);

  async function contribuer(delta: number) {
    await ajusterMontantObjectif(o.id, delta);
    await onChange();
    toast(delta >= 0 ? "Épargne ajoutée" : "Retrait enregistré");
  }

  const descriptionSuivi = mode === "versements" ? `Versements · ${compteNom}` : `Solde · ${compteNom}`;

  return (
    <div className="card">
      <div className="flex-between">
        <div style={{ fontWeight: 700, fontSize: 16 }}>{o.nom}</div>
        <button className="icon-btn" onClick={onEdit} aria-label="Modifier" style={{ fontSize: 16 }}>
          <Icon name="edit" size={16} />
        </button>
      </div>

      <div className="num" style={{ fontSize: 24, fontWeight: 750, margin: "10px 0 2px", color: o.couleur }}>
        {formatMontant(montantActuel)}
        <span className="muted" style={{ fontSize: 15, fontWeight: 500 }}> / {formatMontant(o.montant_cible)}</span>
      </div>
      <div className="progress" style={{ height: 10, marginTop: 8 }}>
        <span style={{ width: `${ratio * 100}%`, background: o.couleur }} />
      </div>
      <div className="flex-between" style={{ marginTop: 6, fontSize: 12 }}>
        <span className="dim">{Math.round(ratio * 100)} %</span>
        <span className="dim">{atteint ? "Terminé" : `Reste ${formatMontant(reste)}`}</span>
      </div>

      {compteNom && (
        <div
          className="chip"
          style={{ background: "var(--brand-grad-soft)", marginTop: 12, fontSize: 12 }}
          title={
            mode === "versements"
              ? "Chaque virement vers ce compte fait avancer l'objectif ; un retrait le fait reculer."
              : "La progression suit le solde total de ce compte."
          }
        >
          <Icon name="repeat" size={13} /> {descriptionSuivi}
        </div>
      )}
      {mode === "versements" && compteNom && (
        <div className="dim" style={{ fontSize: 12, marginTop: 6 }}>
          Virements comptés depuis le {formatDate(debutObjectif(o))}
        </div>
      )}
      {mode === "versements" && partage && (
        <div className="dim" style={{ fontSize: 12, marginTop: 6 }}>
          Compte partagé avec d'autres objectifs : choisis l'objectif alimenté à chaque virement.
        </div>
      )}

      <div className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
        {projection}
      </div>
      {rythmeReel && !atteint && rythme > 0 && (
        <div className="dim" style={{ fontSize: 12, marginTop: 3 }}>
          Au rythme de tes versements : {formatMontant(rythme)} / mois
        </div>
      )}
      {o.date_cible && (
        <div className="dim" style={{ fontSize: 12, marginTop: 3 }}>
          Cible : {formatDate(o.date_cible)}
          {effortRequis != null && ` · ${formatMontant(effortRequis)} / mois nécessaires`}
        </div>
      )}

      {!atteint && mode === "manuel" && (
        <div className="flex" style={{ gap: 6, marginTop: 14, flexWrap: "wrap" }}>
          <button className="btn sm" onClick={() => contribuer(50)}>+ 50</button>
          <button className="btn sm" onClick={() => contribuer(100)}>+ 100</button>
          <input
            className="input"
            style={{ width: 90, padding: "6px 9px" }}
            placeholder="Montant"
            inputMode="decimal"
            value={ajout}
            onChange={(e) => setAjout(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const n = parseFloat(ajout.replace(",", "."));
                if (n) {
                  contribuer(n);
                  setAjout("");
                }
              }
            }}
          />
          <button
            className="btn sm primary"
            onClick={() => {
              const n = parseFloat(ajout.replace(",", "."));
              if (n) {
                contribuer(n);
                setAjout("");
              }
            }}
            disabled={!ajout}
          >
            Ajouter
          </button>
        </div>
      )}
    </div>
  );
}

const MODES: { valeur: ModeSuivi; libelle: string; aide: string }[] = [
  {
    valeur: "versements",
    libelle: "Mes versements vers un compte",
    aide: "Chaque virement vers ce compte fait avancer l'objectif tout seul ; un retrait le fait reculer. Seuls les mouvements à partir de la création de l'objectif comptent.",
  },
  {
    valeur: "solde",
    libelle: "Le solde d'un compte",
    aide: "La progression suit le solde total du compte, y compris l'argent déjà présent.",
  },
  {
    valeur: "manuel",
    libelle: "Suivi manuel",
    aide: "Tu indiques toi-même tes versements avec les boutons de la carte.",
  },
];

function ObjectifForm({
  objectif,
  comptes,
  onClose,
  onSaved,
  onDelete,
}: {
  objectif: Objectif | null;
  comptes: Compte[];
  onClose: () => void;
  onSaved: () => void;
  onDelete: (id: number) => void;
}) {
  const devise = getDevise();
  const compteParDefaut = comptes.find((c) => c.type === "epargne")?.id ?? comptes[0]?.id ?? "";
  const [nom, setNom] = useState(objectif?.nom ?? "");
  const [cible, setCible] = useState(objectif ? String(objectif.montant_cible) : "");
  const [actuel, setActuel] = useState(objectif ? String(objectif.montant_actuel) : "0");
  const [dateCible, setDateCible] = useState(objectif?.date_cible ?? "");
  const [couleur, setCouleur] = useState(objectif?.couleur ?? COULEURS[0]);
  const [mode, setMode] = useState<ModeSuivi>(
    objectif ? modeSuivi(objectif) : comptes.length > 0 ? "versements" : "manuel"
  );
  const [compteId, setCompteId] = useState<number | "">(objectif?.compte_id ?? compteParDefaut);

  const surCompte = mode !== "manuel";
  const valide = nom.trim() && parseFloat(cible.replace(",", ".")) > 0 && (!surCompte || compteId !== "");

  async function submit() {
    if (!valide) return;
    const input: ObjectifInput = {
      nom: nom.trim(),
      montant_cible: parseFloat(cible.replace(",", ".")),
      // « solde » : calculé sur le compte, on stocke 0. Sinon : saisi / point de départ.
      montant_actuel: mode === "solde" ? 0 : parseFloat(actuel.replace(",", ".")) || 0,
      date_cible: dateCible || null,
      couleur,
      compte_id: surCompte ? Number(compteId) : null,
      mode_suivi: mode,
    };
    if (objectif) await majObjectif(objectif.id, input);
    else await creerObjectif(input);
    onSaved();
  }

  return (
    <Modal
      titre={objectif ? "Modifier l'objectif" : "Nouvel objectif"}
      onClose={onClose}
      footer={
        <>
          {objectif && (
            <button className="btn danger" style={{ marginRight: "auto" }} onClick={() => onDelete(objectif.id)}>
              Supprimer
            </button>
          )}
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={submit} disabled={!valide}>Enregistrer</button>
        </>
      }
    >
      <div className="field">
        <label>Nom de l'objectif</label>
        <input className="input" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="ex. Vacances d'été" autoFocus />
      </div>
      <div className="row">
        <div className="field">
          <label>Montant cible ({devise})</label>
          <input className="input" inputMode="decimal" value={cible} onChange={(e) => setCible(e.target.value)} placeholder="3000" />
        </div>
        {mode !== "solde" && (
          <div className="field">
            <label>{mode === "versements" ? `Déjà mis de côté avant (${devise})` : `Déjà épargné (${devise})`}</label>
            <input className="input" inputMode="decimal" value={actuel} onChange={(e) => setActuel(e.target.value)} />
            {mode === "versements" && (
              <div className="muted" style={{ fontSize: 11.5, marginTop: 5 }}>
                Argent mis de côté AVANT la création de l'objectif. Les virements saisis depuis sont comptés automatiquement.
              </div>
            )}
          </div>
        )}
      </div>

      <div className="field">
        <label>Progression</label>
        <select
          className="select"
          value={mode}
          onChange={(e) => {
            const suivant = e.target.value as ModeSuivi;
            // Passage aux versements : les virements déjà saisis seront comptés
            // automatiquement ; garder l'ancien total manuel les compterait deux fois.
            if (suivant === "versements" && mode !== "versements") setActuel("0");
            setMode(suivant);
          }}
          disabled={comptes.length === 0}
        >
          {MODES.filter((m) => comptes.length > 0 || m.valeur === "manuel").map((m) => (
            <option key={m.valeur} value={m.valeur}>
              {m.libelle}
            </option>
          ))}
        </select>
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          {MODES.find((m) => m.valeur === mode)?.aide}
        </div>
      </div>

      {surCompte && (
        <div className="field">
          <label>Compte suivi</label>
          <select
            className="select"
            value={compteId}
            onChange={(e) => setCompteId(e.target.value === "" ? "" : Number(e.target.value))}
          >
            {comptes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="field">
        <label>Date cible (optionnel)</label>
        <input className="input" type="date" value={dateCible} onChange={(e) => setDateCible(e.target.value)} />
      </div>
      <div className="field">
        <label>Couleur</label>
        <div className="flex" style={{ flexWrap: "wrap", gap: 8 }}>
          {COULEURS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCouleur(c)}
              style={{
                width: 28, height: 28, borderRadius: "50%", background: c,
                border: couleur === c ? "3px solid var(--text)" : "2px solid var(--surface)",
                boxShadow: "0 0 0 1px var(--border)", cursor: "pointer",
              }}
            />
          ))}
        </div>
      </div>
    </Modal>
  );
}
