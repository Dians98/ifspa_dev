import { TriangleAlert } from "lucide-react";
import { BadgeStatutEcheance } from "@/components/app/badge-statut-echeance";
import { Badge } from "@/components/ui/badge";
import { libelleMois } from "@/lib/ecolage";
import { formaterAriary } from "@/lib/montant";
import { cn } from "@/lib/utils";
import type { DossierEtudiant, EcheanceFiche, InscriptionFiche } from "@/server/lectures/etudiants";
import { EtatVide } from "@/components/app/parametres/panneau-parametre";

const STYLE_CARTE: Record<EcheanceFiche["statut"], string> = {
  paye: "border-paye/30 bg-paye-pale",
  partiel: "border-partiel/30 bg-partiel-pale",
  retard: "border-retard/30 bg-retard-pale",
  a_venir: "border-dashed bg-card",
};

function Montant({ valeur }: { valeur: number }) {
  return <span className="tabular-nums">{formaterAriary(valeur)}</span>;
}

function CarteNonDue({ e }: { e: EcheanceFiche }) {
  return (
    <li className="grid content-start gap-2 rounded-lg border border-dashed bg-muted/50 p-3 text-sm text-muted-foreground">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="font-semibold">{e.libelle}</span>
        <Badge className="bg-muted text-muted-foreground">{e.libelleStatut}</Badge>
      </div>
      <p>
        <span className="line-through tabular-nums">{formaterAriary(e.montantDu)}</span>
        <span className="sr-only"> : non dû, hors totaux</span>
      </p>
    </li>
  );
}

function CarteEcheance({ e, moisCourant }: { e: EcheanceFiche; moisCourant: string }) {
  if (e.nonDue) return <CarteNonDue e={e} />;
  const enCours = e.mois.slice(0, 7) === moisCourant;
  const partiel = e.paye > 0 && e.reste > 0;
  return (
    <li className={cn("grid content-start gap-2 rounded-lg border p-3 text-sm", STYLE_CARTE[e.statut], enCours && "ring-2 ring-primary")}>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="font-semibold">{e.libelle}</span>
        <BadgeStatutEcheance statut={e.statut} className="bg-background" />
      </div>
      {e.type === "FRAIS" && (
        <p className="text-xs text-muted-foreground">Frais, exigible en {libelleMois(new Date(`${e.mois}T00:00:00Z`)).toLowerCase()}</p>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <dt className="text-muted-foreground">Dû</dt>
        <dd className="text-right">
          <Montant valeur={e.montantDu} />
        </dd>
        <dt className="text-muted-foreground">Payé</dt>
        <dd className="text-right">
          <Montant valeur={e.paye} />
        </dd>
        <dt className="text-muted-foreground">Reste</dt>
        <dd className={cn("text-right", e.reste > 0 && "font-semibold")}>
          <Montant valeur={e.reste} />
        </dd>
      </dl>
      {partiel && (
        <div aria-hidden className="h-1 overflow-hidden rounded-full bg-background">
          <div className="h-full rounded-full bg-current text-partiel" style={{ width: `${Math.round((e.paye / e.montantDu) * 100)}%` }} />
        </div>
      )}
      {enCours && <p className="text-xs font-semibold text-primary">{e.type === "MENSUALITE" ? "Mois en cours" : "Exigible ce mois-ci"}</p>}
    </li>
  );
}

function LigneTotaux({ t }: { t: InscriptionFiche["totaux"] }) {
  return (
    <p className="text-sm text-muted-foreground">
      Dû <Montant valeur={t.du} /> · Payé <Montant valeur={t.paye} /> ·{" "}
      <span className={cn("font-semibold", t.reste > 0 ? "text-foreground" : "text-paye")}>
        {t.reste > 0 ? (
          <>
            Reste <Montant valeur={t.reste} />
          </>
        ) : (
          "Année soldée"
        )}
      </span>
    </p>
  );
}

function AnneeEcolage({ i, moisCourant, repliable }: { i: InscriptionFiche; moisCourant: string; repliable: boolean }) {
  const nbNonDues = i.echeances.filter((x) => x.nonDue).length;
  const titre = (
    <div className="min-w-0">
      <h3 className="font-heading text-lg font-semibold text-primary">
        Écolage <span className="tabular-nums">{i.annee}</span>
        <span className="font-sans text-base font-medium text-muted-foreground"> · {i.libelleNiveau}</span>
      </h3>
      <LigneTotaux t={i.totaux} />
      {nbNonDues > 0 && (
        <p className="text-sm text-muted-foreground">
          {nbNonDues} échéance{nbNonDues > 1 ? "s" : ""} non due{nbNonDues > 1 ? "s" : ""} après la sortie, hors des totaux.
        </p>
      )}
    </div>
  );
  const grille = (
    <ul className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5">
      {i.echeances.map((e) => (
        <CarteEcheance key={e.id} e={e} moisCourant={moisCourant} />
      ))}
    </ul>
  );

  if (!repliable) {
    return (
      <section className="rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          {titre}
        </div>
        {grille}
      </section>
    );
  }
  // Une année précédente soldée se replie ; celles qui ont un reste dû restent ouvertes.
  return (
    <details open={i.totaux.reste > 0} className="rounded-xl border bg-card p-4 sm:p-5">
      <summary className="flex cursor-pointer items-center justify-between gap-3 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50 max-md:min-h-11">
        {titre}
        {i.totaux.reste === 0 && <Badge className="shrink-0 bg-paye-pale text-paye">Soldée</Badge>}
      </summary>
      {grille}
    </details>
  );
}

export function EcolageFiche({ dossier }: { dossier: DossierEtudiant }) {
  const { situation: s, jour } = dossier;
  const moisCourant = jour.slice(0, 7);
  const annees = [...dossier.parcours].reverse();

  if (annees.length === 0) {
    return <EtatVide texte="Cet étudiant n'a aucune inscription : il n'y a pas d'écolage à suivre." />;
  }

  return (
    <div className="grid gap-5">
      <section aria-labelledby="situation-ecolage" className="rounded-xl bg-rose-pale px-4 py-4 sm:px-6">
        <h2 id="situation-ecolage" className="sr-only">
          Situation de l&apos;écolage, toutes années
        </h2>
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Reste à payer</dt>
            <dd className="mt-0.5 text-2xl font-bold text-primary">
              {s.reste > 0 ? <Montant valeur={s.reste} /> : "Rien à payer"}
            </dd>
            <dd className="text-xs text-muted-foreground">Toutes années confondues</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Dont en retard</dt>
            <dd className={cn("mt-0.5 text-2xl font-bold", s.resteEnRetard > 0 ? "text-retard" : "text-paye")}>
              {s.resteEnRetard > 0 ? (
                <>
                  <TriangleAlert aria-hidden className="mr-1.5 inline size-5 -translate-y-0.5" />
                  <Montant valeur={s.resteEnRetard} />
                </>
              ) : (
                "Aucun retard"
              )}
            </dd>
            {s.resteEnRetard > 0 && (
              <dd className="text-xs text-muted-foreground">
                {s.moisEnRetard} mois impayé{s.moisEnRetard > 1 ? "s" : ""}
              </dd>
            )}
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Déjà payé</dt>
            <dd className="mt-0.5 text-2xl font-bold text-primary">
              <Montant valeur={s.paye} />
            </dd>
            <dd className="text-xs text-muted-foreground">Sur {formaterAriary(s.du)} dus au total</dd>
            <dd className="text-xs text-muted-foreground">
              Total encaissé : <span className="tabular-nums">{formaterAriary(dossier.totalEncaisse)}</span>
            </dd>
          </div>
        </dl>
      </section>

      <p className="text-sm text-muted-foreground">
        Un paiement solde d&apos;abord les droits, puis les mois dus, puis les frais dus, et enfin ce qui est à venir ; le surplus passe en acompte sur l&apos;échéance suivante.
      </p>

      {annees.map((i, rang) => (
        <AnneeEcolage key={i.id} i={i} moisCourant={moisCourant} repliable={rang > 0} />
      ))}
    </div>
  );
}
