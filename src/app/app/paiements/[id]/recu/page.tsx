import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, TriangleAlert } from "lucide-react";
import { ApercuRecu } from "@/components/app/paiements/apercu-recu";
import { TitrePage } from "@/components/app/titre-page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formaterAriary } from "@/lib/montant";
import { exigerSessionPage } from "@/server/acces";
import { lireRecu } from "@/server/lectures/paiements";

export const metadata: Metadata = { title: "Reçu de paiement" };

export default async function PageRecu({ params }: { params: Promise<{ id: string }> }) {
  await exigerSessionPage();
  const { id } = await params;
  const recu = await lireRecu(id);

  const retour = (
    <Button asChild variant="ghost" className="mb-3 -ml-2 max-md:h-11">
      <Link href="/app/paiements">
        <ChevronLeft aria-hidden />
        Retour aux paiements
      </Link>
    </Button>
  );

  if (!recu) {
    return (
      <div className="mx-auto max-w-3xl">
        {retour}
        <TitrePage titre="Reçu introuvable" />
        <p className="max-w-prose text-muted-foreground">
          Ce reçu n&apos;existe pas ou plus. Retrouvez-le par son numéro ou par le nom de l&apos;étudiant dans la liste des paiements.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      {retour}
      <TitrePage
        titre={`Reçu ${recu.numero}`}
        description={`${recu.etudiant.nom} ${recu.etudiant.prenoms} · ${formaterAriary(recu.total)} · ${recu.date} à ${recu.heure}`}
      />
      {recu.annulation && (
        <Alert variant="destructive" className="mb-5 bg-retard-pale">
          <TriangleAlert aria-hidden />
          <AlertTitle>Ce reçu a été annulé</AlertTitle>
          <AlertDescription className="text-destructive">
            Annulé le {recu.annulation.date} par {recu.annulation.par}. Motif : {recu.annulation.motif}. Toute réimpression porte la mention
            ANNULÉ.
          </AlertDescription>
        </Alert>
      )}
      <ApercuRecu donnees={recu} />
    </div>
  );
}
