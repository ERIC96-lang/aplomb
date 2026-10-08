import { useMemo } from "react";
import { statutsBudgets } from "../../../src/lib/budgets";
import { formatMois, formatMontant, moisCourant } from "../../../src/lib/format";
import { Entete, PuceSync, Vide, montantGrand } from "../composants";
import { useEtat } from "../etat";

export function Budgets({ onReglages }: { onReglages: () => void }) {
  const { inst, transactions } = useEtat();
  const mois = moisCourant();

  const statuts = useMemo(() => {
    if (!inst) return [];
    return statutsBudgets(inst.budgets, inst.categories, transactions, mois).sort((a, b) => b.ratio - a.ratio);
  }, [inst, transactions, mois]);

  const total = statuts.reduce(
    (acc, s) => ({ depense: acc.depense + s.depense, plafond: acc.plafond + s.plafond }),
    { depense: 0, plafond: 0 }
  );
  const ratioTotal = total.plafond > 0 ? total.depense / total.plafond : 0;

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
            <div className="m-carte m-hero">
              <div className="m-hero-lib">Dépensé sur vos budgets</div>
              <div className="m-hero-montant">{montantGrand(formatMontant(total.depense))}</div>
              <div className="m-hero-sous">sur {formatMontant(total.plafond)} de plafonds</div>
              <div className={`m-barre ${ratioTotal >= 1 ? "depasse" : ratioTotal >= 0.8 ? "attention" : ""}`}>
                <span style={{ width: `${Math.min(100, Math.max(2, ratioTotal * 100))}%` }} />
              </div>
            </div>

            <div className="m-carte">
              {statuts.map((s) => (
                <div key={s.categorie_id} style={{ padding: "8px 0 12px" }}>
                  <div className="flex-between">
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
                      <span
                        aria-hidden="true"
                        style={{ width: 9, height: 9, borderRadius: "50%", background: s.couleur }}
                      />
                      {s.nom}
                    </span>
                    <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 650 }}>
                      {formatMontant(s.depense)}
                    </span>
                  </div>
                  <div className={`m-barre ${s.etat === "ok" ? "" : s.etat}`}>
                    <span style={{ width: `${Math.min(100, Math.max(2, s.ratio * 100))}%` }} />
                  </div>
                  <div
                    className="flex-between"
                    style={{ marginTop: 6, fontSize: 12.5, color: "var(--text-dim)" }}
                  >
                    <span>Plafond {formatMontant(s.plafond)}</span>
                    <span className={s.etat === "depasse" ? "neg" : s.etat === "attention" ? "attn" : ""}>
                      {s.reste >= 0 ? `Reste ${formatMontant(s.reste)}` : `Dépassé de ${formatMontant(-s.reste)}`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
