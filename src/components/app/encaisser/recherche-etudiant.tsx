"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { chercherAuGuichet } from "@/server/actions/paiements";
import type { ResultatGuichet } from "@/server/lectures/paiements";
import { BadgesSituation } from "./badge-situation";

const MIN_CARACTERES = 2;
const DELAI_MS = 200;

type Etat = { terme: string; liste: ResultatGuichet[]; erreur: boolean };

/** Recherche au clavier : flèches, Entrée pour choisir, Échap pour effacer. Sans saisie, les derniers servis. */
export function RechercheEtudiant({
  derniers,
  onChoisir,
  desactive,
}: {
  derniers: ResultatGuichet[];
  onChoisir: (etudiant: ResultatGuichet) => void;
  desactive?: boolean;
}) {
  const id = useId();
  const champ = useRef<HTMLInputElement>(null);
  const [saisie, setSaisie] = useState("");
  const [etat, setEtat] = useState<Etat | null>(null);
  const [actifBrut, setActif] = useState(-1);

  const terme = saisie.trim();
  const recherche = terme.length >= MIN_CARACTERES;
  const enAttente = recherche && etat?.terme !== terme;
  const liste = !recherche ? derniers : etat?.terme === terme ? etat.liste : [];
  const erreur = recherche && etat?.terme === terme && etat.erreur;
  const actif = Math.min(actifBrut, liste.length - 1);

  useEffect(() => champ.current?.focus(), []);

  useEffect(() => {
    if (terme.length < MIN_CARACTERES) return;
    let annule = false;
    const minuteur = setTimeout(async () => {
      try {
        const resultats = await chercherAuGuichet(terme);
        if (!annule) setEtat({ terme, liste: resultats, erreur: false });
      } catch {
        if (!annule) setEtat({ terme, liste: [], erreur: true });
      }
    }, DELAI_MS);
    return () => {
      annule = true;
      clearTimeout(minuteur);
    };
  }, [terme]);

  function surSaisie(valeur: string) {
    setSaisie(valeur);
    setActif(valeur.trim().length >= MIN_CARACTERES ? 0 : -1);
  }

  function surTouche(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (liste.length === 0) return;
      const suivant = e.key === "ArrowDown" ? (actif + 1) % liste.length : actif <= 0 ? liste.length - 1 : actif - 1;
      setActif(suivant);
      document.getElementById(`${id}-option-${suivant}`)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      const choisi = liste[actif];
      if (choisi) onChoisir(choisi);
    } else if (e.key === "Escape" && saisie) {
      e.preventDefault();
      surSaisie("");
    }
  }

  let titre = "Derniers servis";
  if (recherche) {
    if (enAttente) titre = "Recherche en cours…";
    else if (erreur) titre = "Recherche impossible";
    else if (liste.length === 0) titre = "Aucun résultat";
    else titre = `${liste.length} étudiant${liste.length > 1 ? "s" : ""} trouvé${liste.length > 1 ? "s" : ""}`;
  } else if (terme.length > 0) {
    titre = "Tapez au moins 2 caractères";
  }

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          ref={champ}
          type="search"
          role="combobox"
          aria-label="Rechercher l'étudiant par nom, prénoms ou matricule"
          aria-autocomplete="list"
          aria-expanded={liste.length > 0}
          aria-controls={`${id}-liste`}
          aria-activedescendant={actif >= 0 ? `${id}-option-${actif}` : undefined}
          placeholder="Nom, prénoms ou matricule"
          autoComplete="off"
          spellCheck={false}
          value={saisie}
          disabled={desactive}
          onChange={(e) => surSaisie(e.target.value)}
          onKeyDown={surTouche}
          className="h-14 pl-12 text-base md:text-base"
        />
        {enAttente && (
          <Loader2 className="absolute top-1/2 right-4 size-5 -translate-y-1/2 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden />
        )}
      </div>

      <p id={`${id}-titre`} role="status" className="mt-4 mb-1.5 text-sm font-semibold text-muted-foreground">
        {titre}
      </p>

      {erreur && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-retard-pale px-3 py-2 text-sm text-destructive">
          La recherche a échoué. Vérifiez la connexion Internet, puis tapez de nouveau.
        </p>
      )}

      <ul id={`${id}-liste`} role="listbox" aria-labelledby={`${id}-titre`} className="-mx-2 grid gap-0.5">
        {liste.map((e, i) => (
          <li
            key={e.id}
            id={`${id}-option-${i}`}
            role="option"
            aria-selected={i === actif}
            onClick={() => onChoisir(e)}
            className={cn(
              "flex min-h-14 cursor-pointer flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg px-2 py-2 hover:bg-muted",
              i === actif && "bg-secondary ring-1 ring-ring/40",
            )}
          >
            <span className="min-w-0">
              <b className="block font-semibold">
                {e.nom} {e.prenoms}
              </b>
              <span className="block text-sm text-muted-foreground">
                {e.matricule} · {e.filiereCode}
                {e.niveau ? ` · ${e.niveau}` : ""}
              </span>
            </span>
            <BadgesSituation etudiant={e} />
          </li>
        ))}
      </ul>

      {!recherche && derniers.length === 0 && terme.length === 0 && (
        <p className="py-3 text-sm text-muted-foreground">
          Les étudiants que vous venez d&apos;encaisser apparaîtront ici. Pour commencer, tapez un nom ou un matricule.
        </p>
      )}
      {recherche && !enAttente && !erreur && liste.length === 0 && (
        <p className="py-2 text-sm text-muted-foreground">
          Aucun étudiant à encaisser ne correspond à « {terme} ». Vérifiez l&apos;orthographe ou tapez le matricule.
        </p>
      )}
    </div>
  );
}
