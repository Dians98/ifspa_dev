import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { lireImpayes, lirePaiements, lireRecu, situationGuichet, TAILLE_PAGE_PAIEMENTS } from "@/server/lectures/paiements";
import { fabriquerAnnee, fabriquerEtudiant, fabriquerInscription, fabriquerPaiement } from "../factories";
import { fabriquerEtudiantInscrit, fabriquerMonde, type Monde } from "../factories/scenarios";

const TARIF = { niveau: 1, droitsInscription: 100_000, montantMensuel: 80_000, nombreMois: 10 };

let m: Monde;

beforeEach(async () => {
  m = await fabriquerMonde();
});

type Inscrit = Awaited<ReturnType<typeof fabriquerEtudiantInscrit>>;

const payer = (e: Inscrit, lignes: [number, number][], donnees = {}, caissier = m.user.id) =>
  fabriquerPaiement(
    e.etudiant.id,
    caissier,
    lignes.map(([i, montant]) => ({ echeanceId: e.inscription.echeances[i].id, montant })),
    donnees,
  );

describe("lirePaiements", () => {
  let e: Inscrit;

  /** Jour 15/11/2026 à Madagascar = du 14/11 21:00 UTC au 15/11 20:59:59 UTC. */
  async function jeuDeDonnees() {
    e = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF, { nom: "RAKOTO", prenoms: "Éloïse" });
    const base = (n: number, date: string, montant: number, donnees = {}) =>
      payer(e, [[n % 11, montant]], { numeroRecu: `R-2026-${String(n).padStart(5, "0")}`, date: new Date(date), ...donnees });
    await base(1, "2026-11-15T05:00:00Z", 80_000);
    await base(2, "2026-11-15T10:00:00Z", 50_000, { mode: "MOBILE_MONEY", operateur: "MVOLA", reference: "MP1" });
    await base(3, "2026-11-15T10:30:00Z", 40_000, { annule: true, annuleParId: m.admin.id, dateAnnulation: new Date("2026-11-15T12:00:00Z"), motifAnnulation: "doublon" });
    await base(4, "2026-11-14T21:30:00Z", 10_000);
    await base(5, "2026-11-14T20:59:59Z", 5_000);
    await base(6, "2026-11-15T21:00:00Z", 7_000);
    await base(7, "2026-09-30T10:00:00Z", 3_000);
    await base(8, "2026-11-15T11:00:00Z", 2_000, { aVerifier: true });
    await base(9, "2027-08-20T10:00:00Z", 1_000);
  }

  const numeros = (l: { lignes: { numeroRecu: string }[] }) => l.lignes.map((x) => x.numeroRecu.slice(-1));

  it("par défaut la journée du jour à Madagascar : bornes à 00 h 00 heure locale (UTC+3)", async () => {
    await jeuDeDonnees();

    const l = await lirePaiements({}, "2026-11-15");

    expect(numeros(l)).toEqual(["8", "3", "2", "1", "4"]);
    expect(l.periode).toEqual({ du: "2026-11-15", au: "2026-11-15", libelle: "Aujourd'hui, 15/11/2026" });
    expect((await lirePaiements({}, "2026-11-14")).lignes.map((x) => x.numeroRecu.slice(-1))).toEqual(["5"]);
    expect((await lirePaiements({}, "2026-11-16")).lignes.map((x) => x.numeroRecu.slice(-1))).toEqual(["6"]);
  });

  it("totaux de la sélection : paiements annulés exclus des sommes, comptés à part", async () => {
    await jeuDeDonnees();

    const { totaux } = await lirePaiements({}, "2026-11-15");

    expect(totaux).toEqual({
      montant: 80_000 + 50_000 + 10_000 + 2_000,
      nombre: 4,
      especes: 80_000 + 10_000 + 2_000,
      mobileMoney: 50_000,
      annules: 1,
      aVerifier: 1,
    });
  });

  it("une seule ligne annulée : montant et nombre à zéro", async () => {
    await jeuDeDonnees();
    const { totaux, lignes } = await lirePaiements({ statut: "annules" }, "2026-11-15");
    expect(numeros({ lignes })).toEqual(["3"]);
    expect(totaux).toMatchObject({ montant: 0, nombre: 0, especes: 0, annules: 1 });
    expect(lignes[0].annulation).toEqual({ date: "15/11/2026", par: "Admin Test", motif: "doublon" });
  });

  it("filtres de statut, de mode, d'opérateur et de caissier", async () => {
    await jeuDeDonnees();
    const j = "2026-11-15";

    expect(numeros(await lirePaiements({ statut: "valides" }, j))).toEqual(["8", "2", "1", "4"]);
    expect(numeros(await lirePaiements({ statut: "aVerifier" }, j))).toEqual(["8"]);
    expect(numeros(await lirePaiements({ mode: "MOBILE_MONEY" }, j))).toEqual(["2"]);
    expect(numeros(await lirePaiements({ mode: "MVOLA" }, j))).toEqual(["2"]);
    expect(numeros(await lirePaiements({ mode: "ORANGE_MONEY" }, j))).toEqual([]);
    expect(numeros(await lirePaiements({ mode: "ESPECES" }, j))).toEqual(["8", "3", "1", "4"]);
    expect(numeros(await lirePaiements({ caissierId: m.admin.id }, j))).toEqual([]);
    expect(numeros(await lirePaiements({ caissierId: m.user.id }, j))).toEqual(["8", "3", "2", "1", "4"]);
  });

  it("recherche par numéro de reçu ou par étudiant (sans accent)", async () => {
    await jeuDeDonnees();
    const j = "2026-11-15";

    expect(numeros(await lirePaiements({ q: "r-2026-00002" }, j))).toEqual(["2"]);
    expect(numeros(await lirePaiements({ q: "00001" }, j))).toEqual(["1"]);
    expect(numeros(await lirePaiements({ q: "eloise rakoto" }, j))).toEqual(["8", "3", "2", "1", "4"]);
    expect(numeros(await lirePaiements({ q: "inconnu" }, j))).toEqual([]);
  });

  it("périodes mois, plage (bornes inversées acceptées) et année scolaire", async () => {
    await jeuDeDonnees();

    const mois = await lirePaiements({ periode: "mois", mois: "2026-11" }, "2026-11-15");
    expect(mois.periode).toEqual({ du: "2026-11-01", au: "2026-11-30", libelle: "Novembre 2026" });
    expect(mois.totaux).toMatchObject({ montant: 80_000 + 50_000 + 10_000 + 5_000 + 7_000 + 2_000, nombre: 6 });
    expect((await lirePaiements({ periode: "mois" }, "2026-11-15")).periode.libelle).toBe("Novembre 2026");

    const plage = await lirePaiements({ periode: "plage", du: "2026-11-16", au: "2026-11-14" }, "2026-11-15");
    expect(plage.periode).toEqual({ du: "2026-11-14", au: "2026-11-16", libelle: "Du 14/11/2026 au 16/11/2026" });
    expect(numeros(plage)).toEqual(["6", "8", "3", "2", "1", "4", "5"]);

    const annee = await lirePaiements({ periode: "annee" }, "2026-11-15");
    expect(annee.periode).toEqual({ du: "2026-10-01", au: "2027-09-30", libelle: "Année 2026-2027" });
    expect(annee.total).toBe(8);
    expect(annee.lignes.map((x) => x.numeroRecu.slice(-1))).toContain("9");
    expect(annee.lignes.map((x) => x.numeroRecu.slice(-1))).not.toContain("7");

    const precedente = await fabriquerAnnee({ anneeDebut: 2025 });
    const avant = await lirePaiements({ periode: "annee", anneeId: precedente.id }, "2026-11-15");
    expect(numeros(avant)).toEqual(["7"]);
  });

  it("filtres invalides ignorés ; caissiers et années proposés", async () => {
    await jeuDeDonnees();

    const l = await lirePaiements({ periode: "zz", mode: "bitcoin", statut: "?", page: "-4", jour: "pas-un-jour" }, "2026-11-15");

    expect(l.filtres).toMatchObject({ periode: "jour", mode: "tous", statut: "tous", page: 1 });
    expect(l.total).toBe(5);
    expect(l.caissiers).toEqual([{ id: m.user.id, nom: "Caissier Test" }]);
    expect(l.annees.map((a) => a.libelle)).toEqual(["2026-2027"]);
  });

  it("pagine par 50 avec les totaux sur toute la sélection", async () => {
    const etudiant = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF);
    for (let i = 1; i <= TAILLE_PAGE_PAIEMENTS + 1; i++) {
      await payer(etudiant, [[0, 1_000]], { numeroRecu: `R-2026-${String(i).padStart(5, "0")}`, date: new Date(`2026-11-15T05:${String(i % 60).padStart(2, "0")}:00Z`) });
    }

    const p1 = await lirePaiements({}, "2026-11-15");
    const p2 = await lirePaiements({ page: "2" }, "2026-11-15");

    expect(p1).toMatchObject({ total: 51, pages: 2, taillePage: 50 });
    expect(p1.lignes).toHaveLength(50);
    expect(p2.lignes).toHaveLength(1);
    expect(p1.totaux).toMatchObject({ montant: 51_000, nombre: 51 });
    expect(p2.totaux).toMatchObject({ montant: 51_000, nombre: 51 });
  });

  it("aucun paiement : listes vides et totaux à zéro", async () => {
    expect(await lirePaiements({}, "2026-11-15")).toMatchObject({
      lignes: [],
      total: 0,
      totaux: { montant: 0, nombre: 0, especes: 0, mobileMoney: 0, annules: 0, aVerifier: 0 },
    });
  });
});

describe("lireRecu", () => {
  it("reconstruit le reçu depuis les valeurs figées : même si le tarif et la mensualité ont changé depuis", async () => {
    const e = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF);
    const p = await payer(e, [[0, 100_000], [1, 50_000]], { resteApres: 750_000, retardApres: 30_000, date: new Date("2026-11-15T07:24:00Z") });
    await db.paiementLigne.updateMany({ where: { paiementId: p.id, echeanceId: e.inscription.echeances[1].id }, data: { resteEcheanceApres: 30_000 } });
    await db.tarif.update({ where: { id: m.tarifIF.id }, data: { montantMensuel: 1_000, droitsInscription: 1_000 } });

    const recu = await lireRecu(p.id);

    expect(recu).toMatchObject({
      numero: p.numeroRecu,
      date: "15/11/2026",
      heure: "10:24",
      total: 150_000,
      resteApres: 750_000,
      retardApres: 30_000,
      caissier: "Caissier Test",
      annulation: null,
    });
    expect(recu?.lignes).toEqual([
      { libelle: "Droits d'inscription", montant: 100_000, acompte: false, resteEcheance: 0 },
      { libelle: "Octobre 2026", montant: 50_000, acompte: true, resteEcheance: 30_000 },
    ]);
  });

  it("paiement inconnu : null", async () => {
    expect(await lireRecu("inconnu")).toBeNull();
  });
});

describe("lireImpayes", () => {
  async function scene() {
    const a = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF, { nom: "AAA", telephone: "0341234567" });
    const b = await fabriquerEtudiantInscrit(m.sf.id, m.annee, { ...TARIF, niveau: 1 }, { nom: "BBB" });
    await payer(b, b.inscription.echeances.slice(0, 3).map((x, i): [number, number] => [i, x.montantDu]));
    const c = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF, { nom: "CCC" });
    await payer(c, [[0, 100_000], [1, 80_000]], { date: new Date("2026-11-10T08:00:00Z") });
    await payer(c, [[2, 10_000]], { date: new Date("2026-12-01T08:00:00Z"), annule: true, annuleParId: m.admin.id, dateAnnulation: new Date("2026-12-02T08:00:00Z"), motifAnnulation: "erreur" });
    const diplome = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF, { nom: "DIPLOME", statut: "DIPLOME" });
    const abandon = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF, { nom: "ABANDON", statut: "ABANDON" });
    const exclu = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF, { nom: "EXCLU", statut: "EXCLU" });
    return { a, b, c, diplome, abandon, exclu };
  }

  const ids = (l: { lignes: { id: string }[] }) => l.lignes.map((x) => x.id);

  it("ne liste que les étudiants ACTIF en retard, jamais les diplômés, abandons ni exclus", async () => {
    const s = await scene();

    const l = await lireImpayes({}, "2026-12-15");

    expect(ids(l)).toEqual([s.a.etudiant.id, s.c.etudiant.id]);
    for (const sorti of [s.diplome, s.abandon, s.exclu]) expect(ids(l)).not.toContain(sorti.etudiant.id);
  });

  it("mois en retard, restes, années, dernier paiement non annulé et totaux", async () => {
    const s = await scene();

    const l = await lireImpayes({}, "2026-12-15");

    expect(l.lignes[0]).toMatchObject({
      nom: "AAA",
      moisEnRetard: 2,
      resteEnRetard: 100_000 + 160_000,
      resteDu: 900_000,
      anneesEnRetard: ["2026-2027"],
      niveau: 1,
      libelleNiveau: "1re année",
      telephoneAffiche: "034 12 345 67",
      dernierPaiement: null,
      filiere: { code: "IF" },
    });
    expect(l.lignes[1]).toMatchObject({
      nom: "CCC",
      moisEnRetard: 1,
      resteEnRetard: 80_000,
      resteDu: 720_000,
      dernierPaiement: { dateISO: "2026-11-10T08:00:00.000Z", date: "10/11/2026", montant: 180_000 },
    });
    expect(l.totaux).toEqual({ etudiants: 2, resteEnRetard: 340_000 });
    expect(l.jour).toBe("2026-12-15");
    expect(ids(l)).not.toContain(s.b.etudiant.id);
  });

  it("la limite : rien en retard le 31 octobre ; le 1er novembre, seul celui qui n'a rien payé l'est", async () => {
    await scene();
    expect((await lireImpayes({}, "2026-10-31")).lignes).toEqual([]);
    const l = await lireImpayes({}, "2026-11-01");
    expect(l.lignes.map((x) => [x.nom, x.moisEnRetard, x.resteEnRetard])).toEqual([["AAA", 1, 100_000 + 80_000]]);
  });

  it("filtres : filière, niveau, mois en retard minimum, recherche", async () => {
    const s = await scene();
    const j = "2026-12-15";

    expect(ids(await lireImpayes({ filiereId: m.sf.id }, j))).toEqual([]);
    expect(ids(await lireImpayes({ filiereId: m.ifs.id }, j))).toEqual([s.a.etudiant.id, s.c.etudiant.id]);
    expect(ids(await lireImpayes({ niveau: "2" }, j))).toEqual([]);
    expect(ids(await lireImpayes({ niveau: "1" }, j))).toEqual([s.a.etudiant.id, s.c.etudiant.id]);
    expect(ids(await lireImpayes({ moisMin: "2" }, j))).toEqual([s.a.etudiant.id]);
    expect(ids(await lireImpayes({ q: "ccc" }, j))).toEqual([s.c.etudiant.id]);
    expect(ids(await lireImpayes({ moisMin: "abc", niveau: "99" }, j))).toEqual([s.a.etudiant.id, s.c.etudiant.id]);
    expect((await lireImpayes({}, j)).options.filieres.map((f) => f.code)).toEqual(["IF", "SF"]);
  });

  it("une échéance en retard d'une année précédente suffit, et l'année est signalée", async () => {
    const a2025 = await fabriquerAnnee({ anneeDebut: 2025 });
    const etudiant = await fabriquerEtudiant(m.ifs.id, a2025.id, { nom: "ANCIEN" });
    const ins = await fabriquerInscription(etudiant.id, a2025.id, TARIF, a2025.dateDebut);
    await fabriquerInscription(etudiant.id, m.annee.id, { ...TARIF, niveau: 2 }, m.annee.dateDebut);
    await fabriquerPaiement(etudiant.id, m.user.id, ins.echeances.slice(0, 10).map((x) => ({ echeanceId: x.id, montant: x.montantDu })));

    const l = await lireImpayes({}, "2026-09-30");

    expect(l.lignes).toMatchObject([{ nom: "ANCIEN", moisEnRetard: 1, resteEnRetard: 80_000, anneesEnRetard: ["2025-2026"], niveau: 2 }]);
  });
});

describe("situationGuichet à une date injectée", () => {
  it("droits et octobre pas encore échus le 31/10 ; échus et en retard le 1er novembre", async () => {
    const e = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF);

    const veille = (await situationGuichet(e.etudiant.id, "2026-10-31"))!;
    const lendemain = (await situationGuichet(e.etudiant.id, "2026-11-01"))!;

    expect(veille).toMatchObject({ resteEnRetard: 0, etudiant: { resteEnRetard: 0, resteDu: 900_000 } });
    expect(veille.echeances.slice(0, 2).map((x) => x.statut)).toEqual(["a_venir", "a_venir"]);
    expect(lendemain.resteEnRetard).toBe(100_000 + 80_000);
    expect(lendemain.echeances.slice(0, 2).map((x) => [x.libelle, x.statut])).toEqual([["Droits d'inscription", "retard"], ["Octobre 2026", "retard"]]);
    expect(veille.echeances[0]).toMatchObject({ libelle: "Droits d'inscription", statut: "a_venir", echue: false });
    expect(lendemain.echeances[0]).toMatchObject({ libelle: "Droits d'inscription", statut: "retard", echue: true });
  });

  it("inconnu : null", async () => {
    expect(await situationGuichet("inconnu", "2026-11-15")).toBeNull();
  });
});
