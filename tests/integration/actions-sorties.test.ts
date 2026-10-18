import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dateLimiteRetard, situation } from "@/lib/ecolage";
import { fabriquerAnnee, fabriquerEtudiant, fabriquerInscription, fabriquerPaiement } from "../factories";
import {
  connecter,
  fabriquerEtudiantInscrit,
  fabriquerMonde,
  MAINTENANT,
  reussi,
  type Monde,
} from "../factories/scenarios";

const { getSession, revalidatePath } = vi.hoisted(() => ({ getSession: vi.fn(), revalidatePath: vi.fn() }));

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath }));

const { db } = await import("@/lib/db");
const actions = await import("@/server/actions/sorties");
const paiements = await import("@/server/actions/paiements");
const { echeancesEtudiant, restesParEtudiant } = await import("@/server/ecolage");
const { LIBELLE_NON_DUE, lireEtudiants, lireFicheEtudiant } = await import("@/server/lectures/etudiants");
const { lireImpayes, situationGuichet } = await import("@/server/lectures/paiements");

const REFUS_ADMIN = { statut: "erreur", message: "Cette action est réservée à l'administrateur." };
const TARIF = { niveau: 1, droitsInscription: 100_000, montantMensuel: 80_000, nombreMois: 10 };

let m: Monde;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(MAINTENANT) });
  revalidatePath.mockClear();
  getSession.mockReset();
  m = await fabriquerMonde();
  connecter(getSession, m.admin);
});

afterEach(() => vi.useRealTimers());

const etudiantStandard = async (droitsEnTranches = 1, donnees = {}) =>
  fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF, donnees, droitsEnTranches);

const sortir = (etudiantId: string, surcharge: Partial<{ type: "ABANDON" | "EXCLU"; date: string; motif: string }> = {}) =>
  actions.enregistrerSortie({ etudiantId, type: "ABANDON", date: "2026-11-15", motif: "Départ de la ville", ...surcharge });

const echeancesDe = (etudiantId: string) =>
  db.echeance.findMany({ where: { inscription: { etudiantId } }, orderBy: [{ inscriptionId: "asc" }, { ordre: "asc" }] });

const nonDues = async (etudiantId: string) =>
  (await echeancesDe(etudiantId)).filter((e) => e.nonDueSortie).map((e) => `${e.type === "DROITS" ? "D" : "M"}${e.mois.toISOString().slice(0, 7)}`);

const reste = async (etudiantId: string) => (await situationGuichet(etudiantId, "2026-11-15"))!.resteDuTotal;

describe("enregistrerSortie : rôle et validation", () => {
  it("refuse le rôle user avec le message réel, même avec une entrée invalide, sans rien modifier", async () => {
    const { etudiant } = await etudiantStandard();
    const avant = await echeancesDe(etudiant.id);
    connecter(getSession, m.user);

    expect(await sortir(etudiant.id)).toEqual(REFUS_ADMIN);
    expect(await actions.enregistrerSortie({} as never)).toEqual(REFUS_ADMIN);

    expect(await db.etudiant.findUniqueOrThrow({ where: { id: etudiant.id } })).toMatchObject({ statut: "ACTIF", dateSortie: null, motifSortie: null });
    expect(await echeancesDe(etudiant.id)).toEqual(avant);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("sans session : redirigé vers la connexion", async () => {
    const { etudiant } = await etudiantStandard();
    getSession.mockResolvedValue(null);
    await expect(sortir(etudiant.id)).rejects.toThrow(/NEXT_REDIRECT/);
  });

  it.each(["DIPLOME", "ABANDON", "EXCLU"] as const)("étudiant %s : refusé, sa sortie déjà enregistrée n'est pas écrasée", async (statut) => {
    const { etudiant } = await etudiantStandard(1, { statut, dateSortie: new Date(Date.UTC(2026, 10, 1)), motifSortie: "motif d'origine" });

    const r = await sortir(etudiant.id, { type: "EXCLU", motif: "Nouveau motif" });

    expect(r).toMatchObject({ statut: "erreur", message: expect.stringMatching(/n'est plus acti(f|ve)/) });
    expect(await db.etudiant.findUniqueOrThrow({ where: { id: etudiant.id } })).toMatchObject({ statut, motifSortie: "motif d'origine" });
    expect(await nonDues(etudiant.id)).toEqual([]);
  });

  it("date future refusée sur le champ date", async () => {
    const { etudiant } = await etudiantStandard();
    const r = await sortir(etudiant.id, { date: "2026-11-16" });
    expect(r).toMatchObject({ statut: "erreur", message: expect.stringMatching(/dans le futur/), erreurs: { date: expect.stringMatching(/dans le futur/) } });
    expect((await db.etudiant.findUniqueOrThrow({ where: { id: etudiant.id } })).statut).toBe("ACTIF");
  });

  it("date antérieure au début de l'année en cours refusée", async () => {
    const { etudiant } = await etudiantStandard();
    const r = await sortir(etudiant.id, { date: "2026-09-30" });
    expect(r).toMatchObject({ statut: "erreur", erreurs: { date: expect.stringMatching(/01\/10\/2026/) } });
    expect(await nonDues(etudiant.id)).toEqual([]);
  });

  it("le premier jour de l'année et le jour même sont acceptés", async () => {
    const a = await etudiantStandard();
    const b = await etudiantStandard();
    reussi(await sortir(a.etudiant.id, { date: "2026-10-01" }));
    reussi(await sortir(b.etudiant.id, { date: "2026-11-15" }));
  });

  it.each([
    ["motif vide", { motif: "" }, "motif"],
    ["motif d'espaces", { motif: "    " }, "motif"],
    ["motif trop court", { motif: "ab" }, "motif"],
    ["type DIPLOME", { type: "DIPLOME" }, "type"],
    ["date illisible", { date: "demain" }, "date"],
    ["date inexistante", { date: "2026-02-30" }, "date"],
  ])("entrée invalide : %s", async (_nom, surcharge, champ) => {
    const { etudiant } = await etudiantStandard();
    const r = await sortir(etudiant.id, surcharge as never);
    expect(r).toMatchObject({ statut: "erreur", erreurs: { [champ]: expect.any(String) } });
    expect((await db.etudiant.findUniqueOrThrow({ where: { id: etudiant.id } })).statut).toBe("ACTIF");
  });

  it("étudiant inconnu : INTROUVABLE", async () => {
    expect(await sortir("inconnu")).toMatchObject({ statut: "erreur", code: "INTROUVABLE" });
  });
});

describe("enregistrerSortie : effets", () => {
  it("abandon le 15/11 : statut, date et motif posés, inscription fermée, mois suivants non dus, rien supprimé ni réécrit", async () => {
    const { etudiant, inscription } = await etudiantStandard();
    const avant = await echeancesDe(etudiant.id);

    const r = await sortir(etudiant.id, { motif: "  Départ de la ville  " });

    expect(reussi(r)).toEqual({ echeancesNonDues: 8 });
    expect(r).toMatchObject({ message: expect.stringMatching(/Abandon enregistré : 8 échéances des mois suivants ne sont plus dues/) });
    const e = await db.etudiant.findUniqueOrThrow({ where: { id: etudiant.id } });
    expect(e).toMatchObject({ statut: "ABANDON", motifSortie: "Départ de la ville" });
    expect(e.dateSortie?.toISOString().slice(0, 10)).toBe("2026-11-15");
    expect((await db.inscription.findUniqueOrThrow({ where: { id: inscription.id } })).statut).toBe("ABANDON");

    const apres = await echeancesDe(etudiant.id);
    expect(apres).toHaveLength(avant.length);
    expect(apres.map((e) => ({ ...e, nonDueSortie: false }))).toEqual(avant);
    expect(await nonDues(etudiant.id)).toEqual([
      "M2026-12", "M2027-01", "M2027-02", "M2027-03", "M2027-04", "M2027-05", "M2027-06", "M2027-07",
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/app/admissions", "layout");
  });

  it("exclusion : statut EXCLU, inscription EXCLU, accord au féminin du message", async () => {
    const { etudiant, inscription } = await etudiantStandard();
    const r = await sortir(etudiant.id, { type: "EXCLU", motif: "Décision du conseil" });
    expect(r).toMatchObject({ statut: "succes", message: expect.stringMatching(/^Exclusion enregistrée/) });
    expect((await db.etudiant.findUniqueOrThrow({ where: { id: etudiant.id } })).statut).toBe("EXCLU");
    expect((await db.inscription.findUniqueOrThrow({ where: { id: inscription.id } })).statut).toBe("EXCLU");
  });

  it.each([
    ["2026-10-01", 9],
    ["2026-10-31", 9],
    ["2026-11-01", 8],
    ["2026-11-30", 8],
    ["2026-12-01", 7],
    ["2027-06-30", 1],
    ["2027-07-15", 0],
  ])("sortie le %s : %i échéances non dues, le mois de sortie et l'échu restent dus", async (date, attendu) => {
    vi.setSystemTime(new Date(`${date}T09:00:00Z`));
    const { etudiant } = await etudiantStandard();

    expect(reussi(await sortir(etudiant.id, { date }))).toEqual({ echeancesNonDues: attendu });

    const moisSortie = date.slice(0, 7);
    const dues = (await echeancesDe(etudiant.id)).filter((e) => !e.nonDueSortie);
    expect(dues.every((e) => e.mois.toISOString().slice(0, 7) <= moisSortie)).toBe(true);
    expect((await nonDues(etudiant.id)).every((n) => n.slice(1) > moisSortie)).toBe(true);
    expect(dues.some((e) => e.mois.toISOString().slice(0, 7) === moisSortie && e.type === "MENSUALITE")).toBe(true);
  });

  it("sans échéance à rendre : le message dit que toutes restent dues", async () => {
    vi.setSystemTime(new Date("2027-07-15T09:00:00Z"));
    const { etudiant } = await etudiantStandard();
    expect(await sortir(etudiant.id, { date: "2027-07-15" })).toMatchObject({ message: expect.stringMatching(/toutes ses échéances restent dues/) });
  });

  it("sortie antidatée : les mois postérieurs à la date de sortie sont rendus même s'ils sont déjà échus aujourd'hui", async () => {
    vi.setSystemTime(new Date("2027-03-15T09:00:00Z"));
    const { etudiant } = await etudiantStandard();

    expect(reussi(await sortir(etudiant.id, { date: "2026-10-31" }))).toEqual({ echeancesNonDues: 9 });

    const sit = situation(await echeancesEtudiant(db, etudiant.id, { avecNonDues: true }), "2027-03-15");
    expect(sit).toMatchObject({ du: 180_000, reste: 180_000, moisEnRetard: 1 });
  });

  it("droits en 3 tranches : seules les tranches des mois postérieurs sont rendues", async () => {
    const { etudiant } = await etudiantStandard(3);

    reussi(await sortir(etudiant.id, { date: "2026-10-20" }));

    const rendues = await nonDues(etudiant.id);
    expect(rendues.filter((x) => x.startsWith("D"))).toEqual(["D2026-11", "D2026-12"]);
    expect(rendues.filter((x) => x.startsWith("M"))).toHaveLength(9);
    expect(rendues).not.toContain("D2026-10");
    expect(rendues).not.toContain("M2026-10");
  });

  it("un paiement non annulé, même partiel, garde son échéance due ; un paiement annulé n'empêche pas", async () => {
    const { etudiant, inscription } = await etudiantStandard();
    const [, , , dec, jan] = inscription.echeances;
    await fabriquerPaiement(etudiant.id, m.user.id, [{ echeanceId: dec.id, montant: 20_000, resteEcheanceApres: 60_000 }]);
    await fabriquerPaiement(
      etudiant.id,
      m.user.id,
      [{ echeanceId: jan.id, montant: 80_000 }],
      { annule: true, annuleParId: m.admin.id, dateAnnulation: new Date(), motifAnnulation: "erreur de saisie" },
    );

    expect(reussi(await sortir(etudiant.id))).toEqual({ echeancesNonDues: 7 });

    const rendues = await nonDues(etudiant.id);
    expect(rendues).not.toContain("M2026-12");
    expect(rendues).toContain("M2027-01");
    expect(await reste(etudiant.id)).toBe(100_000 + 80_000 + 80_000 + 60_000);
  });

  it("toutes années : seules les échéances postérieures au mois de sortie sont rendues, les impayés passés restent dus", async () => {
    const a2025 = await fabriquerAnnee({ anneeDebut: 2025 });
    const e = await fabriquerEtudiant(m.ifs.id, a2025.id);
    const ancienne = await fabriquerInscription(e.id, a2025.id, TARIF, a2025.dateDebut);
    await db.inscription.update({ where: { id: ancienne.id }, data: { statut: "ADMIS" } });
    await fabriquerInscription(e.id, m.annee.id, { ...TARIF, niveau: 2 }, m.annee.dateDebut);

    reussi(await sortir(e.id));

    const toutes = await db.echeance.findMany({ where: { inscription: { etudiantId: e.id } }, include: { inscription: true } });
    expect(toutes.filter((x) => x.inscription.anneeScolaireId === a2025.id && x.nonDueSortie)).toEqual([]);
    expect(toutes.filter((x) => x.nonDueSortie)).toHaveLength(8);
    expect((await db.inscription.findUniqueOrThrow({ where: { id: ancienne.id } })).statut).toBe("ADMIS");
    expect(await reste(e.id)).toBe(900_000 + 260_000);
  });

  it("deux sorties simultanées : une seule aboutit", async () => {
    const { etudiant } = await etudiantStandard();

    const etats = await Promise.all([sortir(etudiant.id, { motif: "Premier motif" }), sortir(etudiant.id, { motif: "Second motif" })]);

    expect(etats.map((x) => x.statut).sort()).toEqual(["erreur", "succes"]);
    expect(await nonDues(etudiant.id)).toHaveLength(8);
  });

  it("sortie et encaissement simultanés : jamais d'échéance non due portant un paiement non annulé", async () => {
    for (let tour = 0; tour < 4; tour++) {
      const { etudiant } = await etudiantStandard();

      const [sortie, encaissement] = await Promise.all([
        sortir(etudiant.id),
        paiements.encaisser({ etudiantId: etudiant.id, montant: 500_000, mode: "ESPECES", idClient: randomUUID(), resteDuAffiche: 900_000 }),
      ]);

      expect(sortie.statut).toBe("succes");
      const rendues = (await nonDues(etudiant.id)).length;
      if (encaissement.statut === "succes") expect(rendues).toBe(5);
      else {
        expect(encaissement).toMatchObject({ code: "SITUATION_CHANGEE" });
        expect(rendues).toBe(8);
      }
      const payees = await db.echeance.findMany({
        where: { inscription: { etudiantId: etudiant.id }, nonDueSortie: true, lignesPaiement: { some: { paiement: { annule: false } } } },
      });
      expect(payees).toEqual([]);
    }
  });
});

describe("échéances non dues : exclues de tous les calculs", () => {
  async function sorti() {
    const e = await etudiantStandard(1, { nom: "SORTANT" });
    reussi(await sortir(e.etudiant.id));
    return e.etudiant;
  }

  it("situation() : dû, reste et retard ne comptent que le mois de sortie et l'échu", async () => {
    const etudiant = await sorti();
    const echeances = await echeancesEtudiant(db, etudiant.id, { avecNonDues: true });
    expect(echeances).toHaveLength(11);

    expect(situation(echeances, "2027-03-15")).toMatchObject({ du: 260_000, reste: 260_000, resteEnRetard: 260_000, moisEnRetard: 2, duEchu: 260_000, payeEchu: 0 });
    expect((await echeancesEtudiant(db, etudiant.id)).map((x) => x.libelle)).toEqual(["Droits d'inscription", "Octobre 2026", "Novembre 2026"]);
  });

  it("sqlRestes : mêmes sommes que situation(), à plusieurs dates", async () => {
    const etudiant = await sorti();
    for (const jour of ["2026-10-31", "2026-11-15", "2026-12-01", "2027-03-15"]) {
      const sit = situation(await echeancesEtudiant(db, etudiant.id, { avecNonDues: true }), jour);

      const r = (await restesParEtudiant([etudiant.id], dateLimiteRetard(jour))).get(etudiant.id)!;

      expect(r, jour).toMatchObject({ resteDu: sit.reste, resteEnRetard: sit.resteEnRetard, moisEnRetard: sit.moisEnRetard });
    }
  });

  it("liste des Étudiants : reste dû et retard sans les mois non dus, filtre « en retard » levé une fois l'échu payé", async () => {
    const etudiant = await sorti();

    const avant = await lireEtudiants({ q: "sortant" }, "2027-03-15");
    expect(avant.lignes[0]).toMatchObject({ statut: "ABANDON", resteDu: 260_000, resteEnRetard: 260_000, moisEnRetard: 2 });
    expect((await lireEtudiants({ enRetard: true }, "2027-03-15")).lignes.map((l) => l.id)).toEqual([etudiant.id]);

    reussi(await paiements.encaisser({ etudiantId: etudiant.id, montant: 260_000, mode: "ESPECES", idClient: randomUUID(), resteDuAffiche: 260_000 }));

    const apres = await lireEtudiants({ q: "sortant" }, "2027-03-15");
    expect(apres.lignes[0]).toMatchObject({ resteDu: 0, resteEnRetard: 0, moisEnRetard: 0 });
    expect((await lireEtudiants({ enRetard: true }, "2027-03-15")).lignes).toEqual([]);
  });

  it("Impayés : les étudiants sortis n'y figurent pas ; un actif aux échéances non dues n'est retardataire que de l'échu", async () => {
    await sorti();
    expect((await lireImpayes({}, "2027-03-15")).lignes).toEqual([]);

    const force = await etudiantStandard(1, { nom: "FORCE" });
    const echeances = await echeancesDe(force.etudiant.id);
    await db.echeance.updateMany({ where: { id: { in: echeances.slice(3).map((x) => x.id) } }, data: { nonDueSortie: true } });

    const l = await lireImpayes({}, "2027-03-15");

    expect(l.lignes.map((x) => x.nom)).toEqual(["FORCE"]);
    expect(l.lignes[0]).toMatchObject({ resteEnRetard: 260_000, resteDu: 260_000, moisEnRetard: 2 });
    expect(l.totaux).toEqual({ etudiants: 1, resteEnRetard: 260_000 });
  });

  it("fiche : mois non dus signalés, sans reste ni retard, totaux sur le dû seulement", async () => {
    const etudiant = await sorti();

    const fiche = (await lireFicheEtudiant(etudiant.id, "2027-03-15"))!;

    const lignes = fiche.parcours[0].echeances;
    expect(lignes.filter((x) => x.nonDue)).toHaveLength(8);
    for (const x of lignes.filter((y) => y.nonDue)) {
      expect(x).toMatchObject({ reste: 0, echue: false, statut: "a_venir", libelleStatut: LIBELLE_NON_DUE, montantDu: 80_000 });
    }
    expect(lignes.filter((x) => !x.nonDue).map((x) => [x.libelle, x.statut, x.reste])).toEqual([
      ["Droits d'inscription", "retard", 100_000],
      ["Octobre 2026", "retard", 80_000],
      ["Novembre 2026", "retard", 80_000],
    ]);
    expect(fiche.situation).toMatchObject({ du: 260_000, reste: 260_000, resteEnRetard: 260_000 });
    expect(fiche.parcours[0].totaux).toMatchObject({ du: 260_000, reste: 260_000 });
    expect(fiche.sortie).toMatchObject({ date: "2026-11-15", motif: "Départ de la ville" });
  });

  it("guichet : seules les échéances dues sont proposées, étudiant sorti encaissable tant qu'il doit", async () => {
    const etudiant = await sorti();

    const s = (await situationGuichet(etudiant.id, "2027-03-15"))!;

    expect(s.echeances.map((x) => x.libelle)).toEqual(["Droits d'inscription", "Octobre 2026", "Novembre 2026"]);
    expect(s).toMatchObject({ resteDuTotal: 260_000, resteEnRetard: 260_000, refus: null });
    expect(s.etudiant).toMatchObject({ statut: "ABANDON", sorti: true, resteDu: 260_000 });
    expect(s.anneeEnCours).toMatchObject({ libelle: "2026-2027", du: 260_000, paye: 0, reste: 260_000 });
    expect(s.preselection).toHaveLength(3);
    const trouves = await paiements.chercherAuGuichet("sortant");
    expect(trouves).toMatchObject([{ id: etudiant.id, sorti: true, resteDu: 260_000 }]);
  });

  it("encaisser : la répartition ignore les mois non dus, le trop-perçu est mesuré sur le dû restant", async () => {
    const etudiant = await sorti();
    const base = { etudiantId: etudiant.id, mode: "ESPECES" as const, resteDuAffiche: 260_000 };

    const trop = await paiements.encaisser({ ...base, montant: 260_001, idClient: randomUUID() });
    expect(trop).toMatchObject({ statut: "erreur", message: expect.stringMatching(/260.000.Ar au plus/) });
    const ancien900 = await paiements.encaisser({ ...base, montant: 100_000, idClient: randomUUID(), resteDuAffiche: 900_000 });
    expect(ancien900).toMatchObject({ statut: "erreur", code: "SITUATION_CHANGEE" });

    const partiel = reussi(await paiements.encaisser({ ...base, montant: 130_000, idClient: randomUUID() }));
    expect(partiel.lignes.map((l) => [l.libelle, l.montant, l.acompte])).toEqual([
      ["Droits d'inscription", 100_000, false],
      ["Octobre 2026", 30_000, true],
    ]);
    expect(partiel.resteApres).toBe(130_000);

    const solde = reussi(await paiements.encaisser({ ...base, montant: 130_000, idClient: randomUUID(), resteDuAffiche: 130_000 }));
    expect(solde.lignes.map((l) => l.libelle)).toEqual(["Octobre 2026", "Novembre 2026"]);
    expect(solde.resteApres).toBe(0);

    expect(await paiements.encaisser({ ...base, montant: 1_000, idClient: randomUUID(), resteDuAffiche: 0 })).toMatchObject({
      statut: "erreur",
      message: expect.stringMatching(/rien à payer/),
    });
    expect(await db.paiementLigne.count({ where: { echeance: { nonDueSortie: true } } })).toBe(0);
  });

  it("annuler un paiement après la sortie ne rend pas les échéances non dues", async () => {
    const etudiant = await sorti();
    const recu = reussi(await paiements.encaisser({ etudiantId: etudiant.id, montant: 260_000, mode: "ESPECES", idClient: randomUUID(), resteDuAffiche: 260_000 }));

    reussi(await paiements.annulerPaiement({ paiementId: recu.paiementId!, motif: "erreur de saisie" }));

    expect(await reste(etudiant.id)).toBe(260_000);
    expect(await nonDues(etudiant.id)).toHaveLength(8);
  });
});
