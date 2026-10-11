import { TriangleAlert } from "lucide-react";
import { SEUIL_TAUX_BAS } from "@/lib/dashboard";
import { cn } from "@/lib/utils";

/** « 85,7 % », espace insécable avant le signe. */
export function formaterTaux(valeur: number): string {
  return `${valeur.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
}

/** Jauge simple : la barre est décorative, le pourcentage en texte porte l'information (sous le seuil : orange, icône et texte). */
export function JaugeTaux({
  valeur,
  bas,
  className,
  barreSeule = false,
}: {
  valeur: number | null;
  bas: boolean;
  className?: string;
  /** La valeur est déjà écrite à côté : seule la barre est dessinée. */
  barreSeule?: boolean;
}) {
  if (valeur === null) {
    if (barreSeule) return null;
    return (
      <span className={cn("text-muted-foreground", className)}>
        —<span className="sr-only"> Rien n&apos;est encore échu</span>
      </span>
    );
  }
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div aria-hidden className="h-2 min-w-16 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", bas ? "bg-attention" : "bg-primary")} style={{ width: `${Math.min(valeur, 100)}%` }} />
      </div>
      {!barreSeule && (
        <span className={cn("flex shrink-0 items-center gap-1 font-semibold tabular-nums", bas && "text-attention")}>
          {bas && <TriangleAlert className="size-3.5" aria-hidden />}
          {formaterTaux(valeur)}
          {bas && <span className="sr-only"> , sous {SEUIL_TAUX_BAS} %</span>}
        </span>
      )}
    </div>
  );
}
