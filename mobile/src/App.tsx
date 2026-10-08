import { useState } from "react";
import { Icon, type IconName } from "../../src/components/Icon";
import { useEtat } from "./etat";
import { Accueil } from "./ecrans/Accueil";
import { Apercu } from "./ecrans/Apercu";
import { Budgets } from "./ecrans/Budgets";
import { Operations } from "./ecrans/Operations";
import { Reglages } from "./ecrans/Reglages";
import { Saisie } from "./ecrans/Saisie";
import { EcranVerrou } from "./EcranVerrou";
import { useVerrou } from "./verrou";

type Onglet = "apercu" | "operations" | "budgets" | "reglages";

const ONGLETS: { id: Onglet; libelle: string; icone: IconName }[] = [
  { id: "apercu", libelle: "Aperçu", icone: "dashboard" },
  { id: "operations", libelle: "Opérations", icone: "card" },
  { id: "budgets", libelle: "Budgets", icone: "coins" },
  { id: "reglages", libelle: "Réglages", icone: "settings" },
];

export function App() {
  const { pret, appaire, inst } = useEtat();
  const { verrouille } = useVerrou();
  const [onglet, setOnglet] = useState<Onglet>("apercu");
  const [saisie, setSaisie] = useState(false);

  if (!pret) return null;
  if (!appaire) return <Accueil />;

  const allerReglages = () => {
    setOnglet("reglages");
    window.scrollTo(0, 0);
  };

  const bouton = (o: (typeof ONGLETS)[number]) => (
    <button
      key={o.id}
      className={`m-onglet ${onglet === o.id ? "actif" : ""}`}
      onClick={() => {
        setOnglet(o.id);
        window.scrollTo(0, 0);
      }}
      aria-current={onglet === o.id ? "page" : undefined}
    >
      <Icon name={o.icone} size={22} strokeWidth={onglet === o.id ? 2.2 : 1.9} />
      {o.libelle}
    </button>
  );

  return (
    <div className="m-app">
      <main>
        {onglet === "apercu" && <Apercu onReglages={allerReglages} />}
        {onglet === "operations" && <Operations onReglages={allerReglages} />}
        {onglet === "budgets" && <Budgets onReglages={allerReglages} />}
        {onglet === "reglages" && <Reglages />}
      </main>

      <nav className="m-onglets" aria-label="Navigation">
        {bouton(ONGLETS[0])}
        {bouton(ONGLETS[1])}
        <button
          className="m-fab"
          onClick={() => setSaisie(true)}
          disabled={!inst}
          aria-label="Nouvelle saisie"
          style={!inst ? { opacity: 0.4 } : undefined}
        >
          <Icon name="plus" size={26} strokeWidth={2.4} />
        </button>
        {bouton(ONGLETS[2])}
        {bouton(ONGLETS[3])}
      </nav>

      {saisie && <Saisie onFermer={() => setSaisie(false)} />}
      {verrouille && <EcranVerrou />}
    </div>
  );
}
