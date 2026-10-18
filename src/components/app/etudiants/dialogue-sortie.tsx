"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, LogOut, TriangleAlert } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { appliquerErreursServeur } from "@/components/app/parametres/erreurs-serveur";
import { MESSAGE_RESEAU } from "@/components/app/parametres/executer-action";
import { attributsChamp, ChampFormulaire } from "@/components/app/parametres/champ-formulaire";
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
import { FieldError, FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { formaterAriary } from "@/lib/montant";
import { lireJour } from "@/lib/dates";
import {
  apercuSortie,
  LIBELLE_TYPE_SORTIE,
  messageApercuSortie,
  schemaSortie,
  type EcheanceAvantSortie,
} from "@/lib/sorties";
import { enregistrerSortie } from "@/server/actions/sorties";
import { ChoixRadio } from "./champs-identite";

type Entree = z.input<typeof schemaSortie>;
type Sortie = z.output<typeof schemaSortie>;

const CHAMPS = ["type", "date", "motif"] as const;

function jourValide(v: string | undefined): v is string {
  if (!v) return false;
  try {
    lireJour(v);
    return true;
  } catch {
    return false;
  }
}

/** Admin seulement, étudiant actif : la sortie est définitive, la fenêtre est la seule confirmation. */
export function DialogueSortie({
  etudiantId,
  jour,
  echeances,
}: {
  etudiantId: string;
  /** Aujourd'hui (Madagascar), « AAAA-MM-JJ » : date proposée et borne haute. */
  jour: string;
  echeances: EcheanceAvantSortie[];
}) {
  const [ouvert, setOuvert] = useState(false);

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full text-destructive max-md:h-11">
          <LogOut aria-hidden />
          Enregistrer une sortie
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <FormulaireSortie etudiantId={etudiantId} jour={jour} echeances={echeances} fermer={() => setOuvert(false)} />
      </DialogContent>
    </Dialog>
  );
}

function FormulaireSortie({
  etudiantId,
  jour,
  echeances,
  fermer,
}: {
  etudiantId: string;
  jour: string;
  echeances: EcheanceAvantSortie[];
  fermer: () => void;
}) {
  const [erreurGenerale, setErreurGenerale] = useState<string | null>(null);
  const form = useForm<Entree, unknown, Sortie>({
    resolver: zodResolver(schemaSortie),
    defaultValues: { etudiantId, type: "ABANDON", date: jour, motif: "" },
  });
  const { errors, isSubmitting } = form.formState;
  const type = useWatch({ control: form.control, name: "type" });
  const date = useWatch({ control: form.control, name: "date" });
  const apercu = jourValide(date) ? messageApercuSortie(apercuSortie(echeances, date), formaterAriary) : null;

  const soumettre = form.handleSubmit(async (valeurs) => {
    setErreurGenerale(null);
    try {
      const etat = await enregistrerSortie(valeurs);
      if (etat.statut === "succes") {
        toast.success(etat.message);
        fermer();
      } else setErreurGenerale(appliquerErreursServeur(form, etat, CHAMPS));
    } catch {
      setErreurGenerale(MESSAGE_RESEAU);
    }
  });

  return (
    <form onSubmit={soumettre} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle className="text-lg">Enregistrer une sortie</DialogTitle>
        <DialogDescription>L&apos;étudiant n&apos;apparaîtra plus dans les passages en année supérieure.</DialogDescription>
      </DialogHeader>

      <div className="flex gap-2.5 rounded-lg border border-attention/30 bg-attention-pale px-3 py-2.5 text-sm">
        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-attention" />
        <p>
          Cette sortie est <strong>définitive</strong>. Les mois après la sortie sans aucun paiement ne seront plus dus.{" "}
          <span aria-live="polite" className="font-semibold tabular-nums">
            {apercu ?? "Indiquez la date de sortie pour voir ce qui restera à payer."}
          </span>
        </p>
      </div>

      {erreurGenerale && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-retard-pale px-3 py-2 text-sm text-destructive">
          {erreurGenerale}
        </p>
      )}

      <FieldGroup className="gap-4">
        <FieldSet>
          <FieldLegend variant="label">Type de sortie</FieldLegend>
          <Controller
            control={form.control}
            name="type"
            render={({ field }) => (
              <RadioGroup
                value={field.value ?? ""}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                aria-invalid={errors.type ? true : undefined}
                aria-describedby={errors.type ? "sortie-type-erreur" : undefined}
                className="flex flex-wrap gap-2"
              >
                <ChoixRadio id="sortie-abandon" valeur="ABANDON" inputRef={field.ref}>
                  {LIBELLE_TYPE_SORTIE.ABANDON}
                </ChoixRadio>
                <ChoixRadio id="sortie-exclu" valeur="EXCLU">
                  {LIBELLE_TYPE_SORTIE.EXCLU}
                </ChoixRadio>
              </RadioGroup>
            )}
          />
          {errors.type?.message && <FieldError id="sortie-type-erreur">{errors.type.message}</FieldError>}
        </FieldSet>

        <ChampFormulaire id="sortie-date" libelle="Date de sortie" erreur={errors.date?.message}>
          <Input
            {...attributsChamp("sortie-date", { erreur: errors.date?.message })}
            {...form.register("date")}
            type="date"
            max={jour}
            className="max-md:h-11"
          />
        </ChampFormulaire>

        <ChampFormulaire
          id="sortie-motif"
          libelle="Motif"
          aide="Obligatoire : il reste visible dans le parcours de l'étudiant."
          erreur={errors.motif?.message}
        >
          <Textarea
            {...attributsChamp("sortie-motif", { erreur: errors.motif?.message, aide: true })}
            {...form.register("motif")}
            rows={3}
            placeholder="Ex. a quitté l'institut pour raison familiale"
          />
        </ChampFormulaire>
      </FieldGroup>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" disabled={isSubmitting} className="max-md:h-11">
            Annuler
          </Button>
        </DialogClose>
        <Button type="submit" variant="destructive" disabled={isSubmitting} className="max-md:h-11">
          {isSubmitting && <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" />}
          {type === "EXCLU" ? "Enregistrer l'exclusion" : "Enregistrer l'abandon"}
        </Button>
      </DialogFooter>
    </form>
  );
}
