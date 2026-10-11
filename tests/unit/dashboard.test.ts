import { describe, expect, it } from "vitest";
import { calculer, estTauxBas, SEUIL_TAUX_BAS, tauxRecouvrement, totaliser } from "@/lib/dashboard";

describe("tauxRecouvrement", () => {
  it("null quand rien n'est échu : pas de division par zéro, pas de 0 % trompeur", () => {
    expect(tauxRecouvrement(0, 0)).toBeNull();
  });

  it("encaissé / attendu en %, arrondi au dixième", () => {
    expect(tauxRecouvrement(0, 180_000)).toBe(0);
    expect(tauxRecouvrement(90_000, 180_000)).toBe(50);
    expect(tauxRecouvrement(180_000, 180_000)).toBe(100);
    expect(tauxRecouvrement(1, 3)).toBe(33.3);
    expect(tauxRecouvrement(2, 3)).toBe(66.7);
    expect(tauxRecouvrement(280_000, 540_000)).toBe(51.9);
  });

  it("évite les arrondis flottants : 84,55 % donne 84,6", () => {
    expect(tauxRecouvrement(8455, 10_000)).toBe(84.6);
    expect(tauxRecouvrement(8454, 10_000)).toBe(84.5);
  });

  it.each([
    ["montant négatif", -1, 100],
    ["attendu négatif", 0, -100],
    ["encaissé décimal", 10.5, 100],
    ["attendu décimal", 10, 100.5],
    ["encaissé NaN", Number.NaN, 100],
    ["attendu infini", 0, Number.POSITIVE_INFINITY],
    ["encaissé supérieur à l'attendu", 101, 100],
    ["encaissé sans attendu", 1, 0],
  ])("lève une RangeError : %s", (_nom, paye, du) => {
    expect(() => tauxRecouvrement(paye, du)).toThrow(RangeError);
  });
});

describe("estTauxBas", () => {
  it("seuil à 85 % : 85 n'est pas bas, 84,9 l'est", () => {
    expect(SEUIL_TAUX_BAS).toBe(85);
    expect(estTauxBas(85)).toBe(false);
    expect(estTauxBas(84.9)).toBe(true);
    expect(estTauxBas(0)).toBe(true);
    expect(estTauxBas(100)).toBe(false);
  });

  it("taux inconnu : jamais signalé comme bas", () => {
    expect(estTauxBas(null)).toBe(false);
  });

  it("à partir des montants : 8 490 sur 10 000 est bas, 8 500 sur 10 000 ne l'est pas", () => {
    expect(estTauxBas(tauxRecouvrement(8490, 10_000))).toBe(true);
    expect(estTauxBas(tauxRecouvrement(8500, 10_000))).toBe(false);
  });
});

describe("calculer", () => {
  it("reste = attendu − encaissé, taux et alerte", () => {
    expect(calculer({ effectif: 12, attendu: 180_000, encaisse: 100_000, enRetard: 4 })).toEqual({
      effectif: 12,
      attendu: 180_000,
      encaisse: 100_000,
      enRetard: 4,
      reste: 80_000,
      taux: 55.6,
      tauxBas: true,
    });
  });

  it("classe sans échéance échue : taux nul, pas d'alerte", () => {
    expect(calculer({ effectif: 5, attendu: 0, encaisse: 0, enRetard: 0 })).toMatchObject({ reste: 0, taux: null, tauxBas: false });
  });

  it("refuse un encaissé supérieur à l'attendu", () => {
    expect(() => calculer({ effectif: 1, attendu: 10, encaisse: 20, enRetard: 0 })).toThrow(RangeError);
  });
});

describe("totaliser", () => {
  const ligne = (filiereId: string, niveau: number, effectif: number, attendu: number, encaisse: number, enRetard: number) => ({
    filiereId,
    niveau,
    effectif,
    attendu,
    encaisse,
    enRetard,
  });

  it("taux de chaque regroupement recalculé sur les sommes, jamais moyenné", () => {
    const { parFiliere, total } = totaliser([
      ligne("IF", 1, 10, 1_000_000, 1_000_000, 0),
      ligne("IF", 2, 10, 100_000, 0, 5),
      ligne("SF", 1, 4, 400_000, 200_000, 2),
    ]);

    expect(parFiliere.map((f) => [f.filiereId, f.effectif, f.attendu, f.encaisse, f.reste, f.taux, f.enRetard])).toEqual([
      ["IF", 20, 1_100_000, 1_000_000, 100_000, 90.9, 5],
      ["SF", 4, 400_000, 200_000, 200_000, 50, 2],
    ]);
    // La moyenne des taux de lignes serait (100 + 0 + 50) / 3 = 50
    expect(total).toMatchObject({ effectif: 24, attendu: 1_500_000, encaisse: 1_200_000, reste: 300_000, taux: 80, tauxBas: true, enRetard: 7 });
  });

  it("filières dans l'ordre de première apparition", () => {
    const { parFiliere } = totaliser([ligne("SF", 1, 1, 0, 0, 0), ligne("IF", 1, 1, 0, 0, 0), ligne("SF", 2, 1, 0, 0, 0)]);
    expect(parFiliere.map((f) => f.filiereId)).toEqual(["SF", "IF"]);
  });

  it("aucune ligne : total à zéro, taux nul", () => {
    const { parFiliere, total } = totaliser([]);
    expect(parFiliere).toEqual([]);
    expect(total).toEqual({ effectif: 0, attendu: 0, encaisse: 0, enRetard: 0, reste: 0, taux: null, tauxBas: false });
  });

  it("n'altère pas l'entrée et enchaîne deux appels sans mémoire", () => {
    const lignes = [ligne("IF", 1, 3, 300, 300, 0)];
    totaliser(lignes);
    expect(totaliser(lignes).total.effectif).toBe(3);
    expect(lignes[0].effectif).toBe(3);
  });
});
