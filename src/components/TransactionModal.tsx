import { useMemo, useState } from "react";
import { Modal } from "./Modal";
import { useAppData } from "../state/AppDataContext";
import {
  creerTransaction,
  majTransaction,
  supprimerTransaction,
  type TransactionInput,
} from "../db/repo";
import { aujourdhui } from "../lib/format";
import { genererRecuTransaction } from "../lib/pdf";
import { Icon } from "./Icon";
import type { Transaction, TxType } from "../db/types";

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
  const { comptes, categories } = useAppData();

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
  const [busy, setBusy] = useState(false);

  const categoriesFiltrees = useMemo(
    () =>
      categories.filter((c) =>
        type === "revenu" ? c.type === "revenu" : c.type === "depense"
      ),
    [categories, type]
  );

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
    };
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
          <label>Montant (€)</label>
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
          onChange={(e) => setDescription(e.target.value)}
          placeholder="ex. Courses Carrefour"
        />
      </div>

      {erreur && (
        <div style={{ color: "var(--red)", fontSize: 13, fontWeight: 600 }}>{erreur}</div>
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
