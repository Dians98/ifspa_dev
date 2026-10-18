import type { Metadata } from "next";
import { AccesReserve } from "@/components/app/parametres/acces-reserve";
import { GrilleTarifs } from "@/components/app/parametres/grille-tarifs";
import { exigerSessionPage } from "@/server/acces";
import { lireGrilleTarifs } from "@/server/lectures/parametres";

export const metadata: Metadata = { title: "Tarifs · Paramètres" };

export default async function PageTarifs({ searchParams }: { searchParams: Promise<{ annee?: string | string[] }> }) {
  if (!(await exigerSessionPage()).admin) return <AccesReserve />;
  const { annee } = await searchParams;
  const grille = await lireGrilleTarifs(typeof annee === "string" ? annee : undefined);

  // La clé rejoue l'état local dès que les montants enregistrés changent (après « Enregistrer »).
  const signature = grille.cases
    .map((c) => `${c.filiereId}:${c.niveau}:${c.tarif ? `${c.tarif.droitsInscription}/${c.tarif.montantMensuel}/${c.tarif.nombreMois}` : "-"}`)
    .join("|");

  return <GrilleTarifs key={`${grille.annee?.id ?? "aucune"}#${signature}`} grille={grille} />;
}
