import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { FormulaireModificationEtudiant } from "@/components/app/etudiants/formulaire-modification-etudiant";
import { TitrePage } from "@/components/app/titre-page";
import { lireFicheEtudiant } from "@/server/lectures/etudiants";

export const metadata: Metadata = { title: "Modifier un étudiant" };

export default async function PageModifierEtudiant({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = await lireFicheEtudiant(id);
  if (!e) notFound();
  const derniere = e.parcours.at(-1);

  return (
    <>
      <Link
        href={`/app/etudiants/${e.id}`}
        className="mb-3 inline-flex min-h-6 items-center gap-1 text-sm text-muted-foreground hover:text-primary max-md:min-h-11"
      >
        <ChevronLeft aria-hidden className="size-4" />
        Fiche de {e.nom} {e.prenoms}
      </Link>
      <TitrePage titre="Modifier l'étudiant" description={`${e.nom} ${e.prenoms} · ${e.matricule}`} />
      <FormulaireModificationEtudiant
        id={e.id}
        valeurs={{
          nom: e.nom,
          prenoms: e.prenoms,
          sexe: e.sexe,
          dateNaissance: e.dateNaissance,
          lieuNaissance: e.lieuNaissance,
          cin: e.cin ?? "",
          telephone: e.telephone ?? "",
          email: e.email ?? "",
          adresse: e.adresse ?? "",
        }}
        verrouille={{
          matricule: e.matricule,
          filiere: e.filiere.nom,
          niveau: derniere ? `${derniere.libelleNiveau} · ${derniere.annee}` : null,
          anneeEntree: e.anneeEntree,
        }}
      />
    </>
  );
}
