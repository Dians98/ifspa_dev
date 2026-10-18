"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TableRow } from "@/components/ui/table";
import type { EtatAnnee } from "@/lib/parametres";
import type { AnneeParametre } from "@/server/lectures/parametres";
import { cloturerAnnee, definirAnneeCourante, rouvrirAnnee, supprimerAnnee } from "@/server/actions/parametres";
import { BadgeEtat, type TonEtat } from "./badge-etat";
import { BoutonAction } from "./bouton-action";
import { ConfirmationAction } from "./confirmation-action";
import { DialogueAnnee } from "./dialogue-annee";
import { MotifsRefus } from "./motifs-refus";
import { EtatVide, PanneauParametre } from "./panneau-parametre";
import {
  CelluleAdaptative,
  ColonneAdaptative,
  CorpsAdaptatif,
  EnTeteAdaptatif,
  LigneAdaptative,
  TableauAdaptatif,
} from "./tableau-adaptatif";

const TON_ETAT: Record<EtatAnnee, TonEtat> = {
  courante: "vert",
  cloturee: "neutre",
  preparation: "bleu",
  ouverte: "orange",
};

function BoutonNouvelleAnnee({ anneeDebutProposee }: { anneeDebutProposee: number }) {
  return (
    <DialogueAnnee
      anneeDebutProposee={anneeDebutProposee}
      declencheur={
        <Button className="max-md:h-11">
          <Plus aria-hidden />
          Nouvelle année
        </Button>
      }
    />
  );
}

export function ListeAnnees({ annees, anneeDebutProposee }: { annees: AnneeParametre[]; anneeDebutProposee: number }) {
  const courante = annees.find((a) => a.estCourante);

  return (
    <PanneauParametre
      titre="Années scolaires"
      description="L'année courante est celle proposée par défaut à l'encaissement et sur le tableau de bord."
      action={annees.length > 0 ? <BoutonNouvelleAnnee anneeDebutProposee={anneeDebutProposee} /> : undefined}
    >
      {annees.length === 0 ? (
        <EtatVide
          texte="Aucune année scolaire. Créez la première pour pouvoir saisir les tarifs et inscrire des étudiants."
          action={<BoutonNouvelleAnnee anneeDebutProposee={anneeDebutProposee} />}
        />
      ) : (
        <TableauAdaptatif>
          <EnTeteAdaptatif>
            <TableRow>
              <ColonneAdaptative>Année</ColonneAdaptative>
              <ColonneAdaptative>Période des mensualités</ColonneAdaptative>
              <ColonneAdaptative>État</ColonneAdaptative>
              <ColonneAdaptative className="text-right">Actions</ColonneAdaptative>
            </TableRow>
          </EnTeteAdaptatif>
          <CorpsAdaptatif>
            {[...annees].reverse().map((a) => (
              <LigneAnnee key={a.id} annee={a} couranteActuelle={courante?.libelle} />
            ))}
          </CorpsAdaptatif>
        </TableauAdaptatif>
      )}
    </PanneauParametre>
  );
}

function LigneAnnee({ annee: a, couranteActuelle }: { annee: AnneeParametre; couranteActuelle?: string }) {
  const motifs = [
    a.estCourante ? null : a.refus.definirCourante,
    a.refus.supprimer,
    a.estCourante ? a.refus.cloturer : null,
  ].filter((m): m is string => m !== null);

  return (
    <LigneAdaptative>
      <CelluleAdaptative libelle="Année" className="font-semibold text-primary tabular-nums">
        {a.libelle}
        {a.estCourante && <span className="block text-xs font-medium text-rose-fonce">Année courante</span>}
      </CelluleAdaptative>
      <CelluleAdaptative libelle="Période des mensualités" className="text-muted-foreground">
        {a.periode}
      </CelluleAdaptative>
      <CelluleAdaptative libelle="État">
        <BadgeEtat ton={TON_ETAT[a.etat]}>{a.libelleEtat}</BadgeEtat>
      </CelluleAdaptative>
      <CelluleAdaptative pleine droite>
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          {a.refus.definirCourante === null && (
            <ConfirmationAction
              titre={`Définir ${a.libelle} comme année courante ?`}
              description={
                <>
                  {a.libelle} sera proposée par défaut à l&apos;encaissement et sur le tableau de bord.
                  {couranteActuelle && ` ${couranteActuelle} n'est pas supprimée : ses impayés restent encaissables.`}
                </>
              }
              libelleAction="Définir comme année courante"
              action={() => definirAnneeCourante({ id: a.id })}
              declencheur={
                <Button
                  variant="outline"
                  size="sm"
                  className="max-md:h-11"
                  aria-label={`Définir ${a.libelle} comme année courante`}
                >
                  Définir comme année courante
                </Button>
              }
            />
          )}
          {a.refus.cloturer === null && (
            <ConfirmationAction
              titre={`Clôturer l'année ${a.libelle} ?`}
              description="Ses tarifs ne pourront plus être modifiés. Les impayés de cette année restent encaissables, et vous pouvez la rouvrir à tout moment."
              libelleAction="Clôturer l'année"
              action={() => cloturerAnnee({ id: a.id })}
              declencheur={
                <Button variant="outline" size="sm" className="max-md:h-11" aria-label={`Clôturer l'année ${a.libelle}`}>
                  Clôturer
                </Button>
              }
            />
          )}
          {a.refus.rouvrir === null && (
            <BoutonAction
              action={() => rouvrirAnnee({ id: a.id })}
              variant="outline"
              size="sm"
              className="max-md:h-11"
              aria-label={`Rouvrir l'année ${a.libelle}`}
            >
              Rouvrir
            </BoutonAction>
          )}
          <Button asChild variant="outline" size="sm" className="max-md:h-11">
            <Link href={`/app/parametres/tarifs?annee=${a.id}`} aria-label={`Tarifs de l'année ${a.libelle}`}>
              Tarifs
            </Link>
          </Button>
          {a.refus.supprimer === null && (
            <ConfirmationAction
              destructif
              titre={`Supprimer l'année ${a.libelle} ?`}
              description="Aucun étudiant n'y est inscrit. Ses tarifs seront supprimés avec elle, définitivement."
              libelleAction="Supprimer l'année"
              action={() => supprimerAnnee({ id: a.id })}
              declencheur={
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive max-md:h-11"
                  aria-label={`Supprimer l'année ${a.libelle}`}
                >
                  Supprimer
                </Button>
              }
            />
          )}
          <MotifsRefus motifs={motifs} />
        </div>
      </CelluleAdaptative>
    </LigneAdaptative>
  );
}
