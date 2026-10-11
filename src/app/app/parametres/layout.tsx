import type { Metadata } from "next";
import { AccesReserve } from "@/components/app/parametres/acces-reserve";
import { estAdministrateur } from "@/components/app/parametres/acces";
import { OngletsParametres } from "@/components/app/parametres/onglets-parametres";
import { TitrePage } from "@/components/app/titre-page";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await estAdministrateur()) ? "Paramètres" : "Accès réservé" };
}

export default async function LayoutParametres({ children }: { children: React.ReactNode }) {
  // C'est le layout qui décide : le secrétariat voit le panneau, pas une redirection.
  if (!(await estAdministrateur())) return <AccesReserve />;

  return (
    <>
      <TitrePage titre="Paramètres" description="Filières, années scolaires, tarifs et comptes utilisateurs." />
      <OngletsParametres />
      {children}
    </>
  );
}
