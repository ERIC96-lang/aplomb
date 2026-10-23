import { useMemo } from "react";
import { addDays, format, getDaysInMonth, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Icon, type IconName } from "../../../src/components/Icon";
import { soldeCompteAvecInitial, totauxMois, variationPct } from "../../../src/lib/calculs";
import { formatMois, formatMontant, moisCourant } from "../../../src/lib/format";
import { montantActuelObjectif } from "../../../src/lib/objectifs";
import { planDuMois } from "../../../src/lib/planMois";
import { projeterFinDeMois } from "../../../src/lib/projection";
import { statutsBudgets } from "../../../src/lib/budgets";
import { prochainesOccurrences } from "../../../src/lib/echeancier";
import { estReglee } from "../../../src/lib/statutEcheance";
import { pointsFluxMensuel } from "../../../src/lib/series";
import type { CompteType, EcheanceStatut } from "../../../src/db/types";
import { Bandeau, Indicateurs, Kpi, LigneCalcul, TotalCalcul, type Humeur } from "../../../src/components/ui/Page";
import { FilDuMois, type EtatEvenement, type EvenementFil } from "../../../src/components/dashboard/FilDuMois";
import { Anneau, Entete, PuceSync, Vide, ilYaCourt } from "../composants";
import { useEtat } from "../etat";

const TYPES: Record<CompteType, string> = {
  courant: "Compte courant",
  epargne: "Épargne",
  autre: "Autre",
};

const ETAT_FIL: Record<EcheanceStatut, EtatEvenement> = {
  a_venir: "avenir",
  en_retard: "retard",
  payee_sans_justif: "paye",
  payee_avec_justif: "paye",
  reglee_ailleurs: "ailleurs",
};

// Couleurs des comptes, comme sur le PC.
const COULEURS = ["var(--accent)", "var(--teal)", "var(--blue)", "var(--amber)", "var(--green)", "var(--red)"];

export function Apercu({
  onReglages,
  onOnglet,
}: {
  onReglages: () => void;
  onOnglet: (o: "operations" | "budgets") => void;
}) {
  const { inst, transactions, comptes, onedrive, attente } = useEtat();
  const mois = moisCourant();
  const surtitre = format(new Date(), "EEEE d MMMM", { locale: fr });

  const d = useMemo(() => {
    if (!inst) return null;
    const totaux = totauxMois(transactions, mois);
    const prec = totauxMois(transactions, format(addDays(parseISO(`${mois}-01`), -1), "yyyy-MM"));
    const soldes = comptes.map((c) => ({ c, solde: soldeCompteAvecInitial(c, transactions) }));
    const plan = planDuMois(
      {
        transactions,
        chargesFixes: inst.charges,
        budgets: inst.budgets,
        categories: inst.categories,
        profil: inst.profil,
        echeances: inst.echeances,
      },
      mois
    );
    // Même calcul que le PC ; besoin des échéances (absentes si le PC n'est pas à jour).
    const fin = inst.echeances
      ? projeterFinDeMois(comptes, transactions, inst.charges, inst.echeances, mois).reduce(
          (a, p) => ({
            charges: a.charges + p.chargesRestantes,
            variables: a.variables + p.depensesVariablesEstimees,
            projete: a.projete + p.soldeProjete,
          }),
          { charges: 0, variables: 0, projete: 0 }
        )
      : null;

    const budgets = statutsBudgets(inst.budgets, inst.categories, transactions, mois, inst.comptes).filter((b) => !b.epargne);
    const plafond = budgets.reduce((a, b) => a + b.plafond, 0);
    const consomme = budgets.reduce((a, b) => a + b.depense, 0);

    const charges = new Map(inst.charges.map((c) => [c.id, c]));
    const echMois = (inst.echeances ?? []).filter((e) => e.mois === mois && charges.has(e.charge_fixe_id));
    const jours = getDaysInMonth(parseISO(`${mois}-01`));
    const evenements: EvenementFil[] = echMois.map((e) => {
      const c = charges.get(e.charge_fixe_id)!;
      return { jour: Math.min(c.jour_echeance, jours), label: c.nom, montant: c.montant_attendu, etat: ETAT_FIL[e.statut] };
    });
    if (inst.profil.configure && inst.profil.jourPaie > 0 && plan.revenuAttendu > 0) {
      evenements.push({ jour: Math.min(inst.profil.jourPaie, jours), label: "Paie", montant: plan.revenuAttendu, etat: "paie" });
    }

    // Prochaines échéances (30 jours), hors celles déjà réglées.
    const statut = new Map((inst.echeances ?? []).map((e) => [`${e.charge_fixe_id}|${e.mois}`, e.statut]));
    const limite = format(addDays(new Date(), 30), "yyyy-MM-dd");
    const aVenir = prochainesOccurrences(inst.charges, 1, new Date())
      .filter((o) => o.date <= limite)
      .filter((o) => {
        const s = statut.get(`${o.charge.id}|${o.mois}`);
        return !s || !estReglee(s);
      })
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 4);

    return {
      solde: soldes.reduce((a, x) => a + x.solde, 0),
      totaux,
      prec,
      soldes,
      plan,
      fin,
      plafond,
      consomme,
      budgetsAlerte: budgets.filter((b) => b.etat !== "ok").length,
      budgetsDepasses: budgets.filter((b) => b.etat === "depasse").length,
      retard: echMois.filter((e) => e.statut === "en_retard").length,
      jours,
      evenements,
      aVenir,
      flux: pointsFluxMensuel(transactions, undefined, 6),
      objectifs: inst.objectifs.slice(0, 4).map((o) => {
        const actuel = montantActuelObjectif(o, inst.comptes, transactions, inst.objectifs);
        return { o, actuel, ratio: o.montant_cible > 0 ? Math.min(1, actuel / o.montant_cible) : 0 };
      }),
    };
  }, [inst, comptes, transactions, mois]);

  if (!d || !inst) {
    return (
      <>
        <Entete surtitre={surtitre} titre="Aperçu" droite={inst && <PuceSync onReglages={onReglages} />} />
        <div className="m-page">
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
        </div>
      </>
    );
  }

  const humeur: Humeur = d.fin && d.fin.projete < 0 ? "risque" : d.retard > 0 || d.budgetsDepasses > 0 ? "attention" : "ok";
  const statutTexte = humeur === "ok" ? "D'aplomb" : humeur === "attention" ? "À surveiller" : "Hors d'aplomb";
  const finMois = format(parseISO(`${mois}-01`), "MMMM", { locale: fr });
  const aEnvoyer = attente.filter((s) => !s.envoyee).length;
  const taux = d.totaux.revenus > 0 ? Math.round((d.totaux.solde / d.totaux.revenus) * 100) : null;
  const positif = d.soldes.reduce((a, x) => a + Math.max(0, x.solde), 0) || 1;

  const actions = [
    aEnvoyer > 0 && { ico: "repeat" as IconName, ton: "amber", texte: `${aEnvoyer} saisie${aEnvoyer > 1 ? "s" : ""} à envoyer au PC`, vers: "operations" as const },
    d.retard > 0 && { ico: "alert" as IconName, ton: "red", texte: `${d.retard} charge${d.retard > 1 ? "s" : ""} fixe${d.retard > 1 ? "s" : ""} en retard` },
    d.plan.echeancesSemaine > 0 && {
      ico: "calendar" as IconName,
      ton: "amber",
      texte: `${d.plan.echeancesSemaine} échéance${d.plan.echeancesSemaine > 1 ? "s" : ""} cette semaine`,
    },
    d.budgetsAlerte > 0 && {
      ico: "coins" as IconName,
      ton: d.budgetsDepasses > 0 ? "red" : "amber",
      texte: `${d.budgetsAlerte} budget${d.budgetsAlerte > 1 ? "s" : ""} à surveiller`,
      vers: "budgets" as const,
    },
  ].filter(Boolean) as { ico: IconName; ton: string; texte: string; vers?: "operations" | "budgets" }[];

  return (
    <>
      <Entete surtitre={surtitre} titre="Aperçu" droite={<PuceSync onReglages={onReglages} />} />
      <div className="m-page">
        <Bandeau
          surtitre="Solde aujourd'hui"
          montant={d.solde}
          humeur={humeur}
          statut={statutTexte}
          phrase={
            d.fin ? (
              <>
                Fin {finMois} : <strong className="num">{formatMontant(d.fin.projete)}</strong>
              </>
            ) : (
              `${comptes.length} compte${comptes.length > 1 ? "s" : ""}`
            )
          }
          calcul={
            d.fin ? (
              <>
                <LigneCalcul label="Solde actuel" valeur={d.solde} />
                <LigneCalcul label="Charges fixes restantes" valeur={-d.fin.charges} />
                <LigneCalcul label="Dépenses variables" valeur={-d.fin.variables} aide="estimées · 3 derniers mois" />
                <TotalCalcul label="Fin de mois projetée" valeur={d.fin.projete} />
              </>
            ) : undefined
          }
        >
          {d.evenements.length > 0 && (
            <FilDuMois jours={d.jours} aujourdhui={new Date().getDate()} evenements={d.evenements} />
          )}
        </Bandeau>
        <div className="m-maj">Données du PC {ilYaCourt(inst.genere_le)}</div>

        <Indicateurs>
          <Kpi
            label="Revenus"
            ico="trending-up"
            montant={d.totaux.revenus}
            ton="pos"
            delta={variationPct(d.totaux.revenus, d.prec.revenus)}
            serie={d.flux.map((p) => p.revenus)}
            couleur="var(--green)"
          />
          <Kpi
            label="Dépenses"
            ico="trending-down"
            montant={d.totaux.depenses}
            ton="neg"
            delta={variationPct(d.totaux.depenses, d.prec.depenses)}
            inverse
            serie={d.flux.map((p) => p.depenses)}
            couleur="var(--red)"
          />
          <Kpi
            label="Épargne"
            ico="coins"
            montant={d.totaux.solde}
            ton={d.totaux.solde >= 0 ? "pos" : "neg"}
            sous={taux !== null ? `${taux} % des revenus` : formatMois(mois)}
            serie={d.flux.map((p) => p.epargne)}
            couleur="var(--teal)"
          />
          <div className="m-kpi-bouton" role="button" tabIndex={0} onClick={() => onOnglet("budgets")}>
            <Kpi
              label="Budgets"
              ico="target"
              valeur={d.plafond > 0 ? `${Math.round((d.consomme / d.plafond) * 100)} %` : "—"}
              sous={d.plafond > 0 ? `${formatMontant(d.consomme)} sur ${formatMontant(d.plafond)}` : "Aucun plafond"}
            >
              {d.plafond > 0 && (
                <div className="progress db-kpi-barre">
                  <span
                    style={{
                      width: `${Math.min(100, (d.consomme / d.plafond) * 100)}%`,
                      background: d.budgetsDepasses ? "var(--red)" : d.budgetsAlerte ? "var(--amber)" : "var(--green)",
                    }}
                  />
                </div>
              )}
            </Kpi>
          </div>
        </Indicateurs>

        <div className="m-carte">
          <div className="m-carte-titre">
            À faire
            {actions.length > 0 && <span className="db-compteur">{actions.length}</span>}
          </div>
          {actions.length === 0 ? (
            <div className="db-ok">
              <Icon name="check" size={16} strokeWidth={2.4} /> Tout est à jour.
            </div>
          ) : (
            <div className="db-actions">
              {actions.map((a) => (
                <button
                  key={a.texte}
                  className={`db-action ${a.ton}`}
                  onClick={a.vers ? () => onOnglet(a.vers!) : undefined}
                  disabled={!a.vers}
                >
                  <span className="db-action-ico">
                    <Icon name={a.ico} size={15} />
                  </span>
                  <span>{a.texte}</span>
                  {a.vers && <Icon name="chevron-right" size={15} />}
                </button>
              ))}
            </div>
          )}

          <div className="db-sous-titre">
            <span>Prochaines échéances</span>
          </div>
          {d.aVenir.length === 0 ? (
            <p className="m-note" style={{ margin: 0 }}>Rien dans les 30 prochains jours.</p>
          ) : (
            <ul className="db-echeances">
              {d.aVenir.map((o) => (
                <li key={`${o.charge.id}-${o.date}`}>
                  <span className="db-date">{format(parseISO(o.date), "d MMM", { locale: fr })}</span>
                  <span className="db-ech-nom">{o.charge.nom}</span>
                  <span className="num">{formatMontant(o.charge.montant_attendu)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="m-carte">
          <div className="m-carte-titre">Comptes</div>
          {d.soldes.length === 0 ? (
            <div className="m-note" style={{ margin: 0 }}>
              Aucun compte.
            </div>
          ) : (
            <>
              <div className="pg-pile m-pile" aria-hidden="true">
                {d.soldes.map(({ c, solde }, i) =>
                  solde > 0 ? (
                    <span key={c.id} style={{ width: `${(solde / positif) * 100}%`, background: COULEURS[i % COULEURS.length] }} />
                  ) : null
                )}
              </div>
              {d.soldes.map(({ c, solde }, i) => (
                <div className="m-ligne" key={c.id}>
                  <span
                    className="m-pastille"
                    aria-hidden="true"
                    style={{
                      color: COULEURS[i % COULEURS.length],
                      background: `color-mix(in srgb, ${COULEURS[i % COULEURS.length]} 14%, var(--surface))`,
                    }}
                  >
                    <Icon name={c.type === "epargne" ? "coins" : "wallet"} size={17} />
                  </span>
                  <div className="corps">
                    <div className="nom">{c.nom}</div>
                    <div className="sous">{TYPES[c.type] ?? c.type}</div>
                  </div>
                  <div className={`montant ${solde < 0 ? "neg" : ""}`}>{formatMontant(solde)}</div>
                </div>
              ))}
            </>
          )}
        </div>

        {d.objectifs.length > 0 && (
          <div className="m-carte">
            <div className="m-carte-titre">Objectifs</div>
            <div className="m-objectifs">
              {d.objectifs.map(({ o, actuel, ratio }) => (
                <div key={o.id} className="m-objectif">
                  <Anneau ratio={ratio} couleur={o.couleur} />
                  <div className="nom">{o.nom}</div>
                  <div className="sous">
                    {formatMontant(actuel)} / {formatMontant(o.montant_cible)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
