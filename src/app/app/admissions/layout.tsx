import type { Metadata } from "next";
import { Avancement } from "@/components/app/admissions/avancement";
import { OngletsAdmissions } from "@/components/app/admissions/onglets-admissions";
import { TitrePage } from "@/components/app/titre-page";
import { lireEcran } from "./lecture";

export const metadata: Metadata = { title: "Passage en année supérieure" };

export default async function LayoutAdmissions({ children }: { children: React.ReactNode }) {
  const ecran = await lireEcran();
  const description =
    ecran.source && ecran.libelleCible
      ? `Fin de l'année ${ecran.source.libelle} : décidez, classe par classe, qui passe en ${ecran.libelleCible}.`
      : "Décidez, classe par classe, qui passe dans l'année supérieure.";

  return (
    <>
      <TitrePage
        titre="Passage en année supérieure"
        description={description}
        actions={ecran.avancement.total > 0 ? <Avancement avancement={ecran.avancement} /> : undefined}
      />
      <OngletsAdmissions />
      {children}
    </>
  );
}
