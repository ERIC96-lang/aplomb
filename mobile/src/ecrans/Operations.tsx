import { useMemo, useState } from "react";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Icon } from "../../../src/components/Icon";
import { formatMontant } from "../../../src/lib/format";
import { useToast } from "../../../src/state/ToastContext";
import { estEnAttente } from "../../../src/sync/fusion";
import { uuidDepuisOrigine } from "../../../src/sync/protocole";
import type { Transaction } from "../../../src/db/types";
import { Entete, PuceSync, Vide } from "../composants";
import { useEtat } from "../etat";

const PAS = 80;

function libelleJour(iso: string): string {
  try {
    const d = parseISO(iso);
    if (isToday(d)) return "Aujourd'hui";
    if (isYesterday(d)) return "Hier";
    return format(d, "EEEE d MMMM", { locale: fr });
  } catch {
    return iso;
  }
}

function normaliser(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function Operations({ onReglages }: { onReglages: () => void }) {
  const { inst, transactions, saisies, annulerSaisie } = useEtat();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [limite, setLimite] = useState(PAS);

  const categories = useMemo(() => new Map((inst?.categories ?? []).map((c) => [c.id, c])), [inst]);
  const comptes = useMemo(() => new Map((inst?.comptes ?? []).map((c) => [c.id, c])), [inst]);
  const envoyees = useMemo(() => new Set(saisies.filter((s) => s.envoyee).map((s) => s.uuid)), [saisies]);

  const filtrees = useMemo(() => {
    const t = normaliser(q.trim());
    if (!t) return transactions;
    return transactions.filter((x) => {
      const cat = x.categorie_id != null ? categories.get(x.categorie_id)?.nom ?? "" : "";
      return normaliser(`${x.description ?? ""} ${cat} ${x.montant.toFixed(2)}`).includes(t);
    });
  }, [q, transactions, categories]);

  const groupes = useMemo(() => {
    const g: { date: string; lignes: Transaction[] }[] = [];
    for (const t of filtrees.slice(0, limite)) {
      const dernier = g[g.length - 1];
      if (dernier && dernier.date === t.date) dernier.lignes.push(t);
      else g.push({ date: t.date, lignes: [t] });
    }
    return g;
  }, [filtrees, limite]);

  async function toucher(t: Transaction) {
    if (!estEnAttente(t)) return;
    const uuid = uuidDepuisOrigine(t.auto_origine);
    if (!uuid) return;
    if (envoyees.has(uuid)) {
      toast("Déjà envoyée : le PC l'intégrera à sa prochaine relève.");
      return;
    }
    if (window.confirm("Annuler cette saisie ? Elle n'a pas encore été envoyée au PC.")) {
      await annulerSaisie(uuid);
      toast("Saisie annulée");
    }
  }

  return (
    <>
      <Entete titre="Opérations" droite={inst && <PuceSync onReglages={onReglages} />} />
      <div className="m-page">
        <label className="m-recherche">
          <Icon name="search" size={16} />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher"
            aria-label="Rechercher une opération"
          />
        </label>

        {groupes.length === 0 ? (
          <div className="m-carte">
            <Vide icone="card" titre={q ? "Aucun résultat" : "Aucune opération"}>
              {q ? `Rien ne correspond à « ${q} ».` : "Les opérations du PC et vos saisies apparaîtront ici."}
            </Vide>
          </div>
        ) : (
          <div>
            {groupes.map((g) => (
              <div key={g.date}>
                <div className="m-jour">{libelleJour(g.date)}</div>
                <div className="m-carte m-liste-carte">
                  {g.lignes.map((t) => {
                    const cat = t.categorie_id != null ? categories.get(t.categorie_id) : undefined;
                    const cpt = t.compte_id != null ? comptes.get(t.compte_id) : undefined;
                    const attente = estEnAttente(t);
                    const uuid = attente ? uuidDepuisOrigine(t.auto_origine) : null;
                    const couleur = cat?.couleur ?? "#8a857c";
                    const signe = t.type === "revenu" ? "+ " : t.type === "depense" ? "− " : "";
                    const nom =
                      t.description?.trim() ||
                      cat?.nom ||
                      (t.type === "virement" ? "Virement" : t.type === "revenu" ? "Revenu" : "Dépense");
                    return (
                      <button className="m-ligne" key={`${t.id}-${t.auto_origine ?? ""}`} onClick={() => toucher(t)}>
                        <span
                          className="m-pastille"
                          aria-hidden="true"
                          style={{
                            background: `color-mix(in srgb, ${couleur} 16%, var(--surface))`,
                            color: `color-mix(in srgb, ${couleur} 70%, var(--text))`,
                          }}
                        >
                          {t.type === "virement" ? (
                            <Icon name="repeat" size={16} />
                          ) : (
                            (cat?.nom ?? nom).charAt(0).toUpperCase()
                          )}
                        </span>
                        <div className="corps">
                          <div className="nom">
                            {nom}
                            {attente && (
                              <span className={`m-badge ${uuid && envoyees.has(uuid) ? "envoye" : ""}`}>
                                {uuid && envoyees.has(uuid) ? "Envoyée" : "À envoyer"}
                              </span>
                            )}
                          </div>
                          <div className="sous">
                            {[cat?.nom, cpt?.nom].filter(Boolean).join(" · ") || "Sans catégorie"}
                          </div>
                        </div>
                        <div className={`montant ${t.type === "revenu" ? "pos" : ""}`}>
                          {signe}
                          {formatMontant(t.montant)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {filtrees.length > limite && (
              <button className="m-bouton discret" onClick={() => setLimite((l) => l + PAS)}>
                Afficher plus
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
