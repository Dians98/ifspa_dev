import Link from "next/link";
import { Banknote, Download, Pencil } from "lucide-react";
import { BoutonImprimerPdf } from "@/components/app/bouton-imprimer-pdf";
import { DialogueSortie } from "@/components/app/etudiants/dialogue-sortie";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formaterJour } from "@/lib/dates";
import { formaterAriary } from "@/lib/montant";
import type { DossierEtudiant } from "@/server/lectures/etudiants";

/** Le libellé dit ce que fait le bouton : le montant en retard, ou les droits d'un étudiant tout juste inscrit. */
function libelleEncaisser(e: DossierEtudiant, nouveau: boolean): string {
  if (nouveau) return "Encaisser les droits d'inscription";
  if (e.situation.resteEnRetard > 0) return `Encaisser ${formaterAriary(e.situation.resteEnRetard)}`;
  return "Encaisser";
}

/** `admin` masque la sortie au secrétariat ; le serveur la refuse aussi. */
export function EnteteFiche({ e, nouveau, admin }: { e: DossierEtudiant; nouveau: boolean; admin: boolean }) {
  const derniere = e.parcours.at(-1);
  const actif = e.statut === "ACTIF";
  const urlReleve = `/api/pdf/releve/${e.id}`;

  return (
    <section aria-label="Identité de l'étudiant" className="mb-5 rounded-xl border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl leading-tight font-bold tracking-tight break-words text-primary after:mt-2.5 after:block after:h-1 after:w-11 after:rounded-full after:bg-rose after:content-[''] sm:text-3xl">
            {e.nom} <span className="font-semibold">{e.prenoms}</span>
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Matricule <span className="ml-1 text-xl font-bold tracking-wide text-foreground tabular-nums">{e.matricule}</span>
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant="outline">{e.filiere.nom}</Badge>
            {derniere && (
              <Badge className="bg-secondary text-secondary-foreground">
                {derniere.libelleNiveau} · {derniere.annee}
              </Badge>
            )}
            {derniere?.redoublement && <Badge variant="outline">Redoublant</Badge>}
            {actif ? (
              <Badge className="bg-secondary text-secondary-foreground">Actif</Badge>
            ) : (
              <Badge className="bg-muted text-muted-foreground">
                Sorti · {e.libelleStatut}
                {e.sortie?.date && ` le ${formaterJour(e.sortie.date)}`}
              </Badge>
            )}
          </div>
        </div>

        <div className="grid w-full gap-2 sm:w-auto sm:min-w-64">
          {(actif || e.situation.reste > 0) && (
            <Button asChild size="lg" className="h-9 bg-rose-fonce text-white hover:bg-rose-fonce/90 max-md:h-11">
              <Link href={`/app/encaisser?etudiant=${e.id}`}>
                <Banknote aria-hidden />
                {libelleEncaisser(e, nouveau)}
              </Link>
            </Button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <BoutonImprimerPdf url={urlReleve} variant="outline" className="max-md:h-11">
              Imprimer le relevé
            </BoutonImprimerPdf>
            <Button asChild variant="outline" className="max-md:h-11">
              <a href={`${urlReleve}?telecharger=1`} aria-label="Télécharger le relevé d'écolage en PDF">
                <Download aria-hidden />
                Télécharger
              </a>
            </Button>
          </div>
          <Button asChild variant="outline" className="max-md:h-11">
            <Link href={`/app/etudiants/${e.id}/modifier`}>
              <Pencil aria-hidden />
              Modifier
            </Link>
          </Button>
          {admin && actif && (
            <div className="mt-1 border-t pt-3">
              <DialogueSortie etudiantId={e.id} jour={e.jour} resteEnRetard={e.situation.resteEnRetard} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
