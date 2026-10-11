"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { libelleNiveau } from "@/lib/parametres";
import { cn } from "@/lib/utils";
import type { ListeImpayes } from "@/server/lectures/paiements";

const MOIS_MIN = [2, 3, 4, 6];

/** Filtres de la liste, portés par l'adresse de la page : l'export Excel reprend les mêmes. */
export function FiltresImpayes({ filtres, options }: Pick<ListeImpayes, "filtres" | "options">) {
  const router = useRouter();
  const pathname = usePathname();
  const courants = useSearchParams();
  const [enCours, demarrer] = useTransition();
  const [recherche, setRecherche] = useState(filtres.q ?? "");
  const minuteur = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(minuteur.current), []);

  function appliquer(cle: string, valeur: string | undefined) {
    const params = new URLSearchParams(courants.toString());
    if (!valeur || valeur === "tous") params.delete(cle);
    else params.set(cle, valeur);
    const qs = params.toString();
    demarrer(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  return (
    <div role="search" aria-label="Filtrer les impayés" className={cn("grid gap-3 border-b p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]", enCours && "opacity-70")}>
      <div className="relative sm:col-span-2 lg:col-span-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          aria-label="Rechercher un étudiant"
          placeholder="Nom ou matricule…"
          value={recherche}
          autoComplete="off"
          onChange={(e) => {
            setRecherche(e.target.value);
            clearTimeout(minuteur.current);
            minuteur.current = setTimeout(() => appliquer("q", e.target.value.trim()), 400);
          }}
          className="h-10 pl-9 md:h-9"
        />
      </div>

      <Select value={filtres.filiereId ?? "tous"} onValueChange={(v) => appliquer("filiereId", v)}>
        <SelectTrigger aria-label="Filière" className="h-10 w-full md:h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectItem value="tous">Toutes les filières</SelectItem>
          {options.filieres.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.nom}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filtres.niveau ? String(filtres.niveau) : "tous"} onValueChange={(v) => appliquer("niveau", v)}>
        <SelectTrigger aria-label="Niveau" className="h-10 w-full md:h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectItem value="tous">Tous les niveaux</SelectItem>
          {Array.from({ length: options.niveauMax }, (_, i) => i + 1).map((n) => (
            <SelectItem key={n} value={String(n)}>
              {libelleNiveau(n)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filtres.moisMin ? String(filtres.moisMin) : "tous"} onValueChange={(v) => appliquer("moisMin", v)}>
        <SelectTrigger aria-label="Mois de retard" className="h-10 w-full md:h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectItem value="tous">Tout retard</SelectItem>
          {MOIS_MIN.map((n) => (
            <SelectItem key={n} value={String(n)}>
              {n} mois et plus
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
