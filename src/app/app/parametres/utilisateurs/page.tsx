import type { Metadata } from "next";
import { estAdministrateur } from "@/components/app/parametres/acces";
import { ListeUtilisateurs } from "@/components/app/parametres/liste-utilisateurs";
import { lireUtilisateurs } from "@/server/lectures/utilisateurs";

export const metadata: Metadata = { title: "Utilisateurs · Paramètres" };

export default async function PageUtilisateurs() {
  if (!(await estAdministrateur())) return null;
  return <ListeUtilisateurs utilisateurs={await lireUtilisateurs()} />;
}
