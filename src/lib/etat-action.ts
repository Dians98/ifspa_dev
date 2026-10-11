import type { z } from "zod";

// État renvoyé par toutes les Server Actions : sérialisable, messages en français affichables tels quels.

export type EtatSucces<D> = { statut: "succes"; message: string; donnees: D };
export type EtatErreur = {
  statut: "erreur";
  message: string;
  /** Erreur par champ ; clé = chemin du champ (« code », « lignes.2.montantMensuel »). */
  erreurs?: Record<string, string>;
  /** Cas que l'écran traite à part (ex. « DOUBLON_POSSIBLE » : proposer de confirmer). */
  code?: CodeErreur;
};
export type EtatAction<D = undefined> = EtatSucces<D> | EtatErreur;

export type CodeErreur = "DOUBLON_POSSIBLE" | "SITUATION_CHANGEE" | "INTROUVABLE";

export function succes(message: string): EtatSucces<undefined>;
export function succes<D>(message: string, donnees: D): EtatSucces<D>;
export function succes<D>(message: string, donnees?: D): EtatSucces<D | undefined> {
  return { statut: "succes", message, donnees };
}

export function echec(message: string, erreurs?: Record<string, string>): EtatErreur {
  return erreurs ? { statut: "erreur", message, erreurs } : { statut: "erreur", message };
}

export function echecCode(code: CodeErreur, message: string): EtatErreur {
  return { statut: "erreur", message, code };
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

/** Pour un écran sans champ de saisie à signaler : le premier message devient le message général. */
export function echecValidationGlobale(error: z.ZodError): EtatErreur {
  const etat = echecValidation(error);
  return { ...etat, message: error.issues[0]?.message ?? etat.message };
}
