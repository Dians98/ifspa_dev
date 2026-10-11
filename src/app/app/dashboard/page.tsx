import type { Metadata } from "next";
import Link from "next/link";
import { CartesDashboard } from "@/components/app/dashboard/cartes-dashboard";
import { DerniersPaiements } from "@/components/app/dashboard/derniers-paiements";
import { FiltresDashboard } from "@/components/app/dashboard/filtres-dashboard";
import { TableauRecouvrement } from "@/components/app/dashboard/tableau-recouvrement";
import { TitrePage } from "@/components/app/titre-page";
import { Button } from "@/components/ui/button";
import { formaterJour } from "@/lib/dates";
import { requireSession, roleDe } from "@/lib/permissions";
import { lireDashboard } from "@/server/lectures/dashboard";

export const metadata: Metadata = { title: "Tableau de bord" };

export default async function PageTableauDeBord({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireSession();
  const d = await lireDashboard(await searchParams);

  if (!d.annee) {
    const admin = roleDe(session) === "admin";
    return (
      <>
        <TitrePage titre="Tableau de bord" />
        <section className="flex flex-col items-center gap-3 rounded-xl border bg-card px-6 py-14 text-center">
          <h2 className="font-heading text-lg font-semibold text-primary">Aucune année scolaire</h2>
          <p className="max-w-md text-muted-foreground">
            {admin
              ? "Le tableau de bord s'affichera dès qu'une année scolaire existe."
              : "Demandez à l'administrateur de créer l'année scolaire dans Paramètres › Années scolaires."}
          </p>
          {admin && (
            <Button asChild className="max-md:h-11">
              <Link href="/app/parametres/annees">Créer l&apos;année scolaire</Link>
            </Button>
          )}
        </section>
      </>
    );
  }

  const filiere = d.options.filieres.find((f) => f.id === d.filtres.filiereId);

  return (
    <>
      <TitrePage
        titre="Tableau de bord"
        description={`Situation au ${formaterJour(d.jour)} · année scolaire ${d.annee.libelle}${filiere ? ` · ${filiere.nom}` : ""}`}
        actions={<FiltresDashboard filtres={d.filtres} options={d.options} />}
      />

      <CartesDashboard cartes={d.cartes} filiereId={d.filtres.filiereId} lienImpayes={d.annee.estCourante} />

      <section aria-labelledby="titre-recouvrement" className="mb-6 overflow-hidden rounded-xl border bg-card">
        <div className="border-b px-4 py-4 sm:px-5">
          <h2 id="titre-recouvrement" className="font-heading text-lg font-semibold text-primary">
            Recouvrement par filière et par niveau
          </h2>
          <p className="text-sm text-muted-foreground">
            Seules les échéances dont le mois est terminé comptent : un mois n&apos;est en retard qu&apos;à partir du 1er du suivant.
          </p>
        </div>
        {d.tableau.lignes.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <p className="max-w-md text-muted-foreground">Aucun étudiant n&apos;est encore inscrit sur cette année scolaire.</p>
            <Button asChild variant="outline" className="max-md:h-11">
              <Link href="/app/admissions">Aller aux admissions</Link>
            </Button>
          </div>
        ) : (
          <TableauRecouvrement tableau={d.tableau} liens={d.annee.estCourante} />
        )}
      </section>

      <section aria-labelledby="titre-derniers" className="overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:px-5">
          <div>
            <h2 id="titre-derniers" className="font-heading text-lg font-semibold text-primary">
              Derniers paiements
            </h2>
            <p className="text-sm text-muted-foreground">Reçus les plus récents{filiere ? ` · ${filiere.nom}` : ""}, toutes années confondues.</p>
          </div>
          <Button asChild variant="outline" className="max-md:h-11">
            <Link href="/app/paiements">Tous les paiements</Link>
          </Button>
        </div>
        {d.derniersPaiements.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <p className="max-w-md text-muted-foreground">Aucun paiement enregistré pour le moment. Les reçus apparaîtront ici dès le premier encaissement.</p>
            <Button asChild className="max-md:h-11">
              <Link href="/app/encaisser">Encaisser un paiement</Link>
            </Button>
          </div>
        ) : (
          <DerniersPaiements paiements={d.derniersPaiements} />
        )}
      </section>
    </>
  );
}
