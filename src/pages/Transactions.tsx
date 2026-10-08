import { useMemo, useState } from "react";
import { useAppData } from "../state/AppDataContext";
import { useToast } from "../state/ToastContext";
import { TransactionModal } from "../components/TransactionModal";
import { Icon } from "../components/Icon";
import { pointerTransaction, type TransactionInput } from "../db/repo";
import { soldeCompteAvecInitial } from "../lib/calculs";
import { scannerRecu } from "../lib/ocr";
import { formatDate, formatMontant, formatMois } from "../lib/format";
import { moisDisponibles } from "../lib/calculs";
import type { Transaction, TxType } from "../db/types";

const LIBELLE_TYPE: Record<TxType, string> = {
  revenu: "Revenu",
  depense: "Dépense",
  virement: "Virement",
};

export function Transactions() {
  const { transactions, comptes, categories, rafraichir } = useAppData();
  const toast = useToast();
  const [modal, setModal] = useState<Transaction | "new" | null>(null);
  const [presets, setPresets] = useState<Partial<TransactionInput> | undefined>(undefined);
  const [scanEnCours, setScanEnCours] = useState(false);

  async function scannerUnRecu() {
    setScanEnCours(true);
    try {
      const r = await scannerRecu();
      if (!r) return; // annulé
      setPresets({
        type: "depense",
        montant: r.montant ?? undefined,
        date: r.date ?? undefined,
        description: r.description ?? undefined,
        compte_id: comptes[0]?.id,
      } as Partial<TransactionInput>);
      setModal("new");
      toast(r.montant != null ? "Reçu lu — vérifie les champs" : "Reçu lu — montant à compléter");
    } catch (e) {
      toast(e instanceof Error ? `Lecture impossible : ${e.message}` : "Lecture du reçu impossible");
    } finally {
      setScanEnCours(false);
    }
  }

  const [fMois, setFMois] = useState<string>("tous");
  const [fCompte, setFCompte] = useState<string>("tous");
  const [fType, setFType] = useState<string>("tous");
  const [fTexte, setFTexte] = useState<string>("");
  const [fMin, setFMin] = useState<string>("");
  const [fMax, setFMax] = useState<string>("");
  const [fPointee, setFPointee] = useState<string>("tous");

  const compteNom = useMemo(
    () => new Map(comptes.map((c) => [c.id, c.nom])),
    [comptes]
  );
  const catById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories]
  );
  const mois = useMemo(() => moisDisponibles(transactions), [transactions]);

  const filtres = useMemo(() => {
    const texte = fTexte.trim().toLowerCase();
    const min = parseFloat(fMin.replace(",", "."));
    const max = parseFloat(fMax.replace(",", "."));
    return transactions.filter((t) => {
      if (fMois !== "tous" && !t.date.startsWith(fMois)) return false;
      if (fType !== "tous" && t.type !== fType) return false;
      if (fCompte !== "tous") {
        const id = Number(fCompte);
        if (t.compte_id !== id && t.compte_dest_id !== id) return false;
      }
      if (!isNaN(min) && t.montant < min) return false;
      if (!isNaN(max) && t.montant > max) return false;
      if (fPointee === "oui" && t.pointee !== 1) return false;
      if (fPointee === "non" && t.pointee === 1) return false;
      if (texte) {
        const cat = t.categorie_id != null ? (catById.get(t.categorie_id)?.nom ?? "") : "";
        const hay = `${t.description ?? ""} ${cat}`.toLowerCase();
        if (!hay.includes(texte)) return false;
      }
      return true;
    });
  }, [transactions, fMois, fType, fCompte, fTexte, fMin, fMax, fPointee, catById]);

  // Rapprochement : quand un compte précis est sélectionné, solde pointé vs solde réel.
  const rapprochement = useMemo(() => {
    if (fCompte === "tous") return null;
    const id = Number(fCompte);
    const c = comptes.find((x) => x.id === id);
    if (!c) return null;
    const pointees = transactions.filter((t) => t.pointee === 1);
    const soldePointe = soldeCompteAvecInitial(c, pointees);
    const soldeReel = soldeCompteAvecInitial(c, transactions);
    return { soldePointe, soldeReel, ecart: soldeReel - soldePointe };
  }, [fCompte, comptes, transactions]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Transactions</h1>
          <div className="sub">
            {filtres.length} transaction{filtres.length > 1 ? "s" : ""} affichée
            {filtres.length > 1 ? "s" : ""}
          </div>
        </div>
        <div className="flex" style={{ gap: 10 }}>
          <button
            className="btn"
            onClick={scannerUnRecu}
            disabled={comptes.length === 0 || scanEnCours}
            title={comptes.length === 0 ? "Crée d'abord un compte" : "Lire un reçu (photo/scan) et pré-remplir"}
          >
            <Icon name="receipt" size={16} /> {scanEnCours ? "Lecture…" : "Scanner un reçu"}
          </button>
          <button
            className="btn primary"
            onClick={() => { setPresets(undefined); setModal("new"); }}
            disabled={comptes.length === 0}
            title={comptes.length === 0 ? "Crée d'abord un compte" : ""}
          >
            <Icon name="plus" size={16} /> Nouvelle transaction
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="flex" style={{ flexWrap: "wrap", gap: 12 }}>
          <select className="select" style={{ maxWidth: 200 }} value={fMois} onChange={(e) => setFMois(e.target.value)}>
            <option value="tous">Tous les mois</option>
            {mois.map((m) => (
              <option key={m} value={m}>
                {formatMois(m)}
              </option>
            ))}
          </select>
          <select className="select" style={{ maxWidth: 200 }} value={fCompte} onChange={(e) => setFCompte(e.target.value)}>
            <option value="tous">Tous les comptes</option>
            {comptes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
          <select className="select" style={{ maxWidth: 200 }} value={fType} onChange={(e) => setFType(e.target.value)}>
            <option value="tous">Tous les types</option>
            <option value="revenu">Revenus</option>
            <option value="depense">Dépenses</option>
            <option value="virement">Virements</option>
          </select>
          <select className="select" style={{ maxWidth: 180 }} value={fPointee} onChange={(e) => setFPointee(e.target.value)}>
            <option value="tous">Pointées & non</option>
            <option value="oui">Pointées</option>
            <option value="non">Non pointées</option>
          </select>
          <input
            className="input"
            style={{ maxWidth: 240 }}
            placeholder="Rechercher (libellé, catégorie)"
            value={fTexte}
            onChange={(e) => setFTexte(e.target.value)}
          />
          <input
            className="input"
            style={{ maxWidth: 120 }}
            placeholder="Montant min"
            inputMode="decimal"
            value={fMin}
            onChange={(e) => setFMin(e.target.value)}
          />
          <input
            className="input"
            style={{ maxWidth: 120 }}
            placeholder="Montant max"
            inputMode="decimal"
            value={fMax}
            onChange={(e) => setFMax(e.target.value)}
          />
          {(fTexte || fMin || fMax || fMois !== "tous" || fCompte !== "tous" || fType !== "tous" || fPointee !== "tous") && (
            <button
              className="btn"
              onClick={() => {
                setFTexte(""); setFMin(""); setFMax(""); setFMois("tous"); setFCompte("tous"); setFType("tous"); setFPointee("tous");
              }}
            >
              Réinitialiser
            </button>
          )}
        </div>
        {rapprochement && (
          <div className="flex" style={{ gap: 18, marginTop: 12, flexWrap: "wrap", fontSize: 13 }}>
            <span className="muted">Rapprochement :</span>
            <span>Solde pointé <strong className="num">{formatMontant(rapprochement.soldePointe)}</strong></span>
            <span>Solde réel <strong className="num">{formatMontant(rapprochement.soldeReel)}</strong></span>
            <span>
              Écart{" "}
              <strong className="num" style={{ color: Math.abs(rapprochement.ecart) < 0.005 ? "var(--green)" : "var(--amber)" }}>
                {formatMontant(rapprochement.ecart)}
              </strong>
              {Math.abs(rapprochement.ecart) < 0.005 ? " ✓" : " (non pointé)"}
            </span>
          </div>
        )}
      </div>

      <div className="card">
        {filtres.length === 0 ? (
          <div className="empty">
            <div className="big">
              <Icon name="card" size={44} strokeWidth={1.5} />
            </div>
            <p>Aucune transaction. Ajoute ta première saisie — tu peux dater dans le passé pour ressaisir ton historique.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th title="Pointée (rapprochée avec le relevé)" style={{ width: 34 }}></th>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Compte</th>
                  <th>Catégorie</th>
                  <th className="right">Montant</th>
                </tr>
              </thead>
              <tbody>
                {filtres.map((t) => {
                  const cat = t.categorie_id != null ? catById.get(t.categorie_id) : null;
                  return (
                    <tr
                      key={t.id}
                      style={{ cursor: "pointer" }}
                      onClick={() => setModal(t)}
                    >
                      <td onClick={(e) => e.stopPropagation()} style={{ textAlign: "center" }}>
                        <button
                          className="pointage"
                          title={t.pointee === 1 ? "Pointée — cliquer pour dé-pointer" : "Marquer comme pointée"}
                          aria-pressed={t.pointee === 1}
                          onClick={async () => {
                            await pointerTransaction(t.id, t.pointee !== 1);
                            await rafraichir();
                          }}
                          style={{
                            width: 18, height: 18, borderRadius: "50%", cursor: "pointer",
                            border: "2px solid " + (t.pointee === 1 ? "var(--green)" : "var(--border-strong)"),
                            background: t.pointee === 1 ? "var(--green)" : "transparent",
                            display: "grid", placeItems: "center", color: "#fff", padding: 0,
                          }}
                        >
                          {t.pointee === 1 && <Icon name="check" size={11} strokeWidth={3} />}
                        </button>
                      </td>
                      <td>{formatDate(t.date)}</td>
                      <td>
                        <span className={`badge type-${t.type}`}>
                          {LIBELLE_TYPE[t.type]}
                        </span>
                      </td>
                      <td>
                        {t.description || <span className="muted">—</span>}
                        {t.justificatif_path && (
                          <span title="Justificatif joint" style={{ marginLeft: 6, color: "var(--text-muted)" }}>
                            <Icon name="paperclip" size={12} />
                          </span>
                        )}
                        {t.a_confirmer === 1 && (
                          <span className="badge payee_sans_justif" style={{ marginLeft: 8 }}>à confirmer</span>
                        )}
                      </td>
                      <td>
                        {t.type === "virement"
                          ? `${compteNom.get(t.compte_id ?? -1) ?? "?"} → ${
                              compteNom.get(t.compte_dest_id ?? -1) ?? "?"
                            }`
                          : compteNom.get(t.compte_id ?? -1) ?? "—"}
                      </td>
                      <td>
                        {cat ? (
                          <span
                            className="chip"
                            style={{
                              background: cat.couleur + "22",
                              color: `color-mix(in srgb, ${cat.couleur} 66%, var(--text))`,
                            }}
                          >
                            <span className="dot" style={{ background: cat.couleur }} />
                            {cat.nom}
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td
                        className={
                          "right " +
                          (t.type === "revenu"
                            ? "montant-pos"
                            : t.type === "depense"
                            ? "montant-neg"
                            : "montant-neutre")
                        }
                      >
                        {t.type === "revenu" ? "+ " : t.type === "depense" ? "− " : ""}
                        {formatMontant(t.montant)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <TransactionModal
          transaction={modal === "new" ? null : modal}
          presets={modal === "new" ? presets : undefined}
          onClose={() => { setModal(null); setPresets(undefined); }}
          onSaved={async () => {
            setModal(null);
            setPresets(undefined);
            await rafraichir();
            toast("Transaction enregistrée");
          }}
        />
      )}
    </>
  );
}
