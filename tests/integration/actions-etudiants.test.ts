import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fabriquerAnnee, fabriquerPaiement } from "../factories";
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

const { db } = await import("@/lib/db");
const actions = await import("@/server/actions/etudiants");
const paiements = await import("@/server/actions/paiements");
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

const echeancesDe = (etudiantId: string) =>
  db.echeance.findMany({ where: { inscription: { etudiantId } }, orderBy: { ordre: "asc" } });

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
  it("copie les montants du tarif : droits puis 10 mensualités d'octobre à juillet", async () => {
    const { id } = reussi(await actions.creerEtudiant(saisieEtudiant(m.ifs.id)));

    const echeances = await echeancesDe(id);
    expect(echeances).toHaveLength(11);
    expect(echeances[0]).toMatchObject({ type: "DROITS", tranche: 1, montantDu: 100_000, ordre: 1 });
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

  it.each([
    [1 as const, 11, [100_000]],
    [2 as const, 12, [50_000, 50_000]],
    [3 as const, 13, [34_000, 33_000, 33_000]],
  ])("droits en %i tranche(s) : %i échéances, tranches %j", async (tranches, total, montants) => {
    const { id } = reussi(await actions.creerEtudiant(saisieEtudiant(m.ifs.id, { droitsEnTranches: tranches as 1 | 2 | 3 })));

    const echeances = await echeancesDe(id);
    expect(echeances).toHaveLength(total);
    expect(echeances.map((e) => e.ordre)).toEqual(Array.from({ length: total }, (_, i) => i + 1));
    const droits = echeances.filter((e) => e.type === "DROITS");
    expect(droits.map((e) => e.montantDu)).toEqual(montants);
    expect(droits.map((e) => e.mois.toISOString().slice(0, 7))).toEqual(["2026-10", "2026-11", "2026-12"].slice(0, tranches));
    expect(echeances.filter((e) => e.type === "MENSUALITE")).toHaveLength(10);
    expect((await db.inscription.findFirstOrThrow({ where: { etudiantId: id } })).droitsEnTranches).toBe(tranches);
  });

  it("pour chaque mois, la tranche de droits précède la mensualité", async () => {
    const { id } = reussi(await actions.creerEtudiant(saisieEtudiant(m.ifs.id, { droitsEnTranches: 3 })));
    const types = (await echeancesDe(id)).slice(0, 7).map((e) => `${e.type[0]}${e.mois.toISOString().slice(5, 7)}`);
    expect(types).toEqual(["D10", "M10", "D11", "M11", "D12", "M12", "M01"]);
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

  it("droits trop faibles pour 3 tranches : refusé ; en une fois, accepté", async () => {
    await db.tarif.update({ where: { id: m.tarifIF.id }, data: { droitsInscription: 2_000 } });

    expect(await actions.creerEtudiant(saisieEtudiant(m.ifs.id, { droitsEnTranches: 3 }))).toMatchObject({
      statut: "erreur",
      message: expect.stringMatching(/trop faibles/),
    });
    expect(await db.compteur.count()).toBe(0);
    expect(reussi(await actions.creerEtudiant(saisieEtudiant(m.ifs.id, { droitsEnTranches: 1 }))).matricule).toBe("IF-2026-0001");
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

describe("modifierTranchesDroits", () => {
  async function etudiantCree(tranches: 1 | 2 | 3 = 1) {
    const { id } = reussi(await actions.creerEtudiant(saisieEtudiant(m.ifs.id, { droitsEnTranches: tranches })));
    const inscription = await db.inscription.findFirstOrThrow({ where: { etudiantId: id } });
    return { id, inscriptionId: inscription.id };
  }

  it("1 → 3 tranches : même total dû, mêmes mensualités (ids), ordres contigus 1 à 13", async () => {
    const { id, inscriptionId } = await etudiantCree(1);
    const avant = await echeancesDe(id);
    const idsMensualites = avant.filter((e) => e.type === "MENSUALITE").map((e) => e.id);
    const total = avant.reduce((s, e) => s + e.montantDu, 0);

    const r = await actions.modifierTranchesDroits({ inscriptionId, droitsEnTranches: 3 });

    expect(r.statut).toBe("succes");
    const apres = await echeancesDe(id);
    expect(apres).toHaveLength(13);
    expect(apres.map((e) => e.ordre)).toEqual(Array.from({ length: 13 }, (_, i) => i + 1));
    expect(apres.reduce((s, e) => s + e.montantDu, 0)).toBe(total);
    expect(apres.filter((e) => e.type === "MENSUALITE").map((e) => e.id)).toEqual(idsMensualites);
    expect(apres.filter((e) => e.type === "DROITS").map((e) => [e.tranche, e.montantDu])).toEqual([
      [1, 34_000],
      [2, 33_000],
      [3, 33_000],
    ]);
    expect(apres.slice(0, 6).map((e) => `${e.type[0]}${e.mois.toISOString().slice(5, 7)}`)).toEqual(["D10", "M10", "D11", "M11", "D12", "M12"]);
    expect((await db.inscription.findUniqueOrThrow({ where: { id: inscriptionId } })).droitsEnTranches).toBe(3);
  });

  it("3 → 1 puis 1 → 2 : le total dû reste celui du tarif d'origine, même si le tarif a changé depuis", async () => {
    const { id, inscriptionId } = await etudiantCree(3);
    await db.tarif.update({ where: { id: m.tarifIF.id }, data: { droitsInscription: 300_000, montantMensuel: 1 } });

    expect((await actions.modifierTranchesDroits({ inscriptionId, droitsEnTranches: 1 })).statut).toBe("succes");
    let echeances = await echeancesDe(id);
    expect(echeances).toHaveLength(11);
    expect(echeances.find((e) => e.type === "DROITS")?.montantDu).toBe(100_000);

    expect((await actions.modifierTranchesDroits({ inscriptionId, droitsEnTranches: 2 })).statut).toBe("succes");
    echeances = await echeancesDe(id);
    expect(echeances.filter((e) => e.type === "DROITS").map((e) => e.montantDu)).toEqual([50_000, 50_000]);
    expect(echeances.reduce((s, e) => s + e.montantDu, 0)).toBe(900_000);
  });

  it("garde les paiements déjà faits sur les mensualités", async () => {
    const { id, inscriptionId } = await etudiantCree(1);
    const mensualite = (await echeancesDe(id)).filter((e) => e.type === "MENSUALITE")[1];
    const p = await fabriquerPaiement(id, m.user.id, [{ echeanceId: mensualite.id, montant: 30_000, resteEcheanceApres: 50_000 }]);

    expect((await actions.modifierTranchesDroits({ inscriptionId, droitsEnTranches: 2 })).statut).toBe("succes");

    const ligne = await db.paiementLigne.findFirstOrThrow({ where: { paiementId: p.id }, include: { echeance: true } });
    expect(ligne.echeanceId).toBe(mensualite.id);
    expect(ligne.echeance.ordre).toBe(4);
  });

  it("refusé après un paiement sur les droits, et rien n'est modifié", async () => {
    const { id, inscriptionId } = await etudiantCree(1);
    const avant = await echeancesDe(id);
    const sit = await paiements.chargerSituationGuichet(id);
    reussi(
      await paiements.encaisser({
        etudiantId: id, montant: 40_000, mode: "ESPECES", idClient: randomUUID(), resteDuAffiche: sit!.resteDuTotal,
      }),
    );

    const r = await actions.modifierTranchesDroits({ inscriptionId, droitsEnTranches: 3 });

    expect(r).toMatchObject({ statut: "erreur", message: expect.stringMatching(/ne peut plus être redécoupé/) });
    expect(await echeancesDe(id)).toEqual(avant);
    expect((await db.inscription.findUniqueOrThrow({ where: { id: inscriptionId } })).droitsEnTranches).toBe(1);
  });

  it("refusé même quand le paiement sur les droits a été annulé", async () => {
    const { id, inscriptionId } = await etudiantCree(1);
    const droits = (await echeancesDe(id)).find((e) => e.type === "DROITS")!;
    await fabriquerPaiement(
      id,
      m.user.id,
      [{ echeanceId: droits.id, montant: 100_000 }],
      { annule: true, annuleParId: m.admin.id, dateAnnulation: new Date(), motifAnnulation: "erreur de saisie" },
    );

    expect(await actions.modifierTranchesDroits({ inscriptionId, droitsEnTranches: 2 })).toMatchObject({
      statut: "erreur",
      message: expect.stringMatching(/même annulés/),
    });
    expect(await db.echeance.count({ where: { inscriptionId, type: "DROITS" } })).toBe(1);
  });

  it("refusé après un paiement annulé via les actions (encaisser puis annulerPaiement)", async () => {
    const { id, inscriptionId } = await etudiantCree(1);
    const sit = await paiements.chargerSituationGuichet(id);
    const recu = reussi(
      await paiements.encaisser({
        etudiantId: id, montant: 100_000, mode: "ESPECES", idClient: randomUUID(), resteDuAffiche: sit!.resteDuTotal,
      }),
    );
    connecter(getSession, m.admin);
    reussi(await paiements.annulerPaiement({ paiementId: recu.paiementId!, motif: "saisi par erreur" }));

    expect((await actions.modifierTranchesDroits({ inscriptionId, droitsEnTranches: 3 })).statut).toBe("erreur");
    const fiche = await lireFicheEtudiant(id, "2026-11-15");
    expect(fiche?.parcours[0]).toMatchObject({ tranchesModifiables: false, droitsEnTranches: 1 });
  });

  it("même nombre de tranches, inscription inconnue, année clôturée, droits trop faibles : refusés", async () => {
    const { id, inscriptionId } = await etudiantCree(1);

    expect(await actions.modifierTranchesDroits({ inscriptionId, droitsEnTranches: 1 })).toMatchObject({
      statut: "erreur",
      message: expect.stringMatching(/déjà payables en une fois/),
    });
    expect(await actions.modifierTranchesDroits({ inscriptionId: "inconnue", droitsEnTranches: 2 })).toMatchObject({
      code: "INTROUVABLE",
    });
    expect(await actions.modifierTranchesDroits({ inscriptionId, droitsEnTranches: 4 as never })).toMatchObject({
      statut: "erreur",
    });

    await db.anneeScolaire.update({ where: { id: m.annee.id }, data: { cloturee: true } });
    expect(await actions.modifierTranchesDroits({ inscriptionId, droitsEnTranches: 2 })).toMatchObject({
      message: expect.stringMatching(/2026-2027 est clôturée/),
    });
    expect(await echeancesDe(id)).toHaveLength(11);
  });

  it("droits trop faibles pour 3 tranches : refusé sans rien modifier", async () => {
    const annee = await fabriquerAnnee({ anneeDebut: 2027 });
    const { etudiant, inscription } = await fabriquerEtudiantInscrit(
      m.ifs.id, annee, { niveau: 1, droitsInscription: 2_000, montantMensuel: 80_000, nombreMois: 10 },
    );
    const avant = await echeancesDe(etudiant.id);

    const r = await actions.modifierTranchesDroits({ inscriptionId: inscription.id, droitsEnTranches: 3 });

    expect(r).toMatchObject({ statut: "erreur", message: expect.stringMatching(/trop faibles/) });
    expect(await echeancesDe(etudiant.id)).toEqual(avant);
  });

  it("sans session : redirigé", async () => {
    const { inscriptionId } = await etudiantCree(1);
    getSession.mockResolvedValue(null);
    await expect(actions.modifierTranchesDroits({ inscriptionId, droitsEnTranches: 2 })).rejects.toThrow(/NEXT_REDIRECT/);
  });
});
