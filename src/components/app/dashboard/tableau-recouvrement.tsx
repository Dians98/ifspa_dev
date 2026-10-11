import { Fragment } from "react";
import Link from "next/link";
import { JaugeTaux } from "@/components/app/dashboard/jauge-taux";
import {
  CelluleAdaptative,
  ColonneAdaptative,
  CorpsAdaptatif,
  EnTeteAdaptatif,
  LigneAdaptative,
  TableauAdaptatif,
} from "@/components/app/parametres/tableau-adaptatif";
import { TableFooter, TableRow } from "@/components/ui/table";
import type { AgregatCalcule } from "@/lib/dashboard";
import { formaterAriary } from "@/lib/montant";
import { cn } from "@/lib/utils";
import type { Dashboard } from "@/server/lectures/dashboard";

function EnRetard({ nombre, href }: { nombre: number; href: string | null }) {
  if (nombre === 0) return <span className="text-muted-foreground">0</span>;
  if (!href) return <span className="font-bold text-retard tabular-nums">{nombre}</span>;
  return (
    <Link href={href} className="inline-flex min-h-6 items-center font-bold text-retard tabular-nums underline underline-offset-4 max-md:min-h-11">
      {nombre}
      <span className="sr-only"> étudiants en retard, voir la liste</span>
    </Link>
  );
}

/** Cellules chiffrées communes aux classes, aux sous-totaux et au total (ordre des colonnes, réordonné sur téléphone). */
function Chiffres({ a, href }: { a: AgregatCalcule; href: string | null }) {
  return (
    <>
      <CelluleAdaptative libelle="Effectif" droite className="tabular-nums max-md:order-3">
        {a.effectif}
      </CelluleAdaptative>
      <CelluleAdaptative libelle="Attendu à date" droite className="tabular-nums max-md:order-5">
        {formaterAriary(a.attendu)}
      </CelluleAdaptative>
      <CelluleAdaptative libelle="Encaissé" droite className="tabular-nums max-md:order-6">
        {formaterAriary(a.encaisse)}
      </CelluleAdaptative>
      <CelluleAdaptative libelle="Reste" droite className="font-semibold tabular-nums max-md:order-7">
        {formaterAriary(a.reste)}
      </CelluleAdaptative>
      <CelluleAdaptative libelle="Taux de recouvrement" pleine className="md:min-w-48 max-md:order-8">
        <JaugeTaux valeur={a.taux} bas={a.tauxBas} />
      </CelluleAdaptative>
      <CelluleAdaptative libelle="En retard" droite className="max-md:order-4">
        <EnRetard nombre={a.enRetard} href={href} />
      </CelluleAdaptative>
    </>
  );
}

/**
 * Une ligne par filière et par niveau, sous-total par filière quand il y en a plusieurs, total en pied.
 * `liens` : seulement pour l'année courante, Impayés ne filtrant pas par année.
 */
export function TableauRecouvrement({ tableau, liens }: { tableau: Dashboard["tableau"]; liens: boolean }) {
  const { lignes, sousTotaux, total } = tableau;
  const avecSousTotaux = sousTotaux.length > 1;

  return (
    <TableauAdaptatif>
      <caption className="sr-only">Recouvrement par filière et par niveau, montants échus à la date du jour</caption>
      <EnTeteAdaptatif>
        <TableRow>
          <ColonneAdaptative>Filière</ColonneAdaptative>
          <ColonneAdaptative>Niveau</ColonneAdaptative>
          <ColonneAdaptative className="text-right">Effectif</ColonneAdaptative>
          <ColonneAdaptative className="text-right">Attendu à date</ColonneAdaptative>
          <ColonneAdaptative className="text-right">Encaissé</ColonneAdaptative>
          <ColonneAdaptative className="text-right">Reste</ColonneAdaptative>
          <ColonneAdaptative>Taux de recouvrement</ColonneAdaptative>
          <ColonneAdaptative className="text-right">En retard</ColonneAdaptative>
        </TableRow>
      </EnTeteAdaptatif>
      <CorpsAdaptatif>
        {sousTotaux.map((s) => (
          <Fragment key={s.filiere.id}>
            {lignes
              .filter((l) => l.filiere.id === s.filiere.id)
              .map((l) => (
                <LigneAdaptative key={`${l.filiere.id}-${l.niveau}`}>
                  <CelluleAdaptative libelle="Filière" className="font-medium max-md:order-1">
                    {l.filiere.nom}
                  </CelluleAdaptative>
                  <CelluleAdaptative libelle="Niveau" className="max-md:order-2">
                    {l.libelleNiveau}
                  </CelluleAdaptative>
                  <Chiffres a={l} href={liens ? `/app/impayes?filiereId=${encodeURIComponent(l.filiere.id)}&niveau=${l.niveau}` : null} />
                </LigneAdaptative>
              ))}
            {avecSousTotaux && (
              <LigneAdaptative className="bg-muted/40 font-semibold">
                <CelluleAdaptative className="max-md:order-1 max-md:col-span-2" colSpan={2}>
                  Sous-total {s.filiere.nom}
                </CelluleAdaptative>
                <Chiffres a={s} href={liens ? `/app/impayes?filiereId=${encodeURIComponent(s.filiere.id)}` : null} />
              </LigneAdaptative>
            )}
          </Fragment>
        ))}
      </CorpsAdaptatif>
      <TableFooter className={cn("bg-rose-pale text-rose-fonce max-md:block")}>
        <LigneAdaptative className="hover:bg-rose-pale">
          <CelluleAdaptative className="font-bold max-md:order-1 max-md:col-span-2" colSpan={2}>
            Total
          </CelluleAdaptative>
          <Chiffres a={total} href={liens ? "/app/impayes" : null} />
        </LigneAdaptative>
      </TableFooter>
    </TableauAdaptatif>
  );
}
