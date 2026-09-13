import { useNavigate } from "react-router-dom";
import { useAppData } from "../state/AppDataContext";
import { useToast } from "../state/ToastContext";
import { confirmerToutesTransactions } from "../db/repo";
import { Icon } from "./Icon";
import { formatMontant } from "../lib/format";

export function ConfirmBar() {
  const { transactions, rafraichir } = useAppData();
  const toast = useToast();
  const navigate = useNavigate();

  const enAttente = transactions.filter((t) => t.a_confirmer === 1);
  if (enAttente.length === 0) return null;

  const total = enAttente.reduce(
    (a, t) => a + (t.type === "revenu" ? t.montant : t.type === "depense" ? -t.montant : 0),
    0
  );

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        marginBottom: 20,
        borderRadius: 12,
        background: "var(--brand-grad-soft)",
        border: "1px solid var(--border-strong)",
      }}
    >
      <span style={{ color: "var(--accent)" }}>
        <Icon name="sparkles" size={20} />
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700 }}>
          {enAttente.length} transaction{enAttente.length > 1 ? "s" : ""} générée{enAttente.length > 1 ? "s" : ""} automatiquement
        </div>
        <div className="muted" style={{ fontSize: 12.5 }}>
          Salaire et charges dues · impact net {formatMontant(total)} — à vérifier puis confirmer.
        </div>
      </div>
      <button className="btn sm" onClick={() => navigate("/transactions")}>
        Vérifier
      </button>
      <button
        className="btn sm primary"
        onClick={async () => {
          await confirmerToutesTransactions();
          await rafraichir();
          toast("Transactions confirmées");
        }}
      >
        <Icon name="check" size={14} /> Tout confirmer
      </button>
    </div>
  );
}
