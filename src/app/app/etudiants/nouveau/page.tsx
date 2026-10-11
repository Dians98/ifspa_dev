import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { FormulaireCreationEtudiant } from "@/components/app/etudiants/formulaire-creation-etudiant";
import { estAdministrateur } from "@/components/app/parametres/acces";
import { TitrePage } from "@/components/app/titre-page";
import { contexteInscription } from "@/server/lectures/etudiants";

export const metadata: Metadata = { title: "Nouvel étudiant" };

export default async function PageNouvelEtudiant() {
  const [contexte, estAdmin] = await Promise.all([contexteInscription(), estAdministrateur()]);

  return (
    <>
      <Link href="/app/etudiants" className="mb-3 inline-flex min-h-6 items-center gap-1 text-sm text-muted-foreground hover:text-primary max-md:min-h-11">
        <ChevronLeft aria-hidden className="size-4" />
        Étudiants
      </Link>
      <TitrePage
        titre="Nouvel étudiant"
        description={
          contexte.annee
            ? `Inscription en ${contexte.annee.libelle}. Le matricule et l'écolage de l'année sont créés à l'enregistrement.`
            : "Inscription d'un nouvel étudiant."
        }
      />
      <FormulaireCreationEtudiant contexte={contexte} estAdmin={estAdmin} />
    </>
  );
}
