import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MESSAGE_ECHEC_GENERIQUE } from "@/server/erreurs";

const { getSession, lireParametresModele } = vi.hoisted(() => ({ getSession: vi.fn(), lireParametresModele: vi.fn() }));

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/lectures/import", () => ({ lireParametresModele }));

const { GET } = await import("@/app/api/import/modele/route");

describe("GET /api/import/modele : panne inattendue", () => {
  beforeEach(() => {
    getSession.mockResolvedValue({ user: { id: "u1", name: "Admin", role: "admin" }, session: { id: "s1" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  it("répond 500 JSON sans détail technique et journalise la cause côté serveur", async () => {
    const cause = new Error("connexion refusée à postgres://ifspa:secret@localhost:5434");
    lireParametresModele.mockRejectedValue(cause);

    const r = await GET(new Request("http://localhost/api/import/modele?format=xlsx"));

    expect(r.status).toBe(500);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    const texte = await r.text();
    expect(JSON.parse(texte)).toEqual({ erreur: MESSAGE_ECHEC_GENERIQUE, code: "ERREUR" });
    expect(texte).not.toContain("secret");
    expect(console.error).toHaveBeenCalledWith(cause);
  });
});
