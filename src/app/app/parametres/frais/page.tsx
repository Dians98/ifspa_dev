import type { Metadata } from "next";
import { AccesReserve } from "@/components/app/parametres/acces-reserve";
import { ListeFrais } from "@/components/app/parametres/liste-frais";
import { exigerSessionPage } from "@/server/acces";
import { lirePageFrais } from "@/server/lectures/frais";

export const metadata: Metadata = { title: "Frais · Paramètres" };

export default async function PageFrais({ searchParams }: { searchParams: Promise<{ annee?: string | string[] }> }) {
  if (!(await exigerSessionPage()).admin) return <AccesReserve />;
  const { annee } = await searchParams;
  const page = await lirePageFrais(typeof annee === "string" ? annee : null);

  // La clé rejoue l'état du dialogue quand les frais changent.
  const signature = page.frais.map((f) => `${f.id}:${f.libelle}:${f.montant}:${f.mois}:${f.paye}`).join("|");
  return <ListeFrais key={`${page.annee?.id ?? "aucune"}#${signature}`} page={page} />;
}
