import { APIError } from "better-auth/api";
import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { codePrisma, indexEnConflit, MESSAGE_ECHEC_GENERIQUE, messageErreurAuth } from "@/server/erreurs";

const erreurPrisma = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError("échec", { code, clientVersion: "7", meta });

describe("erreurs Prisma", () => {
  it("lit le code d'une erreur connue, null sinon", () => {
    expect(codePrisma(erreurPrisma("P2003"))).toBe("P2003");
    expect(codePrisma(new Error("autre"))).toBeNull();
  });

  it("trouve le nom de l'index violé dans l'erreur de l'adaptateur pg", () => {
    const e = erreurPrisma("P2002", {
      driverAdapterError: { cause: { constraint: { index: "annee_scolaire_une_seule_courante" } } },
    });
    expect(indexEnConflit(e)).toBe("annee_scolaire_une_seule_courante");
  });

  it("se rabat sur meta.target, puis sur les champs de la contrainte", () => {
    expect(indexEnConflit(erreurPrisma("P2002", { target: "filiere_code_key" }))).toBe("filiere_code_key");
    expect(indexEnConflit(erreurPrisma("P2002", { target: ["code"] }))).toBe("code");
    expect(indexEnConflit(erreurPrisma("P2002", { driverAdapterError: { cause: { constraint: { fields: ["email"] } } } }))).toBe(
      "email",
    );
    expect(indexEnConflit(erreurPrisma("P2002"))).toBe("");
  });

  it("ne voit pas de conflit d'unicité dans une autre erreur", () => {
    expect(indexEnConflit(erreurPrisma("P2003"))).toBeNull();
    expect(indexEnConflit(new Error("P2002"))).toBeNull();
  });
});

describe("messageErreurAuth", () => {
  it("traduit les codes connus de Better Auth", () => {
    expect(messageErreurAuth(new APIError("BAD_REQUEST", { code: "USER_ALREADY_EXISTS" }))).toBe(
      "Un compte existe déjà avec ce courriel.",
    );
    expect(messageErreurAuth(new APIError("BAD_REQUEST", { code: "YOU_CANNOT_BAN_YOURSELF" }))).toBe(
      "Vous ne pouvez pas désactiver votre propre compte.",
    );
  });

  it("présente un refus de droits comme réservé à l'administrateur", () => {
    expect(messageErreurAuth(new APIError("FORBIDDEN", { code: "YOU_ARE_NOT_ALLOWED_TO_BAN_USERS" }))).toBe(
      "Cette action est réservée à l'administrateur.",
    );
    expect(messageErreurAuth(new APIError("FORBIDDEN"))).toBe("Cette action est réservée à l'administrateur.");
  });

  it("invite à se reconnecter sur une session expirée, message générique sinon", () => {
    expect(messageErreurAuth(new APIError("UNAUTHORIZED"))).toBe("Votre session a expiré. Reconnectez-vous.");
    expect(messageErreurAuth(new APIError("INTERNAL_SERVER_ERROR", { code: "INCONNU" }))).toBe(MESSAGE_ECHEC_GENERIQUE);
  });

  it("renvoie null pour une erreur qui ne vient pas de Better Auth", () => {
    expect(messageErreurAuth(new Error("Unique constraint failed"))).toBeNull();
  });
});
