import type { ReactNode } from "react";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";

/** Attributs à poser sur le contrôle : l'aide et l'erreur sont lues avec lui, l'erreur le marque invalide. */
export function attributsChamp(id: string, { erreur, aide }: { erreur?: string; aide?: boolean }) {
  const decrit = [aide ? `${id}-aide` : null, erreur ? `${id}-erreur` : null].filter(Boolean).join(" ");
  return { id, "aria-invalid": erreur ? true : undefined, "aria-describedby": decrit || undefined } as const;
}

/** Libellé relié au contrôle par `id`, aide facultative, erreur annoncée sous le champ. */
export function ChampFormulaire({
  id,
  libelle,
  aide,
  erreur,
  children,
}: {
  id: string;
  libelle: string;
  aide?: ReactNode;
  erreur?: string;
  children: ReactNode;
}) {
  return (
    <Field data-invalid={erreur ? true : undefined}>
      <FieldLabel htmlFor={id}>{libelle}</FieldLabel>
      {children}
      {aide && <FieldDescription id={`${id}-aide`}>{aide}</FieldDescription>}
      {erreur && <FieldError id={`${id}-erreur`}>{erreur}</FieldError>}
    </Field>
  );
}
