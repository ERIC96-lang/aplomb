import { useMemo } from "react";
import { getDaysInMonth } from "date-fns";
import { statutsBudgets, type BudgetEtat } from "../../../src/lib/budgets";
import { formatMois, formatMontant, moisCourant } from "../../../src/lib/format";
import { Bandeau, LigneCalcul, Rythme, TotalCalcul, type Humeur } from "../../../src/components/ui/Page";
import { Entete, PuceSync, Vide } from "../composants";
import { useEtat } from "../etat";

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

export function Budgets({ onReglages }: { onReglages: () => void }) {
  const { inst, transactions } = useEtat();
  const mois = moisCourant();

  const statuts = useMemo(() => {
    if (!inst) return [];
    return statutsBudgets(inst.budgets, inst.categories, transactions, mois, inst.comptes).sort((a, b) => b.ratio - a.ratio);
  }, [inst, transactions, mois]);

  // L'objectif d'épargne n'est pas un plafond de dépenses : hors totaux.
  const plafonds = statuts.filter((s) => !s.epargne);
  const total = plafonds.reduce(
    (acc, s) => ({ depense: acc.depense + s.depense, plafond: acc.plafond + s.plafond }),
    { depense: 0, plafond: 0 }
  );
  const ratioTotal = total.plafond > 0 ? total.depense / total.plafond : 0;
  // Part du mois écoulée : le « rythme » à comparer à la consommation.
  const avancement = new Date().getDate() / getDaysInMonth(new Date());
  const nbDepasses = plafonds.filter((s) => s.etat === "depasse").length;
  const nbAttention = plafonds.filter((s) => s.etat === "attention").length;
  const enAvance = ratioTotal > avancement + 0.1;
  const humeur: Humeur = nbDepasses > 0 ? "risque" : nbAttention > 0 || enAvance ? "attention" : "ok";

  return (
    <>
      <Entete surtitre={formatMois(mois)} titre="Budgets" droite={inst && <PuceSync onReglages={onReglages} />} />
      <div className="m-page">
        {statuts.length === 0 ? (
          <div className="m-carte">
            <Vide icone="coins" titre="Aucun budget">
              Définissez vos plafonds par catégorie dans l'app PC (menu Budgets) : ils s'afficheront ici.
            </Vide>
          </div>
        ) : (
          <>
            {total.plafond > 0 && (
              <Bandeau
                surtitre="Dépensé sur vos budgets"
                montant={total.depense}
                humeur={humeur}
                statut={
                  nbDepasses > 0
                    ? `${nbDepasses} dépassé${nbDepasses > 1 ? "s" : ""}`
                    : nbAttention > 0
                      ? `${nbAttention} bientôt atteint${nbAttention > 1 ? "s" : ""}`
                      : enAvance
                        ? "En avance sur le mois"
                        : "Dans les clous"
                }
                phrase={`${Math.round(ratioTotal * 100)} % consommés à ${Math.round(avancement * 100)} % du mois`}
                calcul={
                  <>
                    <LigneCalcul label="Plafonds" valeur={total.plafond} />
                    <LigneCalcul label="Dépensé" valeur={-total.depense} />
                    <TotalCalcul
                      label={total.plafond - total.depense >= 0 ? "Reste disponible" : "Dépassement"}
                      valeur={total.plafond - total.depense}
                    />
                  </>
                }
              >
                <Rythme ratio={ratioTotal} avancement={avancement} couleur={COULEUR_ETAT[humeur === "risque" ? "depasse" : humeur === "attention" ? "attention" : "ok"]} />
              </Bandeau>
            )}

            <div className="m-carte">
              <div className="m-carte-titre">Par catégorie</div>
              {statuts.map((s) => {
                const couleur = s.epargne ? (s.ratio >= 1 ? "var(--green)" : "var(--teal)") : COULEUR_ETAT[s.etat];
                const libelle = s.epargne ? (s.ratio >= 1 ? "Objectif atteint" : "Objectif d'épargne") : LABEL_ETAT[s.etat];
                return (
                  <div key={s.categorie_id} className="m-budget">
                    <div className="flex-between">
                      <span className="m-budget-nom">
                        <span className="dot" style={{ background: s.couleur }} />
                        {s.nom}
                      </span>
                      <span className="m-budget-montant">
                        <strong style={{ color: couleur }}>{formatMontant(s.depense)}</strong>
                        <span> / {formatMontant(s.plafond)}</span>
                      </span>
                    </div>
                    <Rythme ratio={s.ratio} avancement={s.epargne ? null : avancement} couleur={couleur} fin />
                    <div className="flex-between m-budget-pied">
                      <span className="badge" style={{ background: `color-mix(in srgb, ${couleur} 16%, transparent)`, color: couleur }}>
                        {libelle}
                      </span>
                      <span>
                        {s.epargne
                          ? s.reste > 0
                            ? `Reste ${formatMontant(s.reste)} à épargner`
                            : "Objectif atteint"
                          : s.reste >= 0
                            ? `Reste ${formatMontant(s.reste)}`
                            : `Dépassé de ${formatMontant(-s.reste)}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </>
  );
}
