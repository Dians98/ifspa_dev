import type { Metadata } from "next";
import { Guichet } from "@/components/app/encaisser/guichet";
import { TitrePage } from "@/components/app/titre-page";
import { formaterJour, jourMadagascar } from "@/lib/dates";
import { requireSession } from "@/lib/permissions";
import { derniersServis, situationGuichet } from "@/server/lectures/paiements";

export const metadata: Metadata = { title: "Encaisser" };

export default async function PageEncaisser({ searchParams }: { searchParams: Promise<{ etudiant?: string | string[] }> }) {
  const session = await requireSession();
  const { etudiant } = await searchParams;
  const id = typeof etudiant === "string" && etudiant ? etudiant : null;

  // Lectures en parallèle : le guichet s'affiche déjà rempli, sans aller-retour depuis le navigateur.
  const [derniers, situation] = await Promise.all([derniersServis(session.user.id), id ? situationGuichet(id) : null]);

  return (
    <div className="mx-auto max-w-3xl">
      <TitrePage titre="Encaisser un paiement" description={`Guichet du ${formaterJour(jourMadagascar(new Date()))}`} />
      <Guichet derniersServis={derniers} situationInitiale={situation} etudiantIntrouvable={id !== null && situation === null} />
    </div>
  );
}
