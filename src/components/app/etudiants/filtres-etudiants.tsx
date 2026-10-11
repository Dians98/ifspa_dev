"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { LIBELLE_STATUT_ETUDIANT } from "@/lib/etudiants";
import { libelleNiveau } from "@/lib/parametres";
import type { ListeEtudiants } from "@/server/lectures/etudiants";

const TOUS = "tous";
const DELAI_RECHERCHE_MS = 300;

type Changements = Partial<Record<"q" | "filiereId" | "niveau" | "anneeId" | "statut" | "enRetard", string | null>>;

/** Filtres dans l'URL : la page serveur relit `searchParams` et renvoie la liste (retour arrière et lien partageable restent justes). */
export function FiltresEtudiants({
  filtres,
  options,
}: {
  filtres: ListeEtudiants["filtres"];
  options: ListeEtudiants["options"];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [enCours, demarrer] = useTransition();
  const [q, setQ] = useState(filtres.q ?? "");
  const minuteur = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(minuteur.current), []);

  const actifs = [filtres.q, filtres.filiereId, filtres.niveau, filtres.anneeId, filtres.statut, filtres.enRetard || undefined].some(
    (v) => v !== undefined && v !== "",
  );

  function appliquer(changements: Changements) {
    clearTimeout(minuteur.current);
    const valeurs: Record<string, string | null | undefined> = {
      q: q.trim(),
      filiereId: filtres.filiereId,
      niveau: filtres.niveau ? String(filtres.niveau) : undefined,
      anneeId: filtres.anneeId,
      statut: filtres.statut,
      enRetard: filtres.enRetard ? "1" : undefined,
      ...changements,
    };
    const params = new URLSearchParams();
    for (const [cle, valeur] of Object.entries(valeurs)) if (valeur) params.set(cle, valeur);
    const qs = params.toString();
    demarrer(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  function saisir(valeur: string) {
    setQ(valeur);
    clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => appliquer({ q: valeur.trim() }), DELAI_RECHERCHE_MS);
  }

  function effacer() {
    setQ("");
    clearTimeout(minuteur.current);
    demarrer(() => router.replace(pathname, { scroll: false }));
  }

  const choix = (valeur: string | number | undefined) => (valeur === undefined ? TOUS : String(valeur));
  const versUrl = (v: string) => (v === TOUS ? null : v);

  return (
    <form
      role="search"
      aria-label="Rechercher un étudiant"
      onSubmit={(e) => {
        e.preventDefault();
        appliquer({ q: q.trim() });
      }}
      className="grid gap-3 border-b p-4 sm:p-5"
    >
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="recherche-etudiant"
          type="search"
          value={q}
          onChange={(e) => saisir(e.target.value)}
          placeholder="Nom, prénoms ou matricule (ex. IF-2026-0003)"
          aria-label="Rechercher par nom, prénoms ou matricule"
          autoComplete="off"
          className="pl-9 max-md:h-11"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
        <Select value={choix(filtres.filiereId)} onValueChange={(v) => appliquer({ filiereId: versUrl(v) })}>
          <SelectTrigger aria-label="Filière" className="w-full max-md:h-11">
            <span className="truncate">
              {options.filieres.find((f) => f.id === filtres.filiereId)?.nom ?? "Toutes les filières"}
            </span>
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value={TOUS}>Toutes les filières</SelectItem>
            {options.filieres.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.nom}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={choix(filtres.niveau)} onValueChange={(v) => appliquer({ niveau: versUrl(v) })}>
          <SelectTrigger aria-label="Niveau" className="w-full max-md:h-11">
            <span className="truncate">{filtres.niveau ? libelleNiveau(filtres.niveau) : "Tous les niveaux"}</span>
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value={TOUS}>Tous les niveaux</SelectItem>
            {Array.from({ length: options.niveauMax }, (_, k) => k + 1).map((n) => (
              <SelectItem key={n} value={String(n)}>
                {libelleNiveau(n)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={choix(filtres.anneeId)} onValueChange={(v) => appliquer({ anneeId: versUrl(v) })}>
          <SelectTrigger aria-label="Année scolaire" className="w-full max-md:h-11">
            <span className="truncate">
              {options.annees.find((a) => a.id === filtres.anneeId)?.libelle ?? "Toutes les années"}
            </span>
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value={TOUS}>Toutes les années</SelectItem>
            {options.annees.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.libelle}
                {a.estCourante ? " (courante)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={choix(filtres.statut)} onValueChange={(v) => appliquer({ statut: versUrl(v) })}>
          <SelectTrigger aria-label="Statut" className="w-full max-md:h-11">
            <span className="truncate">{filtres.statut ? LIBELLE_STATUT_ETUDIANT[filtres.statut] : "Tous les statuts"}</span>
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value={TOUS}>Tous les statuts</SelectItem>
            {Object.entries(LIBELLE_STATUT_ETUDIANT).map(([valeur, libelle]) => (
              <SelectItem key={valeur} value={valeur}>
                {libelle}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <label className="col-span-2 flex min-h-8 cursor-pointer items-center gap-2 rounded-lg border border-input px-3 text-sm font-medium whitespace-nowrap has-[:checked]:border-retard has-[:checked]:bg-retard-pale has-[:checked]:text-retard max-md:min-h-11 md:col-span-1">
          <Checkbox
            checked={filtres.enRetard}
            onCheckedChange={(v) => appliquer({ enRetard: v === true ? "1" : null })}
          />
          En retard uniquement
        </label>
      </div>

      {(actifs || enCours) && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {enCours && (
            <span role="status" className="inline-flex items-center gap-1.5">
              <Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
              Mise à jour…
            </span>
          )}
          {actifs && (
            <Button type="button" variant="ghost" size="sm" onClick={effacer} className="ml-auto max-md:h-11">
              <X aria-hidden />
              Effacer les filtres
            </Button>
          )}
        </div>
      )}
    </form>
  );
}
