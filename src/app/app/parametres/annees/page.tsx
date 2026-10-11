import type { Metadata } from "next";
import { estAdministrateur } from "@/components/app/parametres/acces";
import { ListeAnnees } from "@/components/app/parametres/liste-annees";
import { lireAnnees } from "@/server/lectures/parametres";

export const metadata: Metadata = { title: "Années scolaires · Paramètres" };

export default async function PageAnnees() {
  if (!(await estAdministrateur())) return null;
  const { annees, anneeDebutProposee } = await lireAnnees();
  return <ListeAnnees annees={annees} anneeDebutProposee={anneeDebutProposee} />;
}
