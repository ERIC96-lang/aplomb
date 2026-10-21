import { useCountUp } from "../hooks/useCountUp";
import { formatMontant } from "../lib/format";

/** Nombre qui défile jusqu'à sa valeur (montant par défaut). */
export function Defilant({
  valeur,
  rendu = formatMontant,
}: {
  valeur: number;
  rendu?: (n: number) => string;
}) {
  return <>{rendu(useCountUp(valeur))}</>;
}
