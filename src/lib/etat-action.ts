import type { z } from "zod";

// État renvoyé par toutes les Server Actions : sérialisable, messages en français affichables tels quels.

export type EtatSucces<D> = { statut: "succes"; message: string; donnees: D };
export type EtatErreur = {
  statut: "erreur";
  message: string;
  /** Erreur par champ ; clé = chemin du champ (« code », « lignes.2.montantMensuel »). */
  erreurs?: Record<string, string>;
};
export type EtatAction<D = undefined> = EtatSucces<D> | EtatErreur;

export function succes(message: string): EtatSucces<undefined>;
export function succes<D>(message: string, donnees: D): EtatSucces<D>;
export function succes<D>(message: string, donnees?: D): EtatSucces<D | undefined> {
  return { statut: "succes", message, donnees };
}

export function echec(message: string, erreurs?: Record<string, string>): EtatErreur {
  return erreurs ? { statut: "erreur", message, erreurs } : { statut: "erreur", message };
}

/** Première erreur de chaque champ, indexée par son chemin. */
export function erreursZod(error: z.ZodError): Record<string, string> {
  const erreurs: Record<string, string> = {};
  for (const issue of error.issues) {
    const cle = issue.path.map(String).join(".") || "_";
    if (!(cle in erreurs)) erreurs[cle] = issue.message;
  }
  return erreurs;
}

export function echecValidation(error: z.ZodError): EtatErreur {
  return echec("Vérifiez les champs signalés.", erreursZod(error));
}
