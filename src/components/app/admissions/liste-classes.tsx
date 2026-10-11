import Link from "next/link";
import { Circle, CircleCheck, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClasseAdmission } from "@/server/lectures/admissions";

export const lienClasse = (cle: string) => `/app/admissions?classe=${encodeURIComponent(cle)}`;

function EtatClasse({ c }: { c: ClasseAdmission }) {
  const base = "inline-flex items-center gap-1 text-xs font-semibold whitespace-nowrap";
  switch (c.etat) {
    case "validee":
      return (
        <span className={cn(base, "text-paye")}>
          <CircleCheck aria-hidden className="size-4" />
          {c.libelleEtat}
        </span>
      );
    case "tarif_manquant":
    case "cible_absente":
      return (
        <span className={cn(base, "text-attention")}>
          <TriangleAlert aria-hidden className="size-4" />
          {c.libelleEtat}
        </span>
      );
    case "vide":
      return <span className={cn(base, "text-muted-foreground")}>{c.libelleEtat}</span>;
    default:
      return (
        <span className={cn(base, "text-muted-foreground")}>
          <Circle aria-hidden className="size-3.5" />
          {c.libelleEtat}
        </span>
      );
  }
}

/** Classes groupées par filière : ordinateur en colonne, téléphone en grille au-dessus de la classe choisie. */
export function ListeClasses({ classes, courante }: { classes: ClasseAdmission[]; courante: string | null }) {
  const filieres = [...new Map(classes.map((c) => [c.filiere.id, c.filiere])).values()];

  return (
    <nav aria-label="Classes" className="rounded-xl border bg-card p-3 lg:sticky lg:top-20">
      {filieres.map((f, rang) => (
        <section key={f.id} aria-labelledby={`filiere-${f.id}`} className={cn(rang > 0 && "mt-4")}>
          <h2 id={`filiere-${f.id}`} className="mb-1.5 flex items-center gap-2 px-1 text-xs font-semibold text-muted-foreground">
            <span aria-hidden className={cn("size-2 rounded-full", rang % 2 === 0 ? "bg-bleu" : "bg-rose")} />
            {f.nom}
          </h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1 lg:gap-0.5">
            {classes
              .filter((c) => c.filiere.id === f.id)
              .map((c) => (
                <li key={c.cle}>
                  <Link
                    href={lienClasse(c.cle)}
                    aria-current={c.cle === courante ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 flex-col gap-0.5 rounded-lg border px-3 py-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-x-3 lg:border-transparent",
                      c.cle === courante ? "border-bleu/40 bg-secondary" : "hover:bg-muted",
                      c.etat === "vide" && "text-muted-foreground",
                    )}
                  >
                    <span className={cn("text-sm font-semibold", c.cle === courante && "text-primary")}>{c.libelleNiveau}</span>
                    <span className="lg:row-span-2 lg:col-start-2 lg:row-start-1">
                      <EtatClasse c={c} />
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums max-sm:hidden lg:block">
                      {c.effectif} étudiant{c.effectif > 1 ? "s" : ""}
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}
