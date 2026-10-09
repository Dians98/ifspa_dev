import { describe, expect, it } from "vitest";
import { CHEMIN_ACCUEIL_APP, destinationApresConnexion } from "@/lib/roles";

describe("destinationApresConnexion", () => {
  it("renvoie à l'accueil de l'application sans adresse de retour", () => {
    expect(destinationApresConnexion(null)).toBe(CHEMIN_ACCUEIL_APP);
    expect(destinationApresConnexion(undefined)).toBe(CHEMIN_ACCUEIL_APP);
    expect(destinationApresConnexion("")).toBe(CHEMIN_ACCUEIL_APP);
  });

  it("garde un chemin interne de l'application, avec sa requête", () => {
    expect(destinationApresConnexion("/app/etudiants?filiere=IF")).toBe("/app/etudiants?filiere=IF");
  });

  it("refuse les adresses externes et les chemins hors de l'application", () => {
    for (const retour of ["https://exemple.com", "//exemple.com/app", "/connexion", "/", "javascript:alert(1)", "/apparence"]) {
      expect(destinationApresConnexion(retour), retour).toBe(CHEMIN_ACCUEIL_APP);
    }
  });
});
