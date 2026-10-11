import { describe, expect, it } from "vitest";
import { borneDebutSortie, controleSortie, echeancesNonDuesApresSortie, schemaSortie } from "@/lib/sorties";

const mois = (annee: number, mois1a12: number) => new Date(Date.UTC(annee, mois1a12 - 1, 1));

describe("schemaSortie", () => {
  const valide = { etudiantId: "e1", type: "ABANDON", date: "2026-11-15", motif: "Départ de la ville" };

  it("accepte un abandon et une exclusion, motif et date nettoyés", () => {
    expect(schemaSortie.parse({ ...valide, motif: "  Départ de la ville  ", date: " 2026-11-15 " })).toEqual(valide);
    expect(schemaSortie.safeParse({ ...valide, type: "EXCLU" }).success).toBe(true);
  });

  it.each([
    ["type DIPLOME (réservé au passage)", { type: "DIPLOME" }, "type"],
    ["type absent", { type: undefined }, "type"],
    ["motif vide", { motif: "" }, "motif"],
    ["motif d'espaces", { motif: "     " }, "motif"],
    ["motif de 2 caractères", { motif: "ab" }, "motif"],
    ["motif de plus de 500 caractères", { motif: "x".repeat(501) }, "motif"],
    ["date absente", { date: undefined }, "date"],
    ["date vide", { date: "" }, "date"],
    ["date inexistante", { date: "2026-02-30" }, "date"],
    ["date au mauvais format", { date: "15/11/2026" }, "date"],
    ["étudiant vide", { etudiantId: "" }, "etudiantId"],
  ])("refuse : %s", (_nom, surcharge, champ) => {
    const r = schemaSortie.safeParse({ ...valide, ...surcharge });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path[0]).toBe(champ);
  });
});

describe("borneDebutSortie", () => {
  it("début de l'inscription en cours quand son année a commencé", () => {
    expect(borneDebutSortie([{ enCours: true, debut: "2026-10-01" }], "2026-11-15")).toBe("2026-10-01");
  });

  it("le jour du début compte comme commencé", () => {
    expect(borneDebutSortie([{ enCours: true, debut: "2026-10-01" }], "2026-10-01")).toBe("2026-10-01");
  });

  it("passage déjà fait pour une rentrée à venir : début de la dernière année commencée", () => {
    const inscriptions = [
      { enCours: false, debut: "2025-10-01" },
      { enCours: false, debut: "2026-10-01" },
      { enCours: true, debut: "2027-10-01" },
    ];
    expect(borneDebutSortie(inscriptions, "2027-07-20")).toBe("2026-10-01");
  });

  it("aucune année commencée : début de l'inscription en cours, sinon aucune borne", () => {
    expect(borneDebutSortie([{ enCours: true, debut: "2027-10-01" }], "2026-11-15")).toBe("2027-10-01");
    expect(borneDebutSortie([], "2026-11-15")).toBeNull();
  });

  it("sans inscription en cours : dernière année commencée", () => {
    expect(borneDebutSortie([{ enCours: false, debut: "2025-10-01" }, { enCours: false, debut: "2026-10-01" }], "2026-11-15")).toBe("2026-10-01");
  });
});

describe("controleSortie", () => {
  const base = { statutEtudiant: "ACTIF" as const, date: "2026-11-15", jour: "2026-11-15", borneDebut: "2026-10-01" };

  it("accepte une sortie le jour même, ou le premier jour de l'année", () => {
    expect(controleSortie(base)).toBeNull();
    expect(controleSortie({ ...base, date: "2026-10-01" })).toBeNull();
    expect(controleSortie({ ...base, borneDebut: null, date: "2020-01-01" })).toBeNull();
  });

  it.each(["DIPLOME", "ABANDON", "EXCLU"] as const)("étudiant %s : refusé, sortie déjà enregistrée", (statutEtudiant) => {
    expect(controleSortie({ ...base, statutEtudiant })?.message).toMatch(/n'est plus actif .* déjà enregistrée/);
  });

  it("date future : refusée sur le champ date", () => {
    expect(controleSortie({ ...base, date: "2026-11-16" })).toEqual({
      message: "La date de sortie ne peut pas être dans le futur.",
      champ: "date",
    });
  });

  it("date antérieure au début de l'année : refusée avec la date de début", () => {
    const r = controleSortie({ ...base, date: "2026-09-30" });
    expect(r?.champ).toBe("date");
    expect(r?.message).toMatch(/01\/10\/2026/);
  });

  it("date inexistante : erreur de l'appelant", () => {
    expect(() => controleSortie({ ...base, date: "2026-13-01" })).toThrow(RangeError);
  });
});

describe("echeancesNonDuesApresSortie", () => {
  const echeance = (id: string, m: Date, surcharge: Partial<{ nonDueSortie: boolean; lignesNonAnnulees: number }> = {}) => ({
    id,
    mois: m,
    nonDueSortie: false,
    lignesNonAnnulees: 0,
    ...surcharge,
  });
  const echeances = [
    echeance("oct", mois(2026, 10)),
    echeance("nov", mois(2026, 11)),
    echeance("dec", mois(2026, 12)),
    echeance("jan", mois(2027, 1)),
  ];

  it("seulement les mois strictement postérieurs au mois de sortie : le mois de sortie et l'échu restent dus", () => {
    expect(echeancesNonDuesApresSortie(echeances, "2026-11-15")).toEqual(["dec", "jan"]);
  });

  it("le dernier jour du mois de sortie, ce mois reste dû ; le 1er du mois suivant, il l'est aussi", () => {
    expect(echeancesNonDuesApresSortie(echeances, "2026-11-30")).toEqual(["dec", "jan"]);
    expect(echeancesNonDuesApresSortie(echeances, "2026-12-01")).toEqual(["jan"]);
    expect(echeancesNonDuesApresSortie(echeances, "2026-10-31")).toEqual(["nov", "dec", "jan"]);
  });

  it("franchit le changement d'année", () => {
    expect(echeancesNonDuesApresSortie(echeances, "2026-12-31")).toEqual(["jan"]);
    expect(echeancesNonDuesApresSortie(echeances, "2027-01-01")).toEqual([]);
  });

  it("une échéance avec un paiement non annulé, même partiel, reste due", () => {
    const avecPaiement = [echeance("dec", mois(2026, 12), { lignesNonAnnulees: 1 }), echeance("jan", mois(2027, 1))];
    expect(echeancesNonDuesApresSortie(avecPaiement, "2026-11-15")).toEqual(["jan"]);
  });

  it("un paiement annulé n'empêche pas : il n'est pas compté dans les lignes non annulées", () => {
    expect(echeancesNonDuesApresSortie([echeance("dec", mois(2026, 12), { lignesNonAnnulees: 0 })], "2026-11-15")).toEqual(["dec"]);
  });

  it("une échéance déjà non due n'est pas renvoyée une seconde fois", () => {
    expect(echeancesNonDuesApresSortie([echeance("dec", mois(2026, 12), { nonDueSortie: true })], "2026-11-15")).toEqual([]);
  });

  it("couvre toutes les années de l'étudiant", () => {
    const deuxAnnees = [echeance("a2025", mois(2026, 6)), echeance("a2026", mois(2027, 6))];
    expect(echeancesNonDuesApresSortie(deuxAnnees, "2026-11-15")).toEqual(["a2026"]);
  });
});
