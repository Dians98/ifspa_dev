import type { FieldPath, FieldValues, UseFormReturn } from "react-hook-form";
import type { EtatErreur } from "@/lib/etat-action";

/**
 * Reporte les erreurs par champ du serveur sur le formulaire et focalise le premier champ en erreur.
 * Renvoie le message général à afficher quand aucune erreur ne correspond à un champ.
 */
export function appliquerErreursServeur<T extends FieldValues>(
  form: UseFormReturn<T>,
  etat: EtatErreur,
  champs: readonly FieldPath<T>[],
): string | null {
  const connus = Object.entries(etat.erreurs ?? {}).filter(([chemin]) => champs.includes(chemin as FieldPath<T>));
  connus.forEach(([chemin, message], i) => {
    form.setError(chemin as FieldPath<T>, { type: "serveur", message }, { shouldFocus: i === 0 });
  });
  return connus.length > 0 ? null : etat.message;
}
