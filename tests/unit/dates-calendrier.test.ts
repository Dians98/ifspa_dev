import { describe, expect, it } from "vitest";
import { ajouterJours, debutJourMadagascar, formaterJour, jourDeDate, premierDuMoisSuivant } from "@/lib/dates";

describe("debutJourMadagascar", () => {
  it("minuit à Madagascar est 21 h UTC la veille", () => {
    expect(debutJourMadagascar("2026-11-15").toISOString()).toBe("2026-11-14T21:00:00.000Z");
  });

  it("franchit le changement d'année", () => {
    expect(debutJourMadagascar("2027-01-01").toISOString()).toBe("2026-12-31T21:00:00.000Z");
  });

  it("deux jours consécutifs sont séparés de 24 h exactement (pas d'heure d'été)", () => {
    const delta = debutJourMadagascar("2026-11-16").getTime() - debutJourMadagascar("2026-11-15").getTime();
    expect(delta).toBe(24 * 3600 * 1000);
  });

  it("refuse un jour invalide", () => {
    expect(() => debutJourMadagascar("2026-02-30")).toThrow(RangeError);
  });
});

describe("ajouterJours", () => {
  it("passe d'un mois et d'une année à l'autre", () => {
    expect(ajouterJours("2026-10-31", 1)).toBe("2026-11-01");
    expect(ajouterJours("2026-12-31", 1)).toBe("2027-01-01");
    expect(ajouterJours("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("gère le 29 février bissextile", () => {
    expect(ajouterJours("2028-02-28", 1)).toBe("2028-02-29");
    expect(ajouterJours("2027-02-28", 1)).toBe("2027-03-01");
  });

  it("zéro jour rend le même jour ; plusieurs jours en une fois", () => {
    expect(ajouterJours("2026-11-15", 0)).toBe("2026-11-15");
    expect(ajouterJours("2026-11-15", 30)).toBe("2026-12-15");
    expect(ajouterJours("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("premierDuMoisSuivant", () => {
  it("rend le 1er du mois suivant, quel que soit le jour", () => {
    expect(premierDuMoisSuivant("2026-10-15")).toBe("2026-11-01");
    expect(premierDuMoisSuivant("2026-10-31")).toBe("2026-11-01");
    expect(premierDuMoisSuivant("2026-12-31")).toBe("2027-01-01");
  });

  it("n = 0 : le 1er du mois courant ; n = 12 : un an plus tard ; n négatif : en arrière", () => {
    expect(premierDuMoisSuivant("2026-10-15", 0)).toBe("2026-10-01");
    expect(premierDuMoisSuivant("2026-10-01", 12)).toBe("2027-10-01");
    expect(premierDuMoisSuivant("2026-01-20", -1)).toBe("2025-12-01");
  });
});

describe("formaterJour et jourDeDate", () => {
  it("formate « jj/mm/aaaa » avec les zéros", () => {
    expect(formaterJour("2026-10-01")).toBe("01/10/2026");
    expect(formaterJour("2026-11-15")).toBe("15/11/2026");
  });

  it("refuse un jour mal formé", () => {
    expect(() => formaterJour("15/11/2026")).toThrow(RangeError);
  });

  it("jourDeDate lit une colonne @db.Date (minuit UTC) et formaterJour la rend lisible", () => {
    expect(jourDeDate(new Date("2005-03-14T00:00:00Z"))).toBe("2005-03-14");
    expect(formaterJour(jourDeDate(new Date("2005-03-14T00:00:00Z")))).toBe("14/03/2005");
  });
});
