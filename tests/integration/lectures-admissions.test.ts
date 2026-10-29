import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DecisionAdmission } from "@/generated/prisma/enums";
import { fabriquerEtudiant, fabriquerFiliere, fabriquerInscription, fabriquerPaiement } from "../factories";
import {
  connecter,
  fabriquerAnneeCible,
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
const actions = await import("@/server/actions/admissions");
const { lireBlocageAnnulation, lireClasse, lireEcranAdmissions, lireHistorique } = await import("@/server/lectures/admissions");

let m: Monde;
let cible: Awaited<ReturnType<typeof fabriquerAnneeCible>>;

type Inscrit = Awaited<ReturnType<typeof fabriquerEtudiantInscrit>>;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(MAINTENANT) });
  revalidatePath.mockClear();
  getSession.mockReset();
  m = await fabriquerMonde();
  cible = await fabriquerAnneeCible(m.ifs.id);
  connecter(getSession, m.user);
});

afterEach(() => vi.useRealTimers());

const tarif = (niveau: number) => ({ niveau, droitsInscription: 100_000, montantMensuel: 80_000, nombreMois: 10 });

const inscrire = (filiereId: string, niveau: number, donnees = {}) =>
  fabriquerEtudiantInscrit(filiereId, m.annee, tarif(niveau), donnees);

const valider = (filiereId: string, niveau: number, membres: Inscrit[], decisions: DecisionAdmission[]) =>
  actions.validerClasse({
    anneeSourceId: m.annee.id,
    filiereId,
    niveau,
    decisions: membres.map((e, i) => ({ inscriptionId: e.inscription.id, decision: decisions[i] })),
  });

const classeDe = async (filiereId: string, niveau: number) =>
  (await lireEcranAdmissions()).classes.find((c) => c.filiere.id === filiereId && c.niveau === niveau)!;

describe("lireEcranAdmissions", () => {
  it("années déduites, classes par code de filière puis niveau, effectif et état de chacune", async () => {
    await inscrire(m.ifs.id, 1);
    await inscrire(m.ifs.id, 1);
    await inscrire(m.ifs.id, 1);
    await inscrire(m.sf.id, 1);
    await inscrire(m.sf.id, 1);
    await inscrire(m.ifs.id, 1, { statut: "ABANDON" });

    const e = await lireEcranAdmissions();

    expect(e).toMatchObject({
      source: { id: m.annee.id, libelle: "2026-2027" },
      cible: { id: cible.id, libelle: "2027-2028" },
      libelleCible: "2027-2028",
      refus: null,
    });
    expect(e.classes.map((c) => [c.filiere.code, c.niveau, c.effectif, c.etat])).toEqual([
      ["IF", 1, 3, "a_faire"],
      ["IF", 2, 0, "vide"],
      ["IF", 3, 0, "vide"],
      ["SF", 1, 2, "tarif_manquant"],
      ["SF", 2, 0, "vide"],
      ["SF", 3, 0, "vide"],
    ]);
    expect(e.avancement).toEqual({ validees: 0, total: 2, libelle: "0 classe validée sur 2" });
    const sf1 = e.classes.find((c) => c.filiere.code === "SF" && c.niveau === 1)!;
    expect(sf1.blocage).toMatch(/Tarif manquant pour Sage-femmes 2e année en 2027-2028/);
    expect(sf1).toMatchObject({ libelle: "Sage-femmes 1re année", libelleEtat: "Tarif manquant", derniereAnnee: false });
    expect(e.classes.find((c) => c.filiere.code === "IF" && c.niveau === 3)?.derniereAnnee).toBe(true);
  });

  it("dernière année : aucun tarif requis pour être « à faire »", async () => {
    await inscrire(m.sf.id, 3);
    expect(await classeDe(m.sf.id, 3)).toMatchObject({ etat: "a_faire", blocage: null, derniereAnnee: true });
  });

  it("classe validée : état « Validée », dernière opération et avancement", async () => {
    const membres = [await inscrire(m.ifs.id, 1), await inscrire(m.ifs.id, 1)];
    await inscrire(m.sf.id, 1);
    reussi(await valider(m.ifs.id, 1, membres, ["ADMIS", "REDOUBLANT"]));

    const e = await lireEcranAdmissions();

    const if1 = e.classes.find((c) => c.filiere.code === "IF" && c.niveau === 1)!;
    expect(if1).toMatchObject({ etat: "validee", effectif: 2, libelleEtat: "Validée" });
    expect(if1.operation).toMatchObject({ par: "Caissier Test" });
    expect(e.avancement).toEqual({ validees: 1, total: 2, libelle: "1 classe validée sur 2" });
  });

  it("classe validée : l'effectif est la somme des étudiants de ses passages actifs, toutes décisions confondues", async () => {
    const premiers = [await inscrire(m.ifs.id, 1), await inscrire(m.ifs.id, 1), await inscrire(m.ifs.id, 1)];
    reussi(await valider(m.ifs.id, 1, premiers, ["ADMIS", "REDOUBLANT", "ABANDON"]));
    expect(await classeDe(m.ifs.id, 1)).toMatchObject({ etat: "validee", effectif: 3 });

    const complementaires = [await inscrire(m.ifs.id, 1), await inscrire(m.ifs.id, 1)];
    reussi(await valider(m.ifs.id, 1, complementaires, ["ADMIS", "ADMIS"]));

    expect(await classeDe(m.ifs.id, 1)).toMatchObject({ etat: "validee", effectif: 5 });
  });

  it("un passage annulé ne compte pas dans l'effectif de la classe validée", async () => {
    const premiers = [await inscrire(m.ifs.id, 1), await inscrire(m.ifs.id, 1)];
    reussi(await valider(m.ifs.id, 1, premiers, ["ADMIS", "ADMIS"]));
    const complementaires = [await inscrire(m.ifs.id, 1), await inscrire(m.ifs.id, 1), await inscrire(m.ifs.id, 1)];
    const second = reussi(await valider(m.ifs.id, 1, complementaires, ["ADMIS", "REDOUBLANT", "ADMIS"]));
    expect((await classeDe(m.ifs.id, 1)).effectif).toBe(5);

    connecter(getSession, m.admin);
    reussi(await actions.annulerOperation({ operationId: second.operationId }));

    // Les trois inscrits du passage annulé sont de nouveau en cours : la classe est « à faire » pour eux seuls.
    expect(await classeDe(m.ifs.id, 1)).toMatchObject({ etat: "a_faire", effectif: 3 });
  });

  it("classe redevenue « à faire » après annulation : ses inscriptions en cours reviennent dans l'effectif, sans opération", async () => {
    const membres = [await inscrire(m.ifs.id, 1), await inscrire(m.ifs.id, 1), await inscrire(m.ifs.id, 1)];
    const { operationId } = reussi(await valider(m.ifs.id, 1, membres, ["ADMIS", "REDOUBLANT", "ABANDON"]));
    expect(await classeDe(m.ifs.id, 1)).toMatchObject({ etat: "validee", effectif: 3 });
    connecter(getSession, m.admin);
    reussi(await actions.annulerOperation({ operationId }));

    const c = await classeDe(m.ifs.id, 1);

    expect(c).toMatchObject({ etat: "a_faire", effectif: 3, operation: null });
    expect((await lireEcranAdmissions()).avancement).toEqual({ validees: 0, total: 1, libelle: "0 classe validée sur 1" });
  });

  it("passage complémentaire : un étudiant inscrit après la validation remet la classe « à faire »", async () => {
    const membres = [await inscrire(m.ifs.id, 1)];
    const { operationId } = reussi(await valider(m.ifs.id, 1, membres, ["ADMIS"]));
    await inscrire(m.ifs.id, 1);

    const c = await classeDe(m.ifs.id, 1);

    expect(c).toMatchObject({ etat: "a_faire", effectif: 1 });
    expect(c.operation?.id).toBe(operationId);
  });

  it("une opération annulée ne compte plus : la classe redevient « à faire »", async () => {
    const membres = [await inscrire(m.ifs.id, 1)];
    const { operationId } = reussi(await valider(m.ifs.id, 1, membres, ["ADMIS"]));
    connecter(getSession, m.admin);
    reussi(await actions.annulerOperation({ operationId }));

    expect(await classeDe(m.ifs.id, 1)).toMatchObject({ etat: "a_faire", effectif: 1, operation: null });
  });

  it("tarif du même niveau manquant dans la cible : signalé pour les redoublants sans bloquer la classe", async () => {
    await db.tarif.deleteMany({ where: { anneeScolaireId: cible.id, niveau: 1 } });
    await inscrire(m.ifs.id, 1);

    const c = await classeDe(m.ifs.id, 1);

    expect(c).toMatchObject({ etat: "a_faire", tarifRedoublementManquant: true });
    expect((await classeDe(m.ifs.id, 2)).tarifRedoublementManquant).toBe(false);
  });

  it("année suivante absente : classes non vides « année suivante à créer », avec la raison", async () => {
    await inscrire(m.ifs.id, 1);
    await db.tarif.deleteMany({ where: { anneeScolaireId: cible.id } });
    await db.anneeScolaire.delete({ where: { id: cible.id } });

    const e = await lireEcranAdmissions();

    expect(e).toMatchObject({ cible: null, libelleCible: "2027-2028" });
    expect(e.refus).toMatch(/2027-2028 n'existe pas encore/);
    const c = e.classes.find((x) => x.filiere.code === "IF" && x.niveau === 1)!;
    expect(c).toMatchObject({ etat: "cible_absente", libelleEtat: "Année suivante à créer", blocage: e.refus });
    expect(e.classes.find((x) => x.filiere.code === "IF" && x.niveau === 2)?.etat).toBe("vide");
  });

  it("année cible clôturée : classes bloquées", async () => {
    await inscrire(m.ifs.id, 1);
    await db.anneeScolaire.update({ where: { id: cible.id }, data: { cloturee: true } });
    expect((await classeDe(m.ifs.id, 1)).etat).toBe("cible_absente");
  });

  it("sans année courante : aucune source, aucune classe, raison donnée", async () => {
    await db.anneeScolaire.update({ where: { id: m.annee.id }, data: { estCourante: false } });

    const e = await lireEcranAdmissions();

    expect(e).toMatchObject({ source: null, cible: null, classes: [], avancement: { validees: 0, total: 0 } });
    expect(e.refus).toMatch(/Aucune année scolaire courante/);
  });

  it("la plus ancienne année qui a encore des inscriptions en cours est la source", async () => {
    const a2025 = await db.anneeScolaire.create({
      data: { libelle: "2025-2026", anneeDebut: 2025, dateDebut: new Date(Date.UTC(2025, 9, 1)), dateFin: new Date(Date.UTC(2026, 6, 31)) },
    });
    const e = await fabriquerEtudiant(m.ifs.id, a2025.id);
    await fabriquerInscription(e.id, a2025.id, tarif(1), a2025.dateDebut);
    await inscrire(m.ifs.id, 1);

    const ecran = await lireEcranAdmissions();

    expect(ecran.source?.libelle).toBe("2025-2026");
    expect(ecran.cible?.libelle).toBe("2026-2027");
    expect(ecran.classes.find((c) => c.filiere.code === "IF" && c.niveau === 1)?.effectif).toBe(1);
  });

  it("filière désactivée : ses classes restent tant qu'il y a des inscrits ; sans inscrit ni opération, elle disparaît", async () => {
    await inscrire(m.ifs.id, 1);
    await db.filiere.update({ where: { id: m.ifs.id }, data: { actif: false } });
    await db.filiere.update({ where: { id: m.sf.id }, data: { actif: false } });

    const e = await lireEcranAdmissions();

    expect(new Set(e.classes.map((c) => c.filiere.code))).toEqual(new Set(["IF"]));
    expect(e.classes.find((c) => c.niveau === 1)).toMatchObject({ effectif: 1, etat: "a_faire", filiere: { actif: false } });
  });

  it("une filière dont des inscrits dépassent la durée voit ces niveaux listés", async () => {
    const courte = await fabriquerFiliere({ code: "ZZ", nom: "Courte", dureeAnnees: 2 });
    await fabriquerEtudiantInscrit(courte.id, m.annee, tarif(4));
    const e = await lireEcranAdmissions();
    expect(e.classes.filter((c) => c.filiere.code === "ZZ").map((c) => c.niveau)).toEqual([1, 2, 3, 4]);
  });

  it("sans session : redirigé", async () => {
    getSession.mockResolvedValue(null);
    await expect(lireEcranAdmissions()).rejects.toThrow(/NEXT_REDIRECT/);
    await expect(lireClasse(m.ifs.id, 1)).rejects.toThrow(/NEXT_REDIRECT/);
    await expect(lireHistorique()).rejects.toThrow(/NEXT_REDIRECT/);
    await expect(lireBlocageAnnulation("x")).rejects.toThrow(/NEXT_REDIRECT/);
  });
});

describe("lireClasse", () => {
  it("étudiants actifs en cours par ordre alphabétique, impayé en retard pour information, décision par défaut en tête", async () => {
    const zoe = await inscrire(m.ifs.id, 1, { nom: "ZAFY", prenoms: "Zoé" });
    const ana = await inscrire(m.ifs.id, 1, { nom: "ANDRIA", prenoms: "Zo" });
    const anb = await inscrire(m.ifs.id, 1, { nom: "ANDRIA", prenoms: "Alice" });
    await inscrire(m.ifs.id, 1, { nom: "SORTI", statut: "ABANDON" });
    await inscrire(m.ifs.id, 2, { nom: "AUTRENIVEAU" });
    await fabriquerPaiement(zoe.etudiant.id, m.user.id, [
      { echeanceId: zoe.inscription.echeances[0].id, montant: 100_000 },
      { echeanceId: zoe.inscription.echeances[1].id, montant: 80_000 },
    ]);
    await fabriquerPaiement(anb.etudiant.id, m.user.id, [{ echeanceId: anb.inscription.echeances[0].id, montant: 30_000 }]);

    const c = (await lireClasse(m.ifs.id, 1, "2026-12-01"))!;

    expect(c.etudiants.map((e) => `${e.nom} ${e.prenoms}`)).toEqual(["ANDRIA Alice", "ANDRIA Zo", "ZAFY Zoé"]);
    expect(c.etudiants.map((e) => [e.impayeEnRetard, e.moisEnRetard])).toEqual([
      [70_000 + 80_000 + 80_000, 2],
      [100_000 + 80_000 + 80_000, 2],
      [80_000, 1],
    ]);
    expect(ana.inscription.id).toBe(c.etudiants[1].inscriptionId);
    expect(c.decisions).toEqual([
      { decision: "ADMIS", libelle: "Passe en 2e année" },
      { decision: "REDOUBLANT", libelle: "Redouble" },
      { decision: "ABANDON", libelle: "Abandon" },
    ]);
    expect(c).toMatchObject({ source: { libelle: "2026-2027" }, cible: { libelle: "2027-2028" }, jour: "2026-12-01", peutAnnuler: false });
    expect(c.classe).toMatchObject({ libelle: "Infirmier(e)s 1re année", effectif: 3 });
  });

  it("dernière année : « Diplômé(e) » à la place de « Passe en… »", async () => {
    await inscrire(m.ifs.id, 3);
    const c = (await lireClasse(m.ifs.id, 3))!;
    expect(c.decisions.map((d) => d.libelle)).toEqual(["Diplômé(e)", "Redouble", "Abandon"]);
  });

  it("les mois non dus d'un étudiant n'entrent pas dans son impayé en retard", async () => {
    const e = await inscrire(m.ifs.id, 1);
    await db.echeance.updateMany({ where: { inscriptionId: e.inscription.id, type: "MENSUALITE", mois: new Date(Date.UTC(2026, 10, 1)) }, data: { nonDueSortie: true } });

    const c = (await lireClasse(m.ifs.id, 1, "2027-03-15"))!;

    expect([c.etudiants[0].impayeEnRetard, c.etudiants[0].moisEnRetard]).toEqual([100_000 + 80_000 * 4, 4]);
  });

  it("classe inconnue ou d'une autre année que la source : null", async () => {
    expect(await lireClasse("inconnue", 1)).toBeNull();
    const longue = await fabriquerFiliere({ code: "ZZ", dureeAnnees: 2 });
    expect(await lireClasse(longue.id, 9)).toBeNull();
  });

  it("classe validée : opérations avec décisions par ordre alphabétique, résumé et possibilité d'annuler", async () => {
    const membres = [
      await inscrire(m.ifs.id, 1, { nom: "BETA", matricule: "IF-2026-0002" }),
      await inscrire(m.ifs.id, 1, { nom: "ALPHA", matricule: "IF-2026-0001" }),
      await inscrire(m.ifs.id, 1, { nom: "GAMMA", matricule: "IF-2026-0003" }),
    ];
    const { operationId } = reussi(await valider(m.ifs.id, 1, membres, ["ADMIS", "ADMIS", "REDOUBLANT"]));

    const parUser = (await lireClasse(m.ifs.id, 1))!;
    expect(parUser.etudiants).toEqual([]);
    expect(parUser.peutAnnuler).toBe(false);
    expect(parUser.operations).toHaveLength(1);
    const op = parUser.operations[0];
    expect(op).toMatchObject({ id: operationId, par: "Caissier Test", resume: "2 passent en 2e année · 1 redouble", annulable: true, refusAnnulation: null });
    expect(op.comptes).toEqual({ admis: 2, redoublants: 1, diplomes: 0, abandons: 0 });
    expect(op.lignes.map((l) => [l.nom, l.matricule, l.libelleDecision])).toEqual([
      ["ALPHA", "IF-2026-0001", "Passe en 2e année"],
      ["BETA", "IF-2026-0002", "Passe en 2e année"],
      ["GAMMA", "IF-2026-0003", "Redouble"],
    ]);

    connecter(getSession, m.admin);
    expect((await lireClasse(m.ifs.id, 1))!.peutAnnuler).toBe(true);
  });

  it("un paiement sur une inscription créée rend l'opération non annulable, avec la raison", async () => {
    const membres = [await inscrire(m.ifs.id, 1)];
    reussi(await valider(m.ifs.id, 1, membres, ["ADMIS"]));
    const ic = await db.inscription.findFirstOrThrow({ where: { etudiantId: membres[0].etudiant.id, anneeScolaireId: cible.id }, include: { echeances: true } });
    await fabriquerPaiement(membres[0].etudiant.id, m.user.id, [{ echeanceId: ic.echeances[0].id, montant: 5_000 }], { numeroRecu: "R-2026-00077" });

    const op = (await lireClasse(m.ifs.id, 1))!.operations[0];

    expect(op.annulable).toBe(false);
    expect(op.refusAnnulation).toMatch(/R-2026-00077/);
  });

  it("le passage de la classe d'un autre niveau ne figure pas dans celle-ci", async () => {
    const un = [await inscrire(m.ifs.id, 1)];
    const deux = [await inscrire(m.ifs.id, 2)];
    reussi(await valider(m.ifs.id, 1, un, ["ADMIS"]));
    reussi(await valider(m.ifs.id, 2, deux, ["ADMIS"]));

    expect((await lireClasse(m.ifs.id, 1))!.operations).toHaveLength(1);
    expect((await lireClasse(m.ifs.id, 2))!.operations).toHaveLength(1);
    expect((await lireClasse(m.ifs.id, 3))!.operations).toHaveLength(0);
  });
});

describe("lireHistorique", () => {
  async function deuxOperations() {
    const a = [await inscrire(m.ifs.id, 1)];
    const b = [await inscrire(m.ifs.id, 2), await inscrire(m.ifs.id, 2)];
    const op1 = reussi(await valider(m.ifs.id, 1, a, ["ADMIS"])).operationId;
    const op2 = reussi(await valider(m.ifs.id, 2, b, ["ADMIS", "ABANDON"])).operationId;
    await db.operationAdmission.update({ where: { id: op1 }, data: { createdAt: new Date("2026-11-10T08:00:00Z") } });
    await db.operationAdmission.update({ where: { id: op2 }, data: { createdAt: new Date("2026-11-12T08:00:00Z") } });
    return { op1, op2 };
  }

  it("de la plus récente à la plus ancienne, avec classe, années, résumé et état d'annulation", async () => {
    const { op1, op2 } = await deuxOperations();

    const h = await lireHistorique();

    expect(h.peutAnnuler).toBe(false);
    expect(h.operations.map((o) => o.id)).toEqual([op2, op1]);
    expect(h.operations[0]).toMatchObject({
      classe: "Infirmier(e)s 2e année",
      filiereCode: "IF",
      niveau: 2,
      anneeSource: "2026-2027",
      anneeCible: "2027-2028",
      resume: "1 passe en 3e année · 1 abandon",
      annulee: false,
      annulation: null,
      annulable: true,
      refusAnnulation: null,
      date: "12/11/2026",
      heure: "11:00",
      par: "Caissier Test",
    });
  });

  it("opération annulée : conservée dans l'historique avec qui, quand, et non annulable", async () => {
    const { op1, op2 } = await deuxOperations();
    connecter(getSession, m.admin);
    vi.setSystemTime(new Date("2026-11-16T07:30:00Z"));
    reussi(await actions.annulerOperation({ operationId: op1 }));

    const h = await lireHistorique();

    expect(h.peutAnnuler).toBe(true);
    expect(h.operations.map((o) => [o.id, o.annulee])).toEqual([[op2, false], [op1, true]]);
    expect(h.operations[1]).toMatchObject({
      annulation: { date: "16/11/2026", heure: "10:30", par: "Admin Test" },
      annulable: false,
      refusAnnulation: "Ce passage est déjà annulé.",
    });
  });

  it("aucune opération : liste vide", async () => {
    expect((await lireHistorique()).operations).toEqual([]);
  });
});

describe("lireBlocageAnnulation", () => {
  it("annulable, puis bloquée par des reçus (annulés compris) listés une fois chacun ; opération inconnue : null", async () => {
    const membres = [await inscrire(m.ifs.id, 1)];
    const { operationId } = reussi(await valider(m.ifs.id, 1, membres, ["ADMIS"]));

    expect(await lireBlocageAnnulation(operationId)).toEqual({ annulable: true, refus: null, recusBloquants: [] });
    expect(await actions.chargerBlocageAnnulation(operationId)).toEqual({ annulable: true, refus: null, recusBloquants: [] });

    const ic = await db.inscription.findFirstOrThrow({ where: { etudiantId: membres[0].etudiant.id, anneeScolaireId: cible.id }, include: { echeances: { orderBy: [{ mois: "asc" }, { type: "asc" }] } } });
    const annule = await fabriquerPaiement(
      membres[0].etudiant.id,
      m.user.id,
      [{ echeanceId: ic.echeances[0].id, montant: 5_000 }, { echeanceId: ic.echeances[1].id, montant: 5_000 }],
      { numeroRecu: "R-2026-00020", annule: true, annuleParId: m.admin.id, dateAnnulation: new Date(), motifAnnulation: "erreur de saisie" },
    );
    const actif = await fabriquerPaiement(membres[0].etudiant.id, m.user.id, [{ echeanceId: ic.echeances[2].id, montant: 5_000 }], { numeroRecu: "R-2026-00010" });

    const blocage = await lireBlocageAnnulation(operationId);

    expect(blocage).toMatchObject({ annulable: false, refus: expect.stringMatching(/définitif/) });
    expect(blocage?.recusBloquants).toEqual([
      { id: actif.id, numeroRecu: "R-2026-00010" },
      { id: annule.id, numeroRecu: "R-2026-00020" },
    ]);
    expect(await lireBlocageAnnulation("inconnue")).toBeNull();
  });
});
