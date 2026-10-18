import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const { exigerAdmin, exigerAdminApi, exigerSessionApi } = await import("@/server/acces");

const sessionDe = (role: string | null) => ({ user: { id: "u1", name: "Test", role }, session: { id: "s1" } });

describe("exigerAdmin", () => {
  beforeEach(() => getSession.mockReset());

  it("renvoie la session d'un administrateur, sans refus", async () => {
    getSession.mockResolvedValue(sessionDe("admin"));
    const r = await exigerAdmin();
    expect(r.refus).toBeNull();
    expect(r.session?.user.id).toBe("u1");
  });

  it("renvoie un refus affichable pour le rôle user, au lieu de lever", async () => {
    for (const role of ["user", null, "ADMIN"]) {
      getSession.mockResolvedValue(sessionDe(role));
      expect(await exigerAdmin()).toEqual({
        session: null,
        refus: { statut: "erreur", message: "Cette action est réservée à l'administrateur." },
      });
    }
  });

  it("sans session, laisse passer la redirection vers la connexion", async () => {
    getSession.mockResolvedValue(null);
    await expect(exigerAdmin()).rejects.toThrow(/NEXT_REDIRECT/);
  });
});

describe("exigerSessionApi", () => {
  beforeEach(() => getSession.mockReset());

  it("laisse passer user et admin avec leur session", async () => {
    for (const role of ["user", "admin"]) {
      getSession.mockResolvedValue(sessionDe(role));

      const r = await exigerSessionApi();

      expect(r.refus).toBeNull();
      expect(r.session?.user.role).toBe(role);
    }
  });

  it("sans session : 401 JSON { code: SESSION } sans cache, jamais de redirection", async () => {
    getSession.mockResolvedValue(null);

    const { session, refus } = await exigerSessionApi();

    expect(session).toBeNull();
    expect(refus?.status).toBe(401);
    expect(refus?.headers.get("Cache-Control")).toBe("no-store");
    expect(await refus?.json()).toEqual({ erreur: "Session expirée : reconnectez-vous.", code: "SESSION" });
  });
});

describe("exigerAdminApi", () => {
  beforeEach(() => getSession.mockReset());

  it("renvoie la session d'un administrateur, sans refus", async () => {
    getSession.mockResolvedValue(sessionDe("admin"));

    const r = await exigerAdminApi();

    expect(r.refus).toBeNull();
    expect(r.session?.user.id).toBe("u1");
  });

  it("sans session : 401 SESSION, comme exigerSessionApi, sans redirection", async () => {
    getSession.mockResolvedValue(null);

    const { session, refus } = await exigerAdminApi();

    expect(session).toBeNull();
    expect(refus?.status).toBe(401);
    expect(refus?.headers.get("Cache-Control")).toBe("no-store");
    expect(await refus?.json()).toMatchObject({ code: "SESSION" });
  });

  it("rôle user (ou rôle absent ou inconnu) : 403 INTERDIT avec le message de réserve à l'administrateur", async () => {
    for (const role of ["user", null, "ADMIN", "superviseur"]) {
      getSession.mockResolvedValue(sessionDe(role));

      const { session, refus } = await exigerAdminApi();

      expect(session, String(role)).toBeNull();
      expect(refus?.status, String(role)).toBe(403);
      expect(refus?.headers.get("Cache-Control"), String(role)).toBe("no-store");
      expect(await refus?.json(), String(role)).toEqual({ erreur: "Cette action est réservée à l'administrateur.", code: "INTERDIT" });
    }
  });
});
