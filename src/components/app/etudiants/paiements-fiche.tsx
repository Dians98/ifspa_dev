import Link from "next/link";
import { Printer, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableRow } from "@/components/ui/table";
import { formaterAriary } from "@/lib/montant";
import { cn } from "@/lib/utils";
import type { DossierEtudiant, PaiementFiche } from "@/server/lectures/etudiants";
import { InfoVerification } from "@/components/app/paiements/info-verification";
import { EtatVide, PanneauParametre } from "@/components/app/parametres/panneau-parametre";
import {
  CelluleAdaptative,
  ColonneAdaptative,
  CorpsAdaptatif,
  EnTeteAdaptatif,
  LigneAdaptative,
  TableauAdaptatif,
} from "@/components/app/parametres/tableau-adaptatif";

function LignePaiement({ p }: { p: PaiementFiche }) {
  return (
    <LigneAdaptative className={cn(p.annule && "bg-muted/40")}>
      <CelluleAdaptative libelle="Reçu" className={cn("font-medium tabular-nums", p.annule && "text-muted-foreground line-through")}>
        {p.numeroRecu}
      </CelluleAdaptative>
      <CelluleAdaptative libelle="Date" className={cn("tabular-nums", p.annule && "text-muted-foreground")}>
        {p.date}
        <span className="block text-xs text-muted-foreground">{p.heure}</span>
      </CelluleAdaptative>
      <CelluleAdaptative libelle="Montant" droite className={cn("font-semibold tabular-nums", p.annule && "font-normal text-muted-foreground line-through")}>
        {formaterAriary(p.montant)}
      </CelluleAdaptative>
      <CelluleAdaptative libelle="Mode" className={cn(p.annule && "text-muted-foreground")}>
        {p.modeLibelle}
        {p.operateurLibelle && <span className="block text-xs text-muted-foreground">{p.operateurLibelle}</span>}
        {p.reference && <span className="block text-xs text-muted-foreground tabular-nums">Réf. {p.reference}</span>}
      </CelluleAdaptative>
      <CelluleAdaptative libelle="Caissier" className={cn(p.annule && "text-muted-foreground")}>
        {p.caissier}
      </CelluleAdaptative>
      <CelluleAdaptative libelle="Statut" className="whitespace-normal">
        <div className="flex flex-wrap items-center gap-1.5">
          {p.annule ? (
            <Badge className="bg-retard-pale text-retard">Annulé</Badge>
          ) : (
            <Badge className="bg-paye-pale text-paye">Valide</Badge>
          )}
          {p.aVerifier && !p.annule && (
            <Badge className="bg-attention-pale text-attention">
              <TriangleAlert aria-hidden />À vérifier
            </Badge>
          )}
        </div>
        <InfoVerification
          aVerifier={p.aVerifier}
          annule={p.annule}
          noteVerification={p.noteVerification}
          verification={p.verification}
        />
        {p.observation && <p className="mt-1 text-xs text-muted-foreground">{p.observation}</p>}
        {p.annulation && (
          <p className="mt-1 max-w-64 text-xs text-muted-foreground wrap-anywhere">
            {p.annulation.motif}
            {p.annulation.par && ` · par ${p.annulation.par}`}
            {p.annulation.date && `, le ${p.annulation.date}`}
          </p>
        )}
      </CelluleAdaptative>
      <CelluleAdaptative pleine droite>
        <Button asChild variant="outline" size="sm" className="max-md:h-11 max-md:w-full">
          <Link href={`/app/paiements/${p.id}/recu`} aria-label={`Réimprimer le reçu ${p.numeroRecu}`}>
            <Printer aria-hidden />
            Réimprimer
          </Link>
        </Button>
      </CelluleAdaptative>
    </LigneAdaptative>
  );
}

export function PaiementsFiche({ e }: { e: DossierEtudiant }) {
  return (
    <PanneauParametre titre="Paiements" description="Reçus émis pour cet étudiant, du plus récent au plus ancien.">
      {e.paiements.length === 0 ? (
        <EtatVide
          texte="Aucun paiement enregistré. Les reçus apparaissent ici après le premier encaissement."
          action={
            // Un sorti qui doit encore reste encaissable (décision 20).
            e.statut === "ACTIF" || e.situation.reste > 0 ? (
              <Button asChild className="bg-rose-fonce text-white hover:bg-rose-fonce/90 max-md:h-11">
                <Link href={`/app/encaisser?etudiant=${e.id}`}>Encaisser</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <TableauAdaptatif>
          <caption className="sr-only">Paiements de {e.nom} {e.prenoms}</caption>
          <EnTeteAdaptatif>
            <TableRow>
              <ColonneAdaptative>Reçu</ColonneAdaptative>
              <ColonneAdaptative>Date</ColonneAdaptative>
              <ColonneAdaptative className="text-right">Montant</ColonneAdaptative>
              <ColonneAdaptative>Mode</ColonneAdaptative>
              <ColonneAdaptative>Caissier</ColonneAdaptative>
              <ColonneAdaptative>Statut</ColonneAdaptative>
              <ColonneAdaptative className="text-right">Actions</ColonneAdaptative>
            </TableRow>
          </EnTeteAdaptatif>
          <CorpsAdaptatif>
            {e.paiements.map((p) => (
              <LignePaiement key={p.id} p={p} />
            ))}
          </CorpsAdaptatif>
        </TableauAdaptatif>
      )}
    </PanneauParametre>
  );
}
