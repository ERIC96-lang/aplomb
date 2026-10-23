import { useMemo, useState } from "react";
import { addMonths, format, getDaysInMonth } from "date-fns";
import { useAppData } from "../state/AppDataContext";
import { useToast } from "../state/ToastContext";
import { MenuActions } from "../components/ui/Menu";
import { SelecteurMois } from "../components/ui/SelecteurMois";
import { Icon } from "../components/Icon";
import { Defilant } from "../components/Defilant";
import { Bandeau, Carte, LigneCalcul, Rangee, TotalCalcul, Vide } from "../components/ui/Page";
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
  const { budgets, categories, comptes, transactions, rafraichir } = useAppData();
  const toast = useToast();
  const [mois, setMois] = useState(moisCourant());

  const moisList = useMemo(() => {
    const l = moisDisponibles(transactions);
    const mc = moisCourant();
    if (!l.includes(mc)) l.unshift(mc);
    return l;
  }, [transactions]);

  const statuts = useMemo(
    () => statutsBudgets(budgets, categories, transactions, mois, comptes),
    [budgets, categories, transactions, mois, comptes]
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

  // L'objectif d'épargne n'est pas un plafond de dépenses : hors totaux.
  const plafonds = statuts.filter((s) => !s.epargne);
  const totalPlafond = plafonds.reduce((a, s) => a + s.plafond, 0);
  const totalDepense = plafonds.reduce((a, s) => a + s.depense, 0);
  const ratioGlobal = totalPlafond > 0 ? totalDepense / totalPlafond : 0;
  const nbDepasses = plafonds.filter((s) => s.etat === "depasse").length;
  const nbAttention = plafonds.filter((s) => s.etat === "attention").length;
  // Part du mois écoulée : le « rythme » à comparer à la consommation.
  const avancementMois =
    mois < moisCourant() ? 1 : mois > moisCourant() ? 0 : new Date().getDate() / getDaysInMonth(new Date());
  const enAvance = ratioGlobal > avancementMois + 0.1 && avancementMois < 1;

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
        <SelecteurMois valeur={mois} onChange={setMois} disponibles={moisList} />
        </div>
      </div>

      {plafonds.length > 0 && (
        <Bandeau
          surtitre={`Budgets · ${formatMois(mois)}`}
          montant={totalDepense}
          humeur={nbDepasses > 0 ? "risque" : nbAttention > 0 || enAvance ? "attention" : "ok"}
          statut={
            nbDepasses > 0
              ? `${nbDepasses} dépassé${nbDepasses > 1 ? "s" : ""}`
              : nbAttention > 0
                ? `${nbAttention} bientôt atteint${nbAttention > 1 ? "s" : ""}`
                : enAvance
                  ? "En avance sur le mois"
                  : "Dans les clous"
          }
          phrase={
            <>
              dépensés sur <strong className="num">{formatMontant(totalPlafond)}</strong> de plafonds ·{" "}
              {Math.round(ratioGlobal * 100)} % consommés à {Math.round(avancementMois * 100)} % du mois
            </>
          }
          calcul={
            <>
              <LigneCalcul label="Plafonds" valeur={totalPlafond} />
              <LigneCalcul label="Dépensé" valeur={-totalDepense} />
              <TotalCalcul label={totalPlafond - totalDepense >= 0 ? "Reste disponible" : "Dépassement"} valeur={totalPlafond - totalDepense} />
            </>
          }
        >
          <Rythme ratio={ratioGlobal} avancement={avancementMois} etat={nbDepasses > 0 ? "depasse" : nbAttention > 0 || enAvance ? "attention" : "ok"} />
        </Bandeau>
      )}

      {statuts.length === 0 ? (
        <Carte>
          <Vide
            ico="coins"
            titre="Aucun plafond défini"
            texte="Fixe un plafond mensuel par catégorie pour suivre tes dépenses — ou laisse l'app les proposer d'après tes 3 derniers mois."
          >
            {sansBudget.length > 0 && (
              <button className="btn primary" onClick={proposerPlafonds}>
                <Icon name="sparkles" size={16} /> Proposer les plafonds
              </button>
            )}
          </Vide>
        </Carte>
      ) : (
        <Rangee type="tiers">
          {statuts.map((s) => {
            const couleur = s.epargne ? (s.ratio >= 1 ? "var(--green)" : "var(--teal)") : COULEUR_ETAT[s.etat];
            const libelle = s.epargne ? (s.ratio >= 1 ? "Objectif atteint" : "Objectif d'épargne") : LABEL_ETAT[s.etat];
            return (
              <section className="card pg-budget" key={s.categorie_id}>
                <div className="pg-budget-tete">
                  <span className="dot" style={{ background: s.couleur }} />
                  <span className="pg-budget-nom">{s.nom}</span>
                  <BudgetEditeur categorie_id={s.categorie_id} valeur={s.plafond} onSaved={rafraichir} toast={toast} />
                </div>
                <div className="pg-budget-montant num">
                  <span style={{ color: couleur }}>
                    <Defilant valeur={s.depense} />
                  </span>
                  <span className="muted"> / {formatMontant(s.plafond)}</span>
                </div>
                <Rythme ratio={s.ratio} avancement={s.epargne ? null : avancementMois} etat={s.epargne ? "epargne" : s.etat} fin />
                <div className="pg-budget-pied">
                  <span className="badge" style={{ background: `color-mix(in srgb, ${couleur} 16%, transparent)`, color: couleur }}>
                    {libelle}
                  </span>
                  <span className="dim">
                    {s.epargne
                      ? s.reste > 0
                        ? `Reste ${formatMontant(s.reste)} à épargner`
                        : s.reste < 0
                          ? `Dépassé de ${formatMontant(-s.reste)} — bravo`
                          : "Objectif atteint"
                      : s.reste >= 0
                        ? `Reste ${formatMontant(s.reste)}`
                        : `Dépassement de ${formatMontant(-s.reste)}`}
                  </span>
                </div>
              </section>
            );
          })}
        </Rangee>
      )}

      {/* Catégories sans budget */}
      {sansBudget.length > 0 && (
        <Carte titre="Ajouter un plafond" ico="plus" className="pg-ajout">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {sansBudget.map((c) => (
              <LigneAjout key={c.id} categorie={c} onSaved={rafraichir} toast={toast} statut={statutParCat.get(c.id)?.depense} />
            ))}
          </div>
        </Carte>
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
      <MenuActions
        label="Actions sur ce plafond"
        elements={[
          { id: "modifier", label: "Modifier le plafond", ico: "edit", action: () => setEdit(true) },
          { separateur: true },
          {
            id: "retirer",
            label: "Retirer le plafond",
            ico: "trash",
            danger: true,
            action: async () => {
              await supprimerBudget(categorie_id);
              await onSaved();
              toast("Plafond retiré");
            },
          },
        ]}
      />
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

/**
 * Consommation d'un budget avec, en fil à plomb, la part du mois écoulée :
 * une barre qui dépasse le fil signale des dépenses en avance sur le rythme.
 */
function Rythme({
  ratio,
  avancement,
  etat,
  fin,
}: {
  ratio: number;
  avancement: number | null;
  etat: BudgetEtat | "epargne";
  fin?: boolean;
}) {
  const couleur = etat === "epargne" ? "var(--teal)" : COULEUR_ETAT[etat];
  return (
    <div className={`pg-rythme${fin ? " fin" : ""}`}>
      <div className="pg-rythme-piste">
        <span className="pg-rythme-barre" style={{ width: `${Math.min(100, ratio * 100)}%`, background: couleur }} />
      </div>
      {avancement !== null && avancement > 0 && avancement < 1 && (
        <span className="pg-rythme-fil" style={{ left: `${avancement * 100}%` }} title="Part du mois écoulée">
          {!fin && <em>Aujourd'hui</em>}
        </span>
      )}
    </div>
  );
}
