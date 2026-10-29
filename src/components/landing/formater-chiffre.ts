const NOMBRE = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

export type FormatChiffre = "entier" | "pourcentage";

/** « 1 200 », « 95 % », avec des espaces insécables. */
export function formaterNombre(n: number, format: FormatChiffre): string {
  const nombre = NOMBRE.format(n).replace(/\s/g, " ");
  return format === "pourcentage" ? `${nombre} %` : nombre;
}
