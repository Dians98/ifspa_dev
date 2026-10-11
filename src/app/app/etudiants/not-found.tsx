import Link from "next/link";
import { TitrePage } from "@/components/app/titre-page";
import { Button } from "@/components/ui/button";

export default function EtudiantIntrouvable() {
  return (
    <div className="mx-auto max-w-3xl">
      <TitrePage titre="Étudiant introuvable" />
      <p className="max-w-prose text-muted-foreground">
        Cet étudiant n&apos;existe pas ou plus. Retrouvez-le par son nom ou son matricule dans la liste des étudiants.
      </p>
      <Button asChild className="mt-4 max-md:h-11">
        <Link href="/app/etudiants">Retour aux étudiants</Link>
      </Button>
    </div>
  );
}
