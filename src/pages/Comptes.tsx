import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppData } from "../state/AppDataContext";
import { useToast } from "../state/ToastContext";
import { Modal } from "../components/Modal";
import { Icon } from "../components/Icon";
import { soldeCompteAvecInitial } from "../lib/calculs";
import { formatMontant, aujourdhui } from "../lib/format";
import {
  archiverCompte,
  creerCompte,
  listComptes,
  majCompte,
  supprimerCompte,
} from "../db/repo";
import type { Compte, CompteType } from "../db/types";

const TYPES: { value: CompteType; label: string }[] = [
  { value: "courant", label: "Courant" },
  { value: "epargne", label: "Épargne" },
  { value: "autre", label: "Autre" },
];

export function Comptes() {
  const { comptes, transactions, chargesFixes, rafraichir } = useAppData();
  const toast = useToast();
  const [edit, setEdit] = useState<Compte | "new" | null>(null);
  const [archives, setArchives] = useState<Compte[]>([]);

  const chargerArchives = useCallback(async () => {
    const all = await listComptes(true);
    setArchives(all.filter((c) => c.archive === 1));
  }, []);
  useEffect(() => {
    chargerArchives();
  }, [chargerArchives, comptes]);

  // Un compte archivé est « vide » s'il n'a ni transaction ni charge liée.
  const estVide = useMemo(() => {
    const compteAvecTx = new Set<number>();
    for (const t of transactions) {
      if (t.compte_id != null) compteAvecTx.add(t.compte_id);
      if (t.compte_dest_id != null) compteAvecTx.add(t.compte_dest_id);
    }
    const compteAvecCharge = new Set(chargesFixes.map((c) => c.compte_id));
    return (id: number) => !compteAvecTx.has(id) && !compteAvecCharge.has(id);
  }, [transactions, chargesFixes]);

  const archivesVides = archives.filter((a) => estVide(a.id));

  async function supprimer(c: Compte) {
    if (!estVide(c.id)) {
      if (!window.confirm(`« ${c.nom} » a des transactions liées. Les supprimer détacherait ces transactions. Supprimer quand même ?`)) return;
    }
    await supprimerCompte(c.id);
    await Promise.all([rafraichir(), chargerArchives()]);
    toast("Compte supprimé");
  }

  async function purgerVides() {
    for (const a of archivesVides) await supprimerCompte(a.id);
    await Promise.all([rafraichir(), chargerArchives()]);
    toast(`${archivesVides.length} compte(s) de démo supprimé(s)`);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Comptes</h1>
          <div className="sub">Vue de tous tes comptes et de leur solde actuel</div>
        </div>
        <button className="btn primary" onClick={() => setEdit("new")}>
          <Icon name="plus" size={16} /> Nouveau compte
        </button>
      </div>

      {comptes.length === 0 ? (
        <div className="card empty">
          <div className="big">
            <Icon name="bank" size={44} strokeWidth={1.5} />
          </div>
          <p>Aucun compte pour l'instant. Commence par en créer un.</p>
        </div>
      ) : (
        <div className="grid grid-auto">
          {comptes.map((c) => {
            const solde = soldeCompteAvecInitial(c, transactions);
            return (
              <div className="card" key={c.id}>
                <div className="flex-between">
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{c.nom}</div>
                    <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                      {TYPES.find((t) => t.value === c.type)?.label}
                    </div>
                  </div>
                  <span
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 11,
                      display: "grid",
                      placeItems: "center",
                      background: "var(--brand-grad-soft)",
                      color: "var(--accent)",
                    }}
                  >
                    <Icon name={c.type === "epargne" ? "coins" : "wallet"} size={20} />
                  </span>
                </div>
                <div
                  className="value"
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    marginTop: 14,
                    color: solde < 0 ? "var(--red)" : "var(--text)",
                  }}
                >
                  {formatMontant(solde)}
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                  Solde initial : {formatMontant(c.solde_initial)}
                </div>
                <div className="flex" style={{ marginTop: 16 }}>
                  <button className="btn sm" onClick={() => setEdit(c)}>
                    Renommer
                  </button>
                  <button
                    className="btn sm danger"
                    onClick={async () => {
                      await archiverCompte(c.id, true);
                      await rafraichir();
                      toast("Compte archivé");
                    }}
                  >
                    Archiver
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {archives.length > 0 && (
        <div className="card" style={{ marginTop: 24 }}>
          <div className="flex-between" style={{ marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>Comptes archivés ({archives.length})</h2>
            {archivesVides.length > 0 && (
              <button className="btn sm" onClick={purgerVides}>
                <Icon name="trash" size={14} /> Supprimer les {archivesVides.length} compte(s) vide(s)
              </button>
            )}
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Type</th>
                  <th></th>
                  <th className="right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {archives.map((a) => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 600 }}>{a.nom}</td>
                    <td>{TYPES.find((t) => t.value === a.type)?.label}</td>
                    <td>
                      {estVide(a.id) ? (
                        <span className="chip" style={{ background: "var(--surface-2)" }}>vide</span>
                      ) : (
                        <span className="muted" style={{ fontSize: 12 }}>a des transactions</span>
                      )}
                    </td>
                    <td className="right">
                      <div className="flex" style={{ justifyContent: "flex-end", gap: 6 }}>
                        <button
                          className="btn sm"
                          onClick={async () => {
                            await archiverCompte(a.id, false);
                            await Promise.all([rafraichir(), chargerArchives()]);
                            toast("Compte restauré");
                          }}
                        >
                          Restaurer
                        </button>
                        <button className="btn sm danger" onClick={() => supprimer(a)}>
                          <Icon name="trash" size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {edit && (
        <CompteForm
          compte={edit === "new" ? null : edit}
          onClose={() => setEdit(null)}
          onSaved={async () => {
            setEdit(null);
            await rafraichir();
            toast("Compte enregistré");
          }}
        />
      )}
    </>
  );
}

function CompteForm({
  compte,
  onClose,
  onSaved,
}: {
  compte: Compte | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nom, setNom] = useState(compte?.nom ?? "");
  const [type, setType] = useState<CompteType>(compte?.type ?? "courant");
  const [solde, setSolde] = useState(String(compte?.solde_initial ?? ""));
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!nom.trim()) return;
    setBusy(true);
    const soldeNum = parseFloat(solde.replace(",", ".")) || 0;
    if (compte) {
      // Compte existant : seul le nom est modifiable, le reste est figé.
      await majCompte(compte.id, {
        nom: nom.trim(),
        type: compte.type,
        solde_initial: compte.solde_initial,
      });
    } else {
      await creerCompte({
        nom: nom.trim(),
        type,
        solde_initial: soldeNum,
        date_creation: aujourdhui(),
      });
    }
    onSaved();
  }

  return (
    <Modal
      titre={compte ? "Renommer le compte" : "Nouveau compte"}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn primary" onClick={submit} disabled={busy || !nom.trim()}>
            Enregistrer
          </button>
        </>
      }
    >
      <div className="field">
        <label>Nom du compte</label>
        <input
          className="input"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="ex. Compte courant"
          autoFocus
        />
      </div>
      <div className="field">
        <label>Type</label>
        <select
          className="select"
          value={type}
          onChange={(e) => setType(e.target.value as CompteType)}
          disabled={!!compte}
        >
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Solde initial{compte ? "" : " (€)"}</label>
        <input
          className="input"
          value={solde}
          onChange={(e) => setSolde(e.target.value)}
          placeholder="0,00"
          inputMode="decimal"
          disabled={!!compte}
        />
        <span className="muted" style={{ fontSize: 12 }}>
          {compte
            ? "Le solde initial et le type sont figés à la création. Le solde réel se calcule automatiquement à partir de tes revenus, dépenses et virements."
            : "Le solde du compte au moment de sa création dans l'app."}
        </span>
      </div>
    </Modal>
  );
}
