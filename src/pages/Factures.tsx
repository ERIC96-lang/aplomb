import { useEffect, useMemo, useState } from "react";
import { useToast } from "../state/ToastContext";
import { Icon } from "../components/Icon";
import { creerFacture, listFactures, supprimerFacture } from "../db/repo";
import { genererFacturePdf, ligneVide, totalFacture } from "../lib/pdf";
import { aujourdhui, formatDate, formatMontant } from "../lib/format";
import type { Facture, FactureData, FactureType, LigneFacture } from "../db/types";

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
        <div className="segmented">
          <button className={onglet === "nouvelle" ? "active" : ""} onClick={() => setOnglet("nouvelle")}>
            Nouveau
          </button>
          <button className={onglet === "historique" ? "active" : ""} onClick={() => setOnglet("historique")}>
            Historique ({factures.length})
          </button>
        </div>
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

  return (
    <div className="grid" style={{ gridTemplateColumns: "1fr 300px", alignItems: "start" }}>
      <div className="card">
        <div className="row">
          <div className="field">
            <label>Type de document</label>
            <div className="segmented">
              <button className={type === "facture" ? "active" : ""} onClick={() => setType("facture")}>
                Facture
              </button>
              <button className={type === "recu" ? "active" : ""} onClick={() => setType("recu")}>
                Reçu
              </button>
            </div>
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

        <div className="row">
          <div style={{ flex: 1 }}>
            <div className="section-title">Émetteur</div>
            <div className="field">
              <input className="input" placeholder="Ton nom / société" value={emetteurNom} onChange={(e) => setEmetteurNom(e.target.value)} />
            </div>
            <div className="field">
              <textarea className="input" rows={3} placeholder="Adresse, SIRET, e-mail…" value={emetteurInfos} onChange={(e) => setEmetteurInfos(e.target.value)} />
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div className="section-title">Client</div>
            <div className="field">
              <input className="input" placeholder="Nom du client" value={clientNom} onChange={(e) => setClientNom(e.target.value)} />
            </div>
            <div className="field">
              <textarea className="input" rows={3} placeholder="Adresse, contact…" value={clientInfos} onChange={(e) => setClientInfos(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="section-title">Lignes</div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Désignation</th>
                <th className="right" style={{ width: 70 }}>Qté</th>
                <th className="right" style={{ width: 110 }}>Prix unit.</th>
                <th className="right" style={{ width: 100 }}>Total</th>
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
                    <button className="icon-btn" onClick={() => setLignes((ls) => ls.filter((_, k) => k !== i))} disabled={lignes.length === 1}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="btn sm" style={{ marginTop: 10 }} onClick={() => setLignes((ls) => [...ls, ligneVide()])}>
          <Icon name="plus" size={14} /> Ajouter une ligne
        </button>

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
      </div>

      {/* Résumé sticky */}
      <div className="card" style={{ position: "sticky", top: 0 }}>
        <h2>Récapitulatif</h2>
        <div className="flex-between" style={{ padding: "6px 0" }}>
          <span className="muted">Document</span>
          <span style={{ fontWeight: 600 }}>{type === "facture" ? "Facture" : "Reçu"}</span>
        </div>
        <div className="flex-between" style={{ padding: "6px 0" }}>
          <span className="muted">Lignes</span>
          <span style={{ fontWeight: 600 }}>{lignes.length}</span>
        </div>
        <div className="flex-between" style={{ padding: "10px 0 4px", borderTop: "1px solid var(--border)", marginTop: 6 }}>
          <span style={{ fontWeight: 700 }}>Total TTC</span>
          <span className="num" style={{ fontWeight: 750, fontSize: 18 }}>{formatMontant(total)}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
          <button className="btn primary" onClick={telecharger}>
            <Icon name="download" size={16} /> Télécharger le PDF
          </button>
          <button className="btn" onClick={enregistrer}>
            <Icon name="report" size={16} /> Enregistrer dans l'historique
          </button>
        </div>
      </div>
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
      <div className="card empty">
        <div className="big">
          <Icon name="report" size={44} strokeWidth={1.5} />
        </div>
        <p>Aucun document enregistré. Crée une facture ou un reçu depuis l'onglet « Nouveau ».</p>
      </div>
    );
  }

  return (
    <div className="card">
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
                    <button
                      className="btn sm ghost"
                      onClick={async () => {
                        await supprimerFacture(f.id);
                        onChange();
                        toast("Document supprimé");
                      }}
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
