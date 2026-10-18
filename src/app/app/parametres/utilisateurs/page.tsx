import type { Metadata } from "next";
import { AccesReserve } from "@/components/app/parametres/acces-reserve";
import { ListeUtilisateurs } from "@/components/app/parametres/liste-utilisateurs";
import { exigerSessionPage } from "@/server/acces";
import { lireUtilisateurs } from "@/server/lectures/utilisateurs";

export const metadata: Metadata = { title: "Utilisateurs · Paramètres" };

export default async function PageUtilisateurs() {
  if (!(await exigerSessionPage()).admin) return <AccesReserve />;
  return <ListeUtilisateurs utilisateurs={await lireUtilisateurs()} />;
}
