import { useMemo, useState } from "react";
import { addMonths, differenceInCalendarMonths, format } from "date-fns";
import { fr } from "date-fns/locale";
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
import { formatMontant, formatDate } from "../lib/format";
import type { Objectif } from "../db/types";

const COULEURS = ["#6d6bf5", "#2dd4bf", "#34d399", "#f59e0b", "#ec4899", "#60a5fa", "#a78bfa"];

export function Objectifs() {
  const { objectifs, transactions, rafraichir } = useAppData();
  const toast = useToast();
  const [edit, setEdit] = useState<Objectif | "new" | null>(null);

  // Épargne mensuelle moyenne (3 derniers mois) pour la projection.
  const epargneMoyenne = useMemo(() => {
    const flux = pointsFluxMensuel(transactions, undefined, 3);
    const m = flux.reduce((a, f) => a + f.epargne, 0) / (flux.length || 1);
    return m;
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
              epargneMoyenne={epargneMoyenne}
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
  epargneMoyenne,
  onEdit,
  onChange,
  toast,
}: {
  o: Objectif;
  epargneMoyenne: number;
  onEdit: () => void;
  onChange: () => Promise<void>;
  toast: (m: string) => void;
}) {
  const [ajout, setAjout] = useState("");
  const ratio = o.montant_cible > 0 ? Math.min(1, o.montant_actuel / o.montant_cible) : 0;
  const atteint = o.montant_actuel >= o.montant_cible;
  const reste = Math.max(0, o.montant_cible - o.montant_actuel);

  // Projection : date d'atteinte estimée au rythme d'épargne moyen.
  const projection = useMemo(() => {
    if (atteint) return "Objectif atteint 🎉";
    if (epargneMoyenne <= 0) return "Rythme d'épargne insuffisant pour estimer";
    const mois = Math.ceil(reste / epargneMoyenne);
    const date = addMonths(new Date(), mois);
    return `Atteint vers ${format(date, "MMMM yyyy", { locale: fr })} (~${mois} mois)`;
  }, [atteint, epargneMoyenne, reste]);

  // Si une date cible est fixée : effort mensuel requis.
  const effortRequis = useMemo(() => {
    if (!o.date_cible || atteint) return null;
    const mois = Math.max(1, differenceInCalendarMonths(new Date(o.date_cible), new Date()));
    return reste / mois;
  }, [o.date_cible, atteint, reste]);

  async function contribuer(delta: number) {
    await ajusterMontantObjectif(o.id, delta);
    await onChange();
    toast(delta >= 0 ? "Épargne ajoutée" : "Retrait enregistré");
  }

  return (
    <div className="card">
      <div className="flex-between">
        <div style={{ fontWeight: 700, fontSize: 16 }}>{o.nom}</div>
        <button className="icon-btn" onClick={onEdit} aria-label="Modifier" style={{ fontSize: 16 }}>
          <Icon name="edit" size={16} />
        </button>
      </div>

      <div className="num" style={{ fontSize: 24, fontWeight: 750, margin: "10px 0 2px", color: o.couleur }}>
        {formatMontant(o.montant_actuel)}
        <span className="muted" style={{ fontSize: 15, fontWeight: 500 }}> / {formatMontant(o.montant_cible)}</span>
      </div>
      <div className="progress" style={{ height: 10, marginTop: 8 }}>
        <span style={{ width: `${ratio * 100}%`, background: o.couleur }} />
      </div>
      <div className="flex-between" style={{ marginTop: 6, fontSize: 12 }}>
        <span className="dim">{Math.round(ratio * 100)} %</span>
        <span className="dim">{atteint ? "Terminé" : `Reste ${formatMontant(reste)}`}</span>
      </div>

      <div className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
        {projection}
      </div>
      {o.date_cible && (
        <div className="dim" style={{ fontSize: 12, marginTop: 3 }}>
          Cible : {formatDate(o.date_cible)}
          {effortRequis != null && ` · ${formatMontant(effortRequis)} / mois nécessaires`}
        </div>
      )}

      {!atteint && (
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

function ObjectifForm({
  objectif,
  onClose,
  onSaved,
  onDelete,
}: {
  objectif: Objectif | null;
  onClose: () => void;
  onSaved: () => void;
  onDelete: (id: number) => void;
}) {
  const [nom, setNom] = useState(objectif?.nom ?? "");
  const [cible, setCible] = useState(objectif ? String(objectif.montant_cible) : "");
  const [actuel, setActuel] = useState(objectif ? String(objectif.montant_actuel) : "0");
  const [dateCible, setDateCible] = useState(objectif?.date_cible ?? "");
  const [couleur, setCouleur] = useState(objectif?.couleur ?? COULEURS[0]);

  const valide = nom.trim() && parseFloat(cible.replace(",", ".")) > 0;

  async function submit() {
    if (!valide) return;
    const input: ObjectifInput = {
      nom: nom.trim(),
      montant_cible: parseFloat(cible.replace(",", ".")),
      montant_actuel: parseFloat(actuel.replace(",", ".")) || 0,
      date_cible: dateCible || null,
      couleur,
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
          <label>Montant cible (€)</label>
          <input className="input" inputMode="decimal" value={cible} onChange={(e) => setCible(e.target.value)} placeholder="3000" />
        </div>
        <div className="field">
          <label>Déjà épargné (€)</label>
          <input className="input" inputMode="decimal" value={actuel} onChange={(e) => setActuel(e.target.value)} />
        </div>
      </div>
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
