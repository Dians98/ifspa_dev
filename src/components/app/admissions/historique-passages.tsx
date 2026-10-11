import { BadgeEtat } from "@/components/app/parametres/badge-etat";
import { EtatVide, PanneauParametre } from "@/components/app/parametres/panneau-parametre";
import {
  CelluleAdaptative,
  ColonneAdaptative,
  CorpsAdaptatif,
  EnTeteAdaptatif,
  LigneAdaptative,
  TableauAdaptatif,
} from "@/components/app/parametres/tableau-adaptatif";
import { DialogueAnnulationPassage } from "@/components/app/admissions/dialogue-annulation-passage";
import { Button } from "@/components/ui/button";
import { TableHead, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { TAILLE_HISTORIQUE, type OperationHistorique } from "@/server/lectures/admissions";

export function HistoriquePassages({ operations, peutAnnuler }: { operations: OperationHistorique[]; peutAnnuler: boolean }) {
  const description = peutAnnuler
    ? "Vous pouvez annuler un passage tant qu'aucun reçu n'existe sur les inscriptions qu'il a créées."
    : "Seul l'administrateur peut annuler un passage.";

  return (
    <PanneauParametre titre="Passages validés" description={description}>
      {operations.length === 0 ? (
        <EtatVide texte="Aucun passage n'a encore été validé. Les passages validés dans l'onglet Classes apparaîtront ici." />
      ) : (
        <>
          <TableauAdaptatif>
            <EnTeteAdaptatif>
              <TableRow>
                <ColonneAdaptative>Date</ColonneAdaptative>
                <ColonneAdaptative>Classe</ColonneAdaptative>
                <ColonneAdaptative>Décisions</ColonneAdaptative>
                <ColonneAdaptative>État</ColonneAdaptative>
                {peutAnnuler && (
                  <TableHead className="px-4">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                )}
              </TableRow>
            </EnTeteAdaptatif>
            <CorpsAdaptatif>
              {operations.map((o) => (
                <LigneAdaptative key={o.id} className={cn(o.annulee && "text-muted-foreground")}>
                  <CelluleAdaptative libelle="Date">
                    <span className={cn("font-medium tabular-nums", o.annulee && "line-through")}>{o.date}</span>
                    <span className="block text-xs text-muted-foreground tabular-nums">
                      {o.heure} · {o.par}
                    </span>
                  </CelluleAdaptative>
                  <CelluleAdaptative libelle="Classe">
                    <span className={cn("font-semibold", !o.annulee && "text-foreground")}>{o.classe}</span>
                    <span className="block text-xs tabular-nums">
                      {o.anneeSource} vers {o.anneeCible}
                    </span>
                  </CelluleAdaptative>
                  <CelluleAdaptative libelle="Décisions" pleine>
                    {o.resume || "—"}
                  </CelluleAdaptative>
                  <CelluleAdaptative libelle="État" pleine={!peutAnnuler}>
                    {o.annulee ? (
                      <>
                        <BadgeEtat ton="neutre">Annulé</BadgeEtat>
                        {o.annulation && (
                          <span className="mt-1 block text-xs">
                            Le {o.annulation.date}
                            {o.annulation.par && ` par ${o.annulation.par}`}
                          </span>
                        )}
                      </>
                    ) : (
                      <BadgeEtat ton="vert">Actif</BadgeEtat>
                    )}
                  </CelluleAdaptative>
                  {peutAnnuler && (
                    <CelluleAdaptative pleine droite>
                      {!o.annulee && (
                        <DialogueAnnulationPassage
                          passage={{
                            id: o.id,
                            classe: o.classe,
                            niveau: o.niveau,
                            anneeSource: o.anneeSource,
                            anneeCible: o.anneeCible,
                            quand: `${o.date} à ${o.heure}`,
                            comptes: o.comptes,
                          }}
                          declencheur={
                            <Button type="button" variant="destructive" size="sm" aria-label={`Annuler le passage ${o.classe} du ${o.date}`} className="max-md:h-11">
                              Annuler
                            </Button>
                          }
                        />
                      )}
                    </CelluleAdaptative>
                  )}
                </LigneAdaptative>
              ))}
            </CorpsAdaptatif>
          </TableauAdaptatif>
          {operations.length >= TAILLE_HISTORIQUE && (
            <p className="border-t px-4 py-3 text-sm text-muted-foreground">Les {TAILLE_HISTORIQUE} passages les plus récents sont affichés.</p>
          )}
        </>
      )}
    </PanneauParametre>
  );
}
