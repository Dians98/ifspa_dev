// Formats du matricule et du numéro de reçu, et clés du Compteur. Pur : la séquence vient de la base.

export const SEQUENCE_MATRICULE_MAX = 9999;
export const SEQUENCE_RECU_MAX = 99999;

function verifierSequence(seq: number, max: number, quoi: string): void {
  if (!Number.isInteger(seq) || seq < 1) throw new RangeError(`Séquence de ${quoi} invalide : ${seq}.`);
  if (seq > max) {
    throw new RangeError(`Plus de numéro de ${quoi} disponible (maximum ${max}). Prévenez le responsable technique.`);
  }
}

function verifierAnnee(annee: number): void {
  if (!Number.isInteger(annee) || annee < 1000 || annee > 9999) throw new RangeError(`Année invalide : ${annee}.`);
}

/** `IF-2026-0001`. Le matricule ne change jamais, même en cas de redoublement. */
export function formaterMatricule(code: string, anneeDebut: number, seq: number): string {
  verifierAnnee(anneeDebut);
  verifierSequence(seq, SEQUENCE_MATRICULE_MAX, "matricule");
  return `${code}-${anneeDebut}-${String(seq).padStart(4, "0")}`;
}

/** Séquence propre à chaque filière et année d'entrée : `MATRICULE:IF:2026`. */
export function cleCompteurMatricule(code: string, anneeDebut: number): string {
  verifierAnnee(anneeDebut);
  return `MATRICULE:${code}:${anneeDebut}`;
}

/** `R-2026-00001`, l'année étant l'année civile du paiement à Madagascar. */
export function formaterNumeroRecu(annee: number, seq: number): string {
  verifierAnnee(annee);
  verifierSequence(seq, SEQUENCE_RECU_MAX, "reçu");
  return `R-${annee}-${String(seq).padStart(5, "0")}`;
}

export function cleCompteurRecu(annee: number): string {
  verifierAnnee(annee);
  return `RECU:${annee}`;
}
