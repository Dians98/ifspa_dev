import type { Metadata } from "next";
import { AccesReserve } from "@/components/app/parametres/acces-reserve";
import { ListeAnnees } from "@/components/app/parametres/liste-annees";
import { exigerSessionPage } from "@/server/acces";
import { lireAnnees } from "@/server/lectures/parametres";

export const metadata: Metadata = { title: "Années scolaires · Paramètres" };

export default async function PageAnnees() {
  if (!(await exigerSessionPage()).admin) return <AccesReserve />;
  const { annees, anneeDebutProposee } = await lireAnnees();
  return <ListeAnnees annees={annees} anneeDebutProposee={anneeDebutProposee} />;
}
