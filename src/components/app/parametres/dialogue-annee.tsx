"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ANNEE_DEBUT_MAX,
  ANNEE_DEBUT_MIN,
  libelleAnnee,
  MOIS_DEBUT_POSSIBLES,
  NOMS_MOIS,
  periodeAnnee,
  schemaAnnee,
} from "@/lib/parametres";
import { creerAnnee } from "@/server/actions/parametres";
import { attributsChamp, ChampFormulaire } from "./champ-formulaire";
import { appliquerErreursServeur } from "./erreurs-serveur";
import { MESSAGE_RESEAU } from "./executer-action";

type Entree = z.input<typeof schemaAnnee>;
type Sortie = z.output<typeof schemaAnnee>;

const CHAMPS = ["anneeDebut", "moisDebutEcolage"] as const;

const majuscule = (mot: string) => mot.charAt(0).toUpperCase() + mot.slice(1);

export function DialogueAnnee({
  anneeDebutProposee,
  declencheur,
}: {
  anneeDebutProposee: number;
  declencheur: ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>{declencheur}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <FormulaireAnnee anneeDebutProposee={anneeDebutProposee} fermer={() => setOuvert(false)} />
      </DialogContent>
    </Dialog>
  );
}

function FormulaireAnnee({ anneeDebutProposee, fermer }: { anneeDebutProposee: number; fermer: () => void }) {
  const router = useRouter();
  const [erreurGenerale, setErreurGenerale] = useState<string | null>(null);
  const form = useForm<Entree, unknown, Sortie>({
    resolver: zodResolver(schemaAnnee),
    defaultValues: { anneeDebut: anneeDebutProposee, moisDebutEcolage: 10 },
  });
  const { errors, isSubmitting } = form.formState;
  const [anneeDebut, mois] = useWatch({ control: form.control, name: ["anneeDebut", "moisDebutEcolage"] });
  const apercuValide =
    Number.isInteger(anneeDebut) &&
    anneeDebut >= ANNEE_DEBUT_MIN &&
    anneeDebut <= ANNEE_DEBUT_MAX &&
    MOIS_DEBUT_POSSIBLES.some((m) => m === mois);

  const soumettre = form.handleSubmit(async (valeurs) => {
    setErreurGenerale(null);
    try {
      const etat = await creerAnnee(valeurs);
      if (etat.statut === "succes") {
        toast.success(etat.message, {
          action: {
            label: "Saisir les tarifs",
            onClick: () => router.push(`/app/parametres/tarifs?annee=${etat.donnees.id}`),
          },
        });
        fermer();
      } else setErreurGenerale(appliquerErreursServeur(form, etat, CHAMPS));
    } catch {
      setErreurGenerale(MESSAGE_RESEAU);
    }
  });

  return (
    <form onSubmit={soumettre} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle className="text-lg">Nouvelle année scolaire</DialogTitle>
        <DialogDescription>
          Elle est créée en préparation. Saisissez ses tarifs, puis définissez-la comme année courante à la rentrée.
        </DialogDescription>
      </DialogHeader>

      {erreurGenerale && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-retard-pale px-3 py-2 text-sm text-destructive">
          {erreurGenerale}
        </p>
      )}

      <FieldGroup className="gap-4">
        <ChampFormulaire id="annee-debut" libelle="Année de début" erreur={errors.anneeDebut?.message}>
          <Input
            {...attributsChamp("annee-debut", { erreur: errors.anneeDebut?.message })}
            {...form.register("anneeDebut", { valueAsNumber: true })}
            inputMode="numeric"
            autoComplete="off"
            className="max-md:h-11"
          />
        </ChampFormulaire>

        <ChampFormulaire id="annee-mois" libelle="Premier mois des mensualités" erreur={errors.moisDebutEcolage?.message}>
          <Controller
            control={form.control}
            name="moisDebutEcolage"
            render={({ field }) => (
              <Select value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))}>
                <SelectTrigger
                  ref={field.ref}
                  onBlur={field.onBlur}
                  className="w-full max-md:h-11"
                  {...attributsChamp("annee-mois", { erreur: errors.moisDebutEcolage?.message })}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {MOIS_DEBUT_POSSIBLES.map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {majuscule(NOMS_MOIS[m - 1])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </ChampFormulaire>
      </FieldGroup>

      {apercuValide && (
        <p aria-live="polite" className="rounded-lg bg-rose-pale px-3 py-2 text-sm text-rose-fonce">
          Année <strong className="tabular-nums">{libelleAnnee(anneeDebut)}</strong> : mensualités de{" "}
          {periodeAnnee(anneeDebut, mois ?? 10)}.
        </p>
      )}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" className="max-md:h-11">
            Annuler
          </Button>
        </DialogClose>
        <Button type="submit" disabled={isSubmitting} className="max-md:h-11">
          {isSubmitting && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}
          Créer l&apos;année
        </Button>
      </DialogFooter>
    </form>
  );
}
