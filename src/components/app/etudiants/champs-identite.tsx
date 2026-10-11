"use client";

import type { ReactNode, Ref } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { EntreeModificationEtudiant } from "@/lib/etudiants";
import { attributsChamp, ChampFormulaire } from "@/components/app/parametres/champ-formulaire";
import { FieldError } from "@/components/ui/field";
import { cn } from "@/lib/utils";

export type ValeursIdentite = Omit<EntreeModificationEtudiant, "id">;

export const CHAMPS_IDENTITE = [
  "nom",
  "prenoms",
  "sexe",
  "dateNaissance",
  "lieuNaissance",
  "cin",
  "telephone",
  "email",
  "adresse",
] as const;

/** Case à cocher radio présentée en bouton : cible large, état lisible sans la couleur seule. */
export function ChoixRadio({
  id,
  valeur,
  inputRef,
  disabled,
  children,
}: {
  id: string;
  valeur: string;
  inputRef?: Ref<HTMLButtonElement>;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex min-h-8 cursor-pointer items-center gap-2 rounded-lg border border-input bg-background px-3 py-1.5 text-sm font-medium max-md:min-h-11",
        "has-data-[state=checked]:border-primary has-data-[state=checked]:bg-secondary has-data-[state=checked]:text-primary",
        "has-data-disabled:cursor-not-allowed has-data-disabled:opacity-60",
      )}
    >
      <RadioGroupItem id={id} value={valeur} ref={inputRef} disabled={disabled} />
      {children}
    </label>
  );
}

/** Identité et contact : même saisie à l'inscription et à la modification. À placer dans un `FormProvider`. */
export function ChampsIdentite({ prefixe }: { prefixe: string }) {
  const { register, control, formState } = useFormContext<ValeursIdentite>();
  const { errors } = formState;
  const id = (nom: string) => `${prefixe}-${nom}`;

  return (
    <FieldGroup className="grid gap-4 md:grid-cols-2">
      <ChampFormulaire id={id("nom")} libelle="Nom" erreur={errors.nom?.message}>
        <Input
          {...attributsChamp(id("nom"), { erreur: errors.nom?.message })}
          {...register("nom")}
          autoComplete="family-name"
          className="uppercase max-md:h-11"
        />
      </ChampFormulaire>

      <ChampFormulaire id={id("prenoms")} libelle="Prénoms" erreur={errors.prenoms?.message}>
        <Input
          {...attributsChamp(id("prenoms"), { erreur: errors.prenoms?.message })}
          {...register("prenoms")}
          autoComplete="given-name"
          className="max-md:h-11"
        />
      </ChampFormulaire>

      <FieldSet className="md:col-span-2">
        <FieldLegend variant="label">Sexe</FieldLegend>
        <Controller
          control={control}
          name="sexe"
          render={({ field }) => (
            <RadioGroup
              value={field.value ?? ""}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
              aria-invalid={errors.sexe ? true : undefined}
              aria-describedby={errors.sexe ? id("sexe-erreur") : undefined}
              className="flex flex-wrap gap-2"
            >
              <ChoixRadio id={id("sexe-f")} valeur="F" inputRef={field.ref}>
                Féminin
              </ChoixRadio>
              <ChoixRadio id={id("sexe-m")} valeur="M">
                Masculin
              </ChoixRadio>
            </RadioGroup>
          )}
        />
        {errors.sexe?.message && <FieldError id={id("sexe-erreur")}>{errors.sexe.message}</FieldError>}
      </FieldSet>

      <ChampFormulaire id={id("naissance")} libelle="Date de naissance" erreur={errors.dateNaissance?.message}>
        <Input
          {...attributsChamp(id("naissance"), { erreur: errors.dateNaissance?.message })}
          {...register("dateNaissance")}
          type="date"
          min="1900-01-01"
          autoComplete="bday"
          className="max-md:h-11"
        />
      </ChampFormulaire>

      <ChampFormulaire id={id("lieu")} libelle="Lieu de naissance" erreur={errors.lieuNaissance?.message}>
        <Input
          {...attributsChamp(id("lieu"), { erreur: errors.lieuNaissance?.message })}
          {...register("lieuNaissance")}
          placeholder="Ex. : Toamasina"
          autoComplete="off"
          className="max-md:h-11"
        />
      </ChampFormulaire>

      <ChampFormulaire
        id={id("telephone")}
        libelle="Téléphone"
        aide="Numéro malgache, par exemple 034 12 345 67."
        erreur={errors.telephone?.message}
      >
        <Input
          {...attributsChamp(id("telephone"), { aide: true, erreur: errors.telephone?.message })}
          {...register("telephone")}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          className="max-md:h-11"
        />
      </ChampFormulaire>

      <ChampFormulaire id={id("email")} libelle="E-mail (facultatif)" erreur={errors.email?.message}>
        <Input
          {...attributsChamp(id("email"), { erreur: errors.email?.message })}
          {...register("email")}
          type="email"
          autoComplete="email"
          className="max-md:h-11"
        />
      </ChampFormulaire>

      <ChampFormulaire
        id={id("cin")}
        libelle="CIN (facultatif)"
        aide="12 chiffres."
        erreur={errors.cin?.message}
      >
        <Input
          {...attributsChamp(id("cin"), { aide: true, erreur: errors.cin?.message })}
          {...register("cin")}
          inputMode="numeric"
          autoComplete="off"
          className="max-md:h-11"
        />
      </ChampFormulaire>

      <ChampFormulaire id={id("adresse")} libelle="Adresse" erreur={errors.adresse?.message}>
        <Input
          {...attributsChamp(id("adresse"), { erreur: errors.adresse?.message })}
          {...register("adresse")}
          placeholder="Lot, quartier, ville"
          autoComplete="street-address"
          className="max-md:h-11"
        />
      </ChampFormulaire>
    </FieldGroup>
  );
}
