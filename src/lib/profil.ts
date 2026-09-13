export type ModeRevenu = "fixe" | "moyenne" | "fourchette";

export interface Profil {
  revenuMensuel: number; // montant typique / attendu
  jourPaie: number; // 1..31
  comptePrincipalId: number | null;
  tauxEpargneCible: number; // % du revenu
  configure: boolean;
  modeRevenu: ModeRevenu;
  revenuBas: number; // fourchette : montant prudent
  revenuHaut: number; // fourchette : montant optimiste
}

const CLE = "profil";

const DEFAUT: Profil = {
  revenuMensuel: 0,
  jourPaie: 1,
  comptePrincipalId: null,
  tauxEpargneCible: 15,
  configure: false,
  modeRevenu: "fixe",
  revenuBas: 0,
  revenuHaut: 0,
};

export function lireProfil(): Profil {
  try {
    const raw = localStorage.getItem(CLE);
    if (raw) return { ...DEFAUT, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAUT };
}

export function ecrireProfil(p: Profil): void {
  try {
    localStorage.setItem(CLE, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

/** Convertit le revenu mensuel du profil lors d'un changement de devise. */
export function convertirProfil(taux: number): void {
  const p = lireProfil();
  if (p.revenuMensuel) {
    p.revenuMensuel = Math.round(p.revenuMensuel * taux * 100) / 100;
    ecrireProfil(p);
  }
}
