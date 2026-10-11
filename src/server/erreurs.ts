import "server-only";
import { isAPIError } from "better-auth/api";
import { Prisma } from "@/generated/prisma/client";

export const MESSAGE_ECHEC_GENERIQUE =
  "L'opération n'a pas abouti. Réessayez ; si le problème persiste, prévenez le responsable technique.";

export function codePrisma(e: unknown): string | null {
  return e instanceof Prisma.PrismaClientKnownRequestError ? e.code : null;
}

/** Nom de l'index violé (P2002). Avec l'adaptateur pg, il est dans `driverAdapterError`, pas dans `meta.target`. */
export function indexEnConflit(e: unknown): string | null {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") return null;
  const meta = e.meta as
    | { target?: unknown; driverAdapterError?: { cause?: { constraint?: { index?: string; fields?: string[] } } } }
    | undefined;
  const contrainte = meta?.driverAdapterError?.cause?.constraint;
  if (contrainte?.index) return contrainte.index;
  if (typeof meta?.target === "string") return meta.target;
  if (Array.isArray(meta?.target)) return meta.target.join(",");
  return contrainte?.fields?.join(",") ?? "";
}

const MESSAGES_AUTH: Record<string, string> = {
  USER_ALREADY_EXISTS: "Un compte existe déjà avec ce courriel.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Un compte existe déjà avec ce courriel.",
  INVALID_EMAIL: "Adresse e-mail invalide.",
  USER_NOT_FOUND: "Ce compte n'existe plus. Rechargez la page.",
  PASSWORD_TOO_SHORT: "Le mot de passe généré a été refusé. Réessayez.",
  PASSWORD_TOO_LONG: "Le mot de passe généré a été refusé. Réessayez.",
  YOU_CANNOT_BAN_YOURSELF: "Vous ne pouvez pas désactiver votre propre compte.",
  YOU_CANNOT_REMOVE_YOURSELF: "Vous ne pouvez pas supprimer votre propre compte.",
  FAILED_TO_CREATE_USER: "Le compte n'a pas pu être créé. Réessayez.",
};

/** Traduit une erreur Better Auth en message français ; `null` si ce n'en est pas une. */
export function messageErreurAuth(e: unknown): string | null {
  if (!isAPIError(e)) return null;
  const code = typeof e.body?.code === "string" ? e.body.code : "";
  if (code in MESSAGES_AUTH) return MESSAGES_AUTH[code];
  if (code.startsWith("YOU_ARE_NOT_ALLOWED") || e.status === "FORBIDDEN") {
    return "Cette action est réservée à l'administrateur.";
  }
  if (e.status === "UNAUTHORIZED") return "Votre session a expiré. Reconnectez-vous.";
  return MESSAGE_ECHEC_GENERIQUE;
}
