import { describe, expect, it } from "vitest";
import {
  controleTranches,
  dateLimiteRetard,
  estEchue,
  genererEcheances,
  libelleEcheance,
  montantPourCases,
  preselection,
  repartirPaiement,
  restesApres,
  situation,
  statutEcheance,
  tarifDepuisEcheances,
  tranchesDroits,
  trierPourSolde,
  type EcheanceAPayer,
  type EcheancePayee,
  type TarifEcheances,
} from "@/lib/ecolage";

const TARIF: TarifEcheances = { droitsInscription: 100_000, montantMensuel: 80_000, nombreMois: 10 };
const ANNEE_2026 = { anneeDebut: 2026, moisDebutEcolage: 10 };

const mois = (annee: number, mois1a12: number) => new Date(Date.UTC(annee, mois1a12 - 1, 1));
const montants = (a: { montantDu: number }[]) => a.map((e) => e.montantDu);

function reussie(r: ReturnType<typeof repartirPaiement>) {
  if (!r.ok) throw new Error(`Répartition refusée : ${r.erreur}`);
  return r;
}

describe("tranchesDroits", () => {
  it("100 000 en 1, 2 et 3 fois", () => {
    expect(tranchesDroits(100_000, 1)).toEqual([100_000]);
    expect(tranchesDroits(100_000, 2)).toEqual([50_000, 50_000]);
    expect(tranchesDroits(100_000, 3)).toEqual([34_000, 33_000, 33_000]);
  });

  it("arrondit les parts au millier inférieur et met le reste sur la 1re tranche", () => {
    expect(tranchesDroits(125_500, 3)).toEqual([43_500, 41_000, 41_000]);
    expect(tranchesDroits(125_500, 2)).toEqual([63_500, 62_000]);
  });

  it("la somme des tranches redonne toujours les droits", () => {
    for (const droits of [3_000, 99_999, 100_000, 125_500, 250_001]) {
      for (const n of [1, 2, 3]) {
        expect(tranchesDroits(droits, n).reduce((s, x) => s + x, 0)).toBe(droits);
      }
    }
  });

  it("refuse des droits trop faibles pour être découpés (part nulle après arrondi)", () => {
    expect(() => tranchesDroits(2_000, 3)).toThrow(RangeError);
    expect(() => tranchesDroits(1_500, 2)).toThrow(/trop faibles/);
    expect(tranchesDroits(1_500, 1)).toEqual([1_500]);
  });

  it("refuse un nombre de tranches hors 1, 2, 3 et des droits nuls ou non entiers", () => {
    expect(() => tranchesDroits(100_000, 4)).toThrow(RangeError);
    expect(() => tranchesDroits(100_000, 0)).toThrow(RangeError);
    expect(() => tranchesDroits(0, 1)).toThrow(RangeError);
    expect(() => tranchesDroits(100_000.5, 1)).toThrow(RangeError);
  });

  it("controleTranches renvoie un message affichable plutôt que de lever", () => {
    expect(controleTranches(100_000, 3)).toBeNull();
    expect(controleTranches(2_000, 3)).toMatch(/trop faibles/);
    expect(controleTranches(100_000, 5)).toMatch(/1, 2 ou 3/);
  });
});

describe("genererEcheances", () => {
  it("droits en une fois : 1 droits + 10 mensualités = 11 échéances", () => {
    expect(genererEcheances(TARIF, ANNEE_2026, 1)).toHaveLength(11);
  });

  it("droits en 2 fois : 12 échéances ; en 3 fois : 13", () => {
    expect(genererEcheances(TARIF, ANNEE_2026, 2)).toHaveLength(12);
    expect(genererEcheances(TARIF, ANNEE_2026, 3)).toHaveLength(13);
  });

  it("ordre de solde : pour chaque mois, la tranche de droits puis la mensualité", () => {
    const e = genererEcheances(TARIF, ANNEE_2026, 3);
    expect(e.slice(0, 7).map((x) => [x.type, x.tranche, x.mois.getUTCMonth() + 1])).toEqual([
      ["DROITS", 1, 10],
      ["MENSUALITE", null, 10],
      ["DROITS", 2, 11],
      ["MENSUALITE", null, 11],
      ["DROITS", 3, 12],
      ["MENSUALITE", null, 12],
      ["MENSUALITE", null, 1],
    ]);
    expect(e.map((x) => x.ordre)).toEqual(Array.from({ length: 13 }, (_, i) => i + 1));
  });

  it("tranches de droits exigibles en octobre, novembre, décembre ; montants des tranches et des mensualités", () => {
    const e = genererEcheances(TARIF, ANNEE_2026, 3);
    const droits = e.filter((x) => x.type === "DROITS");
    expect(droits.map((x) => x.mois.toISOString().slice(0, 10))).toEqual(["2026-10-01", "2026-11-01", "2026-12-01"]);
    expect(montants(droits)).toEqual([34_000, 33_000, 33_000]);
    expect(e.filter((x) => x.type === "MENSUALITE").every((x) => x.montantDu === 80_000)).toBe(true);
  });

  it("mensualités d'octobre à juillet, en traversant l'année civile, au 1er du mois à minuit UTC", () => {
    const m = genererEcheances(TARIF, ANNEE_2026, 1).filter((x) => x.type === "MENSUALITE");
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

  it("mois de début 9 : de septembre à juin, droits en septembre, octobre, novembre", () => {
    const e = genererEcheances(TARIF, { anneeDebut: 2026, moisDebutEcolage: 9 }, 3);
    const m = e.filter((x) => x.type === "MENSUALITE");
    expect(m[0].mois.toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(m[9].mois.toISOString().slice(0, 10)).toBe("2027-06-01");
    expect(e.filter((x) => x.type === "DROITS").map((x) => x.mois.getUTCMonth() + 1)).toEqual([9, 10, 11]);
  });

  it("moins de mensualités que de tranches : les tranches restantes ont leur mois, sans mensualité", () => {
    const e = genererEcheances({ ...TARIF, nombreMois: 2 }, ANNEE_2026, 3);
    expect(e.map((x) => [x.type, x.mois.getUTCMonth() + 1])).toEqual([
      ["DROITS", 10],
      ["MENSUALITE", 10],
      ["DROITS", 11],
      ["MENSUALITE", 11],
      ["DROITS", 12],
    ]);
  });

  it("copie les montants du tarif : le tarif modifié ensuite ne réécrit pas les échéances générées", () => {
    const tarif = { ...TARIF };
    const e = genererEcheances(tarif, ANNEE_2026, 1);
    tarif.montantMensuel = 95_000;
    tarif.droitsInscription = 150_000;
    expect(e[0].montantDu).toBe(100_000);
    expect(e.slice(1).every((x) => x.montantDu === 80_000)).toBe(true);
  });

  it("refuse une mensualité, un nombre de mois ou un mois de début invalides", () => {
    expect(() => genererEcheances({ ...TARIF, montantMensuel: 0 }, ANNEE_2026, 1)).toThrow(RangeError);
    expect(() => genererEcheances({ ...TARIF, montantMensuel: 80_000.5 }, ANNEE_2026, 1)).toThrow(RangeError);
    expect(() => genererEcheances({ ...TARIF, nombreMois: 0 }, ANNEE_2026, 1)).toThrow(RangeError);
    expect(() => genererEcheances({ ...TARIF, nombreMois: 13 }, ANNEE_2026, 1)).toThrow(RangeError);
    expect(() => genererEcheances(TARIF, { anneeDebut: 2026, moisDebutEcolage: 13 }, 1)).toThrow(RangeError);
  });
});

describe("tarifDepuisEcheances", () => {
  it("relit droits, mensualité et nombre de mois depuis les échéances générées", () => {
    for (const n of [1, 2, 3]) {
      expect(tarifDepuisEcheances(genererEcheances(TARIF, ANNEE_2026, n))).toEqual(TARIF);
    }
  });

  it("refuse un échéancier incohérent (sans droits, sans mensualité, mensualités différentes)", () => {
    const e = genererEcheances(TARIF, ANNEE_2026, 1);
    expect(() => tarifDepuisEcheances(e.filter((x) => x.type === "MENSUALITE"))).toThrow(RangeError);
    expect(() => tarifDepuisEcheances(e.filter((x) => x.type === "DROITS"))).toThrow(RangeError);
    const bancal = e.map((x, i) => (i === 3 ? { ...x, montantDu: 70_000 } : x));
    expect(() => tarifDepuisEcheances(bancal)).toThrow(RangeError);
  });
});

describe("libelleEcheance", () => {
  it("droits en une fois : « Droits d'inscription »", () => {
    expect(libelleEcheance({ type: "DROITS", tranche: 1, mois: mois(2026, 10) }, 1)).toBe("Droits d'inscription");
  });

  it("droits en tranches : « Droits — tranche k/n »", () => {
    expect(libelleEcheance({ type: "DROITS", tranche: 2, mois: mois(2026, 11) }, 3)).toBe("Droits — tranche 2/3");
    expect(libelleEcheance({ type: "DROITS", tranche: 2, mois: mois(2026, 11) }, 2)).toBe("Droits — tranche 2/2");
  });

  it("mensualité : mois en toutes lettres avec majuscule et année", () => {
    expect(libelleEcheance({ type: "MENSUALITE", tranche: null, mois: mois(2026, 10) }, 1)).toBe("Octobre 2026");
    expect(libelleEcheance({ type: "MENSUALITE", tranche: null, mois: mois(2027, 2) }, 3)).toBe("Février 2027");
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
  const e = (anneeDebut: number, m: Date, montantDu: number, paye: number, ordre = ++n): EcheancePayee => ({
    id: `e${ordre}-${anneeDebut}-${m.toISOString().slice(0, 7)}`,
    anneeDebut,
    mois: m,
    ordre,
    montantDu,
    paye,
  });

  it("totaux généraux et par année scolaire, la plus ancienne d'abord", () => {
    const echeances = [
      e(2026, mois(2026, 10), 50_000, 0, 1),
      e(2026, mois(2026, 10), 80_000, 0, 2),
      e(2025, mois(2025, 10), 80_000, 80_000, 1),
      e(2025, mois(2025, 11), 80_000, 30_000, 2),
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

  it("un mois avec tranche de droits et mensualité impayées compte pour un seul mois en retard", () => {
    const echeances = [
      e(2026, mois(2026, 10), 34_000, 0, 1),
      e(2026, mois(2026, 10), 80_000, 0, 2),
      e(2026, mois(2026, 11), 33_000, 0, 3),
      e(2026, mois(2026, 11), 80_000, 80_000, 4),
    ];
    expect(situation(echeances, "2026-12-01").moisEnRetard).toBe(2);
    expect(situation(echeances, "2026-11-01").moisEnRetard).toBe(1);
  });

  it("deux années scolaires avec un même mois civil ne se confondent pas", () => {
    const echeances = [e(2025, mois(2026, 7), 80_000, 0, 1), e(2026, mois(2026, 7), 80_000, 0, 1)];
    expect(situation(echeances, "2026-09-01").moisEnRetard).toBe(1);
    expect(situation(echeances, "2026-09-01").parAnnee.map((a) => a.moisEnRetard)).toEqual([1, 1]);
  });

  it("sans échéance : tout à zéro", () => {
    expect(situation([], "2026-10-01")).toEqual({
      du: 0, paye: 0, reste: 0, resteEnRetard: 0, moisEnRetard: 0, duEchu: 0, payeEchu: 0, parAnnee: [],
    });
  });

  it("l'impayé d'une année passée reste dû sur cette année, sans notion d'arriérés", () => {
    const echeances = [e(2025, mois(2026, 7), 80_000, 0, 1), e(2026, mois(2026, 10), 80_000, 0, 1)];
    const s = situation(echeances, "2026-10-15");
    expect(s.parAnnee[0].reste).toBe(80_000);
    expect(s.parAnnee[0].resteEnRetard).toBe(80_000);
    expect(s.parAnnee[1].resteEnRetard).toBe(0);
    expect(s).not.toHaveProperty("arrieres");
  });
});

describe("trierPourSolde", () => {
  const c = (id: string, anneeDebut: number, m: Date, ordre: number) => ({ id, anneeDebut, mois: m, ordre });

  it("la plus ancienne d'abord, toutes années confondues", () => {
    const tri = trierPourSolde([
      c("oct26-m", 2026, mois(2026, 10), 2),
      c("jui26-2025", 2025, mois(2026, 7), 10),
      c("oct25", 2025, mois(2025, 10), 1),
    ]);
    expect(tri.map((x) => x.id)).toEqual(["oct25", "jui26-2025", "oct26-m"]);
  });

  it("dans un même mois, la tranche de droits (ordre inférieur) précède la mensualité", () => {
    const tri = trierPourSolde([c("mens", 2026, mois(2026, 10), 2), c("droits", 2026, mois(2026, 10), 1)]);
    expect(tri.map((x) => x.id)).toEqual(["droits", "mens"]);
  });

  it("ne modifie pas le tableau reçu", () => {
    const entree = [c("b", 2026, mois(2026, 11), 3), c("a", 2026, mois(2026, 10), 1)];
    trierPourSolde(entree);
    expect(entree.map((x) => x.id)).toEqual(["b", "a"]);
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

  it("tranche de droits payée en partie, puis la mensualité du même mois n'est pas touchée", () => {
    const droitsPuisMois: EcheanceAPayer[] = [
      { id: "droits1", reste: 34_000 },
      { id: "mens-oct", reste: 80_000 },
    ];
    const r = reussie(repartirPaiement(droitsPuisMois, 20_000));
    expect(r.lignes).toEqual([{ echeanceId: "droits1", montant: 20_000, resteEcheance: 14_000 }]);
    expect(r.resteDuApres).toBe(94_000);
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

describe("restesApres, preselection, montantPourCases", () => {
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

  it("preselection : les échéances en retard seulement, pas le mois en cours", () => {
    expect(preselection(nonSoldees, "2026-12-10")).toEqual(["oct", "nov"]);
    expect(preselection(nonSoldees, "2026-10-31")).toEqual([]);
    expect(preselection(nonSoldees, "2026-11-01")).toEqual(["oct"]);
  });

  it("preselection : ignore une échéance échue au reste nul", () => {
    expect(preselection([{ id: "oct", reste: 0, mois: mois(2026, 10) }], "2026-12-10")).toEqual([]);
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
