import { useMemo, useState } from "react";
import { useAppData } from "../state/AppDataContext";
import { useToast } from "../state/ToastContext";
import { Modal } from "../components/Modal";
import { Icon } from "../components/Icon";
import { TransactionModal } from "../components/TransactionModal";
import {
  creerChargeFixe,
  majChargeFixe,
  majEcheance,
  supprimerChargeFixe,
  type ChargeFixeInput,
} from "../db/repo";
import { statutPaye } from "../lib/echeances";
import {
  choisirEtCopierJustificatif,
  ouvrirJustificatif,
} from "../lib/justificatifs";
import { formatMois, formatMontant, moisCourant } from "../lib/format";
import type { ChargeFixe, Echeance, Periodicite, Transaction } from "../db/types";

const STATUT_LABEL: Record<string, string> = {
  a_venir: "À venir",
  en_retard: "En retard",
  payee_sans_justif: "Payée · sans justif.",
  payee_avec_justif: "Payée · avec justif.",
};

export function ChargesFixes() {
  const { chargesFixes, echeances, comptes, categories, transactions, rafraichir } =
    useAppData();
  const toast = useToast();
  const mois = moisCourant();

  const [edit, setEdit] = useState<ChargeFixe | "new" | null>(null);
  const [regler, setRegler] = useState<{ charge: ChargeFixe; echeance: Echeance } | null>(
    null
  );

  const compteNom = useMemo(() => new Map(comptes.map((c) => [c.id, c.nom])), [comptes]);
  const catNom = useMemo(() => new Map(categories.map((c) => [c.id, c.nom])), [categories]);
  const chargeById = useMemo(
    () => new Map(chargesFixes.map((c) => [c.id, c])),
    [chargesFixes]
  );

  const echeancesMois = useMemo(
    () =>
      echeances
        .filter((e) => e.mois === mois)
        .map((e) => ({ e, charge: chargeById.get(e.charge_fixe_id) }))
        .filter((x): x is { e: Echeance; charge: ChargeFixe } => !!x.charge)
        .sort((a, b) => a.charge.jour_echeance - b.charge.jour_echeance),
    [echeances, mois, chargeById]
  );

  async function attacherJustificatif(charge: ChargeFixe, e: Echeance) {
    const path = await choisirEtCopierJustificatif(charge.nom, e.mois);
    if (!path) return;
    await majEcheance(e.id, {
      justificatif_path: path,
      statut: e.transaction_id != null ? "payee_avec_justif" : e.statut,
    });
    await rafraichir();
    toast("Justificatif attaché");
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Charges fixes</h1>
          <div className="sub">Échéances de {formatMois(mois)} et gestion des charges récurrentes</div>
        </div>
        <button
          className="btn primary"
          onClick={() => setEdit("new")}
          disabled={comptes.length === 0}
          title={comptes.length === 0 ? "Crée d'abord un compte" : ""}
        >
          <Icon name="plus" size={16} /> Nouvelle charge fixe
        </button>
      </div>

      {/* Échéances du mois */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h2>Échéances de {formatMois(mois)}</h2>
        {echeancesMois.length === 0 ? (
          <p className="muted">Aucune charge fixe active ce mois-ci.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Charge</th>
                  <th>Échéance</th>
                  <th>Compte</th>
                  <th className="right">Montant attendu</th>
                  <th>Statut</th>
                  <th className="right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {echeancesMois.map(({ e, charge }) => (
                  <tr key={e.id}>
                    <td style={{ fontWeight: 600 }}>{charge.nom}</td>
                    <td>le {charge.jour_echeance}</td>
                    <td>{compteNom.get(charge.compte_id) ?? "—"}</td>
                    <td className="right">{formatMontant(charge.montant_attendu)}</td>
                    <td>
                      <span className={`badge ${e.statut}`}>{STATUT_LABEL[e.statut]}</span>
                    </td>
                    <td className="right">
                      <div className="flex" style={{ justifyContent: "flex-end", gap: 6 }}>
                        {e.transaction_id == null ? (
                          <button
                            className="btn sm primary"
                            onClick={() => setRegler({ charge, echeance: e })}
                          >
                            Régler
                          </button>
                        ) : (
                          <button
                            className="btn sm"
                            onClick={() => setRegler({ charge, echeance: e })}
                          >
                            Modifier
                          </button>
                        )}
                        {e.justificatif_path ? (
                          <button
                            className="btn sm"
                            onClick={() => ouvrirJustificatif(e.justificatif_path!)}
                          >
                            <Icon name="paperclip" size={14} /> Voir
                          </button>
                        ) : (
                          <button
                            className="btn sm"
                            onClick={() => attacherJustificatif(charge, e)}
                          >
                            <Icon name="paperclip" size={14} /> Justif.
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Toutes les charges */}
      <div className="card">
        <h2>Toutes les charges fixes</h2>
        {chargesFixes.length === 0 ? (
          <div className="empty">
            <div className="big">
              <Icon name="repeat" size={44} strokeWidth={1.5} />
            </div>
            <p>Aucune charge fixe. Ajoute tes loyers, abonnements, assurances…</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Jour</th>
                  <th>Compte</th>
                  <th>Catégorie</th>
                  <th className="right">Montant</th>
                  <th>État</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {chargesFixes.map((c) => (
                  <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => setEdit(c)}>
                    <td style={{ fontWeight: 600 }}>{c.nom}</td>
                    <td>le {c.jour_echeance}</td>
                    <td>{compteNom.get(c.compte_id) ?? "—"}</td>
                    <td>{c.categorie_id != null ? catNom.get(c.categorie_id) ?? "—" : "—"}</td>
                    <td className="right">{formatMontant(c.montant_attendu)}</td>
                    <td>
                      {c.actif ? (
                        <span className="chip" style={{ background: "#ecfdf5", color: "#059669" }}>
                          Active
                        </span>
                      ) : (
                        <span className="chip" style={{ background: "#f1f5f9", color: "#64748b" }}>
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="right muted">modifier ›</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {edit && (
        <ChargeForm
          charge={edit === "new" ? null : edit}
          onClose={() => setEdit(null)}
          onSaved={async () => {
            setEdit(null);
            await rafraichir();
            toast("Charge fixe enregistrée");
          }}
          onDelete={async (id) => {
            await supprimerChargeFixe(id);
            setEdit(null);
            await rafraichir();
            toast("Charge fixe supprimée");
          }}
        />
      )}

      {regler && (
        <ReglerEcheance
          charge={regler.charge}
          echeance={regler.echeance}
          transactions={transactions}
          onClose={() => setRegler(null)}
          onDone={async () => {
            setRegler(null);
            await rafraichir();
            toast("Échéance mise à jour");
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

function ChargeForm({
  charge,
  onClose,
  onSaved,
  onDelete,
}: {
  charge: ChargeFixe | null;
  onClose: () => void;
  onSaved: () => void;
  onDelete: (id: number) => void;
}) {
  const { comptes, categories } = useAppData();
  const categoriesDepense = categories.filter((c) => c.type === "depense");

  const [nom, setNom] = useState(charge?.nom ?? "");
  const [montant, setMontant] = useState(charge ? String(charge.montant_attendu) : "");
  const [compteId, setCompteId] = useState<number | "">(charge?.compte_id ?? comptes[0]?.id ?? "");
  const [categorieId, setCategorieId] = useState<number | "">(charge?.categorie_id ?? "");
  const [jour, setJour] = useState(String(charge?.jour_echeance ?? 1));
  const [periodicite, setPeriodicite] = useState<Periodicite>(charge?.periodicite ?? "mensuelle");
  const [actif, setActif] = useState(charge ? charge.actif === 1 : true);
  const [busy, setBusy] = useState(false);

  const montantNum = parseFloat(montant.replace(",", "."));
  const jourNum = parseInt(jour, 10);
  const valide =
    nom.trim() && montantNum > 0 && compteId !== "" && jourNum >= 1 && jourNum <= 31;

  async function submit() {
    if (!valide) return;
    setBusy(true);
    const input: ChargeFixeInput = {
      nom: nom.trim(),
      montant_attendu: montantNum,
      compte_id: Number(compteId),
      categorie_id: categorieId === "" ? null : Number(categorieId),
      jour_echeance: jourNum,
      actif: actif ? 1 : 0,
      periodicite,
    };
    if (charge) await majChargeFixe(charge.id, input);
    else await creerChargeFixe(input);
    onSaved();
  }

  return (
    <Modal
      titre={charge ? "Modifier la charge fixe" : "Nouvelle charge fixe"}
      onClose={onClose}
      footer={
        <>
          {charge && (
            <button
              className="btn danger"
              style={{ marginRight: "auto" }}
              onClick={() => onDelete(charge.id)}
            >
              Supprimer
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn primary" onClick={submit} disabled={busy || !valide}>
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
          placeholder="ex. Loyer"
          autoFocus
        />
      </div>
      <div className="row">
        <div className="field">
          <label>Montant attendu (€)</label>
          <input
            className="input"
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
            placeholder="0,00"
            inputMode="decimal"
          />
        </div>
        <div className="field">
          <label>Jour d'échéance</label>
          <input
            className="input"
            type="number"
            min={1}
            max={31}
            value={jour}
            onChange={(e) => setJour(e.target.value)}
          />
        </div>
      </div>
      <div className="field">
        <label>Périodicité</label>
        <select
          className="select"
          value={periodicite}
          onChange={(e) => setPeriodicite(e.target.value as Periodicite)}
        >
          <option value="mensuelle">Mensuelle</option>
          <option value="hebdomadaire">Hebdomadaire</option>
          <option value="trimestrielle">Trimestrielle</option>
          <option value="annuelle">Annuelle</option>
        </select>
      </div>
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
            {categoriesDepense.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label className="flex" style={{ cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={actif}
            onChange={(e) => setActif(e.target.checked)}
            style={{ width: 16, height: 16 }}
          />
          Charge active (génère une échéance chaque mois)
        </label>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

function ReglerEcheance({
  charge,
  echeance,
  transactions,
  onClose,
  onDone,
}: {
  charge: ChargeFixe;
  echeance: Echeance;
  transactions: Transaction[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [creer, setCreer] = useState(false);
  const [lien, setLien] = useState<number | "">(echeance.transaction_id ?? "");

  // Transactions candidates : dépenses du compte de la charge, sur le mois.
  const candidates = useMemo(
    () =>
      transactions.filter(
        (t) =>
          t.type === "depense" &&
          t.compte_id === charge.compte_id &&
          t.date.startsWith(echeance.mois)
      ),
    [transactions, charge, echeance.mois]
  );

  async function lier(txId: number) {
    await majEcheance(echeance.id, {
      transaction_id: txId,
      statut: statutPaye(echeance.justificatif_path),
    });
    onDone();
  }

  if (creer) {
    return (
      <TransactionModal
        lockType="depense"
        presets={{
          type: "depense",
          montant: charge.montant_attendu,
          compte_id: charge.compte_id,
          categorie_id: charge.categorie_id,
          date: `${echeance.mois}-${String(Math.min(charge.jour_echeance, 28)).padStart(2, "0")}`,
          description: charge.nom,
        }}
        onClose={() => setCreer(false)}
        onSaved={async (txId) => {
          await lier(txId);
        }}
      />
    );
  }

  return (
    <Modal
      titre={`Régler « ${charge.nom} »`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Fermer
          </button>
          <button
            className="btn primary"
            disabled={lien === ""}
            onClick={() => lien !== "" && lier(Number(lien))}
          >
            Lier la transaction
          </button>
        </>
      }
    >
      <p className="muted" style={{ marginTop: 0 }}>
        Montant attendu : <strong>{formatMontant(charge.montant_attendu)}</strong> · échéance le {charge.jour_echeance} {formatMois(echeance.mois)}
      </p>

      <button
        className="btn primary"
        style={{ width: "100%", justifyContent: "center", marginBottom: 16 }}
        onClick={() => setCreer(true)}
      >
        <Icon name="plus" size={16} /> Créer et lier une nouvelle transaction
      </button>

      <div className="section-title" style={{ margin: "8px 0" }}>
        ou lier une transaction existante
      </div>
      {candidates.length === 0 ? (
        <p className="muted">Aucune dépense correspondante sur ce compte ce mois-ci.</p>
      ) : (
        <select
          className="select"
          value={lien}
          onChange={(e) => setLien(e.target.value === "" ? "" : Number(e.target.value))}
        >
          <option value="">— choisir —</option>
          {candidates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.date} · {formatMontant(t.montant)} · {t.description ?? "sans description"}
            </option>
          ))}
        </select>
      )}
    </Modal>
  );
}
