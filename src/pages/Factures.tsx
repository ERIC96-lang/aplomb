import { MenuActions } from "../components/ui/Menu";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "../state/ToastContext";
import { Icon } from "../components/Icon";
import { creerFacture, listFactures, supprimerFacture } from "../db/repo";
import { genererFacturePdf, ligneVide, totalFacture } from "../lib/pdf";
import { aujourdhui, formatDate, formatMontant } from "../lib/format";
import type { Facture, FactureData, FactureType, LigneFacture } from "../db/types";
import { Segmente } from "../components/ui/Segmente";
import { Carte, Indicateurs, Kpi, Rangee, Vide } from "../components/ui/Page";

const CLE_EMETTEUR = "facture_emetteur";

export function Factures() {
  const toast = useToast();
  const [onglet, setOnglet] = useState<"nouvelle" | "historique">("nouvelle");
  const [factures, setFactures] = useState<Facture[]>([]);

  const recharger = () => listFactures().then(setFactures);
  useEffect(() => {
    recharger();
  }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Factures & reçus</h1>
          <div className="sub">Génère des documents PDF professionnels, à télécharger au besoin</div>
        </div>
        <Segmente
          label="Vue"
          valeur={onglet}
          onChange={setOnglet}
          options={[
            { value: "nouvelle", label: "Nouveau", ico: "plus" },
            { value: "historique", label: "Historique", ico: "folder", compte: factures.length },
          ]}
        />
      </div>

      {onglet === "nouvelle" ? (
        <Generateur onSaved={recharger} nbExistantes={factures.length} toast={toast} />
      ) : (
        <Historique factures={factures} onChange={recharger} toast={toast} />
      )}
    </>
  );
}

function Generateur({
  onSaved,
  nbExistantes,
  toast,
}: {
  onSaved: () => void;
  nbExistantes: number;
  toast: (m: string) => void;
}) {
  const emetteurInit = (() => {
    try {
      return JSON.parse(localStorage.getItem(CLE_EMETTEUR) ?? "{}");
    } catch {
      return {};
    }
  })();

  const [type, setType] = useState<FactureType>("facture");
  const [numero, setNumero] = useState(
    `FAC-${new Date().getFullYear()}-${String(nbExistantes + 1).padStart(3, "0")}`
  );
  const [date, setDate] = useState(aujourdhui());
  const [emetteurNom, setEmetteurNom] = useState(emetteurInit.nom ?? "");
  const [emetteurInfos, setEmetteurInfos] = useState(emetteurInit.infos ?? "");
  const [clientNom, setClientNom] = useState("");
  const [clientInfos, setClientInfos] = useState("");
  const [lignes, setLignes] = useState<LigneFacture[]>([ligneVide()]);
  const [tva, setTva] = useState("20");
  const [notes, setNotes] = useState("");
  const [paye, setPaye] = useState(true);

  const data: FactureData = useMemo(
    () => ({
      type,
      numero,
      date,
      emetteur_nom: emetteurNom,
      emetteur_infos: emetteurInfos,
      client_nom: clientNom,
      client_infos: clientInfos,
      lignes,
      tva_taux: parseFloat(tva.replace(",", ".")) || 0,
      notes,
      paye,
    }),
    [type, numero, date, emetteurNom, emetteurInfos, clientNom, clientInfos, lignes, tva, notes, paye]
  );

  const total = totalFacture(data);

  function majLigne(i: number, patch: Partial<LigneFacture>) {
    setLignes((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  }

  function memoriserEmetteur() {
    try {
      localStorage.setItem(CLE_EMETTEUR, JSON.stringify({ nom: emetteurNom, infos: emetteurInfos }));
    } catch {
      /* ignore */
    }
  }

  async function telecharger() {
    memoriserEmetteur();
    const ok = await genererFacturePdf(data);
    if (ok) toast("PDF généré");
  }

  async function enregistrer() {
    memoriserEmetteur();
    await creerFacture(data, total);
    onSaved();
    toast("Document enregistré dans l'historique");
  }

  const totalHT = lignes.reduce((a, l) => a + l.quantite * l.prix_unitaire, 0);
  const montantTva = total - totalHT;

  return (
    <div className="pg-facture">
      <div className="pg-facture-form">
        <Carte titre="Document" ico="receipt">
          <div className="row">
            <div className="field">
              <label>Type</label>
              <Segmente
                label="Type de document"
                valeur={type}
                onChange={setType}
                options={[
                  { value: "facture", label: "Facture" },
                  { value: "recu", label: "Reçu" },
                ]}
              />
            </div>
            <div className="field">
              <label>Numéro</label>
              <input className="input" value={numero} onChange={(e) => setNumero(e.target.value)} />
            </div>
            <div className="field">
              <label>Date</label>
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
        </Carte>

        <Rangee>
          <Carte titre="Émetteur" ico="wallet">
            <div className="field">
              <input className="input" placeholder="Ton nom / société" value={emetteurNom} onChange={(e) => setEmetteurNom(e.target.value)} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <textarea className="input" rows={3} placeholder="Adresse, SIRET, e-mail…" value={emetteurInfos} onChange={(e) => setEmetteurInfos(e.target.value)} />
            </div>
            <div className="dim pg-memo">Mémorisé pour tes prochains documents.</div>
          </Carte>
          <Carte titre="Client" ico="bank">
            <div className="field">
              <input className="input" placeholder="Nom du client" value={clientNom} onChange={(e) => setClientNom(e.target.value)} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <textarea className="input" rows={3} placeholder="Adresse, contact…" value={clientInfos} onChange={(e) => setClientInfos(e.target.value)} />
            </div>
          </Carte>
        </Rangee>

        <Carte
          titre="Lignes"
          ico="report"
          action={
            <button className="btn sm" onClick={() => setLignes((ls) => [...ls, ligneVide()])}>
              <Icon name="plus" size={14} /> Ajouter une ligne
            </button>
          }
        >
          <div className="table-wrap">
            <table className="data pg-lignes">
              <thead>
                <tr>
                  <th>Désignation</th>
                  <th className="right" style={{ width: 80 }}>Qté</th>
                  <th className="right" style={{ width: 120 }}>Prix unit.</th>
                  <th className="right" style={{ width: 110 }}>Total</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l, i) => (
                  <tr key={i}>
                    <td>
                      <input className="input" value={l.designation} onChange={(e) => majLigne(i, { designation: e.target.value })} placeholder="Prestation / produit" />
                    </td>
                    <td>
                      <input className="input" style={{ textAlign: "right" }} inputMode="decimal" value={l.quantite}
                        onChange={(e) => majLigne(i, { quantite: parseFloat(e.target.value.replace(",", ".")) || 0 })} />
                    </td>
                    <td>
                      <input className="input" style={{ textAlign: "right" }} inputMode="decimal" value={l.prix_unitaire}
                        onChange={(e) => majLigne(i, { prix_unitaire: parseFloat(e.target.value.replace(",", ".")) || 0 })} />
                    </td>
                    <td className="right num">{formatMontant(l.quantite * l.prix_unitaire)}</td>
                    <td>
                      <button
                        className="btn-icone"
                        aria-label="Retirer la ligne"
                        onClick={() => setLignes((ls) => ls.filter((_, k) => k !== i))}
                        disabled={lignes.length === 1}
                      >
                        <Icon name="close" size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="row" style={{ marginTop: 16 }}>
            <div className="field">
              <label>TVA (%)</label>
              <input className="input" inputMode="decimal" value={tva} onChange={(e) => setTva(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 2 }}>
              <label>Notes (conditions, mentions…)</label>
              <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <label className="flex" style={{ cursor: "pointer", marginTop: 4 }}>
            <input type="checkbox" checked={paye} onChange={(e) => setPaye(e.target.checked)} style={{ width: 16, height: 16 }} />
            Marquer comme payé (tampon « PAYÉ » sur le document)
          </label>
        </Carte>
      </div>

      {/* Aperçu « papier » en direct, comme le PDF. */}
      <aside className="pg-facture-apercu">
        <div className="pg-papier" aria-label="Aperçu du document">
          <div className="pg-papier-tete">
            <div>
              <div className="pg-papier-type">{type === "facture" ? "Facture" : "Reçu"}</div>
              <div className="pg-papier-num">{numero || "—"}</div>
            </div>
            <div className="pg-papier-date">{date ? formatDate(date) : ""}</div>
          </div>
          <div className="pg-papier-fil" />
          <div className="pg-papier-parties">
            <div>
              <em>De</em>
              <strong>{emetteurNom || "Ton nom"}</strong>
            </div>
            <div>
              <em>Pour</em>
              <strong>{clientNom || "Client"}</strong>
            </div>
          </div>
          <div className="pg-papier-lignes">
            {lignes.map((l, i) => (
              <div key={i}>
                <span>{l.designation || "Prestation"}</span>
                <span className="num">{formatMontant(l.quantite * l.prix_unitaire)}</span>
              </div>
            ))}
          </div>
          <div className="pg-papier-totaux">
            <div>
              <span>Total HT</span>
              <span className="num">{formatMontant(totalHT)}</span>
            </div>
            <div>
              <span>TVA {data.tva_taux} %</span>
              <span className="num">{formatMontant(montantTva)}</span>
            </div>
            <div className="pg-papier-ttc">
              <span>Total TTC</span>
              <span className="num">{formatMontant(total)}</span>
            </div>
          </div>
          {paye && <div className="pg-papier-tampon">Payé</div>}
        </div>
        <div className="pg-facture-actions">
          <button className="btn primary" onClick={telecharger}>
            <Icon name="download" size={16} /> Télécharger le PDF
          </button>
          <button className="btn" onClick={enregistrer}>
            <Icon name="folder" size={16} /> Enregistrer dans l'historique
          </button>
        </div>
      </aside>
    </div>
  );
}

function Historique({
  factures,
  onChange,
  toast,
}: {
  factures: Facture[];
  onChange: () => void;
  toast: (m: string) => void;
}) {
  async function retelecharger(f: Facture) {
    const data = JSON.parse(f.donnees) as FactureData;
    const ok = await genererFacturePdf(data);
    if (ok) toast("PDF régénéré");
  }

  if (factures.length === 0) {
    return (
      <Carte>
        <Vide ico="receipt" titre="Aucun document enregistré" texte="Crée une facture ou un reçu depuis l'onglet « Nouveau », puis enregistre-le dans l'historique." />
      </Carte>
    );
  }

  const nbFactures = factures.filter((f) => f.type === "facture").length;
  const total = factures.reduce((a, f) => a + f.montant_total, 0);
  const annee = String(new Date().getFullYear());
  const totalAnnee = factures.filter((f) => f.date.startsWith(annee)).reduce((a, f) => a + f.montant_total, 0);

  return (
    <>
    <Indicateurs>
      <Kpi label="Documents" ico="folder" valeur={factures.length} sous={`${nbFactures} facture${nbFactures > 1 ? "s" : ""} · ${factures.length - nbFactures} reçu${factures.length - nbFactures > 1 ? "s" : ""}`} />
      <Kpi label="Total émis" ico="receipt" montant={total} sous="depuis le début" />
      <Kpi label={`Émis en ${annee}`} ico="calendar" montant={totalAnnee} sous="année en cours" />
      <Kpi label="Dernier document" ico="report" valeur={factures[0]?.numero ?? "—"} sous={factures[0] ? formatDate(factures[0].date) : undefined} />
    </Indicateurs>
    <div className="card" style={{ marginTop: 18 }}>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Numéro</th>
              <th>Type</th>
              <th>Date</th>
              <th className="right">Total</th>
              <th className="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {factures.map((f) => (
              <tr key={f.id}>
                <td style={{ fontWeight: 600 }}>{f.numero}</td>
                <td>
                  <span className={`badge ${f.type === "facture" ? "type-virement" : "type-revenu"}`}>
                    {f.type === "facture" ? "Facture" : "Reçu"}
                  </span>
                </td>
                <td>{formatDate(f.date)}</td>
                <td className="right num">{formatMontant(f.montant_total)}</td>
                <td className="right">
                  <div className="flex" style={{ justifyContent: "flex-end", gap: 6 }}>
                    <button className="btn sm" onClick={() => retelecharger(f)}>
                      <Icon name="download" size={13} /> PDF
                    </button>
                    <MenuActions
                      label="Actions sur le document"
                      elements={[
                        { id: "pdf", label: "Télécharger le PDF", ico: "download", action: () => void retelecharger(f) },
                        { separateur: true },
                        {
                          id: "supprimer",
                          label: "Supprimer",
                          ico: "trash",
                          danger: true,
                          action: async () => {
                            if (!window.confirm("Supprimer ce document de l'historique ?")) return;
                            await supprimerFacture(f.id);
                            onChange();
                            toast("Document supprimé");
                          },
                        },
                      ]}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
    </>
  );
}
