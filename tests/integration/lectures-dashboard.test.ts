import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tauxRecouvrement } from "@/lib/dashboard";
import { situation } from "@/lib/ecolage";
import { fabriquerAnnee, fabriquerEtudiant, fabriquerInscription, fabriquerPaiement } from "../factories";
import { connecter, fabriquerEtudiantInscrit, fabriquerMonde, MAINTENANT, type Monde } from "../factories/scenarios";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const { db } = await import("@/lib/db");
const { echeancesEtudiant } = await import("@/server/ecolage");
const { lireDashboard, NOMBRE_DERNIERS_PAIEMENTS } = await import("@/server/lectures/dashboard");

let m: Monde;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(MAINTENANT) });
  getSession.mockReset();
  m = await fabriquerMonde();
  connecter(getSession, m.user);
});

afterEach(() => vi.useRealTimers());

const tarif = (niveau: number) => ({ niveau, droitsInscription: 100_000, montantMensuel: 80_000, nombreMois: 10 });

const payer = (e: { etudiant: { id: string }; inscription: { echeances: { id: string }[] } }, lignes: [number, number][], donnees = {}) =>
  fabriquerPaiement(e.etudiant.id, m.user.id, lignes.map(([i, montant]) => ({ echeanceId: e.inscription.echeances[i].id, montant })), donnees);

const annule = { annule: true, annuleParId: "", dateAnnulation: new Date("2026-11-02T08:00:00Z"), motifAnnulation: "erreur de saisie" };

type Agregat = { effectif: number; attendu: number; encaisse: number; enRetard: number };

/** Mêmes agrégats calculés échéance par échéance avec `situation()`, sans passer par le SQL du dashboard. */
async function attenduParClasse(anneeId: string, jour: string, filiereId?: string) {
  const annee = await db.anneeScolaire.findUniqueOrThrow({ where: { id: anneeId } });
  const inscriptions = await db.inscription.findMany({
    where: { anneeScolaireId: anneeId, ...(filiereId ? { etudiant: { filiereId } } : {}) },
    include: { etudiant: true },
  });
  const classes = new Map<string, Agregat>();
  for (const i of inscriptions) {
    const sit = situation(await echeancesEtudiant(db, i.etudiantId), jour);
    const an = sit.parAnnee.find((a) => a.anneeDebut === annee.anneeDebut);
    const duEchu = an?.duEchu ?? 0;
    const payeEchu = an?.payeEchu ?? 0;
    const dansEffectif = i.statut !== "ABANDON" && i.statut !== "EXCLU";
    const cle = `${i.etudiant.filiereId}:${i.niveau}`;
    const c = classes.get(cle) ?? { effectif: 0, attendu: 0, encaisse: 0, enRetard: 0 };
    c.effectif += dansEffectif ? 1 : 0;
    c.attendu += duEchu;
    c.encaisse += payeEchu;
    c.enRetard += dansEffectif && payeEchu < duEchu ? 1 : 0;
    classes.set(cle, c);
  }
  return classes;
}

/** Deux années, trois filières-niveaux, acompte, paiement annulé, abandon avec mois non dus, exclusion, double inscription. */
async function jeuComplet() {
  const a2025 = await fabriquerAnnee({ anneeDebut: 2025 });
  const a = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, tarif(1), { nom: "AAA" });
  const b = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, tarif(1), { nom: "BBB" });
  const c = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, tarif(1), { nom: "CCC" });
  const d = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, tarif(1), { nom: "DDD", statut: "ABANDON", dateSortie: new Date(Date.UTC(2026, 10, 15)) });
  const e = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, tarif(1), { nom: "EEE", statut: "EXCLU", dateSortie: new Date(Date.UTC(2026, 10, 15)) });
  const g = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, tarif(2), { nom: "GGG" });
  const h = await fabriquerEtudiantInscrit(m.sf.id, m.annee, tarif(1), { nom: "HHH" });
  const i = await fabriquerEtudiantInscrit(m.sf.id, m.annee, tarif(1), { nom: "III" });

  const f = await fabriquerEtudiant(m.ifs.id, a2025.id, { nom: "FFF" });
  const f2025 = await fabriquerInscription(f.id, a2025.id, tarif(1), a2025.dateDebut);
  await db.inscription.update({ where: { id: f2025.id }, data: { statut: "ADMIS" } });
  const f2026 = await fabriquerInscription(f.id, m.annee.id, tarif(2), m.annee.dateDebut);

  await payer(a, [[0, 100_000], [1, 80_000], [2, 80_000]]);
  await payer(b, [[2, 30_000]]);
  await payer(c, [[0, 100_000]]);
  await payer(c, [[1, 80_000]], { ...annule, annuleParId: m.admin.id });
  await payer(d, [[0, 50_000]]);
  await db.inscription.update({ where: { id: d.inscription.id }, data: { statut: "ABANDON" } });
  await db.echeance.updateMany({ where: { inscriptionId: d.inscription.id, mois: { gt: new Date(Date.UTC(2026, 10, 1)) } }, data: { nonDueSortie: true } });
  await db.inscription.update({ where: { id: e.inscription.id }, data: { statut: "EXCLU" } });
  await payer({ etudiant: f, inscription: f2025 }, [[0, 100_000], [1, 80_000], [2, 80_000]]);
  await payer({ etudiant: f, inscription: f2026 }, [[0, 40_000]]);
  await payer(i, [[0, 100_000]]);
  return { a2025, a, b, c, d, e, f, g, h, i };
}

const JOURS = ["2026-10-31", "2026-11-01", "2026-11-15", "2026-12-01", "2027-04-10", "2027-07-31", "2027-08-01"];

describe("lireDashboard : égalité avec situation()", () => {
  it.each(JOURS)("tableau et cartes égaux à situation().parAnnee pour chaque filière × niveau, au %s", async (jour) => {
    await jeuComplet();

    for (const annee of await db.anneeScolaire.findMany()) {
      const attendu = await attenduParClasse(annee.id, jour);

      const d = await lireDashboard({ anneeId: annee.id }, jour);

      expect(d.annee?.id).toBe(annee.id);
      const obtenu = new Map(d.tableau.lignes.map((l) => [`${l.filiere.id}:${l.niveau}`, { effectif: l.effectif, attendu: l.attendu, encaisse: l.encaisse, enRetard: l.enRetard }]));
      expect(obtenu, `${annee.libelle} au ${jour}`).toEqual(attendu);

      const somme = (cle: keyof Agregat) => [...attendu.values()].reduce((s, c) => s + c[cle], 0);
      expect(d.tableau.total).toMatchObject({ effectif: somme("effectif"), attendu: somme("attendu"), encaisse: somme("encaisse"), enRetard: somme("enRetard") });
      expect(d.cartes.effectif.total).toBe(somme("effectif"));
      expect(d.cartes.enRetard).toEqual({ nombre: somme("enRetard"), sur: somme("effectif") });
      expect(d.cartes.taux).toMatchObject({ attendu: somme("attendu"), encaisse: somme("encaisse"), valeur: tauxRecouvrement(somme("encaisse"), somme("attendu")) });
      for (const l of d.tableau.lignes) {
        expect(l.reste).toBe(l.attendu - l.encaisse);
        expect(l.taux).toBe(tauxRecouvrement(l.encaisse, l.attendu));
      }
    }
  });

  it("filtre filière : mêmes agrégats que la comparaison restreinte à cette filière", async () => {
    await jeuComplet();
    const attendu = await attenduParClasse(m.annee.id, "2026-12-01", m.sf.id);

    const d = await lireDashboard({ anneeId: m.annee.id, filiereId: m.sf.id }, "2026-12-01");

    expect(new Map(d.tableau.lignes.map((l) => [`${l.filiere.id}:${l.niveau}`, { effectif: l.effectif, attendu: l.attendu, encaisse: l.encaisse, enRetard: l.enRetard }]))).toEqual(attendu);
    expect(d.tableau.lignes.every((l) => l.filiere.id === m.sf.id)).toBe(true);
    expect(d.filtres.filiereId).toBe(m.sf.id);
    expect(d.cartes.effectif.parFiliere).toEqual([{ id: m.sf.id, code: "SF", nom: "Sage-femmes", effectif: 2 }]);
  });
});

describe("lireDashboard : jour de référence", () => {
  it("31/10 : octobre n'est pas échu, rien d'attendu, pas de retard ; 01/11 : droits et octobre attendus, étudiant en retard", async () => {
    const e = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, tarif(1));

    const veille = await lireDashboard({}, "2026-10-31");
    expect(veille.cartes.taux).toEqual({ valeur: null, attendu: 0, encaisse: 0, bas: false });
    expect(veille.cartes.enRetard).toEqual({ nombre: 0, sur: 1 });
    expect(veille.tableau.lignes[0]).toMatchObject({ effectif: 1, attendu: 0, encaisse: 0, reste: 0, taux: null, tauxBas: false, enRetard: 0 });

    const lendemain = await lireDashboard({}, "2026-11-01");
    expect(lendemain.cartes.taux).toEqual({ valeur: 0, attendu: 180_000, encaisse: 0, bas: true });
    expect(lendemain.cartes.enRetard).toEqual({ nombre: 1, sur: 1 });
    expect(lendemain.tableau.lignes[0]).toMatchObject({ attendu: 180_000, encaisse: 0, reste: 180_000, taux: 0, enRetard: 1 });

    await payer(e, [[0, 100_000], [1, 80_000]]);
    const paye = await lireDashboard({}, "2026-11-01");
    expect(paye.cartes.taux).toEqual({ valeur: 100, attendu: 180_000, encaisse: 180_000, bas: false });
    expect(paye.cartes.enRetard.nombre).toBe(0);
  });

  it("sans jour fourni : le jour à Madagascar de l'horloge", async () => {
    expect((await lireDashboard()).jour).toBe("2026-11-15");
    vi.setSystemTime(new Date("2026-11-30T21:30:00Z"));
    expect((await lireDashboard()).jour).toBe("2026-12-01");
  });

  it("un acompte sur un mois à venir n'est pas de l'encaissé échu, sur un mois échu il l'est", async () => {
    const e = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, tarif(1));
    await payer(e, [[2, 30_000]]);

    expect((await lireDashboard({}, "2026-11-15")).cartes.taux).toMatchObject({ attendu: 180_000, encaisse: 0 });
    expect((await lireDashboard({}, "2026-12-01")).cartes.taux).toMatchObject({ attendu: 260_000, encaisse: 30_000 });
  });
});

describe("lireDashboard : taux", () => {
  it("arrondi au dixième sur les sommes : 280 000 / 540 000 = 51,9 %", async () => {
    const [a, b] = [await fabriquerEtudiantInscrit(m.ifs.id, m.annee, tarif(1)), await fabriquerEtudiantInscrit(m.ifs.id, m.annee, tarif(1))];
    await fabriquerEtudiantInscrit(m.ifs.id, m.annee, tarif(1));
    await payer(a, [[0, 100_000], [1, 80_000]]);
    await payer(b, [[0, 100_000]]);

    const d = await lireDashboard({}, "2026-11-15");

    expect(d.cartes.taux).toEqual({ valeur: 51.9, attendu: 540_000, encaisse: 280_000, bas: true });
    expect(d.tableau.total.taux).toBe(51.9);
  });

  it("85 % exactement n'est pas bas, 84,4 % l'est", async () => {
    const e = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, tarif(1));
    await payer(e, [[0, 100_000], [1, 53_000]]);
    expect((await lireDashboard({}, "2026-11-15")).cartes.taux).toEqual({ valeur: 85, attendu: 180_000, encaisse: 153_000, bas: false });

    await db.paiementLigne.updateMany({ where: { echeanceId: e.inscription.echeances[1].id }, data: { montant: 52_000 } });
    expect((await lireDashboard({}, "2026-11-15")).cartes.taux).toEqual({ valeur: 84.4, attendu: 180_000, encaisse: 152_000, bas: true });
  });

  it("un surpaiement résiduel est plafonné au dû de l'échéance : jamais plus de 100 %", async () => {
    const e = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, tarif(1));
    await payer(e, [[0, 100_000], [1, 120_000]]);

    const d = await lireDashboard({}, "2026-11-15");

    expect(d.cartes.taux).toEqual({ valeur: 100, attendu: 180_000, encaisse: 180_000, bas: false });
  });

  it("paiement annulé : ne compte pas dans l'encaissé", async () => {
    const e = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, tarif(1));
    await payer(e, [[0, 100_000], [1, 80_000]], { ...annule, annuleParId: m.admin.id });

    expect((await lireDashboard({}, "2026-11-15")).cartes.taux).toMatchObject({ valeur: 0, encaisse: 0 });
  });
});

describe("lireDashboard : population", () => {
  it("abandon et exclusion : hors effectif et hors retards, mais leur argent et leur dû échu restent comptés", async () => {
    const actif = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, tarif(1));
    const abandon = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, tarif(1), { statut: "ABANDON" });
    const exclu = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, tarif(1), { statut: "EXCLU" });
    await db.inscription.update({ where: { id: abandon.inscription.id }, data: { statut: "ABANDON" } });
    await db.inscription.update({ where: { id: exclu.inscription.id }, data: { statut: "EXCLU" } });
    await payer(abandon, [[0, 100_000]]);
    await payer(exclu, [[0, 100_000], [1, 80_000]]);
    await payer(actif, [[0, 100_000]]);

    const d = await lireDashboard({}, "2026-11-15");

    expect(d.cartes.effectif.total).toBe(1);
    expect(d.cartes.enRetard).toEqual({ nombre: 1, sur: 1 });
    expect(d.cartes.taux).toMatchObject({ attendu: 3 * 180_000, encaisse: 100_000 + 100_000 + 180_000 });
    expect(d.tableau.lignes).toHaveLength(1);
    expect(d.tableau.lignes[0]).toMatchObject({ effectif: 1, enRetard: 1, attendu: 540_000, encaisse: 380_000 });
  });

  it("abandon avec mois non dus : seul l'échu et le mois de sortie sont attendus", async () => {
    const e = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, tarif(1), { statut: "ABANDON" });
    await db.inscription.update({ where: { id: e.inscription.id }, data: { statut: "ABANDON" } });
    await db.echeance.updateMany({ where: { inscriptionId: e.inscription.id, mois: { gt: new Date(Date.UTC(2026, 10, 1)) } }, data: { nonDueSortie: true } });

    const d = await lireDashboard({}, "2027-07-31");

    expect(d.cartes.taux).toMatchObject({ attendu: 260_000, encaisse: 0 });
  });

  it("inscriptions d'une autre année exclues de l'effectif et des montants de l'année affichée", async () => {
    await jeuComplet();
    const a2025 = (await db.anneeScolaire.findUniqueOrThrow({ where: { anneeDebut: 2025 } }));

    const d2025 = await lireDashboard({ anneeId: a2025.id }, "2026-11-15");

    expect(d2025.tableau.lignes.map((l) => [l.filiere.code, l.niveau, l.effectif])).toEqual([["IF", 1, 1]]);
    expect(d2025.annee).toMatchObject({ libelle: "2025-2026", estCourante: false });
    expect(d2025.tableau.lignes[0]).toMatchObject({ attendu: 900_000, encaisse: 260_000 });
  });

  it("classes triées par code de filière puis niveau, sous-totaux par filière, total général", async () => {
    await jeuComplet();

    const d = await lireDashboard({}, "2026-12-15");

    expect(d.tableau.lignes.map((l) => `${l.filiere.code}${l.niveau}`)).toEqual(["IF1", "IF2", "SF1"]);
    expect(d.tableau.lignes.map((l) => l.libelleNiveau)).toEqual(["1re année", "2e année", "1re année"]);
    expect(d.tableau.sousTotaux.map((s) => s.filiere.code)).toEqual(["IF", "SF"]);
    const [si, ss] = d.tableau.sousTotaux;
    expect(si.effectif).toBe(d.tableau.lignes.filter((l) => l.filiere.code === "IF").reduce((s, l) => s + l.effectif, 0));
    expect(si.attendu + ss.attendu).toBe(d.tableau.total.attendu);
    expect(si.encaisse + ss.encaisse).toBe(d.tableau.total.encaisse);
    expect(d.cartes.effectif.parFiliere.map((f) => [f.code, f.effectif])).toEqual([["IF", si.effectif], ["SF", ss.effectif]]);
    expect(d.cartes.effectif.total).toBe(si.effectif + ss.effectif);
  });

  it("une classe sans inscription sur l'année n'a pas de ligne", async () => {
    await fabriquerEtudiantInscrit(m.ifs.id, m.annee, tarif(2));
    const d = await lireDashboard({}, "2026-11-15");
    expect(d.tableau.lignes.map((l) => [l.filiere.code, l.niveau])).toEqual([["IF", 2]]);
  });

  it("base sans inscription : tableau vide, taux inconnu", async () => {
    const d = await lireDashboard({}, "2026-11-15");
    expect(d.tableau).toMatchObject({ lignes: [], sousTotaux: [] });
    expect(d.cartes.taux).toEqual({ valeur: null, attendu: 0, encaisse: 0, bas: false });
    expect(d.cartes.effectif).toEqual({ total: 0, parFiliere: [] });
  });
});

describe("lireDashboard : filtres", () => {
  it("année inconnue ou invalide : repli sur la courante ; sans paramètre aussi", async () => {
    const autre = await fabriquerAnnee({ anneeDebut: 2025 });

    for (const params of [{ anneeId: "inconnue" }, { anneeId: "" }, {}, undefined, { anneeId: "x".repeat(41) }]) {
      const d = await lireDashboard(params, "2026-11-15");
      expect(d.annee?.id, JSON.stringify(params)).toBe(m.annee.id);
    }
    expect((await lireDashboard({ anneeId: autre.id }, "2026-11-15")).annee?.id).toBe(autre.id);
    expect((await lireDashboard({ anneeId: [autre.id, m.annee.id] }, "2026-11-15")).annee?.id).toBe(autre.id);
  });

  it("aucune année courante : la plus récente ; aucune année du tout : pas d'année, rien à afficher", async () => {
    await db.anneeScolaire.update({ where: { id: m.annee.id }, data: { estCourante: false } });
    await fabriquerAnnee({ anneeDebut: 2030 });
    expect((await lireDashboard({}, "2026-11-15")).annee?.libelle).toBe("2030-2031");

    await db.tarif.deleteMany();
    await db.anneeScolaire.deleteMany();
    const vide = await lireDashboard({}, "2026-11-15");
    expect(vide.annee).toBeNull();
    expect(vide.filtres.anneeId).toBeNull();
    expect(vide.tableau.lignes).toEqual([]);
    expect(vide.options.annees).toEqual([]);
  });

  it("filière inconnue : ignorée, toutes les filières", async () => {
    await fabriquerEtudiantInscrit(m.ifs.id, m.annee, tarif(1));
    await fabriquerEtudiantInscrit(m.sf.id, m.annee, tarif(1));

    const d = await lireDashboard({ filiereId: "inconnue" }, "2026-11-15");

    expect(d.filtres.filiereId).toBeNull();
    expect(d.cartes.effectif.total).toBe(2);
    expect(d.options.filieres.map((f) => f.code)).toEqual(["IF", "SF"]);
    expect(d.options.annees).toEqual([{ id: m.annee.id, libelle: "2026-2027", estCourante: true }]);
  });
});

describe("lireDashboard : derniers paiements", () => {
  async function douzePaiements() {
    const ifs = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, tarif(1), { nom: "RAKOTO", prenoms: "Éloïse", matricule: "IF-2026-0001" });
    const sf = await fabriquerEtudiantInscrit(m.sf.id, m.annee, tarif(1), { nom: "SAGE", matricule: "SF-2026-0001" });
    for (let k = 1; k <= 12; k++) {
      const cible = k % 4 === 0 ? sf : ifs;
      await payer(cible, [[0, 1_000 * k]], {
        numeroRecu: `R-2026-${String(k).padStart(5, "0")}`,
        date: new Date(`2026-11-${String(k).padStart(2, "0")}T08:00:00Z`),
        ...(k === 5 ? { mode: "MOBILE_MONEY", operateur: "MVOLA", reference: "MP1" } : {}),
        ...(k === 11 ? { ...annule, annuleParId: m.admin.id } : {}),
        ...(k === 12 ? { aVerifier: true } : {}),
      });
    }
    return { ifs, sf };
  }

  it("10 au plus, du plus récent au plus ancien, annulés compris", async () => {
    await douzePaiements();

    const { derniersPaiements: l } = await lireDashboard({}, "2026-12-01");

    expect(NOMBRE_DERNIERS_PAIEMENTS).toBe(10);
    expect(l.map((p) => p.numeroRecu)).toEqual(Array.from({ length: 10 }, (_, k) => `R-2026-${String(12 - k).padStart(5, "0")}`));
    expect(l.find((p) => p.numeroRecu === "R-2026-00011")).toMatchObject({ annule: true, montant: 11_000 });
    expect(l[0]).toMatchObject({ aVerifier: true, annule: false, caissier: "Caissier Test", modeLibelle: "Espèces", montant: 12_000 });
    expect(l[0].etudiant).toMatchObject({ matricule: "SF-2026-0001", nom: "SAGE" });
  });

  it("date et heure à Madagascar, mode et opérateur affichés", async () => {
    await douzePaiements();

    const { derniersPaiements: l } = await lireDashboard({}, "2026-12-01");

    const mobile = l.find((p) => p.numeroRecu === "R-2026-00005")!;
    expect(mobile).toMatchObject({ mode: "MOBILE_MONEY", modeLibelle: "MVola", date: "05/11/2026", heure: "11:00", dateISO: "2026-11-05T08:00:00.000Z" });
  });

  it("filtrés par filière seulement, pas par année", async () => {
    await douzePaiements();
    const autre = await fabriquerAnnee({ anneeDebut: 2025 });

    const sf = await lireDashboard({ filiereId: m.sf.id }, "2026-12-01");
    expect(sf.derniersPaiements.map((p) => p.numeroRecu)).toEqual(["R-2026-00012", "R-2026-00008", "R-2026-00004"]);

    const autreAnnee = await lireDashboard({ anneeId: autre.id }, "2026-12-01");
    expect(autreAnnee.derniersPaiements).toHaveLength(10);
    expect(autreAnnee.tableau.lignes).toEqual([]);
  });

  it("à date égale, le numéro de reçu le plus grand d'abord", async () => {
    const e = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, tarif(1));
    const date = new Date("2026-11-10T08:00:00Z");
    for (const n of [2, 3, 1]) await payer(e, [[0, 1_000]], { numeroRecu: `R-2026-0000${n}`, date });

    const { derniersPaiements: l } = await lireDashboard({}, "2026-11-15");

    expect(l.map((p) => p.numeroRecu)).toEqual(["R-2026-00003", "R-2026-00002", "R-2026-00001"]);
  });

  it("aucun paiement : liste vide", async () => {
    expect((await lireDashboard({}, "2026-11-15")).derniersPaiements).toEqual([]);
  });
});

describe("lireDashboard : accès", () => {
  it("sans session : redirigé vers la connexion", async () => {
    getSession.mockResolvedValue(null);
    await expect(lireDashboard({}, "2026-11-15")).rejects.toThrow(/NEXT_REDIRECT/);
  });

  it("le secrétariat et l'administrateur voient le même tableau de bord", async () => {
    await jeuComplet();
    const parUser = await lireDashboard({}, "2026-12-01");
    connecter(getSession, m.admin);
    expect(await lireDashboard({}, "2026-12-01")).toEqual(parUser);
  });
});
