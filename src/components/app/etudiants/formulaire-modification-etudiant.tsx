"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Lock } from "lucide-react";
import { FormProvider, useForm, type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { schemaModificationEtudiant } from "@/lib/etudiants";
import { modifierEtudiant } from "@/server/actions/etudiants";
import { appliquerErreursServeur } from "@/components/app/parametres/erreurs-serveur";
import { MESSAGE_RESEAU } from "@/components/app/parametres/executer-action";
import { PanneauParametre } from "@/components/app/parametres/panneau-parametre";
import { CHAMPS_IDENTITE, ChampsIdentite } from "./champs-identite";

type Entree = z.input<typeof schemaModificationEtudiant>;
type Sortie = z.output<typeof schemaModificationEtudiant>;

type Props = {
  id: string;
  valeurs: Omit<Entree, "id">;
  verrouille: { matricule: string; filiere: string; niveau: string | null; anneeEntree: string };
};

export function FormulaireModificationEtudiant({ id, valeurs, verrouille }: Props) {
  const router = useRouter();
  const [erreurGenerale, setErreurGenerale] = useState<string | null>(null);
  const [redirige, setRedirige] = useState(false);
  const form = useForm<Entree, unknown, Sortie>({
    resolver: zodResolver(schemaModificationEtudiant),
    defaultValues: { id, ...valeurs },
  });
  const occupe = form.formState.isSubmitting || redirige;
  const retour = `/app/etudiants/${id}`;

  const soumettre = form.handleSubmit(async () => {
    setErreurGenerale(null);
    try {
      const etat = await modifierEtudiant({ ...form.getValues(), id });
      if (etat.statut === "succes") {
        setRedirige(true);
        toast.success(etat.message);
        router.push(retour);
        return;
      }
      setErreurGenerale(appliquerErreursServeur(form as unknown as UseFormReturn<Entree>, etat, CHAMPS_IDENTITE));
    } catch {
      setErreurGenerale(MESSAGE_RESEAU);
    }
  });

  return (
    <FormProvider {...form}>
      <form onSubmit={soumettre} noValidate className="grid max-w-4xl gap-5">
        {erreurGenerale && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-retard-pale px-3 py-2 text-sm text-destructive">
            {erreurGenerale}
          </p>
        )}

        <PanneauParametre titre="Identité et contact" description="Tous les champs sont obligatoires, sauf ceux marqués facultatif.">
          <div className="p-4 sm:p-5">
            <ChampsIdentite prefixe="modification" />
          </div>
        </PanneauParametre>

        <PanneauParametre
          titre="Informations verrouillées"
          description="Elles ne se modifient pas : le matricule reste le même pendant toute la scolarité."
        >
          <dl className="grid gap-x-6 gap-y-3 p-4 text-sm sm:grid-cols-2 sm:p-5">
            {[
              ["Matricule", verrouille.matricule],
              ["Filière", verrouille.filiere],
              ["Niveau actuel", verrouille.niveau ?? "Non inscrit"],
              ["Année d'entrée", verrouille.anneeEntree],
            ].map(([libelle, valeur]) => (
              <div key={libelle}>
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  <Lock aria-hidden className="size-3.5" />
                  {libelle}
                </dt>
                <dd className="mt-0.5 font-medium tabular-nums">{valeur}</dd>
              </div>
            ))}
          </dl>
        </PanneauParametre>

        <div className="flex flex-wrap justify-end gap-3">
          <Button asChild variant="outline" className="max-md:h-11 max-sm:flex-1">
            <Link href={retour}>Annuler</Link>
          </Button>
          <Button type="submit" disabled={occupe} className="max-md:h-11 max-sm:flex-1">
            {occupe && <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" />}
            Enregistrer les modifications
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
