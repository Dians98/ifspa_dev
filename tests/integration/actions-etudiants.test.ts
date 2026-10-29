import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fabriquerAnnee, fabriquerFrais } from "../factories";
import {
  connecter,
  fabriquerEtudiantInscrit,
  fabriquerMonde,
  MAINTENANT,
  reussi,
  saisieEtudiant,
  type Monde,
} from "../factories/scenarios";

const { getSession, revaliderPagesEcolage } = vi.hoisted(() => ({ getSession: vi.fn(), revaliderPagesEcolage: vi.fn() }));

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/ecolage-revalidation", () => ({ revaliderPagesEcolage }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { db } = await import("@/lib/db");
const actions = await import("@/server/actions/etudiants");
const fraisActions = await import("@/server/actions/frais");
const { lireEtudiants, lireFicheEtudiant } = await import("@/server/lectures/etudiants");

let m: Monde;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(MAINTENANT) });
  revaliderPagesEcolage.mockClear();
  getSession.mockReset();
  m = await fabriquerMonde();
  connecter(getSession, m.user);
});

afterEach(() => vi.useRealTimers());

/** Ordre de lecture : les droits, puis mois par mois (index 1 = octobre). */
const echeancesDe = async (etudiantId: string) => {
  const lignes = await db.echeance.findMany({ where: { inscription: { etudiantId } }, orderBy: [{ mois: "asc" }, { type: "asc" }] });
  return [...lignes.filter((e) => e.type === "DROITS"), ...lignes.filter((e) => e.type !== "DROITS")];
};

const compteurs = async () =>
  Object.fromEntries((await db.compteur.findMany()).map((c) => [c.cle, c.valeur]));

describe("creerEtudiant : matricule", () => {
  it("numérote par filière : IF-2026-0001, IF-2026-0002, puis SF-2026-0001", async () => {
    const a = reussi(await actions.creerEtudiant(saisieEtudiant(m.ifs.id)));
    const b = reussi(await actions.creerEtudiant(saisieEtudiant(m.ifs.id)));
    const c = reussi(await actions.creerEtudiant(saisieEtudiant(m.sf.id)));

    expect([a.matricule, b.matricule, c.matricule]).toEqual(["IF-2026-0001", "IF-2026-0002", "SF-2026-0001"]);
    expect(await compteurs()).toEqual({ "MATRICULE:IF:2026": 2, "MATRICULE:SF:2026": 1 });
  });

  it("rattache l'étudiant à l'année courante, au créateur, avec la recherche sans accent", async () => {
    const { id } = reussi(await actions.creerEtudiant(saisieEtudiant(m.ifs.id, { nom: "Rakotomalala", prenoms: "Éloïse" })));

    const e = await db.etudiant.findUniqueOrThrow({ where: { id }, include: { inscriptions: true } });
    expect(e).toMatchObject({
      matricule: "IF-2026-0001",
      nom: "RAKOTOMALALA",
      statut: "ACTIF",
      filiereId: m.ifs.id,
      anneeEntreeId: m.annee.id,
      creeParId: m.user.id,
      recherche: "rakotomalala eloise if-2026-0001",
    });
    expect(e.inscriptions).toHaveLength(1);
    expect(e.inscriptions[0]).toMatchObject({ anneeScolaireId: m.annee.id, niveau: 1, redoublement: false, statut: "EN_COURS" });
    expect(revaliderPagesEcolage).toHaveBeenCalledTimes(1);
  });

  it("5 créations concurrentes : matricules distincts de 0001 à 0005, sans trou", async () => {
    const etats = await Promise.all(
      Array.from({ length: 5 }, () => actions.creerEtudiant(saisieEtudiant(m.ifs.id))),
    );

    const matricules = etats.map((r) => reussi(r).matricule).sort();
    expect(matricules).toEqual(["IF-2026-0001", "IF-2026-0002", "IF-2026-0003", "IF-2026-0004", "IF-2026-0005"]);
    expect(await db.etudiant.count()).toBe(5);
    expect(await compteurs()).toEqual({ "MATRICULE:IF:2026": 5 });
  });

  it("créations concurrentes sur deux filières : une séquence par filière", async () => {
    const etats = await Promise.all(
      [m.ifs, m.sf, m.ifs, m.sf, m.ifs, m.sf].map((f, i) =>
        actions.creerEtudiant(saisieEtudiant(f.id, { dateNaissance: `2005-03-${10 + i}` })),
      ),
    );

    const matricules = etats.map((r) => reussi(r).matricule).sort();
    expect(matricules).toEqual([
      "IF-2026-0001",
      "IF-2026-0002",
      "IF-2026-0003",
      "SF-2026-0001",
      "SF-2026-0002",
      "SF-2026-0003",
    ]);
  });

  it("le matricule ne change pas quand l'étudiant est modifié", async () => {
    const { id } = reussi(await actions.creerEtudiant(saisieEtudiant(m.ifs.id)));
    expect((await actions.modifierEtudiant({ id, ...saisieEtudiant(m.sf.id, { nom: "Autre" }) })).statut).toBe("succes");
    expect((await db.etudiant.findUniqueOrThrow({ where: { id } })).matricule).toBe("IF-2026-0001");
  });
});

describe("creerEtudiant : échéances", () => {
  it("copie les montants du tarif : une échéance de droits (octobre, 1er mois) et 10 mensualités d'octobre à juillet", async () => {
    const { id } = reussi(await actions.creerEtudiant(saisieEtudiant(m.ifs.id)));

    const echeances = await echeancesDe(id);
    expect(echeances).toHaveLength(11);
    expect(echeances[0]).toMatchObject({ type: "DROITS", montantDu: 100_000, fraisId: null, nonDueSortie: false });
    expect(echeances[0].mois.toISOString().slice(0, 10)).toBe("2026-10-01");
    const mensualites = echeances.filter((e) => e.type === "MENSUALITE");
    expect(mensualites.every((e) => e.montantDu === 80_000)).toBe(true);
    expect(mensualites.map((e) => e.mois.toISOString().slice(0, 7))).toEqual([
      "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05", "2027-06", "2027-07",
    ]);
  });

  it("un changement de tarif ne réécrit pas les échéances existantes, seulement les suivantes", async () => {
    const { id } = reussi(await actions.creerEtudiant(saisieEtudiant(m.ifs.id)));
    const avant = await echeancesDe(id);

    await db.tarif.update({ where: { id: m.tarifIF.id }, data: { montantMensuel: 95_000, droitsInscription: 150_000 } });

    expect(await echeancesDe(id)).toEqual(avant);
    const suivant = reussi(await actions.creerEtudiant(saisieEtudiant(m.ifs.id)));
    const nouvelles = await echeancesDe(suivant.id);
    expect(nouvelles[0].montantDu).toBe(150_000);
    expect(nouvelles[1].montantDu).toBe(95_000);
  });

  it("une seule échéance de droits, quel que soit le tarif, et aucune trace de tranches", async () => {
    const { id } = reussi(await actions.creerEtudiant(saisieEtudiant(m.ifs.id)));

    const echeances = await echeancesDe(id);
    expect(echeances).toHaveLength(11);
    expect(echeances.filter((e) => e.type === "DROITS")).toHaveLength(1);
    expect(echeances.filter((e) => e.type === "MENSUALITE")).toHaveLength(10);
    expect(echeances.filter((e) => e.type === "FRAIS")).toHaveLength(0);
    expect(await db.inscription.findFirstOrThrow({ where: { etudiantId: id } })).not.toHaveProperty("droitsEnTranches");
  });

  it("un ancien client qui envoie encore droitsEnTranches : le champ est ignoré, une seule échéance de droits", async () => {
    const { id } = reussi(await actions.creerEtudiant({ ...saisieEtudiant(m.ifs.id), droitsEnTranches: 3 } as never));
    expect((await echeancesDe(id)).filter((e) => e.type === "DROITS").map((e) => e.montantDu)).toEqual([100_000]);
  });
});

describe("creerEtudiant : refus sans numéro consommé", () => {
  it("tarif manquant : refusé, ni étudiant ni numéro pris, et le suivant reçoit 0001", async () => {
    const refus = await actions.creerEtudiant(saisieEtudiant(m.ifs.id, { niveau: 2 }));

    expect(refus).toMatchObject({
      statut: "erreur",
      message: expect.stringMatching(/Tarif manquant pour Infirmier\(e\)s 2e année en 2026-2027/),
    });
    expect(await db.etudiant.count()).toBe(0);
    expect(await db.compteur.count()).toBe(0);
    expect(revaliderPagesEcolage).not.toHaveBeenCalled();

    expect(reussi(await actions.creerEtudiant(saisieEtudiant(m.ifs.id))).matricule).toBe("IF-2026-0001");
  });

  it("un refus après d'autres créations laisse le compteur où il était", async () => {
    reussi(await actions.creerEtudiant(saisieEtudiant(m.ifs.id)));
    reussi(await actions.creerEtudiant(saisieEtudiant(m.ifs.id)));
    expect((await actions.creerEtudiant(saisieEtudiant(m.ifs.id, { niveau: 3 }))).statut).toBe("erreur");

    expect(await compteurs()).toEqual({ "MATRICULE:IF:2026": 2 });
    expect(reussi(await actions.creerEtudiant(saisieEtudiant(m.ifs.id))).matricule).toBe("IF-2026-0003");
  });

  it("pas d'année courante : refusé, sans numéro consommé", async () => {
    await db.anneeScolaire.update({ where: { id: m.annee.id }, data: { estCourante: false } });

    const refus = await actions.creerEtudiant(saisieEtudiant(m.ifs.id));

    expect(refus).toMatchObject({ statut: "erreur", message: expect.stringMatching(/Aucune année scolaire courante/) });
    expect(await db.etudiant.count()).toBe(0);
    expect(await db.compteur.count()).toBe(0);
  });

  it("année courante clôturée : refusé", async () => {
    await db.anneeScolaire.update({ where: { id: m.annee.id }, data: { cloturee: true } });
    expect(await actions.creerEtudiant(saisieEtudiant(m.ifs.id))).toMatchObject({
      statut: "erreur",
      message: expect.stringMatching(/2026-2027 est clôturée/),
    });
    expect(await db.compteur.count()).toBe(0);
  });

  it("filière désactivée, inconnue ou niveau au-delà de la durée : refusé", async () => {
    await db.filiere.update({ where: { id: m.sf.id }, data: { actif: false } });
    expect(await actions.creerEtudiant(saisieEtudiant(m.sf.id))).toMatchObject({ message: expect.stringMatching(/SF est désactivée/) });
    expect(await actions.creerEtudiant(saisieEtudiant("inconnue"))).toMatchObject({ message: expect.stringMatching(/n'existe plus/) });
    expect(await actions.creerEtudiant(saisieEtudiant(m.ifs.id, { niveau: 4 }))).toMatchObject({
      message: expect.stringMatching(/dure 3 ans/),
    });
    expect(await db.compteur.count()).toBe(0);
    expect(await db.etudiant.count()).toBe(0);
  });

  it("droits du tarif invalides : refusé sans numéro consommé ; de petits droits sont acceptés", async () => {
    await db.tarif.update({ where: { id: m.tarifIF.id }, data: { droitsInscription: 0 } });

    expect(await actions.creerEtudiant(saisieEtudiant(m.ifs.id))).toMatchObject({
      statut: "erreur",
      message: expect.stringMatching(/droits d'inscription du tarif sont invalides/),
    });
    expect(await db.compteur.count()).toBe(0);

    await db.tarif.update({ where: { id: m.tarifIF.id }, data: { droitsInscription: 2_000 } });
    expect(reussi(await actions.creerEtudiant(saisieEtudiant(m.ifs.id))).matricule).toBe("IF-2026-0001");
  });

  it("tarif invalide en base (mensualité nulle) : refusé proprement, rien d'écrit", async () => {
    await db.tarif.update({ where: { id: m.tarifIF.id }, data: { montantMensuel: 0 } });

    expect(await actions.creerEtudiant(saisieEtudiant(m.ifs.id))).toMatchObject({
      statut: "erreur",
      message: expect.stringMatching(/mensualité du tarif est invalide/),
    });
    expect(await db.etudiant.count()).toBe(0);
    expect(await db.compteur.count()).toBe(0);
  });

  it("plus de matricule disponible (9999 atteint) : refus affichable, rien d'écrit, compteur inchangé", async () => {
    await db.compteur.create({ data: { cle: "MATRICULE:IF:2026", valeur: 9_999 } });

    const r = await actions.creerEtudiant(saisieEtudiant(m.ifs.id));

    expect(r).toMatchObject({ statut: "erreur", message: expect.stringMatching(/Plus de numéro de matricule disponible/) });
    expect(await db.etudiant.count()).toBe(0);
    expect(await compteurs()).toEqual({ "MATRICULE:IF:2026": 9_999 });
  });

  it("saisie invalide ou date de naissance future : erreurs par champ, rien d'écrit", async () => {
    const invalide = await actions.creerEtudiant(saisieEtudiant(m.ifs.id, { telephone: "123", nom: "" }));
    expect(invalide).toMatchObject({ statut: "erreur", erreurs: { telephone: expect.any(String), nom: expect.any(String) } });

    const futur = await actions.creerEtudiant(saisieEtudiant(m.ifs.id, { dateNaissance: "2030-01-01" }));
    expect(futur).toMatchObject({ statut: "erreur", erreurs: { dateNaissance: expect.stringMatching(/passée/) } });

    expect(await db.etudiant.count()).toBe(0);
    expect(await db.compteur.count()).toBe(0);
  });

  it("sans session : redirigé vers la connexion, rien d'écrit", async () => {
    getSession.mockResolvedValue(null);
    await expect(actions.creerEtudiant(saisieEtudiant(m.ifs.id))).rejects.toThrow(/NEXT_REDIRECT/);
    expect(await db.etudiant.count()).toBe(0);
  });
});

describe("creerEtudiant : doublon", () => {
  const identite = { nom: "Rakotomalala", prenoms: "Éloïse", dateNaissance: "2005-03-14" };

  it("DOUBLON_POSSIBLE sans numéro consommé, puis création acceptée avec confirmerDoublon", async () => {
    const premier = reussi(await actions.creerEtudiant(saisieEtudiant(m.ifs.id, identite)));

    const refus = await actions.creerEtudiant(saisieEtudiant(m.ifs.id, identite));
    expect(refus).toMatchObject({
      statut: "erreur",
      code: "DOUBLON_POSSIBLE",
      message: expect.stringContaining(premier.matricule),
    });
    expect(await db.etudiant.count()).toBe(1);
    expect(await compteurs()).toEqual({ "MATRICULE:IF:2026": 1 });

    const confirme = await actions.creerEtudiant(saisieEtudiant(m.ifs.id, { ...identite, confirmerDoublon: true }));
    expect(reussi(confirme).matricule).toBe("IF-2026-0002");
    expect(await db.etudiant.count()).toBe(2);
  });

  it("le doublon ignore la casse et les accents, et vaut aussi d'une filière à l'autre", async () => {
    reussi(await actions.creerEtudiant(saisieEtudiant(m.ifs.id, identite)));

    const refus = await actions.creerEtudiant(
      saisieEtudiant(m.sf.id, { nom: "RAKOTOMALALA", prenoms: "eloise", dateNaissance: "2005-03-14" }),
    );
    expect(refus).toMatchObject({ statut: "erreur", code: "DOUBLON_POSSIBLE" });
  });

  it("même nom mais autre date de naissance ou autres prénoms : pas un doublon", async () => {
    reussi(await actions.creerEtudiant(saisieEtudiant(m.ifs.id, identite)));

    reussi(await actions.creerEtudiant(saisieEtudiant(m.ifs.id, { ...identite, dateNaissance: "2005-03-15" })));
    reussi(await actions.creerEtudiant(saisieEtudiant(m.ifs.id, { ...identite, prenoms: "Hanta" })));
    expect(await db.etudiant.count()).toBe(3);
  });

  it("deux saisies simultanées de la même personne : une seule est créée", async () => {
    const [a, b] = await Promise.all([
      actions.creerEtudiant(saisieEtudiant(m.ifs.id, identite)),
      actions.creerEtudiant(saisieEtudiant(m.ifs.id, identite)),
    ]);

    const statuts = [a.statut, b.statut].sort();
    expect(statuts).toEqual(["erreur", "succes"]);
    expect([a, b].find((r) => r.statut === "erreur")).toMatchObject({ code: "DOUBLON_POSSIBLE" });
    expect(await db.etudiant.count()).toBe(1);
    expect(await compteurs()).toEqual({ "MATRICULE:IF:2026": 1 });
  });
});

describe("tuteur", () => {
  it("enregistré à la création, affiché sur la fiche, retiré à la modification", async () => {
    const { id } = reussi(
      await actions.creerEtudiant(
        saisieEtudiant(m.ifs.id, { tuteurNom: "RAKOTO Jean", tuteurTelephone: "033 12 345 67", tuteurProfession: "Commerçant" }),
      ),
    );

    expect(await db.etudiant.findUniqueOrThrow({ where: { id } })).toMatchObject({
      tuteurNom: "RAKOTO Jean",
      tuteurTelephone: "0331234567",
      tuteurProfession: "Commerçant",
    });
    expect((await lireFicheEtudiant(id, "2026-11-15"))?.tuteur).toEqual({
      nom: "RAKOTO Jean",
      telephone: "0331234567",
      telephoneAffiche: "033 12 345 67",
      profession: "Commerçant",
    });

    reussi(await actions.modifierEtudiant({ id, ...saisieEtudiant(m.ifs.id, { tuteurNom: "", tuteurTelephone: "", tuteurProfession: "" }) }));
    expect(await db.etudiant.findUniqueOrThrow({ where: { id } })).toMatchObject({
      tuteurNom: null,
      tuteurTelephone: null,
      tuteurProfession: null,
    });
    expect((await lireFicheEtudiant(id, "2026-11-15"))?.tuteur).toBeNull();
  });

  it("téléphone du tuteur sans son nom : refusé sur le champ du nom, rien d’écrit", async () => {
    const r = await actions.creerEtudiant(saisieEtudiant(m.ifs.id, { tuteurTelephone: "033 12 345 67" }));

    expect(r).toMatchObject({ statut: "erreur", erreurs: { tuteurNom: expect.any(String) } });
    expect(await db.etudiant.count()).toBe(0);
  });
});

describe("modifierEtudiant", () => {
  it("modifie l'identité sans toucher au matricule, à la filière ni à l'année d'entrée", async () => {
    const { id } = reussi(await actions.creerEtudiant(saisieEtudiant(m.ifs.id)));
    const echeancesAvant = await echeancesDe(id);
    const autreAnnee = await fabriquerAnnee({ anneeDebut: 2030 });

    const entree = {
      ...saisieEtudiant(m.sf.id, { nom: "andriamasy", telephone: "+261 32 00 000 00", email: "Eloise@Mail.MG" }),
      id,
      matricule: "ZZ-1999-9999",
      filiereId: m.sf.id,
      anneeEntreeId: autreAnnee.id,
      statut: "EXCLU",
    };
    const r = await actions.modifierEtudiant(entree);

    expect(r.statut).toBe("succes");
    const e = await db.etudiant.findUniqueOrThrow({ where: { id } });
    expect(e).toMatchObject({
      matricule: "IF-2026-0001",
      filiereId: m.ifs.id,
      anneeEntreeId: m.annee.id,
      statut: "ACTIF",
      nom: "ANDRIAMASY",
      telephone: "0320000000",
      email: "eloise@mail.mg",
    });
    expect(await echeancesDe(id)).toEqual(echeancesAvant);
    expect(revaliderPagesEcolage).toHaveBeenCalledTimes(2);
  });

  it("recalcule la recherche : le nouveau nom est trouvé sans accent, l'ancien ne l'est plus", async () => {
    const { id } = reussi(await actions.creerEtudiant(saisieEtudiant(m.ifs.id, { nom: "Rakoto", prenoms: "Hanta" })));

    reussi(await actions.modifierEtudiant({ id, ...saisieEtudiant(m.ifs.id, { nom: "Andriamasy", prenoms: "Éloïse" }) }));

    expect((await db.etudiant.findUniqueOrThrow({ where: { id } })).recherche).toBe("andriamasy eloise if-2026-0001");
    const nouveau = await lireEtudiants({ q: "eloise andria" }, "2026-11-15");
    expect(nouveau.lignes.map((l) => l.id)).toEqual([id]);
    expect((await lireEtudiants({ q: "rakoto" }, "2026-11-15")).lignes).toEqual([]);
    expect((await lireEtudiants({ q: "IF-2026-0001" }, "2026-11-15")).lignes).toHaveLength(1);
  });

  it("étudiant inconnu : INTROUVABLE ; date de naissance future ou saisie invalide : refusé", async () => {
    expect(await actions.modifierEtudiant({ id: "inconnu", ...saisieEtudiant(m.ifs.id) })).toMatchObject({
      statut: "erreur",
      code: "INTROUVABLE",
    });
    const { id } = reussi(await actions.creerEtudiant(saisieEtudiant(m.ifs.id)));
    expect(await actions.modifierEtudiant({ id, ...saisieEtudiant(m.ifs.id, { dateNaissance: "2031-01-01" }) })).toMatchObject({
      erreurs: { dateNaissance: expect.any(String) },
    });
    expect(await actions.modifierEtudiant({ id, ...saisieEtudiant(m.ifs.id, { adresse: "" }) })).toMatchObject({
      erreurs: { adresse: expect.any(String) },
    });
  });

  it("sans session : redirigé, rien de modifié", async () => {
    const { id } = reussi(await actions.creerEtudiant(saisieEtudiant(m.ifs.id, { nom: "Rakoto" })));
    getSession.mockResolvedValue(null);
    await expect(actions.modifierEtudiant({ id, ...saisieEtudiant(m.ifs.id, { nom: "Autre" }) })).rejects.toThrow(/NEXT_REDIRECT/);
    expect((await db.etudiant.findUniqueOrThrow({ where: { id } })).nom).toBe("RAKOTO");
  });
});

describe("creerEtudiant : frais copiés automatiquement", () => {
  const classeIF1 = () => [{ filiereId: m.ifs.id, niveau: 1 }];
  const mars = new Date(Date.UTC(2027, 2, 1));

  it("l'étudiant inscrit après la création d'un frais pour sa classe reçoit son échéance FRAIS, au montant et au mois du frais", async () => {
    const { frais } = await fabriquerFrais(m.annee.id, { classes: classeIF1(), montant: 15_000, mois: mars });

    const { id } = reussi(await actions.creerEtudiant(saisieEtudiant(m.ifs.id)));

    const echeances = await echeancesDe(id);
    expect(echeances).toHaveLength(12);
    expect(echeances.filter((e) => e.type === "FRAIS")).toMatchObject([{ fraisId: frais.id, montantDu: 15_000, nonDueSortie: false }]);
    expect(echeances.find((e) => e.type === "FRAIS")!.mois.toISOString().slice(0, 10)).toBe("2027-03-01");
  });

  it("rien hors des classes visées : autre filière, autre niveau, autre année", async () => {
    const autreAnnee = await fabriquerAnnee({ anneeDebut: 2031 });
    await fabriquerFrais(m.annee.id, { classes: [{ filiereId: m.sf.id, niveau: 1 }] });
    await fabriquerFrais(m.annee.id, { classes: [{ filiereId: m.ifs.id, niveau: 2 }] });
    await fabriquerFrais(autreAnnee.id, { classes: classeIF1(), mois: new Date(Date.UTC(2031, 11, 1)) });

    const { id } = reussi(await actions.creerEtudiant(saisieEtudiant(m.ifs.id)));

    expect((await echeancesDe(id)).filter((e) => e.type === "FRAIS")).toEqual([]);
  });

  it("deux frais pour la même classe : deux échéances, chacune liée à son frais", async () => {
    const a = await fabriquerFrais(m.annee.id, { classes: classeIF1(), libelle: "Stage", mois: new Date(Date.UTC(2027, 4, 1)) });
    const b = await fabriquerFrais(m.annee.id, { classes: classeIF1(), libelle: "Examen", mois: mars });

    const { id } = reussi(await actions.creerEtudiant(saisieEtudiant(m.ifs.id)));

    const frais = (await echeancesDe(id)).filter((e) => e.type === "FRAIS");
    expect(frais.map((e) => e.fraisId).sort()).toEqual([a.frais.id, b.frais.id].sort());
  });

  it("le frais compte dans le reste dû de la fiche et dans le guichet de l'étudiant créé", async () => {
    await fabriquerFrais(m.annee.id, { classes: classeIF1(), libelle: "Frais d'examen", montant: 15_000, mois: mars });

    const { id } = reussi(await actions.creerEtudiant(saisieEtudiant(m.ifs.id)));

    const fiche = (await lireFicheEtudiant(id, "2027-03-10"))!;
    expect(fiche.situation.reste).toBe(915_000);
    expect(fiche.parcours[0].echeances.find((e) => e.type === "FRAIS")).toMatchObject({ libelle: "Frais d'examen", montantDu: 15_000, statut: "a_venir" });
  });

  it("création d'étudiants et création du frais simultanées : chaque étudiant de la classe a exactement un frais, aucun doublon", async () => {
    const admin = m.admin;
    const creations = Array.from({ length: 4 }, () => actions.creerEtudiant(saisieEtudiant(m.ifs.id)));
    connecter(getSession, admin);
    const frais = fraisActions.creerFrais({ libelle: "Frais d'examen", montant: 15_000, mois: "2027-03", anneeScolaireId: m.annee.id, classes: classeIF1() });

    const etats = await Promise.all([...creations, frais]);

    expect(etats.every((e) => e.statut === "succes")).toBe(true);
    const etudiants = await db.etudiant.findMany({ select: { id: true } });
    expect(etudiants).toHaveLength(4);
    for (const e of etudiants) {
      expect((await echeancesDe(e.id)).filter((x) => x.type === "FRAIS"), e.id).toHaveLength(1);
    }
  });
});
