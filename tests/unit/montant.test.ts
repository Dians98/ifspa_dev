import { describe, expect, it } from "vitest";
import { formaterAriary, formaterNombre, lireMontant, MONTANT_MAX, verifierMontant } from "@/lib/montant";

const lu = (texte: string, zeroAutorise = false) => lireMontant(texte, { zeroAutorise });

describe("lireMontant", () => {
  it("accepte les chiffres groupés par espaces normales, insécables (U+00A0) ou fines (U+202F)", () => {
    expect(lu("100000")).toEqual({ ok: true, valeur: 100_000 });
    expect(lu("100 000")).toEqual({ ok: true, valeur: 100_000 });
    expect(lu("100 000")).toEqual({ ok: true, valeur: 100_000 });
    expect(lu("1 250 000")).toEqual({ ok: true, valeur: 1_250_000 });
    expect(lu("  80 000  ")).toEqual({ ok: true, valeur: 80_000 });
  });

  it("accepte le suffixe « Ar », quelle que soit la casse ou l'espace qui le précède", () => {
    expect(lu("80 000 Ar")).toEqual({ ok: true, valeur: 80_000 });
    expect(lu("80000Ar")).toEqual({ ok: true, valeur: 80_000 });
    expect(lu("80 000 Ar")).toEqual({ ok: true, valeur: 80_000 });
    expect(lu("80 000 ar")).toEqual({ ok: true, valeur: 80_000 });
  });

  it("refuse une virgule ou un point, même utilisé comme séparateur de milliers", () => {
    for (const texte of ["100,5", "100.000", "80 000,00", "1.000.000 Ar"]) {
      const r = lu(texte);
      expect(r.ok, texte).toBe(false);
      if (!r.ok) expect(r.erreur).toMatch(/sans virgule ni point/);
    }
  });

  it("refuse un montant négatif", () => {
    const r = lu("-80 000");
    expect(r).toEqual({ ok: false, erreur: "Le montant ne peut pas être négatif." });
  });

  it("refuse le texte et les notations non décimales", () => {
    for (const texte of ["abc", "80k", "1e5", "Ar 80 000", "0x10", "+80000"]) {
      expect(lu(texte).ok, texte).toBe(false);
    }
  });

  it("refuse une saisie vide ou réduite à l'unité", () => {
    for (const texte of ["", "   ", "Ar", " Ar "]) {
      expect(lu(texte), JSON.stringify(texte)).toEqual({ ok: false, erreur: "Saisissez un montant." });
    }
  });

  it("refuse 0 par défaut et l'accepte avec zeroAutorise", () => {
    expect(lu("0")).toEqual({ ok: false, erreur: "Le montant doit être supérieur à 0." });
    expect(lu("0", true)).toEqual({ ok: true, valeur: 0 });
  });

  it("accepte MONTANT_MAX et refuse au-delà", () => {
    expect(lu(String(MONTANT_MAX))).toEqual({ ok: true, valeur: MONTANT_MAX });
    const r = lu(String(MONTANT_MAX + 1));
    expect(r.ok).toBe(false);
    expect(lu("99999999999999999999").ok).toBe(false);
  });
});

describe("verifierMontant", () => {
  it("refuse un nombre décimal, infini ou NaN", () => {
    for (const n of [1.5, 80_000.01, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(verifierMontant(n).ok, String(n)).toBe(false);
    }
  });

  it("applique les mêmes bornes que la saisie texte", () => {
    expect(verifierMontant(-1).ok).toBe(false);
    expect(verifierMontant(0).ok).toBe(false);
    expect(verifierMontant(0, { zeroAutorise: true })).toEqual({ ok: true, valeur: 0 });
    expect(verifierMontant(MONTANT_MAX + 1).ok).toBe(false);
  });
});

describe("formaterAriary", () => {
  it("groupe les milliers par une espace fine insécable et sépare « Ar » par une insécable", () => {
    expect(formaterAriary(80_000)).toBe("80 000 Ar");
    expect(formaterAriary(1_234_567)).toBe("1 234 567 Ar");
    expect(formaterAriary(999)).toBe("999 Ar");
    expect(formaterAriary(0)).toBe("0 Ar");
  });

  it("produit le même groupement que Intl fr-FR", () => {
    for (const n of [1_000, 80_000, 1_250_000, 999_999_999]) {
      expect(formaterNombre(n)).toBe(new Intl.NumberFormat("fr-FR").format(n));
    }
  });

  it("relit ce qu'il a formaté", () => {
    expect(lireMontant(formaterAriary(1_250_000))).toEqual({ ok: true, valeur: 1_250_000 });
  });

  it("lève une erreur sur un montant non entier", () => {
    expect(() => formaterAriary(1.5)).toThrow(RangeError);
    expect(() => formaterAriary(Number.NaN)).toThrow(RangeError);
  });
});
