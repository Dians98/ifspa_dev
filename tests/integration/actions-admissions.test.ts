import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DecisionAdmission } from "@/generated/prisma/enums";
import { fabriquerAnnee, fabriquerFrais, fabriquerInscription, fabriquerPaiement } from "../factories";
import {
  connecter,
  fabriquerAnneeCible,
  fabriquerEtudiantInscrit,
  fabriquerMonde,
  MAINTENANT,
  reussi,
  tarifCible,
  type Monde,
} from "../factories/scenarios";

const { getSession, revalidatePath } = vi.hoisted(() => ({ getSession: vi.fn(), revalidatePath: vi.fn() }));

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath }));

const { db } = await import("@/lib/db");
const actions = await import("@/server/actions/admissions");
const sorties = await import("@/server/actions/sorties");
const paiements = await import("@/server/actions/paiements");

const REFUS_ADMIN = { statut: "erreur", message: "Cette action est réservée à l'administrateur." };

type Inscrit = Awaited<ReturnType<typeof fabriquerEtudiantInscrit>>;
type Cible = Awaited<ReturnType<typeof fabriquerAnneeCible>>;

let m: Monde;
let cible: Cible;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(MAINTENANT) });
  revalidatePath.mockClear();
  getSession.mockReset();
  m = await fabriquerMonde();
  cible = await fabriquerAnneeCible(m.ifs.id);
  connecter(getSession, m.user);
});

afterEach(() => vi.useRealTimers());

const tarifSource = (niveau: number) => ({ niveau, droitsInscription: 100_000, montantMensuel: 80_000, nombreMois: 10 });

async function classe(effectif: number, niveau = 1, donnees: Parameters<typeof fabriquerEtudiantInscrit>[3] = {}): Promise<Inscrit[]> {
  const membres: Inscrit[] = [];
  for (let i = 0; i < effectif; i++) {
    membres.push(await fabriquerEtudiantInscrit(m.ifs.id, m.annee, tarifSource(niveau), donnees));
  }
  return membres;
}

function entree(membres: Inscrit[], liste: DecisionAdmission | DecisionAdmission[], niveau = 1) {
  const decisions = typeof liste === "string" ? membres.map(() => liste) : liste;
  return {
    anneeSourceId: m.annee.id,
    filiereId: m.ifs.id,
    niveau,
    decisions: membres.map((e, i) => ({ inscriptionId: e.inscription.id, decision: decisions[i] })),
  };
}

const valider = (membres: Inscrit[], liste: DecisionAdmission | DecisionAdmission[], niveau = 1) =>
  actions.validerClasse(entree(membres, liste, niveau));

/** Inscription de l'année cible ; `echeances` dans l'ordre de lecture : droits, puis mois par mois (index 1 = octobre). */
async function inscriptionCible(etudiantId: string) {
  const inscription = await db.inscription.findFirst({
    where: { etudiantId, anneeScolaireId: cible.id },
    include: { echeances: { orderBy: [{ mois: "asc" }, { type: "asc" }] } },
  });
  if (!inscription) return null;
  const { echeances } = inscription;
  return { ...inscription, echeances: [...echeances.filter((e) => e.type === "DROITS"), ...echeances.filter((e) => e.type !== "DROITS")] };
}

function sansMiseAJour<T extends { updatedAt: Date }>(ligne: T): Omit<T, "updatedAt"> {
  const copie: Partial<T> = { ...ligne };
  delete copie.updatedAt;
  return copie as Omit<T, "updatedAt">;
}

/** Tout ce qu'un passage peut toucher, hors `updatedAt`, triés par identifiant. */
async function instantane() {
  const [etudiants, inscriptions, echeances, paiementsBase, compteurs, blocs] = await Promise.all([
    db.etudiant.findMany({ orderBy: { id: "asc" } }),
    db.inscription.findMany({ orderBy: { id: "asc" } }),
    db.echeance.findMany({ orderBy: { id: "asc" } }),
    db.paiement.findMany({ orderBy: { id: "asc" }, include: { lignes: { orderBy: { id: "asc" } } } }),
    db.compteur.findMany({ orderBy: { cle: "asc" } }),
    db.blocNumeros.findMany({ orderBy: { id: "asc" } }),
  ]);
  return {
    etudiants: etudiants.map(sansMiseAJour),
    inscriptions: inscriptions.map(sansMiseAJour),
    echeances,
    paiements: paiementsBase,
    compteurs,
    blocs,
  };
}

const compteurs = async () => Object.fromEntries((await db.compteur.findMany()).map((c) => [c.cle, c.valeur]));

async function rienEcrit(avant: Awaited<ReturnType<typeof instantane>>) {
  expect(await instantane()).toEqual(avant);
  expect(await db.operationAdmission.count()).toBe(0);
  expect(revalidatePath).not.toHaveBeenCalled();
}

describe("validerClasse : effets", () => {
  it("le secrétariat valide une classe : inscriptions cibles, échéances copiées du tarif cible, statuts, sortie de l'abandon", async () => {
    const a = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, tarifSource(1));
    const b = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, tarifSource(1));
    const c = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, tarifSource(1));
    const d = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, tarifSource(1));
    const matricules = (await db.etudiant.findMany({ orderBy: { id: "asc" }, select: { id: true, matricule: true } }));

    const r = await valider([a, b, c, d], ["ADMIS", "ADMIS", "REDOUBLANT", "ABANDON"]);

    const { operationId, comptes } = reussi(r);
    expect(comptes).toEqual({ admis: 2, redoublants: 1, diplomes: 0, abandons: 1 });
    expect(r).toMatchObject({ message: expect.stringMatching(/validée : 2 passent en 2e année · 1 redouble · 1 abandon\./) });

    const ia = (await inscriptionCible(a.etudiant.id))!;
    expect(ia).toMatchObject({ niveau: 2, redoublement: false, statut: "EN_COURS", operationAdmissionId: operationId });
    expect(ia.echeances).toHaveLength(11);
    expect(ia.echeances[0]).toMatchObject({ type: "DROITS", montantDu: tarifCible(2).droitsInscription, nonDueSortie: false });
    expect(ia.echeances[0].mois.toISOString().slice(0, 10)).toBe("2027-10-01");
    expect(ia.echeances.filter((e) => e.type === "MENSUALITE").map((e) => e.montantDu)).toEqual(Array(10).fill(tarifCible(2).montantMensuel));
    expect(ia.echeances.at(-1)?.mois.toISOString().slice(0, 10)).toBe("2028-07-01");

    const ib = (await inscriptionCible(b.etudiant.id))!;
    expect(ib.echeances.filter((e) => e.type === "DROITS").map((e) => e.montantDu)).toEqual([tarifCible(2).droitsInscription]);
    expect(ib.echeances.filter((e) => e.type === "MENSUALITE")).toHaveLength(10);

    const ic = (await inscriptionCible(c.etudiant.id))!;
    expect(ic).toMatchObject({ niveau: 1, redoublement: true, statut: "EN_COURS" });
    expect(ic.echeances[0].montantDu).toBe(tarifCible(1).droitsInscription);
    expect(ic.echeances[1].montantDu).toBe(tarifCible(1).montantMensuel);

    expect(await inscriptionCible(d.etudiant.id)).toBeNull();

    const sources = await db.inscription.findMany({
      where: { anneeScolaireId: m.annee.id },
      orderBy: { id: "asc" },
      select: { id: true, statut: true },
    });
    const statutSource = (x: Inscrit) => sources.find((s) => s.id === x.inscription.id)?.statut;
    expect([a, b, c, d].map(statutSource)).toEqual(["ADMIS", "ADMIS", "REDOUBLE", "ABANDON"]);

    const etudiants = await db.etudiant.findMany({ where: { id: { in: [a, b, c, d].map((x) => x.etudiant.id) } } });
    const parId = (x: Inscrit) => etudiants.find((e) => e.id === x.etudiant.id)!;
    expect([a, b, c].map((x) => [parId(x).statut, parId(x).dateSortie, parId(x).motifSortie])).toEqual(Array(3).fill(["ACTIF", null, null]));
    expect(parId(d)).toMatchObject({ statut: "ABANDON" });
    expect(parId(d).dateSortie?.toISOString().slice(0, 10)).toBe("2026-11-15");
    expect(parId(d).motifSortie).toMatch(/^Ne poursuit pas en 2027-2028/);

    expect(await db.etudiant.findMany({ orderBy: { id: "asc" }, select: { id: true, matricule: true } })).toEqual(matricules);
    expect(await db.compteur.count()).toBe(0);
    expect(await db.echeance.count({ where: { nonDueSortie: true } })).toBe(0);
    expect(revalidatePath).toHaveBeenCalledWith("/app/admissions", "layout");
  });

  it("l'opération et ses lignes gardent l'état d'avant pour chaque étudiant, auteur compris", async () => {
    const [a, b] = await classe(2);
    const ancienne = new Date(Date.UTC(2026, 0, 5));
    await db.etudiant.update({ where: { id: b.etudiant.id }, data: { dateSortie: ancienne, motifSortie: "ancien" } });

    const { operationId } = reussi(await valider([a, b], ["ADMIS", "ABANDON"]));

    const op = await db.operationAdmission.findUniqueOrThrow({ where: { id: operationId }, include: { lignes: { orderBy: { decision: "asc" } } } });
    expect(op).toMatchObject({
      anneeSourceId: m.annee.id,
      anneeCibleId: cible.id,
      filiereId: m.ifs.id,
      niveauSource: 1,
      creeParId: m.user.id,
      annulee: false,
      annuleeParId: null,
    });
    expect(op.lignes.map((l) => [l.decision, l.ancienStatutInscription, l.ancienStatutEtudiant])).toEqual([
      ["ADMIS", "EN_COURS", "ACTIF"],
      ["ABANDON", "EN_COURS", "ACTIF"],
    ]);
    const ligneAbandon = op.lignes.find((l) => l.decision === "ABANDON")!;
    expect(ligneAbandon).toMatchObject({ ancienMotifSortie: "ancien", inscriptionCibleId: null, inscriptionSourceId: b.inscription.id });
    expect(ligneAbandon.ancienneDateSortie).toEqual(ancienne);
    const ligneAdmis = op.lignes.find((l) => l.decision === "ADMIS")!;
    expect(ligneAdmis.inscriptionCibleId).toBe((await inscriptionCible(a.etudiant.id))!.id);
  });

  it("dernière année : diplômés sortis le jour du passage sans motif, redoublant réinscrit au tarif du même niveau", async () => {
    const [d1, d2, r] = await classe(3, 3);

    const res = reussi(await valider([d1, d2, r], ["DIPLOME", "DIPLOME", "REDOUBLANT"], 3));

    expect(res.comptes).toEqual({ admis: 0, redoublants: 1, diplomes: 2, abandons: 0 });
    for (const d of [d1, d2]) {
      const e = await db.etudiant.findUniqueOrThrow({ where: { id: d.etudiant.id } });
      expect(e).toMatchObject({ statut: "DIPLOME", motifSortie: null });
      expect(e.dateSortie?.toISOString().slice(0, 10)).toBe("2026-11-15");
      expect(await inscriptionCible(d.etudiant.id)).toBeNull();
      expect((await db.inscription.findUniqueOrThrow({ where: { id: d.inscription.id } })).statut).toBe("DIPLOME");
    }
    const ir = (await inscriptionCible(r.etudiant.id))!;
    expect(ir).toMatchObject({ niveau: 3, redoublement: true });
    expect(ir.echeances[0].montantDu).toBe(tarifCible(3).droitsInscription);
    expect((await db.etudiant.findUniqueOrThrow({ where: { id: r.etudiant.id } })).statut).toBe("ACTIF");
  });

  it("un changement de tarif cible après la validation ne réécrit pas les échéances créées", async () => {
    const [a] = await classe(1);
    reussi(await valider([a], "ADMIS"));

    await db.tarif.updateMany({ where: { anneeScolaireId: cible.id }, data: { montantMensuel: 1_000, droitsInscription: 5_000 } });

    const ia = (await inscriptionCible(a.etudiant.id))!;
    expect(ia.echeances[0].montantDu).toBe(tarifCible(2).droitsInscription);
    expect(ia.echeances[1].montantDu).toBe(tarifCible(2).montantMensuel);
  });

  it("les classes sont indépendantes : valider une classe ne touche pas les autres filières ni niveaux", async () => {
    const [a] = await classe(1);
    const autreNiveau = await classe(1, 2);
    const sf = await fabriquerEtudiantInscrit(m.sf.id, m.annee, tarifSource(1));

    reussi(await valider([a], "ADMIS"));

    for (const x of [autreNiveau[0], sf]) {
      expect((await db.inscription.findUniqueOrThrow({ where: { id: x.inscription.id } })).statut).toBe("EN_COURS");
      expect(await inscriptionCible(x.etudiant.id)).toBeNull();
    }
  });

  it("un étudiant sorti est exclu de la classe : sa sortie reste, son inscription et ses échéances aussi", async () => {
    const [a, b] = await classe(2);
    const sorti = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, tarifSource(1), { statut: "EXCLU", dateSortie: new Date(Date.UTC(2026, 10, 1)) });
    const avant = await db.echeance.count({ where: { inscriptionId: sorti.inscription.id } });

    reussi(await valider([a, b], "ADMIS"));

    expect(await inscriptionCible(sorti.etudiant.id)).toBeNull();
    expect((await db.inscription.findUniqueOrThrow({ where: { id: sorti.inscription.id } })).statut).toBe("EN_COURS");
    expect(await db.echeance.count({ where: { inscriptionId: sorti.inscription.id } })).toBe(avant);
    expect((await db.etudiant.findUniqueOrThrow({ where: { id: sorti.etudiant.id } })).statut).toBe("EXCLU");
  });

  it("étudiant sorti par l'action Sortie : sa classe se valide sans lui, et le décider est refusé", async () => {
    const [a, b] = await classe(2);
    connecter(getSession, m.admin);
    reussi(await sorties.enregistrerSortie({ etudiantId: b.etudiant.id, type: "ABANDON", date: "2026-11-10", motif: "Départ de la ville" }));
    connecter(getSession, m.user);

    const refus = await valider([a, b], "ADMIS");
    expect(refus).toMatchObject({ statut: "erreur", message: expect.stringMatching(/a changé depuis l'affichage/) });

    reussi(await valider([a], "ADMIS"));
    expect(await inscriptionCible(b.etudiant.id)).toBeNull();
  });

  it("un étudiant inscrit après la validation donne lieu à un passage complémentaire, sans toucher aux premiers", async () => {
    const [a] = await classe(1);
    const premier = reussi(await valider([a], "ADMIS"));
    const [tardif] = await classe(1);

    const second = reussi(await valider([tardif], "REDOUBLANT"));

    expect(second.operationId).not.toBe(premier.operationId);
    expect(await db.operationAdmission.count()).toBe(2);
    expect(await db.inscription.count({ where: { anneeScolaireId: cible.id } })).toBe(2);
    expect((await inscriptionCible(a.etudiant.id))!.niveau).toBe(2);
  });
});

describe("validerClasse : refus", () => {
  it("double validation séquentielle : refusée en nommant qui a validé, aucun doublon d'inscription", async () => {
    const membres = await classe(3);
    reussi(await valider(membres, "ADMIS"));
    const inscriptions = await db.inscription.count({ where: { anneeScolaireId: cible.id } });

    const r = await valider(membres, "ADMIS");

    expect(r).toMatchObject({ statut: "erreur", message: expect.stringMatching(/vient d'être validée par Caissier Test/) });
    expect(await db.inscription.count({ where: { anneeScolaireId: cible.id } })).toBe(inscriptions);
    expect(await db.operationAdmission.count()).toBe(1);
  });

  it("admis en dernière année : refusé, rien n'est écrit", async () => {
    const membres = await classe(2, 3);
    const avant = await instantane();

    const r = await valider(membres, ["DIPLOME", "ADMIS"], 3);

    expect(r).toMatchObject({ statut: "erreur", message: expect.stringMatching(/dure 3 ans, pas de 4e année/) });
    await rienEcrit(avant);
  });

  it("diplômé hors dernière année : refusé, rien n'est écrit", async () => {
    const membres = await classe(2);
    const avant = await instantane();

    const r = await valider(membres, ["ADMIS", "DIPLOME"]);

    expect(r).toMatchObject({ statut: "erreur", message: expect.stringMatching(/le diplôme se décide en 3e année/) });
    await rienEcrit(avant);
  });

  it("tarif du niveau suivant manquant dans l'année cible : refusé, rien n'est écrit", async () => {
    await db.tarif.deleteMany({ where: { anneeScolaireId: cible.id, niveau: 2 } });
    const membres = await classe(2);
    const avant = await instantane();

    const r = await valider(membres, "ADMIS");

    expect(r).toMatchObject({ statut: "erreur", message: expect.stringMatching(/Tarif manquant pour Infirmier\(e\)s 2e année en 2027-2028/) });
    await rienEcrit(avant);
  });

  it("tarif du même niveau manquant : n'empêche que les redoublants", async () => {
    await db.tarif.deleteMany({ where: { anneeScolaireId: cible.id, niveau: 1 } });
    const membres = await classe(3);
    const avant = await instantane();

    const refus = await valider(membres, ["ADMIS", "ADMIS", "REDOUBLANT"]);
    expect(refus).toMatchObject({ statut: "erreur", message: expect.stringMatching(/Tarif manquant pour .* 1re année .*redoublants/) });
    await rienEcrit(avant);

    reussi(await valider(membres, ["ADMIS", "ADMIS", "ABANDON"]));
    expect(await db.inscription.count({ where: { anneeScolaireId: cible.id } })).toBe(2);
  });

  it("année cible absente ou clôturée : refusé", async () => {
    const membres = await classe(1);
    await db.anneeScolaire.update({ where: { id: cible.id }, data: { cloturee: true } });
    const avant = await instantane();
    expect(await valider(membres, "ADMIS")).toMatchObject({ statut: "erreur", message: expect.stringMatching(/2027-2028 est clôturée/) });
    await rienEcrit(avant);

    await db.tarif.deleteMany({ where: { anneeScolaireId: cible.id } });
    await db.anneeScolaire.delete({ where: { id: cible.id } });
    expect(await valider(membres, "ADMIS")).toMatchObject({ statut: "erreur", message: expect.stringMatching(/2027-2028 n'existe pas encore/) });
    expect(await db.operationAdmission.count()).toBe(0);
  });

  it("droits invalides dans le tarif cible : refusé, rien n'est écrit", async () => {
    await db.tarif.update({ where: { filiereId_anneeScolaireId_niveau: { filiereId: m.ifs.id, anneeScolaireId: cible.id, niveau: 2 } }, data: { droitsInscription: 0 } });
    const membres = await classe(1);
    const avant = await instantane();

    const r = await valider(membres, "ADMIS");

    expect(r).toMatchObject({ statut: "erreur", message: expect.stringMatching(/droits d'inscription du tarif sont invalides/) });
    await rienEcrit(avant);
  });

  it("de petits droits ne bloquent plus le passage : une seule échéance de droits", async () => {
    await db.tarif.update({ where: { filiereId_anneeScolaireId_niveau: { filiereId: m.ifs.id, anneeScolaireId: cible.id, niveau: 2 } }, data: { droitsInscription: 2_000 } });
    const membres = await classe(1);

    reussi(await valider(membres, "ADMIS"));

    const ia = (await inscriptionCible(membres[0].etudiant.id))!;
    expect(ia.echeances.filter((e) => e.type === "DROITS").map((e) => e.montantDu)).toEqual([2_000]);
  });

  it("liste incomplète, en trop ou année source périmée : message de rechargement", async () => {
    const membres = await classe(3);
    const avant = await instantane();

    expect(await valider(membres.slice(0, 2), "ADMIS")).toMatchObject({ statut: "erreur", message: expect.stringMatching(/a changé depuis l'affichage/) });
    const enTrop = entree(membres, "ADMIS");
    enTrop.decisions.push({ inscriptionId: "inconnue", decision: "ADMIS" });
    expect(await actions.validerClasse(enTrop)).toMatchObject({ statut: "erreur", message: expect.stringMatching(/a changé depuis l'affichage/) });
    const autreAnnee = { ...entree(membres, "ADMIS"), anneeSourceId: cible.id };
    expect(await actions.validerClasse(autreAnnee)).toMatchObject({ statut: "erreur", message: expect.stringMatching(/porte maintenant sur l'année 2026-2027/) });
    await rienEcrit(avant);
  });

  it("filière inconnue : INTROUVABLE ; entrée invalide : erreurs de champ", async () => {
    const membres = await classe(1);
    expect(await actions.validerClasse({ ...entree(membres, "ADMIS"), filiereId: "inconnue" })).toMatchObject({ statut: "erreur", code: "INTROUVABLE" });
    expect(await actions.validerClasse({ ...entree(membres, "ADMIS"), decisions: [] })).toMatchObject({
      statut: "erreur",
      erreurs: { decisions: expect.any(String) },
    });
    expect(await actions.validerClasse({ ...entree(membres, "ADMIS"), niveau: 0 })).toMatchObject({ statut: "erreur", erreurs: { niveau: expect.any(String) } });
    const doublon = entree(membres, "ADMIS");
    doublon.decisions.push(doublon.decisions[0]);
    expect(await actions.validerClasse(doublon)).toMatchObject({ statut: "erreur", erreurs: { decisions: expect.stringMatching(/deux fois/) } });
    expect(await db.operationAdmission.count()).toBe(0);
  });

  it("sans session : redirigé vers la connexion, rien d'écrit", async () => {
    const membres = await classe(1);
    getSession.mockResolvedValue(null);
    await expect(valider(membres, "ADMIS")).rejects.toThrow(/NEXT_REDIRECT/);
    expect(await db.operationAdmission.count()).toBe(0);
  });

  it("un administrateur valide aussi, et l'auteur est celui de la session", async () => {
    const membres = await classe(1);
    connecter(getSession, m.admin);
    const { operationId } = reussi(await valider(membres, "ADMIS"));
    expect((await db.operationAdmission.findUniqueOrThrow({ where: { id: operationId } })).creeParId).toBe(m.admin.id);
  });
});

describe("validerClasse : concurrence", () => {
  it("3 validations simultanées de la même classe : une seule passe, aucun doublon d'inscription", async () => {
    const membres = await classe(6);
    const decisions: DecisionAdmission[] = ["ADMIS", "ADMIS", "ADMIS", "REDOUBLANT", "REDOUBLANT", "ABANDON"];

    const etats = await Promise.all([valider(membres, decisions), valider(membres, decisions), valider(membres, decisions)]);

    expect(etats.filter((e) => e.statut === "succes")).toHaveLength(1);
    for (const e of etats.filter((x) => x.statut === "erreur")) {
      expect(e).toMatchObject({ message: expect.stringMatching(/validée|modifiée|inscrit/) });
    }
    expect(await db.operationAdmission.count()).toBe(1);
    expect(await db.ligneAdmission.count()).toBe(6);
    const parEtudiant = await db.inscription.groupBy({ by: ["etudiantId"], where: { anneeScolaireId: cible.id }, _count: true });
    expect(parEtudiant).toHaveLength(5);
    expect(parEtudiant.every((g) => g._count === 1)).toBe(true);
    expect(await db.echeance.count({ where: { inscription: { anneeScolaireId: cible.id } } })).toBe(5 * 11);
    expect(await db.compteur.count()).toBe(0);
  });

  it("validation et encaissements simultanés sur les mêmes étudiants : pas d'interblocage, état cohérent", async () => {
    for (let tour = 0; tour < 3; tour++) {
      const membres = await classe(4);
      const payer = (e: Inscrit) =>
        paiements.encaisser({ etudiantId: e.etudiant.id, montant: 10_000, mode: "ESPECES", idClient: randomUUID(), resteDuAffiche: 900_000, jourAffiche: "2026-11-15" });

      const [validation, ...encaissements] = await Promise.all([valider(membres, "ADMIS"), ...membres.map(payer)]);

      expect(validation.statut).toBe("succes");
      for (const e of encaissements) {
        if (e.statut === "erreur") expect(e.code).toBe("SITUATION_CHANGEE");
      }
      const reussis = encaissements.filter((e) => e.statut === "succes").length;
      expect(await db.paiement.count({ where: { etudiantId: { in: membres.map((x) => x.etudiant.id) } } })).toBe(reussis);
      const lignes = await db.paiementLigne.findMany({ where: { paiement: { etudiantId: { in: membres.map((x) => x.etudiant.id) } } }, include: { echeance: { include: { inscription: true } } } });
      expect(lignes.every((l) => l.echeance.inscription.anneeScolaireId === m.annee.id && l.montant <= l.echeance.montantDu)).toBe(true);
      for (const e of membres) expect((await inscriptionCible(e.etudiant.id))!.echeances).toHaveLength(11);
    }
    expect(Object.keys(await compteurs()).every((k) => k.startsWith("RECU:"))).toBe(true);
  });
});

describe("validerClasse : robustesse", () => {
  it("un étudiant déjà inscrit sur l'année cible : toute la validation est annulée, rien n'est écrit", async () => {
    const [a, b, c] = await classe(3);
    await fabriquerInscription(b.etudiant.id, cible.id, tarifCible(1), cible.dateDebut);
    const avant = await instantane();

    const r = await valider([a, b, c], ["ADMIS", "ADMIS", "REDOUBLANT"]);

    expect(r).toMatchObject({ statut: "erreur", message: expect.stringMatching(/déjà inscrit sur l'année suivante/) });
    expect(await instantane()).toEqual(avant);
    expect(await db.operationAdmission.count()).toBe(0);
    expect(await db.ligneAdmission.count()).toBe(0);
  });

  it("validation et sortie simultanées du même étudiant : jamais un étudiant sorti avec une inscription en cours", async () => {
    connecter(getSession, m.admin);
    for (let tour = 0; tour < 3; tour++) {
      const membres = await classe(3);
      const sorti = membres[0].etudiant.id;

      const [validation, sortie] = await Promise.all([
        valider(membres, "ADMIS"),
        sorties.enregistrerSortie({ etudiantId: sorti, type: "ABANDON", date: "2026-11-15", motif: "Départ de la ville" }),
      ]);

      expect(sortie.statut).toBe("succes");
      expect((await db.etudiant.findUniqueOrThrow({ where: { id: sorti } })).statut).toBe("ABANDON");
      expect(await db.inscription.count({ where: { etudiantId: sorti, statut: "EN_COURS" } })).toBe(0);
      const cibleSortie = await inscriptionCible(sorti);
      if (validation.statut === "succes") {
        expect(cibleSortie).toMatchObject({ statut: "ABANDON" });
        expect(cibleSortie!.echeances.every((e) => e.nonDueSortie)).toBe(true);
      } else {
        expect(validation).toMatchObject({ message: expect.stringMatching(/a changé depuis l'affichage/) });
        expect(cibleSortie).toBeNull();
        expect(await db.inscription.count({ where: { id: { in: membres.slice(1).map((e) => e.inscription.id) }, statut: "EN_COURS" } })).toBe(2);
      }
    }
  });

  it("annulation du passage et encaissement simultanés sur l'inscription créée : l'un ou l'autre, jamais les deux", async () => {
    for (let tour = 0; tour < 3; tour++) {
      const [a] = await classe(1);
      reussi(await paiements.encaisser({ etudiantId: a.etudiant.id, montant: 900_000, mode: "ESPECES", idClient: randomUUID(), resteDuAffiche: 900_000, jourAffiche: "2026-11-15" }));
      const { operationId } = reussi(await valider([a], "ADMIS"));
      connecter(getSession, m.admin);
      const reste = (await paiements.chargerSituationGuichet(a.etudiant.id))!.resteDuTotal;
      expect(reste).toBe(tarifCible(2).droitsInscription + 10 * tarifCible(2).montantMensuel);

      const [annulation, encaissement] = await Promise.all([
        actions.annulerOperation({ operationId }),
        paiements.encaisser({ etudiantId: a.etudiant.id, montant: 10_000, mode: "ESPECES", idClient: randomUUID(), resteDuAffiche: reste, jourAffiche: "2026-11-15" }),
      ]);

      const ic = await inscriptionCible(a.etudiant.id);
      if (annulation.statut === "succes") {
        expect(ic).toBeNull();
        expect(encaissement).toMatchObject({ statut: "erreur", code: "SITUATION_CHANGEE" });
      } else {
        expect(annulation).toMatchObject({ message: expect.stringMatching(/paiements ont été enregistrés/) });
        expect(encaissement.statut).toBe("succes");
        expect(ic).not.toBeNull();
      }
      expect(await db.paiementLigne.count({ where: { echeance: { inscription: { anneeScolaireId: cible.id, etudiantId: a.etudiant.id } } } })).toBe(annulation.statut === "succes" ? 0 : 1);
    }
  });
});

describe("annulerOperation", () => {
  async function passageFait(effectif = 3, liste: DecisionAdmission | DecisionAdmission[] = "ADMIS") {
    const membres = await classe(effectif);
    const { operationId } = reussi(await valider(membres, liste));
    return { membres, operationId };
  }

  it("refuse le rôle user, même appelée directement avec une entrée invalide, sans rien modifier", async () => {
    const { operationId } = await passageFait();
    const avant = await instantane();
    revalidatePath.mockClear();

    expect(await actions.annulerOperation({ operationId })).toEqual(REFUS_ADMIN);
    expect(await actions.annulerOperation({} as never)).toEqual(REFUS_ADMIN);

    expect(await instantane()).toEqual(avant);
    expect((await db.operationAdmission.findUniqueOrThrow({ where: { id: operationId } })).annulee).toBe(false);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("sans session : redirigé vers la connexion", async () => {
    const { operationId } = await passageFait();
    getSession.mockResolvedValue(null);
    await expect(actions.annulerOperation({ operationId })).rejects.toThrow(/NEXT_REDIRECT/);
  });

  it("restaure exactement l'état d'avant : étudiants, inscriptions, échéances, paiements et compteurs identiques", async () => {
    const ancienne = new Date(Date.UTC(2026, 0, 5));
    const a = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, tarifSource(1));
    const b = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, tarifSource(1));
    const c = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, tarifSource(1));
    const d = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, tarifSource(1), { dateSortie: ancienne, motifSortie: "ancien motif" });
    await fabriquerEtudiantInscrit(m.sf.id, m.annee, tarifSource(1));
    const niveau3 = await classe(2, 3);
    await fabriquerPaiement(a.etudiant.id, m.user.id, [{ echeanceId: a.inscription.echeances[0].id, montant: 40_000 }]);
    await fabriquerPaiement(
      b.etudiant.id,
      m.user.id,
      [{ echeanceId: b.inscription.echeances[1].id, montant: 80_000 }],
      { annule: true, annuleParId: m.admin.id, dateAnnulation: new Date("2026-11-02T08:00:00Z"), motifAnnulation: "erreur de saisie" },
    );
    await db.compteur.create({ data: { cle: "RECU:2026", valeur: 7 } });
    const avant = await instantane();

    const op1 = reussi(await valider([a, b, c, d], ["ADMIS", "REDOUBLANT", "ADMIS", "ABANDON"])).operationId;
    const op2 = reussi(await valider(niveau3, ["DIPLOME", "REDOUBLANT"], 3)).operationId;
    expect(await instantane()).not.toEqual(avant);
    connecter(getSession, m.admin);
    vi.setSystemTime(new Date("2026-11-16T07:00:00Z"));

    expect(await actions.annulerOperation({ operationId: op2 })).toMatchObject({ statut: "succes", message: expect.stringMatching(/Passage annulé/) });
    expect(await actions.annulerOperation({ operationId: op1 })).toMatchObject({ statut: "succes" });

    expect(await instantane()).toEqual(avant);
    expect(await db.echeance.count()).toBe(avant.echeances.length);
    for (const id of [op1, op2]) {
      const op = await db.operationAdmission.findUniqueOrThrow({ where: { id }, include: { lignes: true } });
      expect(op).toMatchObject({ annulee: true, annuleeParId: m.admin.id });
      expect(op.dateAnnulation?.toISOString()).toBe("2026-11-16T07:00:00.000Z");
      expect(op.lignes.length).toBeGreaterThan(0);
    }
    expect(await db.ligneAdmission.count()).toBe(6);
    expect(await db.inscription.count({ where: { operationAdmissionId: { not: null } } })).toBe(0);
  });

  it("frais prévus sur l'année cible : copiés sur les admis (niveau + 1) et les redoublants (même niveau), l'annulation restaure l'état exact", async () => {
    const [a, b, c, d] = await classe(4);
    const mars = new Date(Date.UTC(2028, 2, 1));
    const fraisNiveau2 = await fabriquerFrais(cible.id, { classes: [{ filiereId: m.ifs.id, niveau: 2 }], libelle: "Frais niveau 2", montant: 15_000, mois: mars });
    const fraisNiveau1 = await fabriquerFrais(cible.id, { classes: [{ filiereId: m.ifs.id, niveau: 1 }], libelle: "Frais niveau 1", montant: 9_000, mois: new Date(Date.UTC(2028, 0, 1)) });
    const fraisSf = await fabriquerFrais(cible.id, { classes: [{ filiereId: m.sf.id, niveau: 1 }], libelle: "Frais SF" });
    const avant = await instantane();

    const { operationId } = reussi(await valider([a, b, c, d], ["ADMIS", "REDOUBLANT", "ADMIS", "ABANDON"]));

    const frais = async (x: Inscrit) =>
      (await inscriptionCible(x.etudiant.id))?.echeances.filter((e) => e.type === "FRAIS").map((e) => [e.fraisId, e.montantDu, e.nonDueSortie]);
    expect(await frais(a)).toEqual([[fraisNiveau2.frais.id, 15_000, false]]);
    expect(await frais(b)).toEqual([[fraisNiveau1.frais.id, 9_000, false]]);
    expect(await frais(c)).toEqual([[fraisNiveau2.frais.id, 15_000, false]]);
    expect(await frais(d)).toBeUndefined();
    expect(await db.echeance.count({ where: { fraisId: fraisSf.frais.id } })).toBe(0);
    expect((await inscriptionCible(a.etudiant.id))!.echeances).toHaveLength(12);

    connecter(getSession, m.admin);
    reussi(await actions.annulerOperation({ operationId }));

    expect(await instantane()).toEqual(avant);
    expect(await db.echeance.count({ where: { type: "FRAIS" } })).toBe(0);
  });

  it("dernière année : les diplômés ne reçoivent aucun frais, le redoublant reçoit celui de son niveau", async () => {
    const [d, r] = await classe(2, 3);
    const frais = await fabriquerFrais(cible.id, { classes: [{ filiereId: m.ifs.id, niveau: 3 }], mois: new Date(Date.UTC(2028, 2, 1)) });

    reussi(await valider([d, r], ["DIPLOME", "REDOUBLANT"], 3));

    expect(await db.echeance.findMany({ where: { fraisId: frais.frais.id }, include: { inscription: true } })).toMatchObject([
      { inscription: { etudiantId: r.etudiant.id } },
    ]);
  });

  it("validation d'une classe et création d'un frais pour l'année cible simultanées : chaque inscription créée a exactement un frais", async () => {
    const membres = await classe(3);
    const { creerFrais } = await import("@/server/actions/frais");
    connecter(getSession, m.admin);

    const [passage, frais] = await Promise.all([
      valider(membres, "ADMIS"),
      creerFrais({ libelle: "Frais de stage", montant: 20_000, mois: "2028-03", anneeScolaireId: cible.id, classes: [{ filiereId: m.ifs.id, niveau: 2 }] }),
    ]);

    expect(passage.statut).toBe("succes");
    expect(frais.statut).toBe("succes");
    for (const x of membres) {
      expect((await inscriptionCible(x.etudiant.id))!.echeances.filter((e) => e.type === "FRAIS"), x.etudiant.id).toHaveLength(1);
    }
  });

  it("l'annulation libère la classe : elle peut être validée de nouveau", async () => {
    const { membres, operationId } = await passageFait(2);
    connecter(getSession, m.admin);
    reussi(await actions.annulerOperation({ operationId }));

    const seconde = reussi(await valider(membres, ["ADMIS", "REDOUBLANT"]));

    expect(seconde.operationId).not.toBe(operationId);
    expect(await db.operationAdmission.count()).toBe(2);
    expect(await db.inscription.count({ where: { anneeScolaireId: cible.id } })).toBe(2);
  });

  it("bloquée par un paiement actif sur une inscription créée : rien n'est modifié, le reçu est cité", async () => {
    const { membres, operationId } = await passageFait();
    const ic = (await inscriptionCible(membres[1].etudiant.id))!;
    const p = await fabriquerPaiement(membres[1].etudiant.id, m.user.id, [{ echeanceId: ic.echeances[0].id, montant: 20_000 }], { numeroRecu: "R-2026-00042" });
    connecter(getSession, m.admin);
    const avant = await instantane();

    const r = await actions.annulerOperation({ operationId });

    expect(r).toMatchObject({ statut: "erreur", message: expect.stringMatching(/paiements ont été enregistrés .*R-2026-00042/) });
    expect(await instantane()).toEqual(avant);
    expect((await db.operationAdmission.findUniqueOrThrow({ where: { id: operationId } })).annulee).toBe(false);
    expect(p.id).toBeTruthy();
  });

  it("bloquée aussi par un paiement annulé : blocage définitif, l'historique du reçu est conservé", async () => {
    const { membres, operationId } = await passageFait();
    const ic = (await inscriptionCible(membres[0].etudiant.id))!;
    const p = await fabriquerPaiement(
      membres[0].etudiant.id,
      m.user.id,
      [{ echeanceId: ic.echeances[1].id, montant: 20_000 }],
      { numeroRecu: "R-2026-00043", annule: true, annuleParId: m.admin.id, dateAnnulation: new Date(), motifAnnulation: "erreur de saisie" },
    );
    connecter(getSession, m.admin);
    const avant = await instantane();

    const r = await actions.annulerOperation({ operationId });

    expect(r).toMatchObject({ statut: "erreur", message: expect.stringMatching(/R-2026-00043.*définitif/) });
    expect(await instantane()).toEqual(avant);
    expect(await db.paiementLigne.count({ where: { paiementId: p.id } })).toBe(1);
  });

  it("un paiement réel (encaisser) sur l'inscription créée bloque l'annulation", async () => {
    const [a] = await classe(1);
    const { operationId } = reussi(await valider([a], "ADMIS"));
    const reste = (await paiements.chargerSituationGuichet(a.etudiant.id))!.resteDuTotal;
    // Le plus ancien dû est l'année 2026 : on solde tout 2026 puis un peu de 2027.
    reussi(await paiements.encaisser({ etudiantId: a.etudiant.id, montant: 900_000 + 10_000, mode: "ESPECES", idClient: randomUUID(), resteDuAffiche: reste, jourAffiche: "2026-11-15" }));
    connecter(getSession, m.admin);

    const r = await actions.annulerOperation({ operationId });

    expect(r).toMatchObject({ statut: "erreur", message: expect.stringMatching(/R-2026-00001/) });
    expect(await inscriptionCible(a.etudiant.id)).not.toBeNull();
  });

  it("un paiement sur l'année source ne bloque pas l'annulation", async () => {
    const [a] = await classe(1);
    reussi(await paiements.encaisser({ etudiantId: a.etudiant.id, montant: 100_000, mode: "ESPECES", idClient: randomUUID(), resteDuAffiche: 900_000, jourAffiche: "2026-11-15" }));
    const { operationId } = reussi(await valider([a], "ADMIS"));
    connecter(getSession, m.admin);

    expect(await actions.annulerOperation({ operationId })).toMatchObject({ statut: "succes" });

    expect(await db.paiement.count()).toBe(1);
    expect(await inscriptionCible(a.etudiant.id)).toBeNull();
  });

  it("bloquée si l'état a dérivé : étudiant sorti après le passage", async () => {
    const { membres, operationId } = await passageFait();
    connecter(getSession, m.admin);
    reussi(await sorties.enregistrerSortie({ etudiantId: membres[0].etudiant.id, type: "EXCLU", date: "2026-11-15", motif: "Décision du conseil" }));
    const avant = await instantane();

    const r = await actions.annulerOperation({ operationId });

    expect(r).toMatchObject({ statut: "erreur", message: expect.stringMatching(/situation de .* a changé depuis ce passage/) });
    expect(await instantane()).toEqual(avant);
  });

  it("bloquée si l'état a dérivé : statut d'un étudiant modifié directement", async () => {
    const membres = await classe(2);
    const { operationId } = reussi(await valider(membres, "ADMIS"));
    await db.etudiant.update({ where: { id: membres[0].etudiant.id }, data: { statut: "DIPLOME" } });
    connecter(getSession, m.admin);

    expect(await actions.annulerOperation({ operationId })).toMatchObject({ statut: "erreur", message: expect.stringMatching(/a changé depuis ce passage/) });
  });

  it("bloquée tant que le passage suivant est validé : on annule d'abord celui-là, puis le premier", async () => {
    const { membres, operationId: premier } = await passageFait(2);
    await db.anneeScolaire.update({ where: { id: m.annee.id }, data: { estCourante: false } });
    await db.anneeScolaire.update({ where: { id: cible.id }, data: { estCourante: true } });
    const annee2028 = await fabriquerAnneeCible(m.ifs.id, { anneeDebut: 2028 });
    const suivant = reussi(
      await actions.validerClasse({
        anneeSourceId: cible.id,
        filiereId: m.ifs.id,
        niveau: 2,
        decisions: await Promise.all(membres.map(async (e) => ({ inscriptionId: (await inscriptionCible(e.etudiant.id))!.id, decision: "ADMIS" as const }))),
      }),
    );
    expect(await db.inscription.count({ where: { anneeScolaireId: annee2028.id } })).toBe(2);
    connecter(getSession, m.admin);

    const refus = await actions.annulerOperation({ operationId: premier });
    expect(refus).toMatchObject({ statut: "erreur", message: expect.stringMatching(/passage suivant a déjà été validé/) });

    reussi(await actions.annulerOperation({ operationId: suivant.operationId }));
    expect(await db.inscription.count({ where: { anneeScolaireId: annee2028.id } })).toBe(0);
    reussi(await actions.annulerOperation({ operationId: premier }));
    expect(await db.inscription.count({ where: { anneeScolaireId: cible.id } })).toBe(0);
    for (const e of membres) expect((await db.inscription.findUniqueOrThrow({ where: { id: e.inscription.id } })).statut).toBe("EN_COURS");
  });

  it("double annulation refusée, sans changer l'auteur ni la date de la première", async () => {
    const { operationId } = await passageFait();
    connecter(getSession, m.admin);
    vi.setSystemTime(new Date("2026-11-16T07:00:00Z"));
    reussi(await actions.annulerOperation({ operationId }));
    const autre = await db.user.create({ data: { id: randomUUID(), name: "Autre admin", email: "autre@test.ifspa.mg", role: "admin" } });
    connecter(getSession, autre);
    vi.setSystemTime(new Date("2026-11-17T07:00:00Z"));

    const r = await actions.annulerOperation({ operationId });

    expect(r).toMatchObject({ statut: "erreur", message: "Ce passage est déjà annulé." });
    const op = await db.operationAdmission.findUniqueOrThrow({ where: { id: operationId } });
    expect(op.annuleeParId).toBe(m.admin.id);
    expect(op.dateAnnulation?.toISOString()).toBe("2026-11-16T07:00:00.000Z");
  });

  it("deux annulations simultanées : une seule aboutit", async () => {
    const { operationId } = await passageFait();
    connecter(getSession, m.admin);

    const etats = await Promise.all([actions.annulerOperation({ operationId }), actions.annulerOperation({ operationId })]);

    expect(etats.map((e) => e.statut).sort()).toEqual(["erreur", "succes"]);
    expect(await db.inscription.count({ where: { anneeScolaireId: cible.id } })).toBe(0);
  });

  it("opération inconnue ou identifiant invalide", async () => {
    connecter(getSession, m.admin);
    expect(await actions.annulerOperation({ operationId: "inconnue" })).toMatchObject({ statut: "erreur", code: "INTROUVABLE" });
    expect(await actions.annulerOperation({ operationId: "" })).toMatchObject({ statut: "erreur", erreurs: { operationId: expect.any(String) } });
  });
});

describe("lectures appelées par l'écran Admissions", () => {
  it("chargerClasse et chargerBlocageAnnulation exigent une session", async () => {
    getSession.mockResolvedValue(null);
    await expect(actions.chargerClasse("f", 1)).rejects.toThrow(/NEXT_REDIRECT/);
    await expect(actions.chargerBlocageAnnulation("o")).rejects.toThrow(/NEXT_REDIRECT/);
  });

  it("entrées invalides : null, sans erreur", async () => {
    expect(await actions.chargerClasse("", 1)).toBeNull();
    expect(await actions.chargerClasse(m.ifs.id, 0)).toBeNull();
    expect(await actions.chargerBlocageAnnulation("")).toBeNull();
    expect(await actions.chargerBlocageAnnulation("inconnue")).toBeNull();
  });
});

describe("années voisines", () => {
  it("source 2026, cible 2027 : les années 2028 et 2030 présentes ne changent pas la cible", async () => {
    await fabriquerAnneeCible(m.ifs.id, { anneeDebut: 2028 });
    await fabriquerAnnee({ anneeDebut: 2030 });
    const [a] = await classe(1);

    reussi(await valider([a], "ADMIS"));

    expect(await inscriptionCible(a.etudiant.id)).toMatchObject({ niveau: 2 });
  });
});
