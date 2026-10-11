import { describe, expect, it } from "vitest";
import {
  cleCompteurMatricule,
  cleCompteurRecu,
  formaterMatricule,
  formaterNumeroRecu,
  SEQUENCE_MATRICULE_MAX,
  SEQUENCE_RECU_MAX,
} from "@/lib/matricule";

describe("formaterMatricule", () => {
  it("format {CODE}-{ANNEE_ENTREE}-{NNNN} avec zéros à gauche", () => {
    expect(formaterMatricule("IF", 2026, 1)).toBe("IF-2026-0001");
    expect(formaterMatricule("SF", 2026, 12)).toBe("SF-2026-0012");
    expect(formaterMatricule("IF", 2027, 345)).toBe("IF-2027-0345");
  });

  it("accepte la séquence maximale 9999", () => {
    expect(SEQUENCE_MATRICULE_MAX).toBe(9999);
    expect(formaterMatricule("IF", 2026, 9999)).toBe("IF-2026-9999");
  });

  it("dépassement de 9999 : RangeError plutôt qu'un matricule à 5 chiffres", () => {
    expect(() => formaterMatricule("IF", 2026, 10_000)).toThrow(RangeError);
  });

  it("refuse une séquence nulle, négative ou décimale, et une année invalide", () => {
    expect(() => formaterMatricule("IF", 2026, 0)).toThrow(RangeError);
    expect(() => formaterMatricule("IF", 2026, -3)).toThrow(RangeError);
    expect(() => formaterMatricule("IF", 2026, 1.5)).toThrow(RangeError);
    expect(() => formaterMatricule("IF", 26, 1)).toThrow(RangeError);
  });
});

describe("formaterNumeroRecu", () => {
  it("format R-{ANNEE}-{NNNNN} avec zéros à gauche", () => {
    expect(formaterNumeroRecu(2026, 1)).toBe("R-2026-00001");
    expect(formaterNumeroRecu(2026, 1234)).toBe("R-2026-01234");
  });

  it("accepte 99999, refuse 100000", () => {
    expect(SEQUENCE_RECU_MAX).toBe(99_999);
    expect(formaterNumeroRecu(2026, 99_999)).toBe("R-2026-99999");
    expect(() => formaterNumeroRecu(2026, 100_000)).toThrow(RangeError);
  });

  it("refuse une séquence nulle ou une année invalide", () => {
    expect(() => formaterNumeroRecu(2026, 0)).toThrow(RangeError);
    expect(() => formaterNumeroRecu(0, 1)).toThrow(RangeError);
  });
});

describe("clés du Compteur", () => {
  it("une séquence de matricule par filière et par année d'entrée", () => {
    expect(cleCompteurMatricule("IF", 2026)).toBe("MATRICULE:IF:2026");
    const cles = new Set([
      cleCompteurMatricule("IF", 2026),
      cleCompteurMatricule("SF", 2026),
      cleCompteurMatricule("IF", 2027),
    ]);
    expect(cles.size).toBe(3);
  });

  it("une séquence de reçu par année civile", () => {
    expect(cleCompteurRecu(2026)).toBe("RECU:2026");
    expect(cleCompteurRecu(2026)).not.toBe(cleCompteurRecu(2027));
  });

  it("refuse une année invalide", () => {
    expect(() => cleCompteurMatricule("IF", 20)).toThrow(RangeError);
    expect(() => cleCompteurRecu(12345)).toThrow(RangeError);
  });
});
