import { describe, expect, it } from "vitest";
import type { TypeEcheance } from "@/generated/prisma/enums";
import {
  controleDroits,
  dateLimiteRetard,
  echeanceFrais,
  estEchue,
  estExigible,
  genererEcheances,
  libelleEcheance,
  moisDroits,
  montantPourCases,
  rangSolde,
  repartirPaiement,
  restesApres,
  situation,
  statutEcheance,
  trierChronologique,
  trierPourSolde,
  type EcheanceAPayer,
  type EcheancePayee,
  type TarifEcheances,
} from "@/lib/ecolage";

const TARIF: TarifEcheances = { droitsInscription: 100_000, montantMensuel: 80_000, nombreMois: 10 };
const ANNEE_2026 = { anneeDebut: 2026, moisDebutEcolage: 10 };

const mois = (annee: number, mois1a12: number) => new Date(Date.UTC(annee, mois1a12 - 1, 1));
const jourDe = (d: Date) => d.toISOString().slice(0, 10);

function reussie(r: ReturnType<typeof repartirPaiement>) {
  if (!r.ok) throw new Error(`Répartition refusée : ${r.erreur}`);
  return r;
}

describe("controleDroits", () => {
  it("accepte des droits entiers positifs", () => {
    expect(controleDroits(100_000)).toBeNull();
    expect(controleDroits(1_500)).toBeNull();
  });

  it("refuse des droits nuls, négatifs ou non entiers avec un message affichable", () => {
    for (const droits of [0, -1, 100_000.5, Number.NaN]) {
      expect(controleDroits(droits), String(droits)).toMatch(/invalides/);
    }
  });
});

describe("genererEcheances", () => {
  it("une seule échéance de droits + 10 mensualités = 11 échéances", () => {
    const e = genererEcheances(TARIF, ANNEE_2026);
    expect(e).toHaveLength(11);
    expect(e.filter((x) => x.type === "DROITS")).toHaveLength(1);
    expect(e.filter((x) => x.type === "MENSUALITE")).toHaveLength(10);
  });

  it("les droits portent le montant entier du tarif, sans découpage en tranches", () => {
    const droits = genererEcheances(TARIF, ANNEE_2026).filter((x) => x.type === "DROITS");
    expect(droits.map((x) => x.montantDu)).toEqual([100_000]);
    expect(droits[0]).not.toHaveProperty("tranche");
    expect(droits[0]).not.toHaveProperty("ordre");
  });

  it("les droits sont exigibles le 1er mois de l'année (octobre), au 1er à minuit UTC", () => {
    const droits = genererEcheances(TARIF, ANNEE_2026).find((x) => x.type === "DROITS")!;
    expect(droits.mois.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(moisDroits(ANNEE_2026).toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("les droits tombent le mois de la 1re mensualité, même avec une seule mensualité", () => {
    const e = genererEcheances({ ...TARIF, nombreMois: 1 }, ANNEE_2026);
    expect(e.map((x) => [x.type, x.mois.getUTCMonth() + 1])).toEqual([
      ["DROITS", 10],
      ["MENSUALITE", 10],
    ]);
  });

  it("les 12 premiers mois possibles : droits et 1re mensualité au même mois, dans l'année de début", () => {
    for (let m = 1; m <= 12; m++) {
      const e = genererEcheances(TARIF, { anneeDebut: 2027, moisDebutEcolage: m });
      const premiere = e.find((x) => x.type === "MENSUALITE")!;
      expect(jourDe(e[0].mois), String(m)).toBe(jourDe(mois(2027, m)));
      expect(jourDe(premiere.mois), String(m)).toBe(jourDe(mois(2027, m)));
    }
  });

  it("année qui commence en janvier : mensualités de janvier à octobre de l'année de début", () => {
    const m = genererEcheances(TARIF, { anneeDebut: 2027, moisDebutEcolage: 1 }).filter((x) => x.type === "MENSUALITE");
    expect(m.map((x) => jourDe(x.mois))).toEqual([
      "2027-01-01", "2027-02-01", "2027-03-01", "2027-04-01", "2027-05-01",
      "2027-06-01", "2027-07-01", "2027-08-01", "2027-09-01", "2027-10-01",
    ]);
  });

  it("mensualités d'octobre à juillet, en traversant l'année civile, au 1er du mois à minuit UTC", () => {
    const m = genererEcheances(TARIF, ANNEE_2026).filter((x) => x.type === "MENSUALITE");
    expect(m.map((x) => x.mois.toISOString())).toEqual([
      "2026-10-01T00:00:00.000Z",
      "2026-11-01T00:00:00.000Z",
      "2026-12-01T00:00:00.000Z",
      "2027-01-01T00:00:00.000Z",
      "2027-02-01T00:00:00.000Z",
      "2027-03-01T00:00:00.000Z",
      "2027-04-01T00:00:00.000Z",
      "2027-05-01T00:00:00.000Z",
      "2027-06-01T00:00:00.000Z",
      "2027-07-01T00:00:00.000Z",
    ]);
  });

  it("mois de début 9 : de septembre à juin, droits en septembre ; mois de début 11 : droits en novembre", () => {
    const sept = genererEcheances(TARIF, { anneeDebut: 2026, moisDebutEcolage: 9 });
    const m = sept.filter((x) => x.type === "MENSUALITE");
    expect(jourDe(m[0].mois)).toBe("2026-09-01");
    expect(jourDe(m[9].mois)).toBe("2027-06-01");
    expect(jourDe(sept.find((x) => x.type === "DROITS")!.mois)).toBe("2026-09-01");

    const nov = genererEcheances(TARIF, { anneeDebut: 2026, moisDebutEcolage: 11 });
    expect(jourDe(nov.find((x) => x.type === "DROITS")!.mois)).toBe("2026-11-01");
  });

  it("aucune échéance générée ne porte de frais", () => {
    expect(genererEcheances(TARIF, ANNEE_2026).every((x) => x.fraisId === null)).toBe(true);
  });

  it("copie les montants du tarif : le tarif modifié ensuite ne réécrit pas les échéances générées", () => {
    const tarif = { ...TARIF };
    const e = genererEcheances(tarif, ANNEE_2026);
    tarif.montantMensuel = 95_000;
    tarif.droitsInscription = 150_000;
    expect(e[0].montantDu).toBe(100_000);
    expect(e.slice(1).every((x) => x.montantDu === 80_000)).toBe(true);
  });

  it("refuse des droits, une mensualité, un nombre de mois ou un mois de début invalides", () => {
    expect(() => genererEcheances({ ...TARIF, droitsInscription: 0 }, ANNEE_2026)).toThrow(RangeError);
    expect(() => genererEcheances({ ...TARIF, montantMensuel: 0 }, ANNEE_2026)).toThrow(RangeError);
    expect(() => genererEcheances({ ...TARIF, montantMensuel: 80_000.5 }, ANNEE_2026)).toThrow(RangeError);
    expect(() => genererEcheances({ ...TARIF, nombreMois: 0 }, ANNEE_2026)).toThrow(RangeError);
    expect(() => genererEcheances({ ...TARIF, nombreMois: 13 }, ANNEE_2026)).toThrow(RangeError);
    expect(() => genererEcheances(TARIF, { anneeDebut: 2026, moisDebutEcolage: 13 })).toThrow(RangeError);
  });
});

describe("echeanceFrais", () => {
  it("copie le montant et le mois du frais et garde son identifiant", () => {
    expect(echeanceFrais({ id: "f1", montant: 15_000, mois: mois(2027, 3) })).toEqual({
      type: "FRAIS",
      mois: mois(2027, 3),
      montantDu: 15_000,
      fraisId: "f1",
    });
  });

  it("refuse un montant nul, négatif ou non entier", () => {
    for (const montant of [0, -1, 1_000.5]) {
      expect(() => echeanceFrais({ id: "f1", montant, mois: mois(2027, 3) }), String(montant)).toThrow(RangeError);
    }
  });
});

describe("libelleEcheance", () => {
  it("droits : « Droits d'inscription », sans notion de tranche", () => {
    expect(libelleEcheance({ type: "DROITS", mois: mois(2026, 10) })).toBe("Droits d'inscription");
  });

  it("mensualité : mois en toutes lettres avec majuscule et année", () => {
    expect(libelleEcheance({ type: "MENSUALITE", mois: mois(2026, 10) })).toBe("Octobre 2026");
    expect(libelleEcheance({ type: "MENSUALITE", mois: mois(2027, 2) })).toBe("Février 2027");
  });

  it("frais : le libellé du frais, nettoyé ; « Frais » à défaut", () => {
    expect(libelleEcheance({ type: "FRAIS", mois: mois(2027, 3), libelleFrais: "  Frais d'examen " })).toBe("Frais d'examen");
    expect(libelleEcheance({ type: "FRAIS", mois: mois(2027, 3), libelleFrais: null })).toBe("Frais");
    expect(libelleEcheance({ type: "FRAIS", mois: mois(2027, 3) })).toBe("Frais");
  });
});

describe("retard : estEchue, statutEcheance, dateLimiteRetard", () => {
  const octobre = mois(2026, 10);

  it("dernier jour du mois M : pas échue ; 1er du mois M+1 : échue", () => {
    expect(estEchue(octobre, "2026-10-01")).toBe(false);
    expect(estEchue(octobre, "2026-10-31")).toBe(false);
    expect(estEchue(octobre, "2026-11-01")).toBe(true);
    expect(estEchue(octobre, "2027-03-15")).toBe(true);
  });

  it("décembre → janvier traverse bien l'année", () => {
    const decembre = mois(2026, 12);
    expect(estEchue(decembre, "2026-12-31")).toBe(false);
    expect(estEchue(decembre, "2027-01-01")).toBe(true);
  });

  it("une échéance non payée : à venir le dernier jour du mois, en retard le 1er du suivant", () => {
    expect(statutEcheance(80_000, 0, octobre, "2026-10-31")).toBe("a_venir");
    expect(statutEcheance(80_000, 0, octobre, "2026-11-01")).toBe("retard");
  });

  it("acompte versé sur un mois non échu : partiel ; une fois le mois échu : en retard", () => {
    expect(statutEcheance(80_000, 20_000, octobre, "2026-10-31")).toBe("partiel");
    expect(statutEcheance(80_000, 20_000, octobre, "2026-11-01")).toBe("retard");
  });

  it("échéance soldée : payée, à toute date", () => {
    expect(statutEcheance(80_000, 80_000, octobre, "2026-09-01")).toBe("paye");
    expect(statutEcheance(80_000, 80_000, octobre, "2027-06-01")).toBe("paye");
  });

  it("une échéance future reste à venir, même plusieurs mois avant", () => {
    expect(statutEcheance(80_000, 0, mois(2027, 5), "2026-10-01")).toBe("a_venir");
  });

  it("droits exigibles le 1er mois : partiels pendant ce mois, en retard dès le 1er du 2e mois", () => {
    const droits = genererEcheances(TARIF, ANNEE_2026).find((x) => x.type === "DROITS")!;
    expect(statutEcheance(droits.montantDu, 0, droits.mois, "2026-10-31")).toBe("a_venir");
    expect(statutEcheance(droits.montantDu, 30_000, droits.mois, "2026-10-01")).toBe("partiel");
    expect(statutEcheance(droits.montantDu, 70_000, droits.mois, "2026-10-31")).toBe("partiel");
    expect(statutEcheance(droits.montantDu, 70_000, droits.mois, "2026-11-01")).toBe("retard");
    expect(statutEcheance(droits.montantDu, 0, droits.mois, "2026-11-01")).toBe("retard");
    expect(statutEcheance(droits.montantDu, 100_000, droits.mois, "2026-11-01")).toBe("paye");
  });

  it("année commençant en janvier : droits en retard au 1er février", () => {
    const droits = genererEcheances(TARIF, { anneeDebut: 2027, moisDebutEcolage: 1 }).find((x) => x.type === "DROITS")!;
    expect(statutEcheance(droits.montantDu, 10_000, droits.mois, "2027-01-31")).toBe("partiel");
    expect(statutEcheance(droits.montantDu, 10_000, droits.mois, "2027-02-01")).toBe("retard");
  });

  it("un frais exigible en mars : à venir ou partiel le 31 mars, en retard le 1er avril", () => {
    const frais = mois(2027, 3);
    expect(statutEcheance(15_000, 0, frais, "2027-03-31")).toBe("a_venir");
    expect(statutEcheance(15_000, 5_000, frais, "2027-03-31")).toBe("partiel");
    expect(statutEcheance(15_000, 5_000, frais, "2027-04-01")).toBe("retard");
    expect(statutEcheance(15_000, 0, frais, "2027-04-01")).toBe("retard");
  });

  it("estExigible : vrai dès le 1er du mois d'exigibilité (mois en cours compris), faux avant", () => {
    const mars = mois(2027, 3);
    expect(estExigible(mars, "2027-02-28")).toBe(false);
    expect(estExigible(mars, "2027-03-01")).toBe(true);
    expect(estExigible(mars, "2027-03-31")).toBe(true);
    expect(estExigible(mars, "2027-04-01")).toBe(true);
  });

  it("dateLimiteRetard : 1er du mois courant à minuit UTC, quel que soit le jour", () => {
    expect(dateLimiteRetard("2026-10-31").toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(dateLimiteRetard("2027-01-01").toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("refuse un jour mal formé ou inexistant", () => {
    expect(() => estEchue(octobre, "2026-10-1")).toThrow(RangeError);
    expect(() => estEchue(octobre, "2026-02-30")).toThrow(RangeError);
  });
});

describe("situation", () => {
  let n = 0;
  const e = (anneeDebut: number, m: Date, montantDu: number, paye: number, type: TypeEcheance = "MENSUALITE"): EcheancePayee => ({
    id: `e${++n}-${anneeDebut}-${m.toISOString().slice(0, 7)}-${type}`,
    type,
    anneeDebut,
    mois: m,
    montantDu,
    paye,
  });

  it("totaux généraux et par année scolaire, la plus ancienne d'abord", () => {
    const echeances = [
      e(2026, mois(2026, 10), 50_000, 0),
      e(2026, mois(2026, 10), 80_000, 0),
      e(2025, mois(2025, 10), 80_000, 80_000),
      e(2025, mois(2025, 11), 80_000, 30_000),
    ];
    const s = situation(echeances, "2026-10-15");
    expect(s.parAnnee.map((a) => a.anneeDebut)).toEqual([2025, 2026]);
    expect(s).toMatchObject({ du: 290_000, paye: 110_000, reste: 180_000 });
    expect(s.parAnnee[0]).toMatchObject({ du: 160_000, paye: 110_000, reste: 50_000, moisEnRetard: 1, resteEnRetard: 50_000 });
    expect(s.parAnnee[1]).toMatchObject({ du: 130_000, paye: 0, reste: 130_000, moisEnRetard: 0, resteEnRetard: 0 });
  });

  it("duEchu et payeEchu ne comptent que les échéances échues", () => {
    const echeances = [
      e(2026, mois(2026, 10), 80_000, 80_000),
      e(2026, mois(2026, 11), 80_000, 30_000),
      e(2026, mois(2026, 12), 80_000, 80_000),
    ];
    const s = situation(echeances, "2026-12-10");
    expect(s.duEchu).toBe(160_000);
    expect(s.payeEchu).toBe(110_000);
    expect(s.resteEnRetard).toBe(50_000);
  });

  it("les droits entrent dans l'attendu à date au 1er du 2e mois de l'année, pas avant", () => {
    const echeances = [e(2026, mois(2026, 10), 100_000, 0, "DROITS"), e(2026, mois(2026, 10), 80_000, 80_000)];
    expect(situation(echeances, "2026-10-31")).toMatchObject({ duEchu: 0, resteEnRetard: 0, moisEnRetard: 0 });
    expect(situation(echeances, "2026-11-01")).toMatchObject({ duEchu: 180_000, resteEnRetard: 100_000, moisEnRetard: 1 });
  });

  it("un mois où seul un frais est impayé compte comme un mois en retard", () => {
    const echeances = [e(2027, mois(2027, 3), 80_000, 80_000), e(2027, mois(2027, 3), 15_000, 0, "FRAIS")];
    expect(situation(echeances, "2027-04-01")).toMatchObject({ moisEnRetard: 1, resteEnRetard: 15_000 });
    expect(situation(echeances, "2027-03-31")).toMatchObject({ moisEnRetard: 0, resteEnRetard: 0 });
  });

  it("une mensualité et un frais impayés d'un même mois ne font qu'un mois en retard", () => {
    const echeances = [
      e(2026, mois(2026, 10), 80_000, 0),
      e(2026, mois(2026, 10), 15_000, 0, "FRAIS"),
      e(2026, mois(2026, 11), 80_000, 0),
    ];
    expect(situation(echeances, "2026-12-01").moisEnRetard).toBe(2);
    expect(situation(echeances, "2026-11-01").moisEnRetard).toBe(1);
  });

  it("le payé retenu ne dépasse jamais le dû d'une échéance", () => {
    const s = situation([e(2026, mois(2026, 10), 80_000, 95_000)], "2026-12-01");
    expect(s).toMatchObject({ du: 80_000, paye: 80_000, reste: 0, payeEchu: 80_000 });
  });

  it("ignore les échéances non dues après une sortie", () => {
    const nonDue = { ...e(2026, mois(2027, 5), 80_000, 0), nonDueSortie: true };
    const s = situation([e(2026, mois(2026, 10), 80_000, 0), nonDue], "2026-11-01");
    expect(s).toMatchObject({ du: 80_000, reste: 80_000 });
  });

  it("deux années scolaires avec un même mois civil ne se confondent pas", () => {
    const echeances = [e(2025, mois(2026, 7), 80_000, 0), e(2026, mois(2026, 7), 80_000, 0)];
    expect(situation(echeances, "2026-09-01").moisEnRetard).toBe(1);
    expect(situation(echeances, "2026-09-01").parAnnee.map((a) => a.moisEnRetard)).toEqual([1, 1]);
  });

  it("sans échéance : tout à zéro", () => {
    expect(situation([], "2026-10-01")).toEqual({
      du: 0, paye: 0, reste: 0, resteEnRetard: 0, moisEnRetard: 0, duEchu: 0, payeEchu: 0, parAnnee: [],
    });
  });

  it("l'impayé d'une année passée reste dû sur cette année, sans notion d'arriérés", () => {
    const echeances = [e(2025, mois(2026, 7), 80_000, 0), e(2026, mois(2026, 10), 80_000, 0)];
    const s = situation(echeances, "2026-10-15");
    expect(s.parAnnee[0].reste).toBe(80_000);
    expect(s.parAnnee[0].resteEnRetard).toBe(80_000);
    expect(s.parAnnee[1].resteEnRetard).toBe(0);
    expect(s).not.toHaveProperty("arrieres");
  });
});

type Ligne = { id: string; type: TypeEcheance; anneeDebut: number; mois: Date; rangFrais?: number };
const droits = (id: string, anneeDebut: number): Ligne => ({ id, type: "DROITS", anneeDebut, mois: mois(anneeDebut, 10) });
const mens = (id: string, anneeDebut: number, m: Date): Ligne => ({ id, type: "MENSUALITE", anneeDebut, mois: m });
const frais = (id: string, anneeDebut: number, m: Date, rangFrais: number): Ligne => ({ id, type: "FRAIS", anneeDebut, mois: m, rangFrais });
const ids = (l: Ligne[]) => l.map((x) => x.id);

describe("rangSolde", () => {
  it("5 rangs : droits, mensualité exigible, frais exigible, mensualité à venir, frais à venir", () => {
    const jour = "2027-03-10";
    expect(rangSolde({ type: "DROITS", mois: mois(2026, 10) }, jour)).toBe(1);
    expect(rangSolde({ type: "MENSUALITE", mois: mois(2027, 3) }, jour)).toBe(2);
    expect(rangSolde({ type: "FRAIS", mois: mois(2027, 3) }, jour)).toBe(3);
    expect(rangSolde({ type: "MENSUALITE", mois: mois(2027, 4) }, jour)).toBe(4);
    expect(rangSolde({ type: "FRAIS", mois: mois(2027, 4) }, jour)).toBe(5);
  });

  it("les droits sont toujours de rang 1, même avant leur mois", () => {
    expect(rangSolde({ type: "DROITS", mois: mois(2026, 10) }, "2026-09-05")).toBe(1);
  });

  it("une mensualité ou un frais passés sont exigibles (rangs 2 et 3)", () => {
    expect(rangSolde({ type: "MENSUALITE", mois: mois(2026, 10) }, "2027-03-10")).toBe(2);
    expect(rangSolde({ type: "FRAIS", mois: mois(2026, 11) }, "2027-03-10")).toBe(3);
  });
});

describe("trierPourSolde", () => {
  it("en mars : droits, mensualités dues, frais dus, mensualités à venir, frais à venir", () => {
    const tri = trierPourSolde(
      [
        frais("frais-mai", 2026, mois(2027, 5), 3),
        mens("mens-avr", 2026, mois(2027, 4)),
        frais("frais-mars", 2026, mois(2027, 3), 2),
        mens("mens-mars", 2026, mois(2027, 3)),
        mens("mens-oct", 2026, mois(2026, 10)),
        droits("droits", 2026),
        frais("frais-oct", 2026, mois(2026, 10), 1),
      ],
      "2027-03-10",
    );
    expect(ids(tri)).toEqual(["droits", "mens-oct", "mens-mars", "frais-oct", "frais-mars", "mens-avr", "frais-mai"]);
  });

  it("deux années : la plus ancienne d'abord, tous rangs confondus", () => {
    const tri = trierPourSolde(
      [
        mens("oct26", 2026, mois(2026, 10)),
        droits("droits26", 2026),
        frais("frais25-juil", 2025, mois(2026, 7), 1),
        mens("juin25", 2025, mois(2026, 6)),
        droits("droits25", 2025),
      ],
      "2026-10-15",
    );
    expect(ids(tri)).toEqual(["droits25", "juin25", "frais25-juil", "droits26", "oct26"]);
  });

  it("bascule du dernier jour du mois au 1er : le frais d'avril passe devant la mensualité de mai", () => {
    const entree = [mens("mens-mai", 2026, mois(2027, 5)), frais("frais-avr", 2026, mois(2027, 4), 1), mens("mens-avr", 2026, mois(2027, 4))];
    expect(ids(trierPourSolde(entree, "2027-03-31"))).toEqual(["mens-avr", "mens-mai", "frais-avr"]);
    expect(ids(trierPourSolde(entree, "2027-04-01"))).toEqual(["mens-avr", "frais-avr", "mens-mai"]);
  });

  it("le frais du mois M est exigible le 31 mars comme le 1er mars, et passe avant la mensualité d'avril", () => {
    const entree = [mens("mens-avr", 2026, mois(2027, 4)), frais("frais-mars", 2026, mois(2027, 3), 1)];
    expect(ids(trierPourSolde(entree, "2027-03-01"))).toEqual(["frais-mars", "mens-avr"]);
    expect(ids(trierPourSolde(entree, "2027-03-31"))).toEqual(["frais-mars", "mens-avr"]);
  });

  it("deux frais du même mois : dans l'ordre de création (rangFrais), quel que soit l'ordre d'entrée et l'id", () => {
    const a = frais("zzz", 2026, mois(2027, 3), 1);
    const b = frais("aaa", 2026, mois(2027, 3), 2);
    expect(ids(trierPourSolde([b, a], "2027-03-10"))).toEqual(["zzz", "aaa"]);
    expect(ids(trierPourSolde([a, b], "2027-03-10"))).toEqual(["zzz", "aaa"]);
    expect(ids(trierPourSolde([b, a], "2027-01-10"))).toEqual(["zzz", "aaa"]);
  });

  it("deux frais de mois différents : le mois d'exigibilité prime sur le rang de création", () => {
    const tard = frais("tard", 2026, mois(2027, 5), 1);
    const tot = frais("tot", 2026, mois(2027, 2), 2);
    expect(ids(trierPourSolde([tard, tot], "2027-06-01"))).toEqual(["tot", "tard"]);
  });

  it("égalité parfaite : départagé par id, de façon stable", () => {
    const tri = trierPourSolde([frais("b", 2026, mois(2027, 3), 1), frais("a", 2026, mois(2027, 3), 1)], "2027-03-10");
    expect(ids(tri)).toEqual(["a", "b"]);
  });

  it("ne modifie pas le tableau reçu", () => {
    const entree = [mens("b", 2026, mois(2026, 11)), mens("a", 2026, mois(2026, 10))];
    trierPourSolde(entree, "2026-12-01");
    expect(ids(entree)).toEqual(["b", "a"]);
  });
});

describe("trierChronologique", () => {
  it("ordre de lecture : année, droits, puis mois par mois avec la mensualité avant les frais", () => {
    const tri = trierChronologique([
      frais("frais-dec", 2026, mois(2026, 12), 1),
      mens("mens-dec", 2026, mois(2026, 12)),
      droits("droits", 2026),
      mens("mens-oct", 2026, mois(2026, 10)),
      droits("droits-25", 2025),
    ]);
    expect(ids(tri)).toEqual(["droits-25", "droits", "mens-oct", "mens-dec", "frais-dec"]);
  });
});

describe("repartirPaiement", () => {
  const trois: EcheanceAPayer[] = [
    { id: "oct", reste: 80_000 },
    { id: "nov", reste: 80_000 },
    { id: "dec", reste: 80_000 },
  ];

  it("plusieurs mois d'un coup : 160 000 solde octobre et novembre", () => {
    const r = reussie(repartirPaiement(trois, 160_000));
    expect(r.lignes).toEqual([
      { echeanceId: "oct", montant: 80_000, resteEcheance: 0 },
      { echeanceId: "nov", montant: 80_000, resteEcheance: 0 },
    ]);
    expect(r.acompte).toBeNull();
    expect(r.resteDuApres).toBe(80_000);
  });

  it("surplus : 100 000 pour un mois à 80 000 = mois soldé + 20 000 d'acompte sur le suivant", () => {
    const r = reussie(repartirPaiement(trois, 100_000));
    expect(r.lignes).toEqual([
      { echeanceId: "oct", montant: 80_000, resteEcheance: 0 },
      { echeanceId: "nov", montant: 20_000, resteEcheance: 60_000 },
    ]);
    expect(r.acompte).toEqual({ echeanceId: "nov", montant: 20_000, resteEcheance: 60_000 });
    expect(r.resteDuApres).toBe(140_000);
  });

  it("montant inférieur à l'échéance : payée en partie", () => {
    const r = reussie(repartirPaiement(trois, 50_000));
    expect(r.lignes).toEqual([{ echeanceId: "oct", montant: 50_000, resteEcheance: 30_000 }]);
    expect(r.acompte).toEqual({ echeanceId: "oct", montant: 50_000, resteEcheance: 30_000 });
  });

  it("droits payés en partie : la mensualité suivante n'est pas touchée", () => {
    const droitsPuisMois: EcheanceAPayer[] = [
      { id: "droits", reste: 100_000 },
      { id: "mens-oct", reste: 80_000 },
    ];
    const r = reussie(repartirPaiement(droitsPuisMois, 20_000));
    expect(r.lignes).toEqual([{ echeanceId: "droits", montant: 20_000, resteEcheance: 80_000 }]);
    expect(r.acompte).toEqual({ echeanceId: "droits", montant: 20_000, resteEcheance: 80_000 });
    expect(r.resteDuApres).toBe(160_000);
  });

  it("droits payés en plusieurs fois : chaque versement diminue le reste de l'unique échéance de droits", () => {
    const apres1 = reussie(repartirPaiement([{ id: "droits", reste: 100_000 }], 40_000));
    expect(apres1.lignes[0]).toMatchObject({ montant: 40_000, resteEcheance: 60_000 });
    const apres2 = reussie(repartirPaiement([{ id: "droits", reste: 60_000 }], 60_000));
    expect(apres2.lignes[0]).toMatchObject({ montant: 60_000, resteEcheance: 0 });
    expect(apres2.acompte).toBeNull();
  });

  it("frais payé en partie : le reste du frais est dû, la mensualité qui suit n'est pas touchée", () => {
    const r = reussie(
      repartirPaiement(
        [
          { id: "frais", reste: 15_000 },
          { id: "mens-avr", reste: 80_000 },
        ],
        10_000,
      ),
    );
    expect(r.lignes).toEqual([{ echeanceId: "frais", montant: 10_000, resteEcheance: 5_000 }]);
    expect(r.acompte).toEqual({ echeanceId: "frais", montant: 10_000, resteEcheance: 5_000 });
  });

  it("refuse un trop-perçu sur les droits seuls et sur un frais seul", () => {
    expect(repartirPaiement([{ id: "droits", reste: 100_000 }], 100_001).ok).toBe(false);
    expect(repartirPaiement([{ id: "frais", reste: 15_000 }], 15_001).ok).toBe(false);
  });

  it("deuxième paiement sur une échéance déjà partielle : solde le reste puis déborde", () => {
    const apresAcompte: EcheanceAPayer[] = [
      { id: "oct", reste: 30_000 },
      { id: "nov", reste: 80_000 },
    ];
    const r = reussie(repartirPaiement(apresAcompte, 40_000));
    expect(r.lignes).toEqual([
      { echeanceId: "oct", montant: 30_000, resteEcheance: 0 },
      { echeanceId: "nov", montant: 10_000, resteEcheance: 70_000 },
    ]);
  });

  it("un paiement peut couvrir deux années scolaires, la plus ancienne d'abord", () => {
    const deuxAnnees: EcheanceAPayer[] = [
      { id: "juillet-2025-2026", reste: 80_000 },
      { id: "octobre-2026-2027", reste: 80_000 },
    ];
    const r = reussie(repartirPaiement(deuxAnnees, 100_000));
    expect(r.lignes.map((l) => [l.echeanceId, l.montant])).toEqual([
      ["juillet-2025-2026", 80_000],
      ["octobre-2026-2027", 20_000],
    ]);
  });

  it("paiement égal au reste dû total : tout est soldé, reste dû nul", () => {
    const r = reussie(repartirPaiement(trois, 240_000));
    expect(r.lignes).toHaveLength(3);
    expect(r.acompte).toBeNull();
    expect(r.resteDuApres).toBe(0);
  });

  it("la somme des lignes égale toujours le montant reçu", () => {
    for (const montant of [1, 79_999, 80_000, 80_001, 159_999, 239_999, 240_000]) {
      const r = reussie(repartirPaiement(trois, montant));
      expect(r.lignes.reduce((s, l) => s + l.montant, 0)).toBe(montant);
    }
  });

  it("refuse un trop-perçu au-delà du reste dû total de l'étudiant", () => {
    const r = repartirPaiement(trois, 240_001);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreur).toMatch(/240\s000/);
  });

  it("refuse 0, un négatif et un décimal", () => {
    for (const montant of [0, -5_000, 1_000.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(repartirPaiement(trois, montant).ok, String(montant)).toBe(false);
    }
  });

  it("refuse quand il n'y a rien à payer", () => {
    const r = repartirPaiement([], 10_000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreur).toMatch(/rien à payer/);
    expect(repartirPaiement([{ id: "x", reste: 0 }], 10_000).ok).toBe(false);
  });

  it("ignore une échéance au reste nul au milieu de la liste", () => {
    const r = reussie(
      repartirPaiement(
        [
          { id: "a", reste: 10_000 },
          { id: "b", reste: 0 },
          { id: "c", reste: 10_000 },
        ],
        15_000,
      ),
    );
    expect(r.lignes.map((l) => l.echeanceId)).toEqual(["a", "c"]);
  });

  it("lève une erreur de programmation sur un reste non entier", () => {
    expect(() => repartirPaiement([{ id: "a", reste: 100.5 }], 100)).toThrow(RangeError);
  });
});

describe("répartition dans l'ordre de solde, en mars", () => {
  const JOUR = "2027-03-10";
  const ligne = (id: string, type: TypeEcheance, m: Date, montantDu: number, paye: number, rangFrais?: number) => ({
    id,
    type,
    anneeDebut: 2026,
    mois: m,
    montantDu,
    paye,
    rangFrais,
  });
  const aPayer = (toutes: ReturnType<typeof ligne>[]): EcheanceAPayer[] =>
    trierPourSolde(toutes, JOUR)
      .map((x) => ({ id: x.id, reste: x.montantDu - x.paye }))
      .filter((x) => x.reste > 0);

  const aJour = [
    ligne("droits", "DROITS", mois(2026, 10), 100_000, 100_000),
    ligne("mens-mars", "MENSUALITE", mois(2027, 3), 80_000, 80_000),
    ligne("mens-avr", "MENSUALITE", mois(2027, 4), 80_000, 0),
    ligne("frais-mars", "FRAIS", mois(2027, 3), 15_000, 0, 1),
  ];

  it("étudiant à jour : 15 000 Ar soldent le frais exigible en mars avant la mensualité d'avril", () => {
    const r = reussie(repartirPaiement(aPayer(aJour), 15_000));
    expect(r.lignes).toEqual([{ echeanceId: "frais-mars", montant: 15_000, resteEcheance: 0 }]);
    expect(r.resteDuApres).toBe(80_000);
  });

  it("étudiant à jour : 60 000 Ar soldent le frais puis mettent 45 000 Ar en acompte sur avril", () => {
    const r = reussie(repartirPaiement(aPayer(aJour), 60_000));
    expect(r.lignes).toEqual([
      { echeanceId: "frais-mars", montant: 15_000, resteEcheance: 0 },
      { echeanceId: "mens-avr", montant: 45_000, resteEcheance: 35_000 },
    ]);
    expect(r.acompte).toEqual({ echeanceId: "mens-avr", montant: 45_000, resteEcheance: 35_000 });
  });

  it("étudiant en retard : ses mensualités dues sont soldées avant le frais de mars", () => {
    const enRetard = [
      ligne("droits", "DROITS", mois(2026, 10), 100_000, 100_000),
      ligne("mens-fev", "MENSUALITE", mois(2027, 2), 80_000, 0),
      ligne("mens-mars", "MENSUALITE", mois(2027, 3), 80_000, 0),
      ligne("mens-avr", "MENSUALITE", mois(2027, 4), 80_000, 0),
      ligne("frais-mars", "FRAIS", mois(2027, 3), 15_000, 0, 1),
    ];
    const r = reussie(repartirPaiement(aPayer(enRetard), 175_000));
    expect(r.lignes).toEqual([
      { echeanceId: "mens-fev", montant: 80_000, resteEcheance: 0 },
      { echeanceId: "mens-mars", montant: 80_000, resteEcheance: 0 },
      { echeanceId: "frais-mars", montant: 15_000, resteEcheance: 0 },
    ]);
    const petit = reussie(repartirPaiement(aPayer(enRetard), 15_000));
    expect(petit.lignes).toEqual([{ echeanceId: "mens-fev", montant: 15_000, resteEcheance: 65_000 }]);
  });

  it("les droits impayés passent avant tout le reste, mensualités dues comprises", () => {
    const droitsDus = [
      ligne("droits", "DROITS", mois(2026, 10), 100_000, 0),
      ligne("mens-fev", "MENSUALITE", mois(2027, 2), 80_000, 0),
      ligne("frais-mars", "FRAIS", mois(2027, 3), 15_000, 0, 1),
    ];
    const r = reussie(repartirPaiement(aPayer(droitsDus), 120_000));
    expect(r.lignes).toEqual([
      { echeanceId: "droits", montant: 100_000, resteEcheance: 0 },
      { echeanceId: "mens-fev", montant: 20_000, resteEcheance: 60_000 },
    ]);
  });

  it("refuse un trop-perçu au-delà du reste dû total, frais compris", () => {
    expect(repartirPaiement(aPayer(aJour), 95_001).ok).toBe(false);
    expect(reussie(repartirPaiement(aPayer(aJour), 95_000)).resteDuApres).toBe(0);
  });
});

describe("restesApres, montantPourCases", () => {
  const nonSoldees = [
    { id: "oct", reste: 80_000, mois: mois(2026, 10) },
    { id: "nov", reste: 80_000, mois: mois(2026, 11) },
    { id: "dec", reste: 80_000, mois: mois(2026, 12) },
  ];

  it("restesApres : reste total et reste en retard une fois les lignes imputées", () => {
    const r = restesApres(
      nonSoldees,
      [
        { echeanceId: "oct", montant: 80_000 },
        { echeanceId: "nov", montant: 30_000 },
      ],
      "2026-12-10",
    );
    expect(r).toEqual({ resteApres: 130_000, retardApres: 50_000 });
  });

  it("restesApres : rien d'imputé, tout le reste est inchangé", () => {
    expect(restesApres(nonSoldees, [], "2026-12-10")).toEqual({ resteApres: 240_000, retardApres: 160_000 });
  });

  it("restesApres : un frais du mois en cours n'est pas en retard, celui du mois passé l'est", () => {
    const avecFrais = [
      { id: "frais-fev", reste: 15_000, mois: mois(2027, 2) },
      { id: "frais-mars", reste: 15_000, mois: mois(2027, 3) },
    ];
    expect(restesApres(avecFrais, [], "2027-03-10")).toEqual({ resteApres: 30_000, retardApres: 15_000 });
  });

  it("montantPourCases : cumul des k premières cases dans l'ordre de solde", () => {
    const restes: EcheanceAPayer[] = [
      { id: "a", reste: 30_000 },
      { id: "b", reste: 80_000 },
      { id: "c", reste: 80_000 },
    ];
    expect(montantPourCases(restes, 0)).toBe(0);
    expect(montantPourCases(restes, 1)).toBe(30_000);
    expect(montantPourCases(restes, 3)).toBe(190_000);
  });

  it("montantPourCases : refuse un nombre de cases hors bornes", () => {
    expect(() => montantPourCases([{ id: "a", reste: 1 }], 2)).toThrow(RangeError);
    expect(() => montantPourCases([{ id: "a", reste: 1 }], -1)).toThrow(RangeError);
    expect(() => montantPourCases([{ id: "a", reste: 1 }], 0.5)).toThrow(RangeError);
  });
});
