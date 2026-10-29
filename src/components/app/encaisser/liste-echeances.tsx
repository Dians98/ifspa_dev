import { Check, Minus } from "lucide-react";
import { BadgeStatutEcheance } from "@/components/app/badge-statut-echeance";
import { formaterAriary } from "@/lib/montant";
import { cn } from "@/lib/utils";
import type { SituationGuichet } from "@/lib/encaissement-hors-ligne";

/** Part de cette échéance couverte par le montant saisi : `entiere` la solde, `partielle` n'en paie qu'une partie. */
export type ImputationCase = { montant: number; resteApres: number };

/** Échéances non soldées, groupées par année scolaire, dans l'ordre de solde du serveur ; la dernière case touchée peut être partielle. */
export function ListeEcheances({
  annees,
  imputations,
  surBascule,
  indexParId,
}: {
  annees: SituationGuichet["annees"];
  imputations: Map<string, ImputationCase>;
  surBascule: (index: number) => void;
  indexParId: Map<string, number>;
}) {
  return (
    <div className="grid gap-5">
      {annees.map((annee) => {
        const idTitre = `annee-${annee.anneeDebut}`;
        return (
          <div key={annee.anneeDebut} role="group" aria-labelledby={idTitre}>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4">
              <h3 id={idTitre} className="font-sans text-sm font-semibold">
                Année {annee.libelle}
                {annee.niveau ? <span className="font-normal text-muted-foreground"> · {annee.niveau}</span> : null}
              </h3>
              <span className="text-sm text-muted-foreground tabular-nums">Reste {formaterAriary(annee.reste)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {annee.echeances.map((e) => {
                const imputation = imputations.get(e.id);
                const partielle = !!imputation && imputation.resteApres > 0;
                const entiere = !!imputation && !partielle;
                const intitule =
                  `${e.libelle}, ${formaterAriary(e.reste)} à payer, ${e.libelleStatut.toLowerCase()}` +
                  (e.paye > 0 ? `, déjà payé ${formaterAriary(e.paye)}` : "") +
                  (partielle
                    ? `, payée en partie : ${formaterAriary(imputation.montant)}, il restera ${formaterAriary(imputation.resteApres)}`
                    : "");
                return (
                  <button
                    key={e.id}
                    type="button"
                    aria-pressed={partielle ? "mixed" : entiere}
                    aria-label={intitule}
                    onClick={() => surBascule(indexParId.get(e.id) ?? 0)}
                    className={cn(
                      "relative grid min-h-24 content-start justify-items-start gap-0.5 rounded-lg border border-input bg-card px-3 py-2.5 text-left transition-colors outline-none hover:border-bleu focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none",
                      entiere && "border-primary bg-secondary ring-1 ring-primary",
                      partielle && "border-partiel bg-partiel-pale ring-1 ring-partiel",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "absolute top-2 right-2 grid size-5 place-items-center rounded-md border border-input bg-card text-card",
                        entiere && "border-primary bg-primary",
                        partielle && "border-partiel bg-partiel",
                      )}
                    >
                      {entiere && <Check className="size-3.5" strokeWidth={3} />}
                      {partielle && <Minus className="size-3.5" strokeWidth={3} />}
                    </span>
                    <span className="pr-6 text-sm leading-tight font-bold">{e.libelle}</span>
                    <span className="text-sm font-medium tabular-nums">
                      {partielle ? formaterAriary(imputation.montant) : formaterAriary(e.reste)}
                    </span>
                    {partielle ? (
                      <small className="text-xs font-medium text-partiel tabular-nums">reste {formaterAriary(imputation.resteApres)}</small>
                    ) : (
                      e.paye > 0 && <small className="text-xs text-muted-foreground tabular-nums">déjà {formaterAriary(e.paye)}</small>
                    )}
                    <BadgeStatutEcheance statut={e.statut} className="mt-0.5" />
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
