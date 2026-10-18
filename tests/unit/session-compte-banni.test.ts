import { beforeEach, describe, expect, it, vi } from "vitest";

const { authGetSession } = vi.hoisted(() => ({ authGetSession: vi.fn() }));

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: authGetSession } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const { estBanni, getSession } = await import("@/lib/permissions");
const { exigerSessionPage } = await import("@/server/acces");

const MAINTENANT = new Date("2026-10-18T09:00:00Z");
const jour = 24 * 60 * 60 * 1000;

const sessionDe = (user: Record<string, unknown>) => ({ user: { id: "u1", name: "Test", role: "user", ...user }, session: { id: "s1" } });

describe("estBanni", () => {
  it("compte non banni : faux, même avec une échéance de bannissement résiduelle", () => {
    expect(estBanni({ banned: false }, MAINTENANT)).toBe(false);
    expect(estBanni({ banned: null }, MAINTENANT)).toBe(false);
    expect(estBanni({}, MAINTENANT)).toBe(false);
    expect(estBanni({ banned: false, banExpires: new Date(MAINTENANT.getTime() + jour) }, MAINTENANT)).toBe(false);
  });

  it("compte banni sans échéance : vrai (désactivation définitive)", () => {
    expect(estBanni({ banned: true }, MAINTENANT)).toBe(true);
    expect(estBanni({ banned: true, banExpires: null }, MAINTENANT)).toBe(true);
  });

  it("bannissement dont l'échéance est à venir : vrai", () => {
    expect(estBanni({ banned: true, banExpires: new Date(MAINTENANT.getTime() + jour) }, MAINTENANT)).toBe(true);
    expect(estBanni({ banned: true, banExpires: new Date(MAINTENANT.getTime() + 1) }, MAINTENANT)).toBe(true);
  });

  it("bannissement dont l'échéance est passée : faux", () => {
    expect(estBanni({ banned: true, banExpires: new Date(MAINTENANT.getTime() - jour) }, MAINTENANT)).toBe(false);
    expect(estBanni({ banned: true, banExpires: new Date(MAINTENANT.getTime() - 1) }, MAINTENANT)).toBe(false);
  });
});

describe("getSession", () => {
  beforeEach(() => authGetSession.mockReset());

  it("renvoie null quand Better Auth rend la session d'un compte banni", async () => {
    authGetSession.mockResolvedValue(sessionDe({ banned: true, banReason: "Compte désactivé par l'administrateur" }));
    expect(await getSession()).toBeNull();
  });

  it("renvoie null pour un bannissement à échéance future, la session sinon", async () => {
    authGetSession.mockResolvedValue(sessionDe({ banned: true, banExpires: new Date(Date.now() + jour) }));
    expect(await getSession()).toBeNull();

    const levee = sessionDe({ banned: true, banExpires: new Date(Date.now() - jour) });
    authGetSession.mockResolvedValue(levee);
    expect(await getSession()).toBe(levee);
  });

  it("renvoie la session d'un compte actif et null sans session", async () => {
    const active = sessionDe({ banned: false });
    authGetSession.mockResolvedValue(active);
    expect(await getSession()).toBe(active);

    authGetSession.mockResolvedValue(null);
    expect(await getSession()).toBeNull();
  });
});

describe("exigerSessionPage", () => {
  beforeEach(() => authGetSession.mockReset());

  it("sans session : redirige vers /connexion", async () => {
    authGetSession.mockResolvedValue(null);
    await expect(exigerSessionPage()).rejects.toMatchObject({
      message: "NEXT_REDIRECT",
      digest: expect.stringContaining(";/connexion;"),
    });
  });

  it("compte banni : redirige vers /connexion comme sans session", async () => {
    authGetSession.mockResolvedValue(sessionDe({ role: "admin", banned: true }));
    await expect(exigerSessionPage()).rejects.toMatchObject({ digest: expect.stringContaining(";/connexion;") });
  });

  it("rôle user : admin faux, avec la session", async () => {
    const s = sessionDe({ role: "user" });
    authGetSession.mockResolvedValue(s);
    expect(await exigerSessionPage()).toEqual({ session: s, admin: false });
  });

  it("rôle absent ou inconnu : admin faux", async () => {
    for (const role of [null, "ADMIN", "superviseur"]) {
      authGetSession.mockResolvedValue(sessionDe({ role }));
      expect((await exigerSessionPage()).admin, String(role)).toBe(false);
    }
  });

  it("rôle admin : admin vrai, avec la session", async () => {
    const s = sessionDe({ role: "admin" });
    authGetSession.mockResolvedValue(s);
    expect(await exigerSessionPage()).toEqual({ session: s, admin: true });
  });
});
