import { useMemo, useState } from "react";
import { addMonths, format } from "date-fns";
import { useAppData } from "../state/AppDataContext";
import { useToast } from "../state/ToastContext";
import { Icon } from "../components/Icon";
import { definirBudget, supprimerBudget } from "../db/repo";
import { statutsBudgets, type BudgetEtat } from "../lib/budgets";
import { moisDisponibles } from "../lib/calculs";
import { formatMontant, formatMois, moisCourant } from "../lib/format";
import type { Categorie } from "../db/types";

const COULEUR_ETAT: Record<BudgetEtat, string> = {
  ok: "var(--green)",
  attention: "var(--amber)",
  depasse: "var(--red)",
};
const LABEL_ETAT: Record<BudgetEtat, string> = {
  ok: "Dans le budget",
  attention: "Bientôt atteint",
  depasse: "Dépassé",
};

export function Budgets() {
  const { budgets, categories, transactions, rafraichir } = useAppData();
  const toast = useToast();
  const [mois, setMois] = useState(moisCourant());

  const moisList = useMemo(() => {
    const l = moisDisponibles(transactions);
    const mc = moisCourant();
    if (!l.includes(mc)) l.unshift(mc);
    return l;
  }, [transactions]);

  const statuts = useMemo(
    () => statutsBudgets(budgets, categories, transactions, mois),
    [budgets, categories, transactions, mois]
  );
  const statutParCat = useMemo(
    () => new Map(statuts.map((s) => [s.categorie_id, s])),
    [statuts]
  );
  const budgetsSet = useMemo(
    () => new Set(budgets.map((b) => b.categorie_id)),
    [budgets]
  );

  const categoriesDepense = categories.filter((c) => c.type === "depense");
  const sansBudget = categoriesDepense.filter((c) => !budgetsSet.has(c.id));

  // Moyenne des dépenses par catégorie sur les 3 mois précédents.
  const moyennes = useMemo(() => {
    const mois3 = [1, 2, 3].map((i) => format(addMonths(new Date(), -i), "yyyy-MM"));
    const somme = new Map<number, number>();
    for (const t of transactions) {
      if (t.type !== "depense" || t.categorie_id == null) continue;
      if (!mois3.includes(t.date.slice(0, 7))) continue;
      somme.set(t.categorie_id, (somme.get(t.categorie_id) ?? 0) + t.montant);
    }
    const moy = new Map<number, number>();
    for (const [cat, s] of somme) moy.set(cat, Math.ceil(s / 3 / 10) * 10);
    return moy;
  }, [transactions]);

  async function proposerPlafonds() {
    let n = 0;
    for (const c of categoriesDepense) {
      if (budgetsSet.has(c.id)) continue;
      const m = moyennes.get(c.id);
      if (m && m > 0) {
        await definirBudget(c.id, m);
        n++;
      }
    }
    await rafraichir();
    toast(n > 0 ? `${n} plafond(s) proposé(s)` : "Aucune donnée pour proposer des plafonds");
  }

  const totalPlafond = statuts.reduce((a, s) => a + s.plafond, 0);
  const totalDepense = statuts.reduce((a, s) => a + s.depense, 0);
  const ratioGlobal = totalPlafond > 0 ? totalDepense / totalPlafond : 0;
  const nbDepasses = statuts.filter((s) => s.etat === "depasse").length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Budgets</h1>
          <div className="sub">Plafonds mensuels par catégorie et suivi des dépassements</div>
        </div>
        <div className="flex" style={{ gap: 10 }}>
          {sansBudget.length > 0 && (
            <button className="btn primary" onClick={proposerPlafonds}>
              <Icon name="sparkles" size={16} /> Proposer les plafonds
            </button>
          )}
        <select className="select" style={{ width: 170 }} value={mois} onChange={(e) => setMois(e.target.value)}>
          {moisList.map((m) => (
            <option key={m} value={m}>
              {formatMois(m)}
            </option>
          ))}
        </select>
        </div>
      </div>

      {/* Résumé global */}
      {statuts.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="flex-between" style={{ marginBottom: 10 }}>
            <h2 style={{ margin: 0 }}>Vue d'ensemble — {formatMois(mois)}</h2>
            {nbDepasses > 0 && (
              <span className="badge en_retard">
                {nbDepasses} budget{nbDepasses > 1 ? "s" : ""} dépassé{nbDepasses > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="flex-between" style={{ marginBottom: 6 }}>
            <span className="num" style={{ fontWeight: 700, fontSize: 18 }}>
              {formatMontant(totalDepense)}{" "}
              <span className="muted" style={{ fontSize: 14, fontWeight: 400 }}>
                / {formatMontant(totalPlafond)}
              </span>
            </span>
            <span className="muted num">{Math.round(ratioGlobal * 100)} %</span>
          </div>
          <div className="progress" style={{ height: 10 }}>
            <span
              style={{
                width: `${Math.min(100, ratioGlobal * 100)}%`,
                background: ratioGlobal >= 1 ? "var(--red)" : undefined,
              }}
            />
          </div>
        </div>
      )}

      {/* Budgets définis */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h2>Plafonds définis</h2>
        {statuts.length === 0 ? (
          <div className="empty">
            <div className="big">
              <Icon name="coins" size={44} strokeWidth={1.5} />
            </div>
            <p>Aucun plafond défini. Ajoute-en un depuis la liste ci-dessous pour suivre tes dépenses par catégorie.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {statuts.map((s) => (
              <div key={s.categorie_id}>
                <div className="flex-between" style={{ marginBottom: 6 }}>
                  <span className="flex" style={{ gap: 8 }}>
                    <span className="dot" style={{ background: s.couleur }} />
                    <span style={{ fontWeight: 600 }}>{s.nom}</span>
                    <span className="badge" style={{ background: `color-mix(in srgb, ${COULEUR_ETAT[s.etat]} 16%, transparent)`, color: COULEUR_ETAT[s.etat] }}>
                      {LABEL_ETAT[s.etat]}
                    </span>
                  </span>
                  <span className="num" style={{ fontSize: 13.5 }}>
                    <strong style={{ color: COULEUR_ETAT[s.etat] }}>{formatMontant(s.depense)}</strong>
                    <span className="muted"> / {formatMontant(s.plafond)}</span>
                  </span>
                </div>
                <div className="progress" style={{ height: 9 }}>
                  <span style={{ width: `${Math.min(100, s.ratio * 100)}%`, background: COULEUR_ETAT[s.etat] }} />
                </div>
                <div className="flex-between" style={{ marginTop: 6 }}>
                  <span className="dim" style={{ fontSize: 12 }}>
                    {s.reste >= 0
                      ? `Reste ${formatMontant(s.reste)}`
                      : `Dépassement de ${formatMontant(-s.reste)}`}
                  </span>
                  <BudgetEditeur
                    categorie_id={s.categorie_id}
                    valeur={s.plafond}
                    onSaved={rafraichir}
                    toast={toast}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Catégories sans budget */}
      {sansBudget.length > 0 && (
        <div className="card">
          <h2>Ajouter un plafond</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {sansBudget.map((c) => (
              <LigneAjout key={c.id} categorie={c} onSaved={rafraichir} toast={toast} statut={statutParCat.get(c.id)?.depense} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function BudgetEditeur({
  categorie_id,
  valeur,
  onSaved,
  toast,
}: {
  categorie_id: number;
  valeur: number;
  onSaved: () => Promise<void>;
  toast: (m: string) => void;
}) {
  const [v, setV] = useState(String(valeur));
  const [edit, setEdit] = useState(false);

  async function save() {
    const n = parseFloat(v.replace(",", "."));
    if (n > 0 && n !== valeur) {
      await definirBudget(categorie_id, n);
      await onSaved();
      toast("Plafond mis à jour");
    }
    setEdit(false);
  }

  if (!edit) {
    return (
      <div className="flex" style={{ gap: 6 }}>
        <button className="btn sm ghost" onClick={() => setEdit(true)}>
          <Icon name="edit" size={13} /> Modifier
        </button>
        <button
          className="btn sm ghost"
          onClick={async () => {
            await supprimerBudget(categorie_id);
            await onSaved();
            toast("Plafond retiré");
          }}
        >
          <Icon name="trash" size={13} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex" style={{ gap: 6 }}>
      <input
        className="input"
        style={{ width: 110, padding: "5px 9px" }}
        value={v}
        onChange={(e) => setV(e.target.value)}
        inputMode="decimal"
        autoFocus
        onKeyDown={(e) => e.key === "Enter" && save()}
      />
      <button className="btn sm primary" onClick={save}>
        OK
      </button>
    </div>
  );
}

function LigneAjout({
  categorie,
  onSaved,
  toast,
  statut,
}: {
  categorie: Categorie;
  onSaved: () => Promise<void>;
  toast: (m: string) => void;
  statut?: number;
}) {
  const [v, setV] = useState("");

  async function save() {
    const n = parseFloat(v.replace(",", "."));
    if (n > 0) {
      await definirBudget(categorie.id, n);
      await onSaved();
      toast(`Plafond défini pour ${categorie.nom}`);
      setV("");
    }
  }

  return (
    <div className="flex-between">
      <span className="flex" style={{ gap: 8 }}>
        <span className="dot" style={{ background: categorie.couleur }} />
        <span style={{ fontWeight: 600 }}>{categorie.nom}</span>
        {statut != null && statut > 0 && (
          <span className="dim" style={{ fontSize: 12 }}>({formatMontant(statut)} dépensés ce mois)</span>
        )}
      </span>
      <div className="flex" style={{ gap: 6 }}>
        <input
          className="input"
          style={{ width: 130, padding: "6px 10px" }}
          value={v}
          onChange={(e) => setV(e.target.value)}
          placeholder="Plafond €"
          inputMode="decimal"
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
        <button className="btn sm primary" onClick={save} disabled={!v}>
          <Icon name="plus" size={14} /> Définir
        </button>
      </div>
    </div>
  );
}
