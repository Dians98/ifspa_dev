"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TableRow } from "@/components/ui/table";
import type { FiliereParametre } from "@/server/lectures/parametres";
import { activerFiliere, supprimerFiliere } from "@/server/actions/parametres";
import { BadgeEtat } from "./badge-etat";
import { BoutonAction } from "./bouton-action";
import { ConfirmationAction } from "./confirmation-action";
import { DialogueFiliere } from "./dialogue-filiere";
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

function BoutonAjouter() {
  return (
    <DialogueFiliere
      declencheur={
        <Button className="max-md:h-11">
          <Plus aria-hidden />
          Ajouter une filière
        </Button>
      }
    />
  );
}

export function ListeFilieres({ filieres }: { filieres: FiliereParametre[] }) {
  return (
    <PanneauParametre
      titre="Filières"
      action={filieres.length > 0 ? <BoutonAjouter /> : undefined}
    >
      {filieres.length === 0 ? (
        <EtatVide
          texte="Aucune filière pour le moment. Ajoutez la première pour pouvoir inscrire des étudiants."
          action={<BoutonAjouter />}
        />
      ) : (
        <TableauAdaptatif>
          <EnTeteAdaptatif>
            <TableRow>
              <ColonneAdaptative>Code</ColonneAdaptative>
              <ColonneAdaptative>Filière</ColonneAdaptative>
              <ColonneAdaptative>Durée</ColonneAdaptative>
              <ColonneAdaptative className="text-right">Étudiants actifs</ColonneAdaptative>
              <ColonneAdaptative>État</ColonneAdaptative>
              <ColonneAdaptative className="text-right">Actions</ColonneAdaptative>
            </TableRow>
          </EnTeteAdaptatif>
          <CorpsAdaptatif>
            {filieres.map((f) => (
              <LigneFiliere key={f.id} filiere={f} />
            ))}
          </CorpsAdaptatif>
        </TableauAdaptatif>
      )}
    </PanneauParametre>
  );
}

function LigneFiliere({ filiere: f }: { filiere: FiliereParametre }) {
  const supprimable = f.refusSuppression === null;

  return (
    <LigneAdaptative>
      <CelluleAdaptative libelle="Code" className="font-semibold text-primary">
        {f.code}
      </CelluleAdaptative>
      <CelluleAdaptative libelle="Filière">{f.nom}</CelluleAdaptative>
      <CelluleAdaptative libelle="Durée">
        {f.dureeAnnees} {f.dureeAnnees > 1 ? "ans" : "an"}
      </CelluleAdaptative>
      <CelluleAdaptative libelle="Étudiants actifs" className="tabular-nums md:text-right">
        {f.etudiantsActifs}
      </CelluleAdaptative>
      <CelluleAdaptative libelle="État">
        {f.actif ? <BadgeEtat ton="vert">Active</BadgeEtat> : <BadgeEtat ton="neutre">Désactivée</BadgeEtat>}
      </CelluleAdaptative>
      <CelluleAdaptative pleine droite>
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <DialogueFiliere
            filiere={f}
            declencheur={
              <Button variant="outline" size="sm" className="max-md:h-11" aria-label={`Modifier la filière ${f.code}`}>
                Modifier
              </Button>
            }
          />
          <BoutonAction
            action={() => activerFiliere({ id: f.id, actif: !f.actif })}
            variant="outline"
            size="sm"
            className="max-md:h-11"
            aria-label={`${f.actif ? "Désactiver" : "Réactiver"} la filière ${f.code}`}
          >
            {f.actif ? "Désactiver" : "Réactiver"}
          </BoutonAction>
          {supprimable ? (
            <ConfirmationAction
              destructif
              titre={`Supprimer la filière ${f.code} ?`}
              description="Aucun étudiant n'y est rattaché. Cette suppression est définitive."
              libelleAction="Supprimer la filière"
              action={() => supprimerFiliere({ id: f.id })}
              declencheur={
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive max-md:h-11"
                  aria-label={`Supprimer la filière ${f.code}`}
                >
                  Supprimer
                </Button>
              }
            />
          ) : (
            <MotifsRefus motifs={f.refusSuppression ? [f.refusSuppression] : []} />
          )}
        </div>
      </CelluleAdaptative>
    </LigneAdaptative>
  );
}
