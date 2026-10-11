import Link from "next/link";
import { Printer } from "lucide-react";
import {
  CelluleAdaptative,
  ColonneAdaptative,
  CorpsAdaptatif,
  EnTeteAdaptatif,
  LigneAdaptative,
  TableauAdaptatif,
} from "@/components/app/parametres/tableau-adaptatif";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableRow } from "@/components/ui/table";
import { formaterAriary } from "@/lib/montant";
import { cn } from "@/lib/utils";
import type { LignePaiement } from "@/server/lectures/paiements";
import { DialogueAnnulationPaiement } from "./dialogue-annulation";

function libelleMode(p: LignePaiement): string {
  return p.mode === "MOBILE_MONEY" ? `Mobile Money${p.operateurLibelle ? ` · ${p.operateurLibelle}` : ""}` : p.modeLibelle;
}

/** Historique : une ligne par reçu, annulés compris (barrés et marqués). Annuler n'apparaît que pour l'administrateur. */
export function TableauPaiements({ lignes, peutAnnuler }: { lignes: LignePaiement[]; peutAnnuler: boolean }) {
  return (
    <TableauAdaptatif>
      <caption className="sr-only">Reçus de paiement, du plus récent au plus ancien</caption>
      <EnTeteAdaptatif>
        <TableRow>
          <ColonneAdaptative>Reçu</ColonneAdaptative>
          <ColonneAdaptative>Étudiant</ColonneAdaptative>
          <ColonneAdaptative className="md:text-right">Montant</ColonneAdaptative>
          <ColonneAdaptative>Mode</ColonneAdaptative>
          <ColonneAdaptative>Caissier</ColonneAdaptative>
          <ColonneAdaptative>Statut</ColonneAdaptative>
          <ColonneAdaptative>
            <span className="sr-only">Actions</span>
          </ColonneAdaptative>
        </TableRow>
      </EnTeteAdaptatif>
      <CorpsAdaptatif>
        {lignes.map((p) => (
          <LigneAdaptative key={p.id} className={cn(p.annule && "bg-muted/40")}>
            <CelluleAdaptative libelle="Reçu" className="whitespace-nowrap">
              <Link
                href={`/app/paiements/${p.id}/recu`}
                className={cn("font-semibold text-primary tabular-nums underline-offset-4 hover:underline", p.annule && "line-through")}
              >
                {p.numeroRecu}
              </Link>
              <span className="block text-xs text-muted-foreground tabular-nums">
                {p.date} · {p.heure}
              </span>
            </CelluleAdaptative>
            <CelluleAdaptative libelle="Étudiant" className="whitespace-normal md:min-w-52">
              <Link href={`/app/etudiants/${p.etudiant.id}`} className="font-medium hover:underline">
                {p.etudiant.nom} {p.etudiant.prenoms}
              </Link>
              <span className="block text-xs text-muted-foreground">{p.etudiant.matricule}</span>
            </CelluleAdaptative>
            <CelluleAdaptative libelle="Montant" droite className="font-bold tabular-nums">
              <span className={cn(p.annule && "text-muted-foreground line-through")}>{formaterAriary(p.montant)}</span>
            </CelluleAdaptative>
            <CelluleAdaptative libelle="Mode" className="whitespace-normal">
              {libelleMode(p)}
              {p.reference && <span className="block text-xs text-muted-foreground tabular-nums">{p.reference}</span>}
            </CelluleAdaptative>
            <CelluleAdaptative libelle="Caissier" className="whitespace-normal">{p.caissier}</CelluleAdaptative>
            <CelluleAdaptative libelle="Statut" className="whitespace-normal">
              {p.annulation ? (
                <>
                  <Badge className="bg-retard-pale text-retard">Annulé</Badge>
                  <span className="mt-1 block max-w-48 text-xs text-muted-foreground">
                    {p.annulation.motif} — par {p.annulation.par} le {p.annulation.date}
                  </span>
                </>
              ) : (
                <span className="flex flex-wrap gap-1">
                  <Badge className="bg-paye-pale text-paye">Valide</Badge>
                  {p.aVerifier && <Badge className="bg-attention-pale text-attention">À vérifier</Badge>}
                </span>
              )}
            </CelluleAdaptative>
            <CelluleAdaptative pleine>
              <div className="flex flex-wrap justify-end gap-2 max-md:justify-start">
                <Button asChild variant="outline" size="sm" className="max-md:h-11 max-md:px-4 max-md:text-sm">
                  <Link href={`/app/paiements/${p.id}/recu`}>
                    <Printer aria-hidden />
                    Réimprimer<span className="sr-only"> le reçu {p.numeroRecu}</span>
                  </Link>
                </Button>
                {peutAnnuler && !p.annule && (
                  <DialogueAnnulationPaiement
                    paiement={{
                      id: p.id,
                      numeroRecu: p.numeroRecu,
                      date: p.date,
                      heure: p.heure,
                      montant: p.montant,
                      modeLibelle: libelleMode(p),
                      etudiant: `${p.etudiant.nom} ${p.etudiant.prenoms}`,
                      matricule: p.etudiant.matricule,
                    }}
                    declencheur={
                      <Button variant="destructive" size="sm" className="max-md:h-11 max-md:px-4 max-md:text-sm">
                        Annuler<span className="sr-only"> le reçu {p.numeroRecu}</span>
                      </Button>
                    }
                  />
                )}
              </div>
            </CelluleAdaptative>
          </LigneAdaptative>
        ))}
      </CorpsAdaptatif>
    </TableauAdaptatif>
  );
}
