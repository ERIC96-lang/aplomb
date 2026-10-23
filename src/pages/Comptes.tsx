import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppData } from "../state/AppDataContext";
import { useToast } from "../state/ToastContext";
import { useNavigate } from "react-router-dom";
import { Modal } from "../components/Modal";
import { MenuActions } from "../components/ui/Menu";
import { useDemandeNavigation } from "../hooks/useActionDemandee";
import { Icon } from "../components/Icon";
import { Defilant } from "../components/Defilant";
import { soldeCompteAvecInitial, totauxMois } from "../lib/calculs";
import { pointsSoldeMensuel } from "../lib/series";
import { addDays, format } from "date-fns";
import { Bandeau, Carte, LigneCalcul, Rangee, TotalCalcul, Vide } from "../components/ui/Page";
import { Sparkline } from "../components/dashboard/Sparkline";
import { formatMontant, aujourdhui, moisCourant } from "../lib/format";
import {
  archiverCompte,
  creerCompte,
  listComptes,
  majCompte,
  supprimerCompte,
} from "../db/repo";
import type { Compte, CompteType } from "../db/types";

// Couleurs des comptes (barre de répartition, icônes, tendances).
const COULEURS = ["var(--accent)", "var(--teal)", "var(--blue)", "var(--amber)", "var(--green)", "var(--red)"];

const TYPES: { value: CompteType; label: string }[] = [
  { value: "courant", label: "Courant" },
  { value: "epargne", label: "Épargne" },
  { value: "autre", label: "Autre" },
];

export function Comptes() {
  const { comptes, transactions, chargesFixes, rafraichir } = useAppData();
  const toast = useToast();
  const navigate = useNavigate();
  const [edit, setEdit] = useState<Compte | "new" | null>(null);
  const [archives, setArchives] = useState<Compte[]>([]);

  const chargerArchives = useCallback(async () => {
    const all = await listComptes(true);
    setArchives(all.filter((c) => c.archive === 1));
  }, []);
  useEffect(() => {
    chargerArchives();
  }, [chargerArchives, comptes]);

  // Un compte archivé est « vide » s'il n'a ni transaction ni charge liée.
  const estVide = useMemo(() => {
    const compteAvecTx = new Set<number>();
    for (const t of transactions) {
      if (t.compte_id != null) compteAvecTx.add(t.compte_id);
      if (t.compte_dest_id != null) compteAvecTx.add(t.compte_dest_id);
    }
    const compteAvecCharge = new Set(chargesFixes.map((c) => c.compte_id));
    return (id: number) => !compteAvecTx.has(id) && !compteAvecCharge.has(id);
  }, [transactions, chargesFixes]);

  const archivesVides = archives.filter((a) => estVide(a.id));

  async function supprimer(c: Compte) {
    if (!estVide(c.id)) {
      if (!window.confirm(`« ${c.nom} » a des transactions liées. Les supprimer détacherait ces transactions. Supprimer quand même ?`)) return;
    }
    await supprimerCompte(c.id);
    await Promise.all([rafraichir(), chargerArchives()]);
    toast("Compte supprimé");
  }

  useDemandeNavigation((d) => {
    if (d.action === "compte") setEdit("new");
  });

  const soldes = useMemo(
    () => comptes.map((c) => ({ c, solde: soldeCompteAvecInitial(c, transactions) })),
    [comptes, transactions]
  );
  const patrimoine = soldes.reduce((a, x) => a + x.solde, 0);
  const positifTotal = soldes.reduce((a, x) => a + Math.max(0, x.solde), 0) || 1;
  const decouverts = soldes.filter((x) => x.solde < 0);
  const parType = soldes.reduce<Partial<Record<CompteType, number>>>((a, x) => {
    a[x.c.type] = (a[x.c.type] ?? 0) + x.solde;
    return a;
  }, {});
  // Variation sur 30 jours : effet net des opérations datées des 30 derniers jours.
  const variation30 = useMemo(() => {
    const depuis = format(addDays(new Date(), -30), "yyyy-MM-dd");
    const ids = new Set(comptes.map((c) => c.id));
    return transactions
      .filter((t) => t.date >= depuis && t.a_confirmer !== 1)
      .reduce((a, t) => {
        if (t.type === "revenu" && t.compte_id != null && ids.has(t.compte_id)) return a + t.montant;
        if (t.type === "depense" && t.compte_id != null && ids.has(t.compte_id)) return a - t.montant;
        return a;
      }, 0);
  }, [comptes, transactions]);
  const tendance = (id: number) => pointsSoldeMensuel(comptes, transactions, id, 12).map((p) => p.solde);

  async function purgerVides() {
    for (const a of archivesVides) await supprimerCompte(a.id);
    await Promise.all([rafraichir(), chargerArchives()]);
    toast(`${archivesVides.length} compte(s) de démo supprimé(s)`);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Comptes</h1>
          <div className="sub">Vue de tous tes comptes et de leur solde actuel</div>
        </div>
        <button className="btn primary" onClick={() => setEdit("new")}>
          <Icon name="plus" size={16} /> Nouveau compte
        </button>
      </div>

      {comptes.length === 0 ? (
        <Carte>
          <Vide ico="bank" titre="Aucun compte pour l'instant" texte="Ajoute ton compte courant, ton livret, tes espèces… avec leur solde actuel : tout le reste de l'app s'appuie dessus.">
            <button className="btn primary" onClick={() => setEdit("new")}>
              <Icon name="plus" size={16} /> Créer un compte
            </button>
          </Vide>
        </Carte>
      ) : (
        <>
          <Bandeau
            surtitre="Patrimoine total"
            montant={patrimoine}
            humeur={decouverts.length > 0 ? "risque" : "ok"}
            statut={decouverts.length > 0 ? `${decouverts.length} compte${decouverts.length > 1 ? "s" : ""} à découvert` : "Tous tes comptes sont positifs"}
            phrase={
              <>
                {comptes.length} compte{comptes.length > 1 ? "s" : ""} actif{comptes.length > 1 ? "s" : ""} ·{" "}
                <strong className="num">{variation30 >= 0 ? "+ " : "− "}{formatMontant(Math.abs(variation30))}</strong> sur 30 jours
              </>
            }
            calcul={
              <>
                {TYPES.filter((t) => parType[t.value] !== undefined).map((t) => (
                  <LigneCalcul key={t.value} label={t.label} valeur={parType[t.value]!} />
                ))}
                <TotalCalcul label="Total" valeur={patrimoine} />
              </>
            }
          >
            <div className="pg-pile" aria-hidden="true">
              {soldes.map(({ c, solde }, i) =>
                solde > 0 ? (
                  <span key={c.id} style={{ width: `${(solde / positifTotal) * 100}%`, background: COULEURS[i % COULEURS.length] }} />
                ) : null
              )}
            </div>
            <div className="pg-pile-legende">
              {soldes.map(({ c, solde }, i) => (
                <span key={c.id}>
                  <span className="dot" style={{ background: COULEURS[i % COULEURS.length] }} />
                  {c.nom} <strong className="num">{positifTotal > 0 && solde > 0 ? `${Math.round((solde / positifTotal) * 100)} %` : formatMontant(solde)}</strong>
                </span>
              ))}
            </div>
          </Bandeau>

          <Rangee type="tiers">
            {soldes.map(({ c, solde }, i) => {
              const mois = totauxMois(transactions, moisCourant(), c.id);
              return (
                <section className="card pg-compte" key={c.id}>
                  <div className="pg-compte-tete">
                    <span className="pg-compte-ico" style={{ color: COULEURS[i % COULEURS.length] }}>
                      <Icon name={c.type === "epargne" ? "coins" : "wallet"} size={19} />
                    </span>
                    <div>
                      <div className="pg-compte-nom">{c.nom}</div>
                      <div className="dim pg-compte-type">{TYPES.find((t) => t.value === c.type)?.label}</div>
                    </div>
                    <MenuActions
                      label={`Actions pour ${c.nom}`}
                      elements={[
                        { id: "modifier", label: "Modifier", ico: "edit", description: "Nom, type, solde initial", action: () => setEdit(c) },
                        {
                          id: "depense",
                          label: "Nouvelle opération",
                          ico: "plus",
                          description: "Dépense, revenu ou virement sur ce compte",
                          action: () => navigate("/transactions", { state: { action: "depense", compte: c.id } }),
                        },
                        { separateur: true },
                        {
                          id: "archiver",
                          label: "Archiver",
                          ico: "folder",
                          description: "Masqué, historique conservé",
                          danger: true,
                          action: async () => {
                            await archiverCompte(c.id, true);
                            await rafraichir();
                            toast("Compte archivé");
                          },
                        },
                      ]}
                    />
                  </div>
                  <div className={`pg-compte-solde num ${solde < 0 ? "neg" : ""}`}>
                    <Defilant valeur={solde} />
                  </div>
                  <Sparkline valeurs={tendance(c.id)} couleur={COULEURS[i % COULEURS.length]} />
                  <div className="pg-compte-mois">
                    <span>
                      <em>Entrées du mois</em>
                      <strong className="num pos">+ {formatMontant(mois.revenus)}</strong>
                    </span>
                    <span>
                      <em>Sorties du mois</em>
                      <strong className="num">− {formatMontant(mois.depenses)}</strong>
                    </span>
                  </div>
                  <button
                    className="pg-compte-lien"
                    onClick={() => navigate("/transactions", { state: { compte: c.id } })}
                  >
                    Voir les opérations <Icon name="chevron-right" size={14} />
                  </button>
                </section>
              );
            })}
          </Rangee>
        </>
      )}

      {archives.length > 0 && (
        <Carte
          titre={`Comptes archivés (${archives.length})`}
          ico="folder"
          action={
            archivesVides.length > 0 ? (
              <button className="btn sm" onClick={purgerVides}>
                <Icon name="trash" size={14} /> Supprimer les {archivesVides.length} compte(s) vide(s)
              </button>
            ) : undefined
          }
        >
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Type</th>
                  <th></th>
                  <th style={{ width: 44 }} aria-label="Actions"></th>
                </tr>
              </thead>
              <tbody>
                {archives.map((a) => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 600 }}>{a.nom}</td>
                    <td>{TYPES.find((t) => t.value === a.type)?.label}</td>
                    <td>
                      {estVide(a.id) ? (
                        <span className="chip etat-inactif">vide</span>
                      ) : (
                        <span className="muted" style={{ fontSize: 12 }}>a des transactions</span>
                      )}
                    </td>
                    <td className="right" style={{ padding: "6px 8px" }}>
                      <MenuActions
                        label={`Actions pour ${a.nom}`}
                        elements={[
                          {
                            id: "restaurer",
                            label: "Restaurer",
                            ico: "undo",
                            action: async () => {
                              await archiverCompte(a.id, false);
                              await Promise.all([rafraichir(), chargerArchives()]);
                              toast("Compte restauré");
                            },
                          },
                          { separateur: true },
                          { id: "supprimer", label: "Supprimer", ico: "trash", danger: true, action: () => void supprimer(a) },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Carte>
      )}

      <AnimatePresence>
        {edit && (
          <CompteForm
            key="edit"
            compte={edit === "new" ? null : edit}
            onClose={() => setEdit(null)}
            onSaved={async () => {
              setEdit(null);
              await rafraichir();
              toast("Compte enregistré");
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function CompteForm({
  compte,
  onClose,
  onSaved,
}: {
  compte: Compte | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nom, setNom] = useState(compte?.nom ?? "");
  const [type, setType] = useState<CompteType>(compte?.type ?? "courant");
  const [solde, setSolde] = useState(String(compte?.solde_initial ?? ""));
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!nom.trim()) return;
    setBusy(true);
    const soldeNum = parseFloat(solde.replace(",", ".")) || 0;
    if (compte) {
      // Compte existant : seul le nom est modifiable, le reste est figé.
      await majCompte(compte.id, {
        nom: nom.trim(),
        type: compte.type,
        solde_initial: compte.solde_initial,
      });
    } else {
      await creerCompte({
        nom: nom.trim(),
        type,
        solde_initial: soldeNum,
        date_creation: aujourdhui(),
      });
    }
    onSaved();
  }

  return (
    <Modal
      titre={compte ? "Renommer le compte" : "Nouveau compte"}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn primary" onClick={submit} disabled={busy || !nom.trim()}>
            Enregistrer
          </button>
        </>
      }
    >
      <div className="field">
        <label>Nom du compte</label>
        <input
          className="input"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="ex. Compte courant"
          autoFocus
        />
      </div>
      <div className="field">
        <label>Type</label>
        <select
          className="select"
          value={type}
          onChange={(e) => setType(e.target.value as CompteType)}
          disabled={!!compte}
        >
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Solde initial{compte ? "" : " (€)"}</label>
        <input
          className="input"
          value={solde}
          onChange={(e) => setSolde(e.target.value)}
          placeholder="0,00"
          inputMode="decimal"
          disabled={!!compte}
        />
        <span className="muted" style={{ fontSize: 12 }}>
          {compte
            ? "Le solde initial et le type sont figés à la création. Le solde réel se calcule automatiquement à partir de tes revenus, dépenses et virements."
            : "Le solde du compte au moment de sa création dans l'app."}
        </span>
      </div>
    </Modal>
  );
}
