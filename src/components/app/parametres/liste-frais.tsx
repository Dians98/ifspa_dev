"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Info, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableRow } from "@/components/ui/table";
import { formaterAriary } from "@/lib/montant";
import { supprimerFrais } from "@/server/actions/frais";
import type { FraisLigne, PageFrais } from "@/server/lectures/frais";
import { BadgeEtat } from "./badge-etat";
import { ConfirmationAction } from "./confirmation-action";
import { DialogueFrais } from "./dialogue-frais";
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

export function ListeFrais({ page }: { page: PageFrais }) {
  const router = useRouter();
  const { annee, annees, frais, refusCreation } = page;

  const selecteur = annees.length > 0 && (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="frais-annee" className="text-sm font-medium">
        Année scolaire
      </label>
      <Select value={annee?.id} onValueChange={(id) => router.push(`/app/parametres/frais?annee=${id}`)}>
        <SelectTrigger id="frais-annee" className="w-full min-w-52 max-md:h-11">
          <SelectValue placeholder="Choisir une année" />
        </SelectTrigger>
        <SelectContent position="popper" align="end">
          {annees.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.libelle}
              {a.estCourante ? " · courante" : a.cloturee ? " · clôturée" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  const entete = {
    titre: "Frais en cours d'année",
    action: selecteur || undefined,
  };

  if (!annee) {
    return (
      <PanneauParametre {...entete}>
        <EtatVide
          texte="Aucune année scolaire. Créez-en une avant d'ajouter des frais."
          action={
            <Button asChild className="max-md:h-11">
              <Link href="/app/parametres/annees">Créer une année scolaire</Link>
            </Button>
          }
        />
      </PanneauParametre>
    );
  }

  const peutCreer = refusCreation === null;
  const boutonNouveau = (
    <DialogueFrais
      page={page}
      declencheur={
        <Button className="max-md:h-11">
          <Plus aria-hidden />
          Nouveau frais
        </Button>
      }
    />
  );
  const nombre = frais.length === 0 ? "Aucun frais" : frais.length === 1 ? "1 frais" : `${frais.length} frais`;

  return (
    <PanneauParametre {...entete}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
        {peutCreer ? (
          <p className="text-sm text-muted-foreground">
            {nombre} pour l&apos;année <span className="tabular-nums">{annee.libelle}</span>.
          </p>
        ) : (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{refusCreation}</span>
          </p>
        )}
        {peutCreer && frais.length > 0 && boutonNouveau}
      </div>

      {frais.length === 0 ? (
        <EtatVide
          texte={
            peutCreer
              ? "Ajoutez par exemple des frais de stage ou d'examen : ils apparaîtront chez les étudiants des classes choisies."
              : "Aucun frais n'a été ajouté pour cette année."
          }
          action={peutCreer ? boutonNouveau : undefined}
        />
      ) : (
        <TableauAdaptatif>
          <EnTeteAdaptatif>
            <TableRow>
              <ColonneAdaptative>Frais</ColonneAdaptative>
              <ColonneAdaptative>Classes</ColonneAdaptative>
              <ColonneAdaptative>Exigible en</ColonneAdaptative>
              <ColonneAdaptative className="text-right">Montant</ColonneAdaptative>
              <ColonneAdaptative className="text-right">Étudiants</ColonneAdaptative>
              <ColonneAdaptative className="text-right">Total dû</ColonneAdaptative>
              <ColonneAdaptative className="text-right">Encaissé</ColonneAdaptative>
              <ColonneAdaptative className="text-right">Actions</ColonneAdaptative>
            </TableRow>
          </EnTeteAdaptatif>
          <CorpsAdaptatif>
            {frais.map((f) => (
              <LigneFrais key={f.id} frais={f} page={page} />
            ))}
          </CorpsAdaptatif>
        </TableauAdaptatif>
      )}
    </PanneauParametre>
  );
}

function LigneFrais({ frais: f, page }: { frais: FraisLigne; page: PageFrais }) {
  const classes = f.classes.map((c) => c.libelle).join(", ");

  return (
    <LigneAdaptative>
      <CelluleAdaptative libelle="Frais" pleine className="md:max-w-64 md:whitespace-normal">
        <span className="font-semibold text-primary">{f.libelle}</span>
        {f.verrouille && (
          <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="size-3 shrink-0" aria-hidden />
            Déjà payé : seul le libellé change
          </span>
        )}
      </CelluleAdaptative>
      <CelluleAdaptative libelle="Classes" pleine className="md:max-w-56 md:whitespace-normal">
        {classes}
      </CelluleAdaptative>
      <CelluleAdaptative libelle="Exigible en">{f.libelleMois}</CelluleAdaptative>
      <CelluleAdaptative libelle="Montant" droite className="font-semibold tabular-nums">
        {formaterAriary(f.montant)}
      </CelluleAdaptative>
      <CelluleAdaptative libelle="Étudiants" droite className="tabular-nums">
        {f.etudiants}
      </CelluleAdaptative>
      <CelluleAdaptative libelle="Total dû" droite className="tabular-nums">
        {formaterAriary(f.du)}
      </CelluleAdaptative>
      <CelluleAdaptative libelle="Encaissé" droite className="tabular-nums">
        {f.paye > 0 ? <BadgeEtat ton="vert">{formaterAriary(f.paye)}</BadgeEtat> : formaterAriary(0)}
      </CelluleAdaptative>
      <CelluleAdaptative pleine droite>
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          {f.modifiable.libelle && (
            <DialogueFrais
              page={page}
              frais={f}
              declencheur={
                <Button variant="outline" size="sm" className="max-md:h-11" aria-label={`Modifier le frais ${f.libelle}`}>
                  <Pencil aria-hidden />
                  Modifier
                </Button>
              }
            />
          )}
          {f.supprimable && (
            <ConfirmationAction
              destructif
              rafraichirSiRefus
              titre={`Supprimer le frais « ${f.libelle} » ?`}
              description={`Il disparaît de la fiche ${f.etudiants === 0 ? "des étudiants" : f.etudiants === 1 ? "de l'étudiant concerné" : `des ${f.etudiants} étudiants concernés`}. Personne ne l'a encore payé.`}
              libelleAction="Supprimer le frais"
              action={() => supprimerFrais({ id: f.id })}
              declencheur={
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive max-md:h-11"
                  aria-label={`Supprimer le frais ${f.libelle}`}
                >
                  <Trash2 aria-hidden />
                  Supprimer
                </Button>
              }
            />
          )}
          {f.raisonVerrou && !f.supprimable && <MotifsRefus motifs={[f.raisonVerrou]} />}
        </div>
      </CelluleAdaptative>
    </LigneAdaptative>
  );
}
