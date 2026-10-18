import { describe, expect, it } from "vitest";
import { dateDuJour } from "@/lib/dates";
import { genererEcheances } from "@/lib/ecolage";
import {
  apercuSortie,
  borneDebutSortie,
  controleSortie,
  echeancesNonDuesApresSortie,
  messageApercuSortie,
  schemaSortie,
  type EcheanceAvantSortie,
} from "@/lib/sorties";

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

  it("étudiante déjà sortie : message accordé au féminin", () => {
    expect(controleSortie({ ...base, statutEtudiant: "ABANDON", sexe: "F" })?.message).toBe(
      "Cette étudiante n'est plus active (abandon) : sa sortie est déjà enregistrée.",
    );
    expect(controleSortie({ ...base, statutEtudiant: "EXCLU", sexe: "M" })?.message).toBe(
      "Cet étudiant n'est plus actif (exclu) : sa sortie est déjà enregistrée.",
    );
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

describe("apercuSortie", () => {
  const ar = (n: number) => `${n} Ar`;
  const total = 100_000 + 10 * 80_000;

  /** Inscription 2025-2026 : droits en une fois (octobre) et 10 mensualités de 80 000 Ar, octobre à juillet. */
  function echeances2025(
    surcharges: Record<string, Partial<Pick<EcheanceAvantSortie, "paye" | "nonDueSortie" | "lignesNonAnnulees">>> = {},
  ): EcheanceAvantSortie[] {
    return genererEcheances(
      { droitsInscription: 100_000, montantMensuel: 80_000, nombreMois: 10 },
      { anneeDebut: 2025, moisDebutEcolage: 10 },
      1,
    ).map((e) => {
      const mois = e.mois.toISOString().slice(0, 10);
      const id = e.type === "DROITS" ? "droits" : mois.slice(0, 7);
      return { id, mois, montantDu: e.montantDu, paye: 0, nonDueSortie: false, lignesNonAnnulees: 0, ...surcharges[id] };
    });
  }

  const payee = (montant: number) => ({ paye: montant, lignesNonAnnulees: 1 });
  const soldee = (e: EcheanceAvantSortie) => ({ paye: e.montantDu, lignesNonAnnulees: 1 });

  it("sortie le 31/01/2026 sans paiement : février à juillet (6 échéances, 480 000 Ar) ne sont plus dues", () => {
    const a = apercuSortie(echeances2025(), "2026-01-31");
    expect(a).toEqual({ resteApres: 420_000, nonDues: { nombre: 6, montant: 480_000 } });
    expect(a.resteApres + a.nonDues.montant).toBe(total);
    expect(messageApercuSortie(a, ar)).toBe("6 échéances ne seront plus dues (480000 Ar) ; il restera 420000 Ar à payer.");
  });

  it("sortie le 31/12/2025 après encaissements : une échéance avec une ligne de paiement non annulée reste due", () => {
    const base = echeances2025();
    const mars = base.find((e) => e.id === "2026-03")!;
    const apres = echeances2025({
      droits: soldee(base[0]),
      "2025-10": payee(80_000),
      "2026-01": payee(20_000),
      "2026-03": soldee(mars),
    });

    const a = apercuSortie(apres, "2025-12-31");

    // Retirées : février, avril, mai, juin, juillet. Janvier (acompte) et mars (payé d'avance) restent.
    expect(a.nonDues).toEqual({ nombre: 5, montant: 5 * 80_000 });
    expect(a.resteApres).toBe(80_000 + 80_000 + 60_000);
  });

  it("un paiement annulé ne retient pas l'échéance : aucune ligne non annulée, elle est retirée", () => {
    const a = apercuSortie(echeances2025({ "2026-02": { paye: 0, lignesNonAnnulees: 0 } }), "2026-01-31");
    expect(a.nonDues.nombre).toBe(6);
  });

  it("tout payé jusqu'en décembre, sortie le 31/12/2025 : 7 échéances retirées, il ne restera rien à payer", () => {
    const base = echeances2025();
    const jusquaDecembre = Object.fromEntries(
      base.filter((e) => e.mois <= "2025-12-01").map((e) => [e.id, soldee(e)]),
    );

    const a = apercuSortie(echeances2025(jusquaDecembre), "2025-12-31");

    expect(a).toEqual({ resteApres: 0, nonDues: { nombre: 7, montant: 560_000 } });
    expect(messageApercuSortie(a, ar)).toBe("7 échéances ne seront plus dues (560000 Ar) ; il ne restera rien à payer.");
  });

  it("une échéance déjà non due est exclue du reste et du compte", () => {
    const a = apercuSortie(echeances2025({ "2026-06": { nonDueSortie: true }, "2026-07": { nonDueSortie: true } }), "2026-01-31");
    expect(a).toEqual({ resteApres: 420_000, nonDues: { nombre: 4, montant: 320_000 } });
  });

  it("une date dans le mois de la dernière échéance : aucune échéance retirée, tout reste dû", () => {
    const a = apercuSortie(echeances2025(), "2026-07-15");
    expect(a).toEqual({ resteApres: total, nonDues: { nombre: 0, montant: 0 } });
    expect(messageApercuSortie(a, ar)).toBe(`Aucune échéance ne devient non due : tout reste dû ; il restera ${total} Ar à payer.`);
  });

  it("le dernier jour d'un mois garde ce mois dû, le 1er du mois suivant garde le suivant", () => {
    expect(apercuSortie(echeances2025(), "2025-10-31").nonDues.nombre).toBe(9);
    expect(apercuSortie(echeances2025(), "2025-11-01").nonDues.nombre).toBe(8);
  });

  it("même résultat que echeancesNonDuesApresSortie : mêmes échéances, compte et montant", () => {
    const lignes = echeances2025({ "2025-12": payee(30_000), "2026-04": payee(80_000), "2026-05": { nonDueSortie: true } });
    for (const date of ["2025-10-01", "2025-12-15", "2026-01-31", "2026-04-30", "2026-07-31"]) {
      const ids = echeancesNonDuesApresSortie(
        lignes.map((e) => ({ ...e, mois: dateDuJour(e.mois) })),
        date,
      );
      const attendu = lignes.filter((e) => ids.includes(e.id)).reduce((t, e) => t + (e.montantDu - e.paye), 0);
      const a = apercuSortie(lignes, date);
      expect(a.nonDues, date).toEqual({ nombre: ids.length, montant: attendu });
    }
  });
});

describe("messageApercuSortie", () => {
  const ar = (n: number) => `${n} Ar`;

  it("singulier : « 1 échéance ne sera plus due »", () => {
    expect(messageApercuSortie({ resteApres: 420_000, nonDues: { nombre: 1, montant: 80_000 } }, ar)).toBe(
      "1 échéance ne sera plus due (80000 Ar) ; il restera 420000 Ar à payer.",
    );
  });

  it("pluriel : « 2 échéances ne seront plus dues »", () => {
    expect(messageApercuSortie({ resteApres: 1, nonDues: { nombre: 2, montant: 160_000 } }, ar)).toBe(
      "2 échéances ne seront plus dues (160000 Ar) ; il restera 1 Ar à payer.",
    );
  });

  it("aucune échéance retirée et rien à payer", () => {
    expect(messageApercuSortie({ resteApres: 0, nonDues: { nombre: 0, montant: 0 } }, ar)).toBe(
      "Aucune échéance ne devient non due : tout reste dû ; il ne restera rien à payer.",
    );
  });
});
