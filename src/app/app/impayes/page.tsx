import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, Download } from "lucide-react";
import { FiltresImpayes } from "@/components/app/impayes/filtres-impayes";
import {
  CelluleAdaptative,
  ColonneAdaptative,
  CorpsAdaptatif,
  EnTeteAdaptatif,
  LigneAdaptative,
  TableauAdaptatif,
} from "@/components/app/parametres/tableau-adaptatif";
import { TitrePage } from "@/components/app/titre-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableRow } from "@/components/ui/table";
import { formaterJour } from "@/lib/dates";
import { formaterAriary } from "@/lib/montant";
import { exigerSessionPage } from "@/server/acces";
import { lireImpayes } from "@/server/lectures/paiements";

export const metadata: Metadata = { title: "Impayés" };

const FILTRES_URL = ["q", "filiereId", "niveau", "moisMin"] as const;

export default async function PageImpayes({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigerSessionPage();
  const liste = await lireImpayes(await searchParams);
  const { lignes, totaux, filtres, jour } = liste;

  // L'export reprend exactement les filtres de l'écran.
  const params = new URLSearchParams();
  for (const cle of FILTRES_URL) if (filtres[cle]) params.set(cle, String(filtres[cle]));
  const qs = params.toString();
  const filtre = qs.length > 0;

  return (
    <>
      <TitrePage
        titre="Étudiants en retard de paiement"
        description={`Situation au ${formaterJour(jour)} : échéances échues et non soldées, toutes années.`}
        actions={
          lignes.length > 0 ? (
            <Button asChild variant="outline" className="max-md:h-11">
              <a href={`/api/export/impayes${qs ? `?${qs}` : ""}`} download>
                <Download aria-hidden />
                Exporter (Excel)
              </a>
            </Button>
          ) : null
        }
      />

      <section aria-label="Liste des étudiants en retard" className="rounded-xl border bg-card">
        <FiltresImpayes filtres={filtres} options={liste.options} />

        <p className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b bg-rose-pale px-4 py-3.5 text-sm sm:px-5" aria-live="polite">
          <span>
            <b className="text-lg tabular-nums">{totaux.etudiants}</b> étudiant{totaux.etudiants > 1 ? "s" : ""} en retard
          </span>
          <span>
            <b className="text-lg text-retard tabular-nums">{formaterAriary(totaux.resteEnRetard)}</b> à recouvrer
          </span>
        </p>

        {lignes.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <p className="max-w-md text-muted-foreground">
              {filtre
                ? "Aucun étudiant en retard ne correspond à ces filtres."
                : "Aucun étudiant n'est en retard de paiement : tout est à jour."}
            </p>
            {filtre && (
              <Button asChild variant="outline" className="max-md:h-11">
                <Link href="/app/impayes">Effacer les filtres</Link>
              </Button>
            )}
          </div>
        ) : (
          <TableauAdaptatif>
            <caption className="sr-only">Étudiants en retard, du plus grand retard au plus petit</caption>
            <EnTeteAdaptatif>
              <TableRow>
                <ColonneAdaptative>Étudiant</ColonneAdaptative>
                <ColonneAdaptative>Filière · niveau</ColonneAdaptative>
                <ColonneAdaptative>Mois en retard</ColonneAdaptative>
                <ColonneAdaptative className="md:text-right">Reste en retard</ColonneAdaptative>
                <ColonneAdaptative>Dernier paiement</ColonneAdaptative>
                <ColonneAdaptative>Téléphone</ColonneAdaptative>
                <ColonneAdaptative>
                  <span className="sr-only">Actions</span>
                </ColonneAdaptative>
              </TableRow>
            </EnTeteAdaptatif>
            <CorpsAdaptatif>
              {lignes.map((l) => (
                <LigneAdaptative key={l.id}>
                  <CelluleAdaptative pleine>
                    <Link href={`/app/etudiants/${l.id}`} className="font-semibold text-primary hover:underline">
                      {l.nom} {l.prenoms}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{l.matricule}</span>
                  </CelluleAdaptative>
                  <CelluleAdaptative libelle="Filière · niveau">
                    {l.filiere.nom}
                    {l.libelleNiveau && <span className="block text-xs text-muted-foreground">{l.libelleNiveau}</span>}
                  </CelluleAdaptative>
                  <CelluleAdaptative libelle="Mois en retard">
                    <Badge className="bg-retard-pale text-retard">
                      {l.moisEnRetard} mois
                    </Badge>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {l.anneesEnRetard.length > 1 ? "Années " : "Année "}
                      {l.anneesEnRetard.join(", ")}
                    </span>
                  </CelluleAdaptative>
                  <CelluleAdaptative libelle="Reste en retard" droite className="font-bold text-retard tabular-nums">
                    {formaterAriary(l.resteEnRetard)}
                  </CelluleAdaptative>
                  <CelluleAdaptative libelle="Dernier paiement">
                    {l.dernierPaiement ? (
                      <>
                        <span className="tabular-nums">{l.dernierPaiement.date}</span>
                        <span className="block text-xs text-muted-foreground tabular-nums">{formaterAriary(l.dernierPaiement.montant)}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Aucun</span>
                    )}
                  </CelluleAdaptative>
                  <CelluleAdaptative libelle="Téléphone">
                    {l.telephone && l.telephoneAffiche ? (
                      <a
                        href={`tel:${l.telephone.replace(/\s/g, "")}`}
                        className="inline-flex min-h-6 items-center font-semibold whitespace-nowrap tabular-nums underline underline-offset-4 max-md:min-h-11"
                      >
                        {l.telephoneAffiche}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">Non renseigné</span>
                    )}
                  </CelluleAdaptative>
                  <CelluleAdaptative pleine>
                    <div className="flex justify-end max-md:justify-start">
                      <Button
                        asChild
                        size="sm"
                        className="bg-rose-fonce text-white hover:bg-rose-fonce/90 max-md:h-11 max-md:px-4 max-md:text-sm"
                      >
                        <Link href={`/app/encaisser?etudiant=${l.id}`}>
                          <Banknote aria-hidden />
                          Encaisser<span className="sr-only"> pour {l.nom} {l.prenoms}</span>
                        </Link>
                      </Button>
                    </div>
                  </CelluleAdaptative>
                </LigneAdaptative>
              ))}
            </CorpsAdaptatif>
          </TableauAdaptatif>
        )}
      </section>
    </>
  );
}
