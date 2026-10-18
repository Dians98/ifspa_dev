import type { Metadata } from "next";
import { AccesReserve } from "@/components/app/parametres/acces-reserve";
import { OngletsParametres } from "@/components/app/parametres/onglets-parametres";
import { TitrePage } from "@/components/app/titre-page";
import { exigerSessionPage } from "@/server/acces";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await exigerSessionPage()).admin ? "Paramètres" : "Accès réservé" };
}

export default async function LayoutParametres({ children }: { children: React.ReactNode }) {
  // C'est le layout qui décide : le secrétariat voit le panneau, pas une redirection.
  if (!(await exigerSessionPage()).admin) return <AccesReserve />;

  return (
    <>
      <TitrePage titre="Paramètres" description="Filières, années scolaires, tarifs, comptes utilisateurs et reprise des données." />
      <OngletsParametres />
      {children}
    </>
  );
}
