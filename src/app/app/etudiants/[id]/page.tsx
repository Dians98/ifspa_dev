import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, CircleCheck } from "lucide-react";
import { EcolageFiche } from "@/components/app/etudiants/ecolage-fiche";
import { EnteteFiche } from "@/components/app/etudiants/entete-fiche";
import { IdentiteFiche } from "@/components/app/etudiants/identite-fiche";
import { ongletValide } from "@/components/app/etudiants/onglets";
import { OngletsFiche } from "@/components/app/etudiants/onglets-fiche";
import { PaiementsFiche } from "@/components/app/etudiants/paiements-fiche";
import { ParcoursFiche } from "@/components/app/etudiants/parcours-fiche";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formaterAriary } from "@/lib/montant";
import { exigerSessionPage } from "@/server/acces";
import { lireFicheEtudiant } from "@/server/lectures/etudiants";

// La page et ses métadonnées lisent la même fiche : une seule lecture par requête, après contrôle de session.
const lireFiche = cache(async (id: string) => {
  await exigerSessionPage();
  return lireFicheEtudiant(id);
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const e = await lireFiche((await params).id);
  return { title: e ? `${e.nom} ${e.prenoms}` : "Étudiant introuvable" };
}

export default async function PageFicheEtudiant({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ nouveau?: string; onglet?: string }>;
}) {
  const [{ id }, { nouveau, onglet }] = await Promise.all([params, searchParams]);
  const [e, { admin }] = await Promise.all([lireFiche(id), exigerSessionPage()]);
  if (!e) notFound();

  const inscrit = nouveau === "1";
  const premiersDroits = e.parcours.at(-1)?.echeances.find((x) => x.type === "DROITS");

  return (
    <>
      <Link href="/app/etudiants" className="mb-3 inline-flex min-h-6 items-center gap-1 text-sm text-muted-foreground hover:text-primary max-md:min-h-11">
        <ChevronLeft aria-hidden className="size-4" />
        Étudiants
      </Link>

      {inscrit && (
        <Alert role="status" className="mb-5 border-paye/30 bg-paye-pale text-foreground">
          <CircleCheck aria-hidden className="text-paye" />
          <AlertTitle className="font-semibold">Étudiant inscrit sous le matricule {e.matricule}</AlertTitle>
          <AlertDescription className="text-foreground">
            Prochaine étape : encaisser les droits d&apos;inscription
            {premiersDroits ? ` (${formaterAriary(premiersDroits.montantDu)})` : ""}
            , avec le bouton « Encaisser ».
          </AlertDescription>
        </Alert>
      )}

      <EnteteFiche e={e} nouveau={inscrit} admin={admin} />
      <OngletsFiche
        defaut={ongletValide(onglet)}
        nbPaiements={e.paiements.length}
        ecolage={<EcolageFiche dossier={e} />}
        identite={<IdentiteFiche e={e} />}
        parcours={<ParcoursFiche e={e} />}
        paiements={<PaiementsFiche e={e} />}
      />
    </>
  );
}
