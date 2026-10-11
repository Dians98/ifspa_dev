import { describe, expect, it } from "vitest";
import { z } from "zod";
import { echec, echecValidation, erreursZod, succes } from "@/lib/etat-action";

describe("état des Server Actions", () => {
  it("succès et échec sont des objets sérialisables", () => {
    expect(succes("Fait.")).toEqual({ statut: "succes", message: "Fait.", donnees: undefined });
    expect(succes("Créé.", { id: "x" })).toEqual({ statut: "succes", message: "Créé.", donnees: { id: "x" } });
    expect(echec("Refusé.")).toEqual({ statut: "erreur", message: "Refusé." });
    expect(echec("Refusé.", { code: "Pris." })).toEqual({ statut: "erreur", message: "Refusé.", erreurs: { code: "Pris." } });
  });

  it("garde la première erreur de chaque champ, indexée par son chemin", () => {
    const schema = z.object({
      code: z.string().min(2, "Trop court.").regex(/^[A-Z]+$/, "Majuscules."),
      lignes: z.array(z.object({ montant: z.number("Montant ?") })),
    });
    const r = schema.safeParse({ code: "a", lignes: [{ montant: 1 }, { montant: "x" }] });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(erreursZod(r.error)).toEqual({ code: "Trop court.", "lignes.1.montant": "Montant ?" });
    expect(echecValidation(r.error)).toEqual({
      statut: "erreur",
      message: "Vérifiez les champs signalés.",
      erreurs: { code: "Trop court.", "lignes.1.montant": "Montant ?" },
    });
  });

  it("range une erreur sur l'objet entier sous la clé « _ »", () => {
    const r = z.object({}, { error: "Données invalides." }).safeParse(null);
    if (r.success) throw new Error("attendu : échec");
    expect(erreursZod(r.error)).toEqual({ _: "Données invalides." });
  });
});
