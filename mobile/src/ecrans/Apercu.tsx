import { useMemo } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Icon } from "../../../src/components/Icon";
import { soldeCompteAvecInitial, soldeGlobal, totauxMois } from "../../../src/lib/calculs";
import { formatMois, formatMontant, moisCourant } from "../../../src/lib/format";
import { montantActuelObjectif } from "../../../src/lib/objectifs";
import { planDuMois } from "../../../src/lib/planMois";
import { projeterFinDeMois } from "../../../src/lib/projection";
import type { CompteType } from "../../../src/db/types";
import { Entete, PuceSync, Vide, ilYaCourt, montantGrand } from "../composants";
import { useEtat } from "../etat";

const TYPES: Record<CompteType, string> = {
  courant: "Compte courant",
  epargne: "Épargne",
  autre: "Autre",
};

export function Apercu({ onReglages }: { onReglages: () => void }) {
  const { inst, transactions, comptes, onedrive } = useEtat();
  const mois = moisCourant();
  const surtitre = format(new Date(), "EEEE d MMMM", { locale: fr });

  const donnees = useMemo(() => {
    if (!inst) return null;
    return {
      solde: soldeGlobal(comptes, transactions),
      mois: totauxMois(transactions, mois),
      plan: planDuMois(
        {
          transactions,
          chargesFixes: inst.charges,
          budgets: inst.budgets,
          categories: inst.categories,
          profil: inst.profil,
        },
        mois
      ),
      // Même calcul que le PC ; besoin des échéances (absentes si le PC n'est pas à jour).
      finDeMois: inst.echeances
        ? projeterFinDeMois(comptes, transactions, inst.charges, inst.echeances, mois).reduce(
            (a, p) => ({
              soldeActuel: a.soldeActuel + p.soldeActuel,
              charges: a.charges + p.chargesRestantes,
              variables: a.variables + p.depensesVariablesEstimees,
              projete: a.projete + p.soldeProjete,
            }),
            { soldeActuel: 0, charges: 0, variables: 0, projete: 0 }
          )
        : null,
      soldes: comptes.map((c) => ({ c, solde: soldeCompteAvecInitial(c, transactions) })),
      objectifs: inst.objectifs.slice(0, 3).map((o) => {
        const actuel = montantActuelObjectif(o, inst.comptes, transactions, inst.objectifs);
        return { o, actuel, ratio: o.montant_cible > 0 ? Math.min(1, actuel / o.montant_cible) : 0 };
      }),
    };
  }, [inst, comptes, transactions, mois]);

  return (
    <>
      <Entete surtitre={surtitre} titre="Aperçu" droite={inst && <PuceSync onReglages={onReglages} />} />
      <div className="m-page">
        {!donnees || !inst ? (
          <div className="m-carte">
            <Vide icone="repeat" titre="En attente des données du PC">
              {onedrive.disponible
                ? "Connectez OneDrive dans les Réglages : vos soldes et budgets arriveront automatiquement."
                : "Importez le fichier publié par votre PC depuis les Réglages."}
            </Vide>
            <button className="m-bouton" onClick={onReglages}>
              Ouvrir les réglages
            </button>
          </div>
        ) : (
          <>
            <div className="m-carte m-hero">
              <div className="m-hero-lib">Solde total</div>
              <div className={`m-hero-montant ${donnees.solde < 0 ? "neg" : ""}`}>
                {montantGrand(formatMontant(donnees.solde))}
              </div>
              <div className="m-hero-sous">
                {comptes.length} compte{comptes.length > 1 ? "s" : ""} · données du PC{" "}
                {ilYaCourt(inst.genere_le)}
              </div>
            </div>

            <div className="m-carte">
              <div className="m-carte-titre">{formatMois(mois)}</div>
              <div className="m-trio">
                <div>
                  <div className="lib">Revenus</div>
                  <div className="val pos">{formatMontant(donnees.mois.revenus)}</div>
                </div>
                <div>
                  <div className="lib">Dépenses</div>
                  <div className="val">{formatMontant(donnees.mois.depenses)}</div>
                </div>
                <div>
                  <div className="lib">Reste</div>
                  <div className={`val ${donnees.mois.solde < 0 ? "neg" : ""}`}>
                    {formatMontant(donnees.mois.solde)}
                  </div>
                </div>
              </div>
            </div>

            {donnees.finDeMois && (
              <div className="m-carte">
                <div className="m-carte-titre">Fin de mois</div>
                <div className="m-ligne">
                  <div className="corps">
                    <div className="nom">Solde actuel</div>
                  </div>
                  <div className="montant">{formatMontant(donnees.finDeMois.soldeActuel)}</div>
                </div>
                <div className="m-ligne">
                  <div className="corps">
                    <div className="nom">Charges fixes restantes</div>
                  </div>
                  <div className="montant neg">− {formatMontant(donnees.finDeMois.charges)}</div>
                </div>
                <div className="m-ligne">
                  <div className="corps">
                    <div className="nom">Dépenses variables</div>
                    <div className="sous">Estimées · moyenne des 3 derniers mois</div>
                  </div>
                  <div className="montant neg">− {formatMontant(donnees.finDeMois.variables)}</div>
                </div>
                <div className="m-fin-mois">
                  <span>Solde projeté</span>
                  <strong className={donnees.finDeMois.projete < 0 ? "neg" : "pos"}>
                    {montantGrand(formatMontant(donnees.finDeMois.projete))}
                  </strong>
                </div>
              </div>
            )}

            <div className="m-carte">
              <div className="m-carte-titre">Plan du mois</div>
              <div className="m-ligne">
                <div className="corps">
                  <div className="nom">Revenu attendu</div>
                </div>
                <div className="montant">{formatMontant(donnees.plan.revenuAttendu)}</div>
              </div>
              <div className="m-ligne">
                <div className="corps">
                  <div className="nom">Charges fixes restantes</div>
                  <div className="sous">
                    {donnees.plan.chargesRestantesCount} sur {donnees.plan.chargesMoisCount} ce mois-ci
                  </div>
                </div>
                <div className="montant">{formatMontant(donnees.plan.chargesRestantesTotal)}</div>
              </div>
              <div className="m-ligne">
                <div className="corps">
                  <div className="nom">Disponible après charges</div>
                  <div className="sous">Pour les dépenses variables</div>
                </div>
                <div className={`montant ${donnees.plan.resteAvantVariable < 0 ? "neg" : "pos"}`}>
                  {formatMontant(donnees.plan.resteAvantVariable)}
                </div>
              </div>
              {(donnees.plan.echeancesSemaine > 0 || donnees.plan.budgetsAlerte > 0) && (
                <div className="m-ligne">
                  <div className="corps">
                    <div className="nom attn">À surveiller</div>
                    <div className="sous">
                      {[
                        donnees.plan.echeancesSemaine > 0 &&
                          `${donnees.plan.echeancesSemaine} échéance${donnees.plan.echeancesSemaine > 1 ? "s" : ""} cette semaine`,
                        donnees.plan.budgetsAlerte > 0 &&
                          `${donnees.plan.budgetsAlerte} budget${donnees.plan.budgetsAlerte > 1 ? "s" : ""} en alerte`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <Icon name="alert" size={18} style={{ color: "var(--amber)" }} />
                </div>
              )}
            </div>

            <div className="m-carte">
              <div className="m-carte-titre">Comptes</div>
              {donnees.soldes.length === 0 ? (
                <div className="m-note" style={{ margin: 0 }}>
                  Aucun compte.
                </div>
              ) : (
                donnees.soldes.map(({ c, solde }) => (
                  <div className="m-ligne" key={c.id}>
                    <span className="m-pastille" aria-hidden="true">
                      <Icon name={c.type === "epargne" ? "coins" : "bank"} size={17} />
                    </span>
                    <div className="corps">
                      <div className="nom">{c.nom}</div>
                      <div className="sous">{TYPES[c.type] ?? c.type}</div>
                    </div>
                    <div className={`montant ${solde < 0 ? "neg" : ""}`}>{formatMontant(solde)}</div>
                  </div>
                ))
              )}
            </div>

            {donnees.objectifs.length > 0 && (
              <div className="m-carte">
                <div className="m-carte-titre">Objectifs</div>
                {donnees.objectifs.map(({ o, actuel, ratio }) => (
                  <div key={o.id} style={{ padding: "6px 0 10px" }}>
                    <div className="flex-between">
                      <span style={{ fontWeight: 600 }}>{o.nom}</span>
                      <span className="sous" style={{ fontSize: 13, color: "var(--text-muted)" }}>
                        {Math.round(ratio * 100)} %
                      </span>
                    </div>
                    <div className={`m-barre ${ratio >= 1 ? "ok" : ""}`}>
                      <span style={{ width: `${Math.max(2, ratio * 100)}%` }} />
                    </div>
                    <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--text-dim)" }}>
                      {formatMontant(actuel)} sur {formatMontant(o.montant_cible)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
