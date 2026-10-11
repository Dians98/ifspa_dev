import { formaterAriary } from "@/lib/montant";

/** Figtree n'a ni l'espace fine insécable (U+202F) ni l'espace fine (U+2009) : remplacées par U+00A0. */
export function pourPdf(texte: string): string {
  return texte.replace(/[  ]/g, " ");
}

/** « 80 000 Ar » affichable dans un PDF. */
export function arPdf(n: number): string {
  return pourPdf(formaterAriary(n));
}
