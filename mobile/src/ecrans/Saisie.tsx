import { useEffect, useMemo, useRef, useState } from "react";
import { subDays } from "date-fns";
import { Icon } from "../../../src/components/Icon";
import { categoriePourDescription } from "../../../src/lib/categorisation";
import { aujourdhui, getDevise } from "../../../src/lib/format";
import { useToast } from "../../../src/state/ToastContext";
import type { PhotoSaisie } from "../../../src/sync/protocole";
import { Feuille } from "../composants";
import { useEtat } from "../etat";
import { compresserPhoto, urlPhoto } from "../photo";

const VISIBLES = 8;

/** « 12,5 » / « 1 234.50 » → 12.5 ; null si invalide. */
function lireMontant(s: string): number | null {
  const n = Number(s.replace(/[\s  ]/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n >= 1e9) return null;
  return Math.round(n * 100) / 100;
}

export function Saisie({ onFermer }: { onFermer: () => void }) {
  const { inst, comptes, ajouterSaisie } = useEtat();
  const toast = useToast();
  const [type, setType] = useState<"depense" | "revenu">("depense");
  const [montantTxt, setMontantTxt] = useState("");
  const [description, setDescription] = useState("");
  const [categorieId, setCategorieId] = useState<number | null>(null);
  const [categorieManuelle, setCategorieManuelle] = useState(false);
  const [toutes, setToutes] = useState(false);
  const [date, setDate] = useState(aujourdhui());
  const [photo, setPhoto] = useState<PhotoSaisie | null>(null);
  const [busy, setBusy] = useState(false);
  const inputPhoto = useRef<HTMLInputElement>(null);

  const comptePrincipal = inst?.profil.comptePrincipalId;
  const [compteId, setCompteId] = useState<number | null>(
    comptes.find((c) => c.id === comptePrincipal)?.id ??
      comptes.find((c) => c.type === "courant")?.id ??
      comptes[0]?.id ??
      null
  );

  // Catégories du type choisi, les plus utilisées ces 90 derniers jours en premier.
  const categories = useMemo(() => {
    const liste = (inst?.categories ?? []).filter((c) => c.type === type);
    const depuis = subDays(new Date(), 90).toISOString().slice(0, 10);
    const usage = new Map<number, number>();
    for (const t of inst?.transactions ?? []) {
      if (t.categorie_id != null && t.date >= depuis) usage.set(t.categorie_id, (usage.get(t.categorie_id) ?? 0) + 1);
    }
    return liste.sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0) || a.nom.localeCompare(b.nom));
  }, [inst, type]);

  // Catégorie devinée à partir du libellé (mêmes règles que sur le PC).
  useEffect(() => {
    if (categorieManuelle || !inst) return;
    const id = categoriePourDescription(inst.regles, description);
    setCategorieId(id != null && categories.some((c) => c.id === id) ? id : null);
  }, [description, categorieManuelle, inst, categories]);

  const montant = lireMontant(montantTxt);
  const visibles = toutes ? categories : categories.slice(0, VISIBLES);
  const choisieCachee = categorieId != null && !visibles.some((c) => c.id === categorieId);

  async function choisirPhoto(f: File | undefined) {
    if (!f) return;
    try {
      setPhoto(await compresserPhoto(f));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Photo illisible");
    }
  }

  async function enregistrer() {
    if (montant == null) return;
    setBusy(true);
    try {
      await ajouterSaisie({
        type,
        montant,
        date,
        description: description.trim() || null,
        compte_id: compteId,
        categorie_id: categorieId,
        photo,
      });
      toast(type === "depense" ? "Dépense enregistrée" : "Revenu enregistré");
      onFermer();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Feuille titre="Nouvelle saisie" onFermer={onFermer}>
      <div className="m-seg" role="tablist">
        {(["depense", "revenu"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={type === t}
            className={type === t ? "actif" : ""}
            onClick={() => {
              setType(t);
              setCategorieId(null);
              setCategorieManuelle(false);
            }}
          >
            {t === "depense" ? "Dépense" : "Revenu"}
          </button>
        ))}
      </div>

      <div className="m-montant">
        <input
          inputMode="decimal"
          placeholder="0,00"
          value={montantTxt}
          onChange={(e) => setMontantTxt(e.target.value.replace(/[^\d.,\s]/g, ""))}
          aria-label="Montant"
          autoFocus
        />
        <div className="devise">{getDevise()}</div>
      </div>

      <div className="m-champ">
        <label htmlFor="m-libelle">Libellé</label>
        <input
          id="m-libelle"
          className="m-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={type === "depense" ? "Ex. Boulangerie, essence…" : "Ex. Salaire, remboursement…"}
          autoCapitalize="sentences"
          enterKeyHint="done"
        />
      </div>

      {categories.length > 0 && (
        <div className="m-champ">
          <div className="lib">Catégorie</div>
          <div className="m-chips">
            {(choisieCachee ? [...visibles, categories.find((c) => c.id === categorieId)!] : visibles).map((c) => (
              <button
                key={c.id}
                className={`m-chip ${categorieId === c.id ? "actif" : ""}`}
                onClick={() => {
                  setCategorieManuelle(true);
                  setCategorieId(categorieId === c.id ? null : c.id);
                }}
              >
                <span className="pt" style={{ background: c.couleur }} aria-hidden="true" />
                {c.nom}
              </button>
            ))}
            {categories.length > VISIBLES && (
              <button className="m-chip" onClick={() => setToutes((v) => !v)}>
                {toutes ? "Moins" : `+ ${categories.length - VISIBLES}`}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="m-champs-duo">
        <div className="m-champ">
          <label htmlFor="m-compte">Compte</label>
          <select
            id="m-compte"
            className="m-input"
            value={compteId ?? ""}
            onChange={(e) => setCompteId(e.target.value ? Number(e.target.value) : null)}
          >
            {comptes.length === 0 && <option value="">Aucun compte</option>}
            {comptes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
        </div>
        <div className="m-champ">
          <label htmlFor="m-date">Date</label>
          <input
            id="m-date"
            className="m-input"
            type="date"
            value={date}
            max={aujourdhui()}
            onChange={(e) => setDate(e.target.value || aujourdhui())}
          />
        </div>
      </div>

      <div className="m-photo">
        {photo ? (
          <>
            <img src={urlPhoto(photo)} alt="Ticket joint" />
            <div style={{ flex: 1, fontSize: 14, color: "var(--text-muted)" }}>Ticket joint</div>
            <button className="m-chip" onClick={() => setPhoto(null)}>
              Retirer
            </button>
          </>
        ) : (
          <button className="m-bouton secondaire" onClick={() => inputPhoto.current?.click()}>
            <Icon name="camera" size={18} /> Joindre le ticket
          </button>
        )}
        <input
          ref={inputPhoto}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            void choisirPhoto(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      <button className="m-bouton" onClick={enregistrer} disabled={montant == null || busy}>
        <Icon name="check" size={18} />
        {montant == null ? "Saisissez un montant" : "Enregistrer"}
      </button>
    </Feuille>
  );
}
