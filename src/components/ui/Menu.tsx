import { useId, useState, type KeyboardEvent as KE, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Icon, type IconName } from "../Icon";
import { ressort, sortie } from "../../lib/motion";
import { usePopover } from "./usePopover";

export interface ElementMenu {
  id: string;
  label: ReactNode;
  ico?: IconName;
  /** Pastille de couleur (catégorie, compte…) à la place d'une icône. */
  couleur?: string;
  description?: string;
  /** Choix courant (menu de sélection) : coche affichée. */
  coche?: boolean;
  danger?: boolean;
  desactive?: boolean;
  raccourci?: string;
  action: () => void;
}

export type EntreeMenu = ElementMenu | { separateur: true } | { titre: string };

const estElement = (e: EntreeMenu): e is ElementMenu => "action" in e;

export interface PropsDeclencheur {
  ref: (el: HTMLElement | null) => void;
  onClick: () => void;
  onKeyDown: (e: KE) => void;
  "aria-haspopup": "menu";
  "aria-expanded": boolean;
  ouvert: boolean;
}

/**
 * Menu déroulant commun à toute l'app : s'ouvre sous son déclencheur (ou
 * au-dessus s'il manque de place), se ferme au clic extérieur, à Échap ou
 * après un choix. Navigation au clavier : ↑ ↓ Début Fin Entrée.
 */
export function Menu({
  declencheur,
  elements,
  aligne = "gauche",
  largeur,
  label,
}: {
  declencheur: (p: PropsDeclencheur) => ReactNode;
  elements: EntreeMenu[];
  aligne?: "gauche" | "droite";
  largeur?: number;
  label?: string;
}) {
  const { ouvert, setOuvert, fermer, declRef, popRef, pos, style } = usePopover(aligne, largeur);
  const [actif, setActif] = useState(-1);
  const idSurbrillance = useId();
  const actionnables = elements
    .map((e, i) => (estElement(e) && !e.desactive ? i : -1))
    .filter((i) => i >= 0);

  function ouvrir(premier: "fin" | "coche" = "coche") {
    const coche = elements.findIndex((e) => estElement(e) && e.coche);
    setActif(
      premier === "fin"
        ? actionnables[actionnables.length - 1] ?? -1
        : coche >= 0
          ? coche
          : actionnables[0] ?? -1
    );
    setOuvert(true);
  }

  function choisir(i: number) {
    const e = elements[i];
    if (!e || !estElement(e) || e.desactive) return;
    fermer();
    e.action();
  }

  function clavierMenu(e: KE) {
    const pos = actionnables.indexOf(actif);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActif(actionnables[(pos + 1) % actionnables.length]);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActif(actionnables[(pos - 1 + actionnables.length) % actionnables.length]);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActif(actionnables[0]);
    } else if (e.key === "End") {
      e.preventDefault();
      setActif(actionnables[actionnables.length - 1]);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choisir(actif);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      fermer();
    } else if (e.key === "Tab") {
      fermer(false);
    }
  }

  return (
    <>
      {declencheur({
        ref: (el) => (declRef.current = el),
        onClick: () => (ouvert ? fermer() : ouvrir()),
        onKeyDown: (e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            ouvrir(e.key === "ArrowUp" ? "fin" : "coche");
          }
        },
        "aria-haspopup": "menu",
        "aria-expanded": ouvert,
        ouvert,
      })}
      {createPortal(
        <AnimatePresence>
          {ouvert && (
            <motion.div
              ref={popRef}
              className="menu-pop"
              role="menu"
              aria-label={label}
              tabIndex={-1}
              onKeyDown={clavierMenu}
              style={style}
              initial={{ opacity: 0, y: pos?.haut ? 6 : -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: ressort }}
              exit={{ opacity: 0, scale: 0.98, transition: sortie }}
            >
              {elements.map((e, i) => {
                if ("separateur" in e) return <div key={`s${i}`} className="menu-sep" role="separator" />;
                if ("titre" in e) return <div key={`t${i}`} className="menu-titre">{e.titre}</div>;
                const role = e.coche !== undefined ? "menuitemradio" : "menuitem";
                return (
                  <div
                    key={e.id}
                    role={role}
                    aria-checked={e.coche !== undefined ? e.coche : undefined}
                    aria-disabled={e.desactive || undefined}
                    className={
                      "menu-item" + (e.danger ? " danger" : "") + (e.desactive ? " desactive" : "")
                    }
                    onMouseEnter={() => !e.desactive && setActif(i)}
                    onClick={() => choisir(i)}
                  >
                    {actif === i && (
                      <motion.span layoutId={idSurbrillance} className="menu-hl" transition={ressort} />
                    )}
                    {e.couleur ? (
                      <span className="menu-ico">
                        <span className="dot" style={{ background: e.couleur }} />
                      </span>
                    ) : e.ico ? (
                      <span className="menu-ico">
                        <Icon name={e.ico} size={16} />
                      </span>
                    ) : null}
                    <span className="menu-txt">
                      <span>{e.label}</span>
                      {e.description && <span className="menu-desc">{e.description}</span>}
                    </span>
                    {e.raccourci && <kbd className="menu-kbd">{e.raccourci}</kbd>}
                    {e.coche && (
                      <span className="menu-check">
                        <Icon name="check" size={15} strokeWidth={2.4} />
                      </span>
                    )}
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}

/** Bouton « ⋯ » ouvrant un menu d'actions (lignes de tableau, cartes). */
export function MenuActions({
  elements,
  label = "Actions",
}: {
  elements: EntreeMenu[];
  label?: string;
}) {
  return (
    <span onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex" }}>
      <Menu
        label={label}
        aligne="droite"
        elements={elements}
        declencheur={({ ouvert, ...p }) => (
          <button
            type="button"
            {...p}
            className={"btn-icone" + (ouvert ? " ouvert" : "")}
            aria-label={label}
            title={label}
          >
            <Icon name="more" size={18} />
          </button>
        )}
      />
    </span>
  );
}

export interface OptionChoix<T extends string | number> {
  value: T;
  label: string;
  ico?: IconName;
  couleur?: string;
  description?: string;
}

/**
 * Sélecteur à menu (remplace les listes déroulantes natives) : « Compte · Tous ▾ ».
 * En variante « filtre », il se met en évidence dès qu'il diffère de `parDefaut`.
 */
export function MenuChoix<T extends string | number>({
  libelle,
  valeur,
  options,
  onChange,
  parDefaut,
  ico,
  variante = "select",
  largeur = 220,
}: {
  libelle?: string;
  valeur: T;
  options: OptionChoix<T>[];
  onChange: (v: T) => void;
  parDefaut?: T;
  ico?: IconName;
  variante?: "select" | "filtre";
  largeur?: number;
}) {
  const courant = options.find((o) => o.value === valeur);
  const modifie = parDefaut !== undefined && valeur !== parDefaut;
  return (
    <Menu
      label={libelle}
      largeur={largeur}
      elements={options.map((o) => ({
        id: String(o.value),
        label: o.label,
        ico: o.ico,
        couleur: o.couleur,
        description: o.description,
        coche: o.value === valeur,
        action: () => onChange(o.value),
      }))}
      declencheur={({ ouvert, ...p }) => (
        <button
          type="button"
          {...p}
          className={
            (variante === "filtre" ? "choix filtre" : "choix") +
            (ouvert ? " ouvert" : "") +
            (modifie ? " modifie" : "")
          }
          aria-label={libelle ? `${libelle} : ${courant?.label ?? ""}` : undefined}
        >
          {ico && <Icon name={ico} size={15} />}
          {courant?.couleur && <span className="dot" style={{ background: courant.couleur }} />}
          {libelle && variante === "filtre" && <span className="choix-lib">{libelle}</span>}
          <span className="choix-val">{courant?.label ?? "—"}</span>
          <span className="choix-chev">
            <Icon name="chevron-down" size={15} />
          </span>
        </button>
      )}
    />
  );
}
