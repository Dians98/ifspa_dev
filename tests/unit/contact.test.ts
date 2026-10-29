import { afterEach, describe, expect, it, vi } from "vitest";
import { copiesContact, DESTINATAIRE_CONTACT } from "@/lib/contact";
import { envoyerEmail } from "@/lib/email";

describe("copiesContact", () => {
  it("met en copie les comptes secrétariat, sans le destinataire ni les doublons", () => {
    expect(
      copiesContact(DESTINATAIRE_CONTACT, ["secretariat@ifspa.mg", "Admin@IFSPA.mg", " SECRETARIAT@ifspa.mg ", "caisse@ifspa.mg", ""]),
    ).toEqual(["secretariat@ifspa.mg", "caisse@ifspa.mg"]);
  });

  it("aucun compte secrétariat : pas de copie", () => {
    expect(copiesContact(DESTINATAIRE_CONTACT, [])).toEqual([]);
  });

  it("le destinataire par défaut est admin@ifspa.mg", () => {
    expect(DESTINATAIRE_CONTACT).toBe("admin@ifspa.mg");
  });
});

describe("envoyerEmail", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("envoie au destinataire avec les copies en cc", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_EXPEDITEUR", "IFSPA <site@ifspa.mg>");
    const fetch = vi.fn(async () => Response.json({ id: "49a3999c" }));
    vi.stubGlobal("fetch", fetch);

    const r = await envoyerEmail({ a: "admin@ifspa.mg", copie: ["secretariat@ifspa.mg"], sujet: "Objet", texte: "Texte" });

    expect(r).toEqual({ ok: true });
    const corps = JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(corps).toMatchObject({ to: ["admin@ifspa.mg"], cc: ["secretariat@ifspa.mg"], from: "IFSPA <site@ifspa.mg>" });
  });

  it("sans copie : pas de champ cc", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_EXPEDITEUR", "IFSPA <site@ifspa.mg>");
    const fetch = vi.fn(async () => Response.json({ id: "49a3999c" }));
    vi.stubGlobal("fetch", fetch);

    await envoyerEmail({ a: "admin@ifspa.mg", sujet: "Objet", texte: "Texte" });

    const corps = JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(corps).not.toHaveProperty("cc");
  });
});
