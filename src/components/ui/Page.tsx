import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon, type IconName } from "../Icon";
import { Defilant } from "../Defilant";
import { Sparkline } from "../dashboard/Sparkline";
import { formatMontant } from "../../lib/format";

// Briques communes du langage « Le fil du mois », partagées par toutes les
// pages : bandeau d'en-tête, indicateurs, cartes et lignes de calcul.

export type Humeur = "ok" | "attention" | "risque";

/** Pastille de statut (d'aplomb / à surveiller / hors d'aplomb). */
export function PastilleHumeur({ humeur, children }: { humeur: Humeur; children: ReactNode }) {
  return (
    <span className={`db-humeur ${humeur}`}>
      <Icon name={humeur === "ok" ? "check" : "alert"} size={14} strokeWidth={2.4} />
      {children}
    </span>
  );
}

/**
 * Bandeau d'en-tête d'une page : le chiffre qui compte, son statut, une phrase
 * d'explication, un calcul à droite et, dessous, un contenu libre (fil, barre…).
 */
export function Bandeau({
  surtitre,
  montant,
  valeur,
  humeur = "ok",
  statut,
  phrase,
  calcul,
  children,
}: {
  surtitre: string;
  /** Montant affiché en grand (défile jusqu'à sa valeur)… */
  montant?: number;
  /** … ou valeur libre (pourcentage, nombre). */
  valeur?: ReactNode;
  humeur?: Humeur;
  statut?: ReactNode;
  phrase?: ReactNode;
  calcul?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className={`db-hero ${humeur}${calcul ? "" : " sans-calcul"}`}>
      <div className="db-hero-haut">
        <div className="db-hero-principal">
          <div className="db-surtitre">{surtitre}</div>
          <div className={`db-hero-montant num ${montant !== undefined && montant < 0 ? "neg" : ""}`}>
            {montant !== undefined ? <Defilant valeur={montant} /> : valeur}
          </div>
          {(statut || phrase) && (
            <div className="db-hero-statut">
              {statut && <PastilleHumeur humeur={humeur}>{statut}</PastilleHumeur>}
              {phrase && <span className="db-hero-phrase">{phrase}</span>}
            </div>
          )}
        </div>
        {calcul && <div className="db-hero-calcul">{calcul}</div>}
      </div>
      {children}
    </section>
  );
}

/** Ligne d'un calcul (bandeau) : libellé, aide facultative, montant signé. */
export function LigneCalcul({ label, valeur, aide }: { label: string; valeur: number; aide?: string }) {
  return (
    <div className="db-calcul-ligne">
      <span>
        {label}
        {aide && <em>{aide}</em>}
      </span>
      <span className={`num ${valeur < 0 ? "neg" : ""}`}>
        {valeur < 0 ? "− " : ""}
        {formatMontant(Math.abs(valeur))}
      </span>
    </div>
  );
}

/** Total d'un calcul (bandeau). */
export function TotalCalcul({ label, valeur }: { label: string; valeur: number }) {
  return (
    <div className="db-calcul-total">
      <span>{label}</span>
      <strong className={`num ${valeur < 0 ? "neg" : "pos"}`}>
        <Defilant valeur={valeur} />
      </strong>
    </div>
  );
}

/** Rangée d'indicateurs (4 colonnes, 2 en fenêtre étroite). */
export function Indicateurs({ children }: { children: ReactNode }) {
  return <div className="db-kpis">{children}</div>;
}

/** Indicateur chiffré avec tendance (sparkline) et variation. */
export function Kpi({
  label,
  ico,
  montant,
  valeur,
  ton,
  delta,
  inverse,
  sous,
  serie,
  couleur = "var(--accent)",
  children,
}: {
  label: string;
  ico: IconName;
  montant?: number;
  valeur?: ReactNode;
  ton?: "pos" | "neg";
  delta?: number | null;
  /** Hausse = mauvais (dépenses). */
  inverse?: boolean;
  sous?: ReactNode;
  serie?: number[];
  couleur?: string;
  children?: ReactNode;
}) {
  let badge: ReactNode = null;
  if (delta != null && isFinite(delta)) {
    const plat = Math.abs(delta) < 0.5;
    const bon = inverse ? delta < 0 : delta > 0;
    badge = (
      <span className={`delta ${plat ? "flat" : bon ? "up" : "down"}`}>
        {plat ? "→" : delta > 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(0)} %
      </span>
    );
  }
  return (
    <div className="db-kpi">
      <div className="db-kpi-tete">
        <span>{label}</span>
        <span className="db-kpi-ico">
          <Icon name={ico} size={16} />
        </span>
      </div>
      <div className={`db-kpi-valeur num ${ton ?? ""}`}>
        {montant !== undefined ? <Defilant valeur={montant} /> : valeur}
      </div>
      {serie && serie.length > 1 && <Sparkline valeurs={serie} couleur={couleur} />}
      {children}
      {(badge || sous) && (
        <div className="db-kpi-pied">
          {badge}
          {sous && <span>{sous}</span>}
        </div>
      )}
    </div>
  );
}

/** Carte de section : titre, action à droite (lien ou nœud), contenu. */
export function Carte({
  titre,
  ico,
  lien,
  action,
  className = "",
  children,
}: {
  titre?: ReactNode;
  ico?: IconName;
  lien?: { to: string; label: string };
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`card ${className}`}>
      {(titre || lien || action) && (
        <div className="db-carte-tete">
          <h2 className="db-carte-titre">
            {ico && (
              <span className="db-carte-ico">
                <Icon name={ico} size={16} />
              </span>
            )}
            {titre}
          </h2>
          {action}
          {lien && (
            <Link to={lien.to} className="db-lien">
              {lien.label}
            </Link>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

/** Rangée de cartes : « egale » (2 colonnes) ou « large-etroit » (2/3 – 1/3). */
export function Rangee({ type = "egale", children }: { type?: "egale" | "large-etroit" | "tiers"; children: ReactNode }) {
  return <div className={`db-rangee ${type}`}>{children}</div>;
}

/** État vide engageant (icône, texte, action). */
export function Vide({ ico, titre, texte, children }: { ico: IconName; titre: string; texte?: string; children?: ReactNode }) {
  return (
    <div className="pg-vide">
      <span className="pg-vide-ico">
        <Icon name={ico} size={22} />
      </span>
      <strong>{titre}</strong>
      {texte && <p>{texte}</p>}
      {children}
    </div>
  );
}
