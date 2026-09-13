import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { useAppData } from "../state/AppDataContext";
import { useToast } from "../state/ToastContext";
import { Icon } from "../components/Icon";
import { creerTransaction, listRegles } from "../db/repo";
import { categoriePourDescription } from "../lib/categorisation";
import type { RegleCategorisation } from "../db/types";
import {
  detecterDelimiteur,
  estDoublon,
  parseCSV,
  parseDate,
  parseMontant,
  parseOFX,
  type FormatDate,
  type LigneImport,
} from "../lib/import";
import { formatDate, formatMontant } from "../lib/format";

export function Import() {
  const { comptes, transactions, rafraichir } = useAppData();
  const toast = useToast();

  const [nomFichier, setNomFichier] = useState("");
  const [kind, setKind] = useState<"csv" | "ofx" | null>(null);
  const [rows, setRows] = useState<string[][]>([]);
  const [ofxLignes, setOfxLignes] = useState<LigneImport[]>([]);
  const [entetes, setEntetes] = useState(true);
  const [colDate, setColDate] = useState(0);
  const [colMontant, setColMontant] = useState(1);
  const [colDesc, setColDesc] = useState(2);
  const [fmtDate, setFmtDate] = useState<FormatDate>("auto");
  const [compteId, setCompteId] = useState<number | "">(comptes[0]?.id ?? "");
  const [dedup, setDedup] = useState(true);
  const [resultat, setResultat] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [regles, setRegles] = useState<RegleCategorisation[]>([]);

  useEffect(() => {
    listRegles().then(setRegles);
  }, []);

  async function choisir() {
    const chemin = await open({
      multiple: false,
      filters: [{ name: "Relevés", extensions: ["csv", "ofx", "qfx", "txt"] }],
    });
    if (!chemin || typeof chemin !== "string") return;
    const texte = await readTextFile(chemin);
    const nom = chemin.split(/[\\/]/).pop() ?? "fichier";
    setNomFichier(nom);
    setResultat(null);

    if (/\.(ofx|qfx)$/i.test(nom) || /<OFX>/i.test(texte)) {
      setKind("ofx");
      setOfxLignes(parseOFX(texte));
      setRows([]);
    } else {
      setKind("csv");
      const delim = detecterDelimiteur(texte);
      const r = parseCSV(texte, delim);
      setRows(r);
      // devine les colonnes d'après les en-têtes
      const head = (r[0] ?? []).map((h) => h.toLowerCase());
      const trouve = (mots: string[], def: number) => {
        const i = head.findIndex((h) => mots.some((m) => h.includes(m)));
        return i >= 0 ? i : def;
      };
      setColDate(trouve(["date"], 0));
      setColMontant(trouve(["montant", "amount", "débit", "credit", "valeur"], 1));
      setColDesc(trouve(["libell", "descript", "nature", "name", "mémo", "memo"], 2));
    }
  }

  const lignes: LigneImport[] = useMemo(() => {
    if (kind === "ofx") return ofxLignes;
    if (kind === "csv") {
      const data = entetes ? rows.slice(1) : rows;
      const res: LigneImport[] = [];
      for (const r of data) {
        const date = parseDate(r[colDate] ?? "", fmtDate);
        const montant = parseMontant(r[colMontant] ?? "");
        if (!date || montant == null) continue;
        res.push({ date, montant, description: (r[colDesc] ?? "").trim() });
      }
      return res;
    }
    return [];
  }, [kind, ofxLignes, rows, entetes, colDate, colMontant, colDesc, fmtDate]);

  const doublons = useMemo(() => {
    if (compteId === "" || !dedup) return 0;
    return lignes.filter((l) => estDoublon(transactions, Number(compteId), l.date, Math.abs(l.montant), l.description)).length;
  }, [lignes, transactions, compteId, dedup]);

  const aImporter = lignes.length - (dedup ? doublons : 0);

  async function importer() {
    if (compteId === "" || lignes.length === 0) return;
    setBusy(true);
    let n = 0;
    let ignores = 0;
    for (const l of lignes) {
      const montantAbs = Math.abs(l.montant);
      if (dedup && estDoublon(transactions, Number(compteId), l.date, montantAbs, l.description)) {
        ignores++;
        continue;
      }
      await creerTransaction({
        type: l.montant < 0 ? "depense" : "revenu",
        montant: montantAbs,
        date: l.date,
        description: l.description || null,
        compte_id: Number(compteId),
        compte_dest_id: null,
        categorie_id: l.montant < 0 ? categoriePourDescription(regles, l.description) : null,
      });
      n++;
    }
    await rafraichir();
    setBusy(false);
    setResultat(`${n} transaction(s) importée(s)${ignores ? `, ${ignores} doublon(s) ignoré(s)` : ""}.`);
    toast("Import terminé");
  }

  const entetesNoms = rows[0] ?? [];
  const colOptions = (entetesNoms.length ? entetesNoms : (rows[1] ?? [])).map(
    (h, i) => ({ i, label: entetes && h ? h : `Colonne ${i + 1}` })
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Importer un relevé</h1>
          <div className="sub">Fichiers CSV (relevé bancaire) ou OFX/QFX — avec mapping et dédoublonnage</div>
        </div>
        <button className="btn primary" onClick={choisir}>
          <Icon name="folder" size={16} /> Choisir un fichier
        </button>
      </div>

      {!kind ? (
        <div className="card empty">
          <div className="big">
            <Icon name="download" size={44} strokeWidth={1.5} />
          </div>
          <p>Sélectionne un relevé <strong>.csv</strong> ou <strong>.ofx / .qfx</strong> exporté depuis ta banque pour démarrer avec ton historique réel.</p>
        </div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: "1fr 300px", alignItems: "start" }}>
          <div className="card">
            <div className="flex-between" style={{ marginBottom: 12 }}>
              <h2 style={{ margin: 0 }}>
                {nomFichier} <span className="chip" style={{ background: "var(--brand-grad-soft)", color: "var(--accent)" }}>{kind.toUpperCase()}</span>
              </h2>
              <span className="muted">{lignes.length} ligne(s) détectée(s)</span>
            </div>

            {kind === "csv" && (
              <>
                <label className="flex" style={{ cursor: "pointer", marginBottom: 12 }}>
                  <input type="checkbox" checked={entetes} onChange={(e) => setEntetes(e.target.checked)} style={{ width: 16, height: 16 }} />
                  La première ligne contient les en-têtes
                </label>
                <div className="row">
                  <div className="field">
                    <label>Colonne date</label>
                    <select className="select" value={colDate} onChange={(e) => setColDate(Number(e.target.value))}>
                      {colOptions.map((o) => <option key={o.i} value={o.i}>{o.label}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Colonne montant</label>
                    <select className="select" value={colMontant} onChange={(e) => setColMontant(Number(e.target.value))}>
                      {colOptions.map((o) => <option key={o.i} value={o.i}>{o.label}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Colonne libellé</label>
                    <select className="select" value={colDesc} onChange={(e) => setColDesc(Number(e.target.value))}>
                      {colOptions.map((o) => <option key={o.i} value={o.i}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="field" style={{ maxWidth: 220 }}>
                  <label>Format de date</label>
                  <select className="select" value={fmtDate} onChange={(e) => setFmtDate(e.target.value as FormatDate)}>
                    <option value="auto">Auto</option>
                    <option value="fr">JJ/MM/AAAA</option>
                    <option value="us">MM/JJ/AAAA</option>
                    <option value="iso">AAAA-MM-JJ</option>
                  </select>
                </div>
              </>
            )}

            <div className="section-title">Aperçu</div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th>Date</th><th>Libellé</th><th className="right">Montant</th><th>Type</th></tr>
                </thead>
                <tbody>
                  {lignes.slice(0, 12).map((l, i) => (
                    <tr key={i}>
                      <td>{formatDate(l.date)}</td>
                      <td>{l.description || <span className="muted">—</span>}</td>
                      <td className={"right num " + (l.montant < 0 ? "montant-neg" : "montant-pos")}>{formatMontant(l.montant)}</td>
                      <td><span className={`badge ${l.montant < 0 ? "type-depense" : "type-revenu"}`}>{l.montant < 0 ? "Dépense" : "Revenu"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {lignes.length > 12 && <div className="dim" style={{ marginTop: 8, fontSize: 12 }}>… et {lignes.length - 12} autres</div>}
          </div>

          <div className="card" style={{ position: "sticky", top: 0 }}>
            <h2>Import</h2>
            <div className="field">
              <label>Compte de destination</label>
              <select className="select" value={compteId} onChange={(e) => setCompteId(e.target.value === "" ? "" : Number(e.target.value))}>
                <option value="">—</option>
                {comptes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </div>
            <label className="flex" style={{ cursor: "pointer", margin: "6px 0 14px" }}>
              <input type="checkbox" checked={dedup} onChange={(e) => setDedup(e.target.checked)} style={{ width: 16, height: 16 }} />
              Ignorer les doublons
            </label>
            <div className="flex-between" style={{ padding: "6px 0" }}>
              <span className="muted">Lignes valides</span>
              <span style={{ fontWeight: 600 }}>{lignes.length}</span>
            </div>
            {dedup && (
              <div className="flex-between" style={{ padding: "6px 0" }}>
                <span className="muted">Doublons</span>
                <span style={{ fontWeight: 600 }}>{doublons}</span>
              </div>
            )}
            <div className="flex-between" style={{ padding: "10px 0 4px", borderTop: "1px solid var(--border)", marginTop: 6 }}>
              <span style={{ fontWeight: 700 }}>À importer</span>
              <span className="num" style={{ fontWeight: 750, fontSize: 18 }}>{aImporter}</span>
            </div>
            <button
              className="btn primary"
              style={{ width: "100%", justifyContent: "center", marginTop: 14 }}
              onClick={importer}
              disabled={busy || compteId === "" || aImporter <= 0}
            >
              <Icon name="download" size={16} /> Importer {aImporter > 0 ? `(${aImporter})` : ""}
            </button>
            {resultat && <div className="chip" style={{ marginTop: 12, background: "rgba(52,211,153,.15)", color: "var(--green)" }}>{resultat}</div>}
          </div>
        </div>
      )}
    </>
  );
}
