import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { FiltresPaiements } from "@/components/app/paiements/filtres-paiements";
import { TableauPaiements } from "@/components/app/paiements/tableau-paiements";
import { TitrePage } from "@/components/app/titre-page";
import { Button } from "@/components/ui/button";
import { formaterAriary } from "@/lib/montant";
import { requireSession, roleDe } from "@/lib/permissions";
import { lirePaiements, type FiltresPaiements as FiltresLus } from "@/server/lectures/paiements";

export const metadata: Metadata = { title: "Paiements" };

/** Adresse de la page `page` avec les filtres déjà appliqués (seuls les filtres posés figurent dans l'adresse). */
function adressePage(f: FiltresLus, page: number): string {
  const params = new URLSearchParams();
  if (f.periode !== "jour") params.set("periode", f.periode);
  for (const cle of ["jour", "mois", "anneeId", "du", "au", "caissierId", "q"] as const) {
    if (f[cle]) params.set(cle, f[cle]);
  }
  if (f.mode !== "tous") params.set("mode", f.mode);
  if (f.statut !== "tous") params.set("statut", f.statut);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/app/paiements?${qs}` : "/app/paiements";
}

export default async function PagePaiements({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireSession();
  const liste = await lirePaiements(await searchParams);
  const { totaux, periode, filtres, page, pages, total, taillePage } = liste;
  const debut = total === 0 ? 0 : (page - 1) * taillePage + 1;
  const fin = Math.min(page * taillePage, total);

  return (
    <>
      <TitrePage
        titre="Historique des paiements"
        description="Tous les reçus émis, y compris les annulés. Un paiement n'est jamais supprimé."
      />

      <section aria-label="Liste des paiements" className="rounded-xl border bg-card">
        <FiltresPaiements filtres={filtres} periode={periode} caissiers={liste.caissiers} annees={liste.annees} />

        <div className="border-b bg-rose-pale px-4 py-3.5 sm:px-5">
          <p className="mb-2 text-sm font-semibold text-rose-fonce">{periode.libelle}</p>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:flex sm:flex-wrap">
            <Total libelle="Reçus" valeur={String(totaux.nombre)} detail={totaux.annules > 0 ? `+ ${totaux.annules} annulé${totaux.annules > 1 ? "s" : ""}` : undefined} />
            <Total libelle="Total encaissé" valeur={formaterAriary(totaux.montant)} />
            <Total libelle="dont espèces" valeur={formaterAriary(totaux.especes)} />
            <Total libelle="dont Mobile Money" valeur={formaterAriary(totaux.mobileMoney)} />
            {totaux.aVerifier > 0 && <Total libelle="À vérifier" valeur={String(totaux.aVerifier)} />}
          </dl>
        </div>

        {liste.lignes.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <p className="max-w-md text-muted-foreground">
              Aucun paiement ne correspond à ces filtres.
              {filtres.periode === "jour" && " Les reçus émis au guichet apparaissent ici dès qu'ils sont enregistrés."}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {filtres.periode === "jour" && (
                <Button asChild variant="outline" className="max-md:h-11">
                  <Link href="/app/paiements?periode=mois">Voir ce mois-ci</Link>
                </Button>
              )}
              <Button asChild variant="ghost" className="max-md:h-11">
                <Link href="/app/paiements">Effacer les filtres</Link>
              </Button>
            </div>
          </div>
        ) : (
          <TableauPaiements lignes={liste.lignes} peutAnnuler={roleDe(session) === "admin"} />
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground sm:px-5">
          <p aria-live="polite">
            {total === 0 ? "Aucun reçu" : `Reçus ${debut} à ${fin} sur ${total}`}
          </p>
          {pages > 1 && (
            <nav aria-label="Pagination" className="flex items-center gap-2">
              {page > 1 ? (
                <Button asChild variant="outline" className="max-md:h-11">
                  <Link href={adressePage(filtres, page - 1)} rel="prev">
                    <ChevronLeft aria-hidden />
                    Précédent
                  </Link>
                </Button>
              ) : null}
              <span className="px-1 tabular-nums">
                Page {page} sur {pages}
              </span>
              {page < pages ? (
                <Button asChild variant="outline" className="max-md:h-11">
                  <Link href={adressePage(filtres, page + 1)} rel="next">
                    Suivant
                    <ChevronRight aria-hidden />
                  </Link>
                </Button>
              ) : null}
            </nav>
          )}
        </div>
      </section>
    </>
  );
}

function Total({ libelle, valeur, detail }: { libelle: string; valeur: string; detail?: string }) {
  return (
    <div className="sm:border-l sm:border-rose/30 sm:pl-6 sm:first:border-l-0 sm:first:pl-0">
      <dt className="text-xs font-semibold text-rose-fonce">{libelle}</dt>
      <dd className="mt-0.5 text-lg font-bold tabular-nums">
        {valeur}
        {detail && <small className="ml-1.5 text-xs font-medium text-muted-foreground">{detail}</small>}
      </dd>
    </div>
  );
}
