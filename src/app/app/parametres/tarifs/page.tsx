import type { Metadata } from "next";
import { estAdministrateur } from "@/components/app/parametres/acces";
import { GrilleTarifs } from "@/components/app/parametres/grille-tarifs";
import { lireGrilleTarifs } from "@/server/lectures/parametres";

export const metadata: Metadata = { title: "Tarifs · Paramètres" };

export default async function PageTarifs({ searchParams }: { searchParams: Promise<{ annee?: string | string[] }> }) {
  if (!(await estAdministrateur())) return null;
  const { annee } = await searchParams;
  const grille = await lireGrilleTarifs(typeof annee === "string" ? annee : undefined);

  // La clé rejoue l'état local dès que les montants enregistrés changent (après « Enregistrer »).
  const signature = grille.cases
    .map((c) => `${c.filiereId}:${c.niveau}:${c.tarif ? `${c.tarif.droitsInscription}/${c.tarif.montantMensuel}/${c.tarif.nombreMois}` : "-"}`)
    .join("|");

  return <GrilleTarifs key={`${grille.annee?.id ?? "aucune"}#${signature}`} grille={grille} />;
}
