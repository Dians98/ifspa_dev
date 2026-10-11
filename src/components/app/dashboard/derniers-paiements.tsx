import Link from "next/link";
import {
  CelluleAdaptative,
  ColonneAdaptative,
  CorpsAdaptatif,
  EnTeteAdaptatif,
  LigneAdaptative,
  TableauAdaptatif,
} from "@/components/app/parametres/tableau-adaptatif";
import { Badge } from "@/components/ui/badge";
import { TableRow } from "@/components/ui/table";
import { formaterAriary } from "@/lib/montant";
import { cn } from "@/lib/utils";
import type { DernierPaiementDashboard } from "@/server/lectures/dashboard";

/** Les derniers reçus émis, annulés compris (barrés et marqués), sans action : l'historique complet est dans Paiements. */
export function DerniersPaiements({ paiements }: { paiements: DernierPaiementDashboard[] }) {
  return (
    <TableauAdaptatif>
      <caption className="sr-only">Derniers reçus émis, du plus récent au plus ancien</caption>
      <EnTeteAdaptatif>
        <TableRow>
          <ColonneAdaptative>Reçu</ColonneAdaptative>
          <ColonneAdaptative>Étudiant</ColonneAdaptative>
          <ColonneAdaptative className="text-right">Montant</ColonneAdaptative>
          <ColonneAdaptative>Mode</ColonneAdaptative>
          <ColonneAdaptative>Caissier</ColonneAdaptative>
          <ColonneAdaptative>Statut</ColonneAdaptative>
        </TableRow>
      </EnTeteAdaptatif>
      <CorpsAdaptatif>
        {paiements.map((p) => (
          <LigneAdaptative key={p.id} className={cn(p.annule && "bg-muted/40")}>
            <CelluleAdaptative libelle="Reçu" className="whitespace-nowrap">
              <Link
                href={`/app/paiements/${p.id}/recu`}
                className={cn("inline-flex min-h-6 items-center font-semibold text-primary tabular-nums underline-offset-4 hover:underline max-md:min-h-11", p.annule && "line-through")}
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
              {p.modeLibelle}
            </CelluleAdaptative>
            <CelluleAdaptative libelle="Caissier" className="whitespace-normal">
              {p.caissier}
            </CelluleAdaptative>
            <CelluleAdaptative libelle="Statut" className="whitespace-normal">
              {p.annule ? (
                <Badge className="bg-retard-pale text-retard">Annulé</Badge>
              ) : (
                <span className="flex flex-wrap gap-1">
                  <Badge className="bg-paye-pale text-paye">Valide</Badge>
                  {p.aVerifier && <Badge className="bg-attention-pale text-attention">À vérifier</Badge>}
                </span>
              )}
            </CelluleAdaptative>
          </LigneAdaptative>
        ))}
      </CorpsAdaptatif>
    </TableauAdaptatif>
  );
}
