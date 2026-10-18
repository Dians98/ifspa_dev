"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ListePaiements } from "@/server/lectures/paiements";

const MODES = [
  ["tous", "Tous les modes"],
  ["ESPECES", "Espèces"],
  ["MOBILE_MONEY", "Mobile Money (tous)"],
  ["MVOLA", "MVola"],
  ["ORANGE_MONEY", "Orange Money"],
  ["AIRTEL_MONEY", "Airtel Money"],
] as const;

const STATUTS = [
  ["tous", "Valides et annulés"],
  ["valides", "Valides seulement"],
  ["annules", "Annulés seulement"],
  ["aVerifier", "À vérifier"],
] as const;

const PERIODES = [
  ["jour", "Un jour"],
  ["mois", "Un mois"],
  ["annee", "Une année scolaire"],
  ["plage", "Entre deux dates"],
] as const;

const PARAMS_PERIODE = ["jour", "mois", "anneeId", "du", "au"];

type Props = Pick<ListePaiements, "filtres" | "periode" | "caissiers" | "annees">;

/** Les filtres vivent dans l'adresse de la page : un lien ou un rechargement retrouve la même liste. */
export function FiltresPaiements({ filtres, periode, caissiers, annees }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const courants = useSearchParams();
  const [enCours, demarrer] = useTransition();
  const [recherche, setRecherche] = useState(filtres.q ?? "");
  const minuteur = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(minuteur.current), []);

  function appliquer(modifs: Record<string, string | undefined>, effacer: string[] = []) {
    const params = new URLSearchParams(courants.toString());
    for (const cle of effacer) params.delete(cle);
    for (const [cle, valeur] of Object.entries(modifs)) {
      if (valeur === undefined || valeur === "" || valeur === "tous") params.delete(cle);
      else params.set(cle, valeur);
    }
    params.delete("page");
    const qs = params.toString();
    demarrer(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  function changerPeriode(valeur: string) {
    appliquer(valeur === "jour" ? {} : { periode: valeur }, ["periode", ...PARAMS_PERIODE]);
  }

  const anneeCourante = annees.find((a) => a.estCourante)?.id ?? annees[0]?.id;
  const anneeChoisie = filtres.anneeId ?? anneeCourante;

  return (
    <div role="search" aria-label="Filtrer les paiements" className={cn("grid gap-3 border-b p-4 sm:p-5", enCours && "opacity-70")}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            aria-label="Rechercher un reçu, un étudiant, une note ou un n° de reçu papier"
            placeholder="Reçu, nom, matricule, note, reçu papier…"
            value={recherche}
            autoComplete="off"
            onChange={(e) => {
              setRecherche(e.target.value);
              clearTimeout(minuteur.current);
              minuteur.current = setTimeout(() => appliquer({ q: e.target.value.trim() }), 400);
            }}
            className="h-10 pl-9 md:h-9"
          />
        </div>

        <Select value={filtres.mode} onValueChange={(v) => appliquer({ mode: v })}>
          <SelectTrigger aria-label="Mode de paiement" className="h-10 w-full md:h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {MODES.map(([valeur, libelle]) => (
              <SelectItem key={valeur} value={valeur}>
                {libelle}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filtres.caissierId ?? "tous"} onValueChange={(v) => appliquer({ caissierId: v })}>
          <SelectTrigger aria-label="Caissier" className="h-10 w-full md:h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value="tous">Tous les caissiers</SelectItem>
            {caissiers.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nom}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filtres.statut} onValueChange={(v) => appliquer({ statut: v })}>
          <SelectTrigger aria-label="Statut" className="h-10 w-full md:h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {STATUTS.map(([valeur, libelle]) => (
              <SelectItem key={valeur} value={valeur}>
                {libelle}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={filtres.periode} onValueChange={changerPeriode}>
          <SelectTrigger aria-label="Type de période" className="h-10 w-full sm:w-52 md:h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {PERIODES.map(([valeur, libelle]) => (
              <SelectItem key={valeur} value={valeur}>
                {libelle}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {filtres.periode === "jour" && (
          <Input
            type="date"
            aria-label="Jour"
            value={filtres.jour ?? periode.du}
            onChange={(e) => appliquer({ jour: e.target.value })}
            className="h-10 w-full sm:w-44 md:h-9"
          />
        )}
        {filtres.periode === "mois" && (
          <Input
            type="month"
            aria-label="Mois"
            value={filtres.mois ?? periode.du.slice(0, 7)}
            onChange={(e) => appliquer({ mois: e.target.value })}
            className="h-10 w-full sm:w-44 md:h-9"
          />
        )}
        {filtres.periode === "annee" && (
          <Select value={anneeChoisie} onValueChange={(v) => appliquer({ anneeId: v })}>
            <SelectTrigger aria-label="Année scolaire" className="h-10 w-full sm:w-44 md:h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {annees.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.libelle}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {filtres.periode === "plage" && (
          <>
            <Input
              type="date"
              aria-label="Du"
              value={filtres.du ?? periode.du}
              onChange={(e) => appliquer({ du: e.target.value })}
              className="h-10 w-full sm:w-44 md:h-9"
            />
            <Input
              type="date"
              aria-label="Au"
              value={filtres.au ?? periode.au}
              onChange={(e) => appliquer({ au: e.target.value })}
              className="h-10 w-full sm:w-44 md:h-9"
            />
          </>
        )}
      </div>
    </div>
  );
}
