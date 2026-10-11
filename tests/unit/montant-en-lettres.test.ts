import { describe, expect, it } from "vitest";
import { montantEnLettres, nombreEnLettres } from "@/lib/montant-en-lettres";

describe("montantEnLettres", () => {
  it.each([
    [0, "zéro ariary"],
    [1, "un ariary"],
    [16, "seize ariary"],
    [17, "dix-sept ariary"],
    [21, "vingt et un ariary"],
    [71, "soixante et onze ariary"],
    [80, "quatre-vingts ariary"],
    [81, "quatre-vingt-un ariary"],
    [91, "quatre-vingt-onze ariary"],
    [100, "cent ariary"],
    [180, "cent quatre-vingts ariary"],
    [200, "deux cents ariary"],
    [201, "deux cent un ariary"],
    [1_000, "mille ariary"],
    [2_000, "deux mille ariary"],
    [80_000, "quatre-vingt mille ariary"],
    [150_000, "cent cinquante mille ariary"],
    [1_000_000, "un million d'ariary"],
    [1_200_000, "un million deux cent mille ariary"],
    [80_000_000, "quatre-vingts millions d'ariary"],
  ])("%i → « %s »", (n, attendu) => {
    expect(montantEnLettres(n)).toBe(attendu);
  });

  it("« et un » seulement de 21 à 61 ; 81 et 91 prennent un trait d'union", () => {
    expect(nombreEnLettres(31)).toBe("trente et un");
    expect(nombreEnLettres(61)).toBe("soixante et un");
    expect(nombreEnLettres(101)).toBe("cent un");
    expect(nombreEnLettres(81)).toBe("quatre-vingt-un");
    expect(nombreEnLettres(21_000)).toBe("vingt et un mille");
  });

  it("soixante-dix à soixante-dix-neuf et quatre-vingt-dix à quatre-vingt-dix-neuf", () => {
    expect(nombreEnLettres(70)).toBe("soixante-dix");
    expect(nombreEnLettres(77)).toBe("soixante-dix-sept");
    expect(nombreEnLettres(90)).toBe("quatre-vingt-dix");
    expect(nombreEnLettres(99)).toBe("quatre-vingt-dix-neuf");
  });

  it("« cent » prend un s seulement multiplié et en fin de nombre", () => {
    expect(nombreEnLettres(300)).toBe("trois cents");
    expect(nombreEnLettres(300_000)).toBe("trois cent mille");
    expect(nombreEnLettres(200_000_000)).toBe("deux cents millions");
    expect(nombreEnLettres(280_000)).toBe("deux cent quatre-vingt mille");
    expect(nombreEnLettres(2_080_000)).toBe("deux millions quatre-vingt mille");
  });

  it("« mille » est invariable et ne prend pas « un » devant lui", () => {
    expect(nombreEnLettres(1_000)).toBe("mille");
    expect(nombreEnLettres(1_100)).toBe("mille cent");
    expect(nombreEnLettres(1_000_000 + 1_000)).toBe("un million mille");
    expect(nombreEnLettres(81_000)).toBe("quatre-vingt-un mille");
  });

  it("million et milliard s'accordent au pluriel", () => {
    expect(nombreEnLettres(2_000_000)).toBe("deux millions");
    expect(nombreEnLettres(1_000_000_000)).toBe("un milliard");
    expect(nombreEnLettres(2_000_000_000)).toBe("deux milliards");
  });

  it("« d'ariary » après un nombre rond de millions, « ariary » sinon", () => {
    expect(montantEnLettres(2_000_000)).toBe("deux millions d'ariary");
    expect(montantEnLettres(1_000_000_000)).toBe("un milliard d'ariary");
    expect(montantEnLettres(2_500_000)).toBe("deux millions cinq cent mille ariary");
    expect(montantEnLettres(1_000_001)).toBe("un million un ariary");
  });

  it("refuse un négatif, un décimal et un nombre hors limites", () => {
    for (const n of [-1, 1.5, 1_000_000_000_000, Number.NaN]) {
      expect(() => montantEnLettres(n), String(n)).toThrow(RangeError);
    }
  });
});
