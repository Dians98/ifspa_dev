import type { Metadata } from "next";
import { AccesReserve } from "@/components/app/parametres/acces-reserve";
import { RepriseDonnees } from "@/components/app/parametres/reprise/reprise-donnees";
import { exigerSessionPage } from "@/server/acces";
import { lireAnnees } from "@/server/lectures/parametres";

export const metadata: Metadata = { title: "Reprise des données · Paramètres" };

export default async function PageImport() {
  if (!(await exigerSessionPage()).admin) return <AccesReserve />;
  const { annees } = await lireAnnees();
  const courante = annees.find((a) => a.estCourante);
  return <RepriseDonnees anneeCourante={courante?.libelle ?? null} />;
}
