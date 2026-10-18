import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fabriquerUtilisateur } from "../factories";

process.env.BETTER_AUTH_SECRET ||= "secret-de-test-ifspa-0123456789abcdef0123456789";

const { revalidatePath, contexte } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  contexte: { entetes: new Headers() },
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/headers", () => ({
  headers: async () => contexte.entetes,
  cookies: async () => ({ set: vi.fn(), get: vi.fn(), delete: vi.fn() }),
}));

const { db } = await import("@/lib/db");
const { auth } = await import("@/lib/auth");
const { getSession } = await import("@/lib/permissions");
const actions = await import("@/server/actions/utilisateurs");

const MOT_DE_PASSE = "Mot2Passe-test";

/** Compte avec identifiants réels (Better Auth vérifie le hachage à la connexion). */
async function compte(role: "admin" | "user", nom: string) {
  const u = await fabriquerUtilisateur(role, { name: nom, email: `${nom.toLowerCase().replace(/\s/g, ".")}@test.ifspa.mg` });
  await db.account.create({
    data: { id: randomUUID(), accountId: u.id, providerId: "credential", userId: u.id, password: await hashPassword(MOT_DE_PASSE) },
  });
  return u;
}

/** Ouvre une vraie session Better Auth et renvoie les en-têtes à présenter ensuite. */
async function ouvrirSession(email: string): Promise<Headers> {
  const { headers } = await auth.api.signInEmail({ body: { email, password: MOT_DE_PASSE }, returnHeaders: true });
  const cookie = headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return new Headers({ cookie });
}

const sessionsDe = (userId: string) => db.session.count({ where: { userId } });

let admin: Awaited<ReturnType<typeof compte>>;
let enteteAdmin: Headers;

beforeEach(async () => {
  revalidatePath.mockClear();
  admin = await compte("admin", "Admin Principal");
  enteteAdmin = await ouvrirSession(admin.email);
  contexte.entetes = enteteAdmin;
});

describe("changement de rôle d'un compte", () => {
  it("change le rôle puis ferme les sessions ouvertes du compte, celle de l'administrateur reste", async () => {
    const cible = await compte("user", "Caissier Rado");
    const enteteCible = await ouvrirSession(cible.email);
    await ouvrirSession(cible.email);
    expect(await sessionsDe(cible.id)).toBe(2);

    const r = await actions.changerRole({ userId: cible.id, role: "admin" });

    expect(r).toMatchObject({ statut: "succes", message: expect.stringMatching(/sessions ouvertes ont été fermées/) });
    expect((await db.user.findUniqueOrThrow({ where: { id: cible.id } })).role).toBe("admin");
    expect(await sessionsDe(cible.id)).toBe(0);
    expect(await sessionsDe(admin.id)).toBe(1);
    expect(revalidatePath).toHaveBeenCalledWith("/app/parametres", "layout");

    contexte.entetes = enteteCible;
    expect(await getSession()).toBeNull();
    contexte.entetes = enteteAdmin;
    expect((await getSession())?.user.id).toBe(admin.id);
  });

  it("rétrogradation d'un administrateur : rôle user et sessions fermées", async () => {
    const cible = await compte("admin", "Second Admin");
    await ouvrirSession(cible.email);

    const r = await actions.changerRole({ userId: cible.id, role: "user" });

    expect(r.statut).toBe("succes");
    expect((await db.user.findUniqueOrThrow({ where: { id: cible.id } })).role).toBe("user");
    expect(await sessionsDe(cible.id)).toBe(0);
  });

  it("refuse de changer son propre rôle, sans toucher au rôle ni aux sessions", async () => {
    const r = await actions.changerRole({ userId: admin.id, role: "user" });

    expect(r).toMatchObject({ statut: "erreur", message: expect.stringMatching(/propre rôle/) });
    expect((await db.user.findUniqueOrThrow({ where: { id: admin.id } })).role).toBe("admin");
    expect(await sessionsDe(admin.id)).toBe(1);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuse un rôle identique et ne ferme aucune session", async () => {
    const cible = await compte("user", "Caissier Rado");
    await ouvrirSession(cible.email);

    const r = await actions.changerRole({ userId: cible.id, role: "user" });

    expect(r).toMatchObject({ statut: "erreur", message: expect.stringMatching(/déjà ce rôle/) });
    expect(await sessionsDe(cible.id)).toBe(1);
  });

  it("rôle inconnu ou compte disparu : erreur affichable, rien n'est écrit", async () => {
    const cible = await compte("user", "Caissier Rado");
    expect((await actions.changerRole({ userId: cible.id, role: "root" as never })).statut).toBe("erreur");
    expect(await actions.changerRole({ userId: "inconnu", role: "admin" })).toMatchObject({
      statut: "erreur",
      message: "Ce compte n'existe plus. Rechargez la page.",
    });
    expect((await db.user.findUniqueOrThrow({ where: { id: cible.id } })).role).toBe("user");
  });
});

describe("désactivation d'un compte", () => {
  it("bannit le compte, ferme ses sessions, et sa session survivante est refusée", async () => {
    const cible = await compte("user", "Caissier Rado");
    const enteteCible = await ouvrirSession(cible.email);

    const r = await actions.desactiverUtilisateur({ userId: cible.id });

    expect(r.statut).toBe("succes");
    expect((await db.user.findUniqueOrThrow({ where: { id: cible.id } })).banned).toBe(true);
    expect(await sessionsDe(cible.id)).toBe(0);
    contexte.entetes = enteteCible;
    expect(await getSession()).toBeNull();
  });

  it("refuse la connexion d'un compte désactivé, la rétablit à la réactivation", async () => {
    const cible = await compte("user", "Caissier Rado");
    await actions.desactiverUtilisateur({ userId: cible.id });
    await expect(ouvrirSession(cible.email)).rejects.toBeDefined();

    expect((await actions.reactiverUtilisateur({ userId: cible.id })).statut).toBe("succes");
    contexte.entetes = await ouvrirSession(cible.email);
    expect((await getSession())?.user.id).toBe(cible.id);
  });

  it("un administrateur désactivé perd l'accès aux actions de comptes même avec sa session", async () => {
    const second = await compte("admin", "Second Admin");
    const enteteSecond = await ouvrirSession(second.email);
    await db.user.update({ where: { id: second.id }, data: { banned: true } });
    const cible = await compte("user", "Caissier Rado");
    contexte.entetes = enteteSecond;

    const r = await actions.changerRole({ userId: cible.id, role: "admin" }).catch((e: unknown) => e);

    // Sans session valide la redirection vers /connexion est levée.
    expect(r).toMatchObject({ digest: expect.stringContaining(";/connexion;") });
    expect((await db.user.findUniqueOrThrow({ where: { id: cible.id } })).role).toBe("user");
  });
});

describe("réinitialisation du mot de passe", () => {
  it("change le mot de passe, ferme les sessions, et le nouveau permet de se connecter", async () => {
    const cible = await compte("user", "Caissier Rado");
    await ouvrirSession(cible.email);

    const r = await actions.reinitialiserMotDePasse({ userId: cible.id });

    expect(r.statut).toBe("succes");
    const { motDePasse } = (r as { donnees: { motDePasse: string } }).donnees;
    expect(await sessionsDe(cible.id)).toBe(0);
    await expect(auth.api.signInEmail({ body: { email: cible.email, password: MOT_DE_PASSE } })).rejects.toBeDefined();
    await expect(auth.api.signInEmail({ body: { email: cible.email, password: motDePasse } })).resolves.toBeDefined();
  });
});
