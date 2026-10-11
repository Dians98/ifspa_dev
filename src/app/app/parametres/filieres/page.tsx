import type { Metadata } from "next";
import { estAdministrateur } from "@/components/app/parametres/acces";
import { ListeFilieres } from "@/components/app/parametres/liste-filieres";
import { lireFilieres } from "@/server/lectures/parametres";

export const metadata: Metadata = { title: "Filières · Paramètres" };

export default async function PageFilieres() {
  if (!(await estAdministrateur())) return null;
  return <ListeFilieres filieres={await lireFilieres()} />;
}
