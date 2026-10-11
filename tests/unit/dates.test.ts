import { describe, expect, it } from "vitest";
import { anneeCivile, dateDuJour, dateHeureMadagascar, jourMadagascar, lireJour } from "@/lib/dates";

describe("jourMadagascar (UTC+3)", () => {
  it("21:00 UTC le 31/10 est déjà le 1er novembre à Madagascar", () => {
    expect(jourMadagascar(new Date("2026-10-31T21:00:00Z"))).toBe("2026-11-01");
    expect(jourMadagascar(new Date("2026-10-31T20:59:59Z"))).toBe("2026-10-31");
  });

  it("21:30 UTC le 31/12 est le 1er janvier de l'année suivante", () => {
    expect(jourMadagascar(new Date("2026-12-31T21:30:00Z"))).toBe("2027-01-01");
  });

  it("en milieu de journée, le jour UTC et le jour malgache coïncident", () => {
    expect(jourMadagascar(new Date("2026-10-11T09:00:00Z"))).toBe("2026-10-11");
  });

  it("refuse une date invalide", () => {
    expect(() => jourMadagascar(new Date("n'importe quoi"))).toThrow(RangeError);
  });
});

describe("anneeCivile", () => {
  it("renvoie l'année du jour : celle du numéro de reçu", () => {
    expect(anneeCivile("2026-12-31")).toBe(2026);
    expect(anneeCivile("2027-01-01")).toBe(2027);
  });

  it("un paiement à 22:00 UTC le 31/12 porte l'année suivante dans son numéro", () => {
    expect(anneeCivile(jourMadagascar(new Date("2026-12-31T22:00:00Z")))).toBe(2027);
  });
});

describe("dateHeureMadagascar", () => {
  it("date « jj/mm/aaaa » et heure « hh:mm » de Madagascar", () => {
    expect(dateHeureMadagascar(new Date("2026-10-11T07:24:00Z"))).toEqual({
      jour: "2026-10-11",
      date: "11/10/2026",
      heure: "10:24",
    });
  });

  it("passé minuit à Madagascar : heure sur 24 h, jour suivant", () => {
    expect(dateHeureMadagascar(new Date("2026-10-31T21:05:00Z"))).toEqual({
      jour: "2026-11-01",
      date: "01/11/2026",
      heure: "00:05",
    });
  });
});

describe("lireJour et dateDuJour", () => {
  it("lit un jour valide et le rend à minuit UTC", () => {
    expect(lireJour("2026-10-11")).toEqual({ annee: 2026, mois: 10, jour: 11 });
    expect(dateDuJour("2026-10-11").toISOString()).toBe("2026-10-11T00:00:00.000Z");
  });

  it("accepte le 29 février d'une année bissextile seulement", () => {
    expect(lireJour("2028-02-29").jour).toBe(29);
    expect(() => lireJour("2027-02-29")).toThrow(RangeError);
  });

  it("refuse un format ou une date inexistante", () => {
    for (const jour of ["2026-10-1", "2026/10/01", "", "2026-13-01", "2026-04-31"]) {
      expect(() => lireJour(jour), jour).toThrow(RangeError);
    }
  });
});
