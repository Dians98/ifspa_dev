import { describe, expect, it } from "vitest";
import { situation, type EcheancePayee } from "@/lib/ecolage";

const mois = (annee: number, mois1a12: number) => new Date(Date.UTC(annee, mois1a12 - 1, 1));

let n = 0;
const echeance = (anneeDebut: number, m: Date, montantDu: number, paye: number, nonDueSortie = false): EcheancePayee => ({
  id: `e${++n}`,
  anneeDebut,
  mois: m,
  ordre: n,
  montantDu,
  paye,
  nonDueSortie,
});

describe("situation : échéances non dues après une sortie", () => {
  it("sortent du dû, du reste, du retard et de l'attendu à date, sans rien réécrire", () => {
    const echeances = [
      echeance(2026, mois(2026, 10), 80_000, 30_000),
      echeance(2026, mois(2026, 11), 80_000, 0),
      echeance(2026, mois(2026, 12), 80_000, 0, true),
      echeance(2027, mois(2027, 1), 80_000, 0, true),
    ];

    const s = situation(echeances, "2027-03-15");

    expect(s).toMatchObject({ du: 160_000, paye: 30_000, reste: 130_000, resteEnRetard: 130_000, moisEnRetard: 2, duEchu: 160_000, payeEchu: 30_000 });
    expect(echeances[2].montantDu).toBe(80_000);
  });

  it("l'échéance échue non soldée du mois de sortie reste en retard", () => {
    const s = situation([echeance(2026, mois(2026, 11), 80_000, 0)], "2026-12-01");
    expect(s).toMatchObject({ reste: 80_000, resteEnRetard: 80_000, moisEnRetard: 1 });
  });

  it("une année entièrement non due disparaît de parAnnee", () => {
    const s = situation([echeance(2026, mois(2026, 10), 80_000, 80_000), echeance(2027, mois(2027, 10), 80_000, 0, true)], "2027-11-15");
    expect(s.parAnnee.map((a) => a.anneeDebut)).toEqual([2026]);
    expect(s).toMatchObject({ du: 80_000, reste: 0, moisEnRetard: 0 });
  });

  it("un montant payé sur une échéance non due (état incohérent) n'est pas compté", () => {
    const s = situation([echeance(2026, mois(2026, 12), 80_000, 50_000, true)], "2027-03-15");
    expect(s).toMatchObject({ du: 0, paye: 0, reste: 0, duEchu: 0, payeEchu: 0, parAnnee: [] });
  });

  it("un champ nonDueSortie absent vaut « due »", () => {
    const echeances = [echeance(2026, mois(2026, 10), 80_000, 0), echeance(2026, mois(2026, 11), 80_000, 80_000)];
    const sansChamp = echeances.map((e) => {
      const copie: Partial<EcheancePayee> = { ...e };
      delete copie.nonDueSortie;
      return copie as EcheancePayee;
    });
    expect(situation(sansChamp, "2026-12-15")).toEqual(situation(echeances, "2026-12-15"));
    expect(situation(echeances, "2026-12-15")).toMatchObject({ du: 160_000, reste: 80_000 });
  });
});
