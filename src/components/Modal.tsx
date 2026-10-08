import { useEffect, useId, useRef, type ReactNode } from "react";

interface ModalProps {
  titre: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ titre, onClose, children, footer }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titreId = useId();

  useEffect(() => {
    // Mémorise l'élément focalisé pour le restaurer à la fermeture.
    const precedent = document.activeElement as HTMLElement | null;

    // Focus initial : premier champ/bouton focusable, sinon la boîte elle-même.
    const boite = ref.current;
    const focusable = boite?.querySelector<HTMLElement>(
      'input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])'
    );
    (focusable ?? boite)?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "Tab" && boite) {
        // Piège le focus à l'intérieur de la modale.
        const cibles = Array.from(
          boite.querySelectorAll<HTMLElement>(
            'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.offsetParent !== null);
        if (cibles.length === 0) return;
        const premier = cibles[0];
        const dernier = cibles[cibles.length - 1];
        if (e.shiftKey && document.activeElement === premier) {
          e.preventDefault();
          dernier.focus();
        } else if (!e.shiftKey && document.activeElement === dernier) {
          e.preventDefault();
          premier.focus();
        }
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      precedent?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titreId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3 id={titreId}>{titre}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
