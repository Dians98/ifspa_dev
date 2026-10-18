import { ChevronDown } from "lucide-react";
import type { NumerosNonUtilises } from "@/server/lectures/paiements";

const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;

/** Admin : numéros de reçu réservés par les postes hors ligne mais jamais portés par un ticket. Replié, on n'y va qu'au besoin. */
export function NumerosNonUtilisesSection({ donnees }: { donnees: NumerosNonUtilises }) {
  const { anneesCloses, anneesOuvertes } = donnees;
  const total =
    anneesCloses.reduce((s, a) => s + a.nombre, 0) + anneesOuvertes.reduce((s, a) => s + a.restants, 0);
  if (total === 0) return null;

  return (
    <details className="group mt-4 rounded-xl border bg-card">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-5 [&::-webkit-details-marker]:hidden">
        <h2 className="font-sans text-base font-semibold">
          Numéros non utilisés <span className="font-normal text-muted-foreground">({total})</span>
        </h2>
        <ChevronDown
          className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden
        />
      </summary>

      <div className="grid gap-5 border-t px-4 py-4 text-sm sm:px-5">
        <p className="max-w-prose text-muted-foreground">
          Un poste hors ligne réserve ses numéros de reçu à l&apos;avance. Ceux qui n&apos;ont servi à aucun ticket restent vides : ce n&apos;est
          pas une erreur, mais un contrôle peut les demander.
        </p>

        {anneesOuvertes.map((a) =>
          a.restants === 0 ? null : (
            <section key={a.annee} aria-label={`Année ${a.annee}`}>
              <h3 className="font-sans text-sm font-semibold">
                {a.annee} · {pluriel(a.restants, "numéro encore détenu", "numéros encore détenus")} par les postes
              </h3>
              <ul className="mt-2 divide-y rounded-lg border">
                {a.postes
                  .filter((p) => p.restants > 0)
                  .map((p) => (
                    <li key={`${p.poste}|${p.caissier.id}`} className="flex flex-wrap items-baseline justify-between gap-x-4 px-3 py-2">
                      <span>
                        <b className="font-semibold">{p.caissier.nom}</b>{" "}
                        <span className="text-muted-foreground">· poste {p.posteCourt}</span>
                      </span>
                      <span className="tabular-nums">
                        {pluriel(p.restants, "numéro libre", "numéros libres")}{" "}
                        <span className="text-muted-foreground">({pluriel(p.blocs, "bloc", "blocs")})</span>
                      </span>
                    </li>
                  ))}
              </ul>
            </section>
          ),
        )}

        {anneesCloses.map((a) => (
          <section key={a.annee} aria-label={`Année ${a.annee}`}>
            <h3 className="font-sans text-sm font-semibold">
              {a.annee} · {pluriel(a.nombre, "numéro jamais utilisé", "numéros jamais utilisés")}
            </h3>
            <p className="mt-2 leading-relaxed tabular-nums">{a.numeros.join(", ")}</p>
          </section>
        ))}
      </div>
    </details>
  );
}
