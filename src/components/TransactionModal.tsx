import { useEffect, useMemo, useState } from "react";
import { Modal } from "./Modal";
import { useAppData } from "../state/AppDataContext";
import {
  creerRegle,
  creerTransaction,
  definirJustificatifTransaction,
  listRegles,
  majTransaction,
  supprimerTransaction,
  type TransactionInput,
} from "../db/repo";
import { aujourdhui, getDevise } from "../lib/format";
import { objectifPrincipalDuCompte, objectifsVersementsDuCompte } from "../lib/objectifs";
import { categoriePourDescription, motCleDepuisDescription } from "../lib/categorisation";
import { genererRecuTransaction } from "../lib/pdf";
import { choisirEtCopierJustificatif, ouvrirJustificatif } from "../lib/justificatifs";
import { Icon } from "./Icon";
import type { RegleCategorisation, Transaction, TxType } from "../db/types";

interface Props {
  transaction?: Transaction | null; // édition
  presets?: Partial<TransactionInput>; // valeurs pré-remplies (ex. depuis une échéance)
  lockType?: TxType; // fige le type (ex. "depense" pour régler une charge)
  onClose: () => void;
  onSaved: (txId: number) => void | Promise<void>;
}

const TYPES: { value: TxType; label: string }[] = [
  { value: "depense", label: "Dépense" },
  { value: "revenu", label: "Revenu" },
  { value: "virement", label: "Virement" },
];

export function TransactionModal({
  transaction,
  presets,
  lockType,
  onClose,
  onSaved,
}: Props) {
  const { comptes, categories, objectifs } = useAppData();

  const [type, setType] = useState<TxType>(
    lockType ?? transaction?.type ?? presets?.type ?? "depense"
  );
  const [montant, setMontant] = useState(
    transaction ? String(transaction.montant) : presets?.montant != null ? String(presets.montant) : ""
  );
  const [date, setDate] = useState(transaction?.date ?? presets?.date ?? aujourdhui());
  const [description, setDescription] = useState(
    transaction?.description ?? presets?.description ?? ""
  );
  const [compteId, setCompteId] = useState<number | "">(
    transaction?.compte_id ?? presets?.compte_id ?? comptes[0]?.id ?? ""
  );
  const [compteDestId, setCompteDestId] = useState<number | "">(
    transaction?.compte_dest_id ?? presets?.compte_dest_id ?? ""
  );
  const [categorieId, setCategorieId] = useState<number | "">(
    transaction?.categorie_id ?? presets?.categorie_id ?? ""
  );
  const [objectifId, setObjectifId] = useState<number | "">(
    transaction?.objectif_id ?? presets?.objectif_id ?? ""
  );
  const [busy, setBusy] = useState(false);
  const [justif, setJustif] = useState<string | null>(transaction?.justificatif_path ?? null);

  // F1 — catégorisation apprenante : règles existantes + option « mémoriser ».
  const [regles, setRegles] = useState<RegleCategorisation[]>([]);
  const [memoriser, setMemoriser] = useState(true);
  const [motCleManuel, setMotCleManuel] = useState<string | null>(null);
  useEffect(() => {
    listRegles().then(setRegles).catch(() => {});
  }, []);

  const dejaCouvert = useMemo(
    () => categoriePourDescription(regles, description) != null,
    [regles, description]
  );
  const motCleSuggere = motCleManuel ?? motCleDepuisDescription(description);
  // Proposer la mémorisation seulement pour une dépense/revenu catégorisé à la
  // main dont le libellé n'est pas déjà pris en charge par une règle.
  const proposerRegle =
    type !== "virement" &&
    categorieId !== "" &&
    description.trim().length > 0 &&
    !dejaCouvert &&
    motCleSuggere.length >= 3;

  /** À la saisie du libellé, pré-remplit la catégorie via les règles apprises. */
  function onDescriptionChange(valeur: string) {
    setDescription(valeur);
    setMotCleManuel(null);
    if (type !== "virement" && categorieId === "") {
      const cat = categoriePourDescription(regles, valeur);
      if (cat != null) setCategorieId(cat);
    }
  }

  async function joindreJustificatif() {
    if (!transaction) return;
    const path = await choisirEtCopierJustificatif(
      description.trim() || `transaction-${transaction.id}`,
      date.slice(0, 7)
    );
    if (!path) return;
    await definirJustificatifTransaction(transaction.id, path);
    setJustif(path);
  }
  async function retirerJustificatif() {
    if (!transaction) return;
    await definirJustificatifTransaction(transaction.id, null);
    setJustif(null);
  }

  const categoriesFiltrees = useMemo(
    () =>
      categories.filter((c) =>
        type === "revenu" ? c.type === "revenu" : c.type === "depense"
      ),
    [categories, type]
  );

  // Objectifs « versements » concernés par ce virement (compte de destination ou de source).
  const objectifsVirement = useMemo(() => {
    if (type !== "virement") return [];
    const dest = compteDestId === "" ? null : Number(compteDestId);
    const src = compteId === "" ? null : Number(compteId);
    const l = [...objectifsVersementsDuCompte(objectifs, dest), ...objectifsVersementsDuCompte(objectifs, src)];
    return l.filter((o, i) => l.findIndex((x) => x.id === o.id) === i);
  }, [type, compteId, compteDestId, objectifs]);
  // Objectif retenu : le choix explicite s'il est valide, sinon le plus ancien du compte.
  const objectifRetenu =
    objectifsVirement.find((o) => o.id === objectifId) ??
    objectifPrincipalDuCompte(objectifs, compteDestId === "" ? null : Number(compteDestId)) ??
    objectifPrincipalDuCompte(objectifs, compteId === "" ? null : Number(compteId));

  const erreur = (() => {
    const m = parseFloat(montant.replace(",", "."));
    if (!m || m <= 0) return "Montant invalide";
    if (type === "virement") {
      if (!compteId || !compteDestId) return "Choisis les deux comptes";
      if (compteId === compteDestId) return "Comptes source et destination identiques";
    } else if (!compteId) {
      return "Choisis un compte";
    }
    return null;
  })();

  async function submit() {
    if (erreur) return;
    setBusy(true);
    const m = parseFloat(montant.replace(",", "."));
    const input: TransactionInput = {
      type,
      montant: m,
      date,
      description: description.trim() || null,
      compte_id: compteId === "" ? null : Number(compteId),
      compte_dest_id:
        type === "virement" && compteDestId !== "" ? Number(compteDestId) : null,
      categorie_id:
        type === "virement" ? null : categorieId === "" ? null : Number(categorieId),
      objectif_id: objectifsVirement.length > 0 ? objectifRetenu?.id ?? null : null,
    };
    // F1 — mémorise une règle de catégorisation à partir de ce classement manuel.
    if (proposerRegle && memoriser && input.categorie_id != null) {
      const motcle = motCleSuggere.trim().toLowerCase();
      if (motcle.length >= 3 && !regles.some((r) => r.motcle === motcle)) {
        await creerRegle(motcle, input.categorie_id).catch(() => {});
      }
    }

    let id: number;
    if (transaction) {
      await majTransaction(transaction.id, input);
      id = transaction.id;
    } else {
      id = await creerTransaction(input);
    }
    await onSaved(id);
  }

  return (
    <Modal
      titre={transaction ? "Modifier la transaction" : "Nouvelle transaction"}
      onClose={onClose}
      footer={
        <>
          {transaction && (
            <>
              <button
                className="btn danger"
                onClick={async () => {
                  await supprimerTransaction(transaction.id);
                  await onSaved(transaction.id);
                }}
              >
                Supprimer
              </button>
              <button
                className="btn"
                style={{ marginRight: "auto" }}
                onClick={() =>
                  genererRecuTransaction(
                    transaction,
                    comptes.find((c) => c.id === transaction.compte_id)?.nom ?? "—",
                    categories.find((c) => c.id === transaction.categorie_id)?.nom ?? null
                  )
                }
              >
                <Icon name="download" size={15} /> Reçu PDF
              </button>
            </>
          )}
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn primary" onClick={submit} disabled={busy || !!erreur}>
            Enregistrer
          </button>
        </>
      }
    >
      {!lockType && (
        <div className="field">
          <label>Type</label>
          <div className="segmented">
            {TYPES.map((t) => (
              <button
                key={t.value}
                className={type === t.value ? "active" : ""}
                onClick={() => setType(t.value)}
                type="button"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="row">
        <div className="field">
          <label>Montant ({getDevise()})</label>
          <input
            className="input"
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
            placeholder="0,00"
            inputMode="decimal"
            autoFocus
          />
        </div>
        <div className="field">
          <label>Date</label>
          <input
            className="input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      {type === "virement" ? (
        <div className="row">
          <div className="field">
            <label>Compte source</label>
            <select
              className="select"
              value={compteId}
              onChange={(e) => setCompteId(e.target.value === "" ? "" : Number(e.target.value))}
            >
              <option value="">—</option>
              {comptes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Compte destination</label>
            <select
              className="select"
              value={compteDestId}
              onChange={(e) =>
                setCompteDestId(e.target.value === "" ? "" : Number(e.target.value))
              }
            >
              <option value="">—</option>
              {comptes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <div className="row">
          <div className="field">
            <label>Compte</label>
            <select
              className="select"
              value={compteId}
              onChange={(e) => setCompteId(e.target.value === "" ? "" : Number(e.target.value))}
            >
              <option value="">—</option>
              {comptes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Catégorie</label>
            <select
              className="select"
              value={categorieId}
              onChange={(e) =>
                setCategorieId(e.target.value === "" ? "" : Number(e.target.value))
              }
            >
              <option value="">Sans catégorie</option>
              {categoriesFiltrees.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="field">
        <label>Description</label>
        <input
          className="input"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="ex. Courses Carrefour"
        />
      </div>

      {proposerRegle && (
        <label
          className="flex"
          style={{ gap: 9, alignItems: "center", marginTop: -4, fontSize: 13, cursor: "pointer" }}
        >
          <input type="checkbox" checked={memoriser} onChange={(e) => setMemoriser(e.target.checked)} />
          <span className="muted">Classer automatiquement les prochaines transactions contenant</span>
          <input
            className="input"
            style={{ width: 150, padding: "5px 8px" }}
            value={motCleSuggere}
            onChange={(e) => setMotCleManuel(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            disabled={!memoriser}
          />
        </label>
      )}

      {transaction && (
        <div className="field">
          <label>Justificatif (PDF)</label>
          {justif ? (
            <div className="flex" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span className="chip" style={{ background: "var(--brand-grad-soft)" }}>
                <Icon name="paperclip" size={13} /> Justificatif joint
              </span>
              <button className="btn" type="button" onClick={() => ouvrirJustificatif(justif)}>
                Voir
              </button>
              <button className="btn danger" type="button" onClick={retirerJustificatif}>
                Retirer
              </button>
            </div>
          ) : (
            <button className="btn" type="button" onClick={joindreJustificatif}>
              <Icon name="paperclip" size={15} /> Joindre un PDF
            </button>
          )}
        </div>
      )}

      {erreur && (
        <div style={{ color: "var(--red)", fontSize: 13, fontWeight: 600 }}>{erreur}</div>
      )}

      {objectifsVirement.length === 1 && (
        <div className="chip" style={{ background: "var(--brand-grad-soft)", fontSize: 12.5, alignSelf: "flex-start" }}>
          <Icon name="target" size={13} /> Alimente l'objectif « {objectifsVirement[0].nom} »
        </div>
      )}
      {objectifsVirement.length > 1 && (
        <div className="field">
          <label>Objectif alimenté</label>
          <select
            className="select"
            value={objectifRetenu?.id ?? ""}
            onChange={(e) => setObjectifId(e.target.value === "" ? "" : Number(e.target.value))}
          >
            {objectifsVirement.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nom}
              </option>
            ))}
          </select>
        </div>
      )}

      {type === "virement" && (
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          Un virement déplace de l'argent entre tes comptes. Il n'est jamais compté
          comme revenu ni comme dépense dans les totaux.
        </div>
      )}
    </Modal>
  );
}
