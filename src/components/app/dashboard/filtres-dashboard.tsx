"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Dashboard } from "@/server/lectures/dashboard";

type Props = Pick<Dashboard, "filtres" | "options">;

const TOUTES = "toutes";

/** Année et filière vivent dans l'adresse : un lien ou un rechargement retrouve le même tableau. */
export function FiltresDashboard({ filtres, options }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const courants = useSearchParams();
  const [enCours, demarrer] = useTransition();

  function appliquer(cle: "anneeId" | "filiereId", valeur: string) {
    const params = new URLSearchParams(courants.toString());
    if (valeur === TOUTES) params.delete(cle);
    else params.set(cle, valeur);
    const qs = params.toString();
    demarrer(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  return (
    <div role="search" aria-label="Choisir l'année et la filière" className={cn("flex flex-wrap gap-2", enCours && "opacity-70")} aria-busy={enCours}>
      <Select value={filtres.filiereId ?? TOUTES} onValueChange={(v) => appliquer("filiereId", v)}>
        <SelectTrigger aria-label="Filière" className="w-full max-md:h-11 sm:w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectItem value={TOUTES}>Toutes les filières</SelectItem>
          {options.filieres.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.nom}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={filtres.anneeId ?? undefined} onValueChange={(v) => appliquer("anneeId", v)}>
        <SelectTrigger aria-label="Année scolaire" className="w-full max-md:h-11 sm:w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          {options.annees.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.libelle}
              {a.estCourante ? " (en cours)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
