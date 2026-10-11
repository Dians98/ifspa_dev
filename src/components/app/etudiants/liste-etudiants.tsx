import Link from "next/link";
import { CircleCheck, ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableRow } from "@/components/ui/table";
import { formaterAriary } from "@/lib/montant";
import type { LigneEtudiant, ListeEtudiants } from "@/server/lectures/etudiants";
import { EtatVide } from "@/components/app/parametres/panneau-parametre";
import {
  CelluleAdaptative,
  ColonneAdaptative,
  CorpsAdaptatif,
  EnTeteAdaptatif,
  LigneAdaptative,
  TableauAdaptatif,
} from "@/components/app/parametres/tableau-adaptatif";

function SituationEcolage({ ligne }: { ligne: LigneEtudiant }) {
  if (ligne.resteEnRetard > 0) {
    return (
      <div className="md:text-right">
        <Badge className="h-auto bg-retard-pale py-0.5 text-retard">
          <TriangleAlert aria-hidden />
          En retard · <span className="tabular-nums">{formaterAriary(ligne.resteEnRetard)}</span>
        </Badge>
        <p className="mt-1 text-xs text-muted-foreground">
          {ligne.moisEnRetard} mois impayé{ligne.moisEnRetard > 1 ? "s" : ""}
        </p>
      </div>
    );
  }
  if (ligne.statut === "ACTIF") {
    return (
      <div className="md:text-right">
        <Badge className="bg-paye-pale text-paye">
          <CircleCheck aria-hidden />À jour
        </Badge>
      </div>
    );
  }
  return <span className="text-sm text-muted-foreground">Aucun retard</span>;
}

function LigneListe({ ligne }: { ligne: LigneEtudiant }) {
  return (
    <LigneAdaptative className="relative hover:bg-muted/50">
      <CelluleAdaptative pleine>
        {/* Le lien couvre toute la ligne : un clic n'importe où ouvre la fiche. */}
        <Link
          href={`/app/etudiants/${ligne.id}`}
          className="font-semibold text-primary outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
        >
          {ligne.nom} {ligne.prenoms}
        </Link>
      </CelluleAdaptative>
      <CelluleAdaptative libelle="Matricule" className="font-medium tabular-nums">
        {ligne.matricule}
      </CelluleAdaptative>
      <CelluleAdaptative libelle="Filière">{ligne.filiere.nom}</CelluleAdaptative>
      <CelluleAdaptative libelle="Niveau">
        {ligne.libelleNiveau ?? <span className="text-muted-foreground">Non inscrit</span>}
        {ligne.anneeScolaire && <span className="block text-xs text-muted-foreground tabular-nums">{ligne.anneeScolaire}</span>}
      </CelluleAdaptative>
      <CelluleAdaptative libelle="Statut">
        <Badge className={ligne.statut === "ACTIF" ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground"}>
          {ligne.libelleStatut}
        </Badge>
      </CelluleAdaptative>
      <CelluleAdaptative pleine droite>
        <SituationEcolage ligne={ligne} />
      </CelluleAdaptative>
    </LigneAdaptative>
  );
}

export function TableauEtudiants({ liste, filtresActifs }: { liste: ListeEtudiants; filtresActifs: boolean }) {
  if (liste.total === 0) {
    return filtresActifs ? (
      <EtatVide texte="Aucun étudiant ne correspond. Vérifiez l'orthographe du nom ou du matricule, ou effacez les filtres." />
    ) : (
      <EtatVide
        texte="Aucun étudiant inscrit pour le moment. Inscrivez le premier pour suivre son écolage."
        action={
          <Button asChild className="max-md:h-11">
            <Link href="/app/etudiants/nouveau">Inscrire le premier étudiant</Link>
          </Button>
        }
      />
    );
  }

  return (
    <>
      <TableauAdaptatif>
        <caption className="sr-only">Liste des étudiants, par ordre alphabétique</caption>
        <EnTeteAdaptatif>
          <TableRow>
            <ColonneAdaptative>Étudiant</ColonneAdaptative>
            <ColonneAdaptative>Matricule</ColonneAdaptative>
            <ColonneAdaptative>Filière</ColonneAdaptative>
            <ColonneAdaptative>Niveau</ColonneAdaptative>
            <ColonneAdaptative>Statut</ColonneAdaptative>
            <ColonneAdaptative className="text-right">Écolage</ColonneAdaptative>
          </TableRow>
        </EnTeteAdaptatif>
        <CorpsAdaptatif>
          {liste.lignes.map((l) => (
            <LigneListe key={l.id} ligne={l} />
          ))}
        </CorpsAdaptatif>
      </TableauAdaptatif>
      <PiedListe liste={liste} />
    </>
  );
}

/** Pages en vrais liens : les filtres de l'URL sont conservés, seule `page` change. */
function PiedListe({ liste }: { liste: ListeEtudiants }) {
  const { page, pages, taillePage, total, filtres } = liste;
  const debut = (page - 1) * taillePage + 1;
  const fin = Math.min(total, page * taillePage);

  function lien(p: number): string {
    const params = new URLSearchParams();
    if (filtres.q) params.set("q", filtres.q);
    if (filtres.filiereId) params.set("filiereId", filtres.filiereId);
    if (filtres.niveau) params.set("niveau", String(filtres.niveau));
    if (filtres.anneeId) params.set("anneeId", filtres.anneeId);
    if (filtres.statut) params.set("statut", filtres.statut);
    if (filtres.enRetard) params.set("enRetard", "1");
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/app/etudiants?${qs}` : "/app/etudiants";
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 sm:px-5">
      <p className="text-sm text-muted-foreground tabular-nums">
        {debut}–{fin} sur {total}
      </p>
      {pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center gap-2">
          {page > 1 ? (
            <Button asChild variant="outline" size="sm" className="max-md:h-11">
              <Link href={lien(page - 1)} rel="prev">
                <ChevronLeft aria-hidden />
                Précédent
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled className="max-md:h-11">
              <ChevronLeft aria-hidden />
              Précédent
            </Button>
          )}
          <span className="px-1 text-sm tabular-nums" aria-current="page">
            Page {page} sur {pages}
          </span>
          {page < pages ? (
            <Button asChild variant="outline" size="sm" className="max-md:h-11">
              <Link href={lien(page + 1)} rel="next">
                Suivant
                <ChevronRight aria-hidden />
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled className="max-md:h-11">
              Suivant
              <ChevronRight aria-hidden />
            </Button>
          )}
        </nav>
      )}
    </div>
  );
}
