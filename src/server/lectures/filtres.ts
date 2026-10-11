import "server-only";
import { z } from "zod";
import { lireJour } from "@/lib/dates";

// Filtres des listes, lus depuis `searchParams` : une valeur invalide est ignorée, jamais une erreur.

export type ParamsRecherche = Record<string, string | string[] | number | boolean | null | undefined>;

/** `?a=1&a=2` → « 1 » : seule la première valeur compte. */
export function aplatir(params: ParamsRecherche | undefined): Record<string, string | number | boolean | undefined> {
  const sortie: Record<string, string | number | boolean | undefined> = {};
  for (const [cle, v] of Object.entries(params ?? {})) {
    const valeur = Array.isArray(v) ? v[0] : v;
    sortie[cle] = valeur === null || valeur === "" ? undefined : valeur;
  }
  return sortie;
}

export const texteOpt = z.string().trim().max(100).optional().catch(undefined);
export const idOpt = z.string().trim().min(1).max(40).optional().catch(undefined);
export const pageOpt = z.coerce.number().int().min(1).max(100_000).catch(1);
export const booleenOpt = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => v === true || v === "1" || v === "true" || v === "oui")
  .catch(false);

export const jourOpt = z
  .string()
  .refine((v) => {
    try {
      lireJour(v);
      return true;
    } catch {
      return false;
    }
  })
  .optional()
  .catch(undefined);

export function entierOpt(min: number, max: number) {
  return z.coerce.number().int().min(min).max(max).optional().catch(undefined);
}

export type Pagination = { page: number; pages: number; taillePage: number; total: number };

export function pagination(total: number, page: number, taillePage: number): Pagination {
  return { page, pages: Math.max(1, Math.ceil(total / taillePage)), taillePage, total };
}
