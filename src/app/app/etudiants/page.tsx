import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { FiltresEtudiants } from "@/components/app/etudiants/filtres-etudiants";
import { TableauEtudiants } from "@/components/app/etudiants/liste-etudiants";
import { TitrePage } from "@/components/app/titre-page";
import { Button } from "@/components/ui/button";
import { lireEtudiants } from "@/server/lectures/etudiants";

export const metadata: Metadata = { title: "Étudiants" };

export default async function PageEtudiants({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const liste = await lireEtudiants(await searchParams);
  const { filtres } = liste;
  const filtresActifs = Boolean(
    filtres.q || filtres.filiereId || filtres.niveau || filtres.anneeId || filtres.statut || filtres.enRetard,
  );

  return (
    <>
      <TitrePage
        titre="Étudiants"
        description={
          <span role="status">
            {liste.total} étudiant{liste.total > 1 ? "s" : ""}
            {filtresActifs ? " correspondent aux critères" : " inscrits"}
          </span>
        }
        actions={
          <Button asChild className="max-md:h-11">
            <Link href="/app/etudiants/nouveau">
              <Plus aria-hidden />
              Nouvel étudiant
            </Link>
          </Button>
        }
      />
      <section aria-label="Liste des étudiants" className="overflow-hidden rounded-xl border bg-card">
        <FiltresEtudiants filtres={filtres} options={liste.options} />
        <TableauEtudiants liste={liste} filtresActifs={filtresActifs} />
      </section>
    </>
  );
}
