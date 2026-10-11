import Link from "next/link";
import { TriangleAlert, Users, Wallet } from "lucide-react";
import { JaugeTaux, formaterTaux } from "@/components/app/dashboard/jauge-taux";
import { SEUIL_TAUX_BAS } from "@/lib/dashboard";
import { formaterAriary } from "@/lib/montant";
import type { Dashboard } from "@/server/lectures/dashboard";

const CARTE = "flex flex-col gap-1 rounded-xl border bg-card p-5";
const LIBELLE = "flex items-center gap-2 text-sm font-semibold text-rose-fonce";
const VALEUR = "font-heading text-4xl font-bold tabular-nums text-primary";
const DETAIL = "text-sm text-muted-foreground";

/** Les trois seuls indicateurs du tableau de bord : effectif, taux de recouvrement, étudiants en retard. */
/** `lienImpayes` : seulement pour l'année courante, Impayés ne filtrant pas par année. */
export function CartesDashboard({
  cartes,
  filiereId,
  lienImpayes,
}: {
  cartes: Dashboard["cartes"];
  filiereId: string | null;
  lienImpayes: boolean;
}) {
  const { effectif, taux, enRetard } = cartes;
  const adresseImpayes = filiereId ? `/app/impayes?filiereId=${encodeURIComponent(filiereId)}` : "/app/impayes";

  return (
    <section aria-labelledby="titre-indicateurs" className="mb-6">
      <h2 id="titre-indicateurs" className="sr-only">
        Indicateurs
      </h2>
      <dl className="grid gap-4 md:grid-cols-3">
        <div className={CARTE}>
          <dt className={LIBELLE}>
            <Users className="size-4" aria-hidden />
            Effectif actif
          </dt>
          <dd className={VALEUR}>{effectif.total}</dd>
          <dd className={DETAIL}>
            {effectif.parFiliere.length === 0
              ? "Aucun étudiant inscrit sur cette année"
              : effectif.parFiliere.map((f) => `${f.effectif} ${f.nom}`).join(" · ")}
          </dd>
        </div>

        <div className={CARTE}>
          <dt className={LIBELLE}>
            <Wallet className="size-4" aria-hidden />
            Taux de recouvrement
          </dt>
          <dd className={VALEUR}>{taux.valeur === null ? "—" : formaterTaux(taux.valeur)}</dd>
          {taux.valeur !== null && (
            <dd className="my-1">
              <JaugeTaux valeur={taux.valeur} bas={taux.bas} barreSeule />
            </dd>
          )}
          <dd className={DETAIL}>
            {taux.valeur === null
              ? "Rien n'est encore échu"
              : `${formaterAriary(taux.encaisse)} encaissés sur ${formaterAriary(taux.attendu)} attendus à date`}
          </dd>
          {taux.bas && (
            <dd className="flex items-center gap-1.5 text-sm font-medium text-attention">
              <TriangleAlert className="size-4" aria-hidden />
              Sous {SEUIL_TAUX_BAS} %
            </dd>
          )}
        </div>

        <div className={CARTE}>
          <dt className={LIBELLE}>
            <TriangleAlert className="size-4" aria-hidden />
            Étudiants en retard
          </dt>
          <dd className={VALEUR}>
            {enRetard.nombre} <span className="text-lg font-semibold text-muted-foreground">sur {enRetard.sur}</span>
          </dd>
          <dd className={DETAIL}>
            {enRetard.nombre === 0 ? "Personne n'a d'échéance impayée" : "Au moins une échéance échue impayée"}
          </dd>
          {lienImpayes && (
            <dd className="mt-1">
              <Link href={adresseImpayes} className="inline-flex min-h-6 items-center text-sm font-semibold text-rose-fonce underline underline-offset-4 max-md:min-h-11">
                Voir la liste des impayés
              </Link>
            </dd>
          )}
        </div>
      </dl>
    </section>
  );
}
