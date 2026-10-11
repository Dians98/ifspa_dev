import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const { exigerAdmin } = await import("@/server/acces");

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
