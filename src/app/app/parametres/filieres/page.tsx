import type { Metadata } from "next";
import { AccesReserve } from "@/components/app/parametres/acces-reserve";
import { ListeFilieres } from "@/components/app/parametres/liste-filieres";
import { exigerSessionPage } from "@/server/acces";
import { lireFilieres } from "@/server/lectures/parametres";

export const metadata: Metadata = { title: "Filières · Paramètres" };

export default async function PageFilieres() {
  if (!(await exigerSessionPage()).admin) return <AccesReserve />;
  return <ListeFilieres filieres={await lireFilieres()} />;
}
