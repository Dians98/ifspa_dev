import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { echecCode } from "@/lib/etat-action";
import { cleCompteurMatricule, cleCompteurRecu } from "@/lib/matricule";
import { fabriquerAnnee, fabriquerPaiement, fabriquerTarif } from "../factories";
import { connecter, fabriquerEtudiantInscrit, fabriquerMonde, MAINTENANT, reussi, type Monde } from "../factories/scenarios";
import { depotCsv, depotXlsx, formulaire, type Depot } from "../factories/reprise";

const { getSession, revaliderPagesEcolage } = vi.hoisted(() => ({ getSession: vi.fn(), revaliderPagesEcolage: vi.fn() }));

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/ecolage-revalidation", () => ({ revaliderPagesEcolage }));
// Appelle le vrai enregistrement, sauf quand un test lui fait refuser un paiement en cours d'import.
vi.mock("@/server/paiements", async (importOriginal) => {
  const o = await importOriginal<typeof import("@/server/paiements")>();
  return { ...o, enregistrerPaiement: vi.fn(o.enregistrerPaiement) };
});

const { db } = await import("@/lib/db");
const actions = await import("@/server/actions/import");
const { enregistrerPaiement } = await import("@/server/paiements");

const enregistrer = vi.mocked(enregistrerPaiement);
const enregistrerReel = enregistrer.getMockImplementation()!;

const REFUS_ADMIN = { statut: "erreur", message: "Cette action est réservée à l'administrateur." };
const RIEN_A_IMPORTER = "Rien à importer : les étudiants et les paiements du fichier sont déjà en base. Rien n'a été modifié.";
const PLAN_CHANGE = /Le fichier ou la base ont changé depuis le rapport\. Rien n'a été importé/;

type LigneE = Parameters<typeof depotCsv>[0][number];
type LigneP = NonNullable<Parameters<typeof depotCsv>[1]>[number];

let m: Monde;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(MAINTENANT) });
  revaliderPagesEcolage.mockClear();
  getSession.mockReset();
  enregistrer.mockImplementation(enregistrerReel);
  m = await fabriquerMonde();
  connecter(getSession, m.admin);
});

afterEach(() => vi.useRealTimers());

/** Étudiant n° `n` d'identité propre (même date de naissance par défaut : le 10/05/2004). */
const etu = (n: number, surcharge: LigneE = {}): LigneE => ({ numero: String(n), nom: `NOM${n}`, prenoms: `Prenom${n}`, ...surcharge });
const pai = (n: number, date: string, montant: number, surcharge: LigneP = {}): LigneP => ({ numeroEtudiant: String(n), date, montant: String(montant), ...surcharge });

const analyser = async (depot: Depot) => reussi(await actions.analyserReprise(formulaire(depot)));

async function importer(depot: Depot, signature?: string) {
  const sig = signature ?? (await analyser(depot)).signature;
  return actions.importerReprise(formulaire(depot, sig));
}

/** Tout ce que l'import peut écrire, pour prouver qu'une action n'a rien changé. */
async function photo() {
  return {
    etudiants: await db.etudiant.findMany({ orderBy: { id: "asc" } }),
    inscriptions: await db.inscription.findMany({ orderBy: { id: "asc" } }),
    echeances: await db.echeance.findMany({ orderBy: { id: "asc" } }),
    paiements: await db.paiement.findMany({ orderBy: { id: "asc" } }),
    lignes: await db.paiementLigne.findMany({ orderBy: { id: "asc" } }),
    compteurs: await db.compteur.findMany({ orderBy: { cle: "asc" } }),
  };
}

async function annee2025AvecTarifNiveau2() {
  const a = await fabriquerAnnee({ anneeDebut: 2025, cloturee: true });
  await fabriquerTarif(m.ifs.id, m.annee.id, { niveau: 2 });
  return a;
}

describe("accès : administrateur seulement", () => {
  it("le rôle user est refusé par les deux actions avant toute lecture du fichier, rien n'est écrit", async () => {
    connecter(getSession, m.user);
    const avant = await photo();
    const depot = depotCsv([etu(1)]);
    const signature = "a".repeat(64);

    expect(await actions.analyserReprise(new FormData())).toEqual(REFUS_ADMIN);
    expect(await actions.analyserReprise(formulaire(depot))).toEqual(REFUS_ADMIN);
    expect(await actions.importerReprise(new FormData())).toEqual(REFUS_ADMIN);
    expect(await actions.importerReprise(formulaire(depot, signature))).toEqual(REFUS_ADMIN);
    expect(await photo()).toEqual(avant);
    expect(revaliderPagesEcolage).not.toHaveBeenCalled();
  });

  it("un user ne peut pas importer avec la signature qu'un admin a obtenue", async () => {
    const depot = depotCsv([etu(1)]);
    const { signature } = await analyser(depot);
    connecter(getSession, m.user);

    expect(await actions.importerReprise(formulaire(depot, signature))).toEqual(REFUS_ADMIN);
    expect(await db.etudiant.count()).toBe(0);
  });

  it("sans session : redirection vers la connexion", async () => {
    getSession.mockResolvedValue(null);

    await expect(actions.analyserReprise(formulaire(depotCsv([etu(1)])))).rejects.toThrow(/NEXT_REDIRECT/);
    await expect(actions.importerReprise(formulaire(depotCsv([etu(1)]), "a".repeat(64)))).rejects.toThrow(/NEXT_REDIRECT/);
  });
});

describe("analyserReprise", () => {
  it("renvoie le rapport allégé et une signature, sans rien écrire (aucune ligne, compteurs compris)", async () => {
    await db.compteur.create({ data: { cle: cleCompteurMatricule("IF", 2026), valeur: 5 } });
    await db.compteur.create({ data: { cle: cleCompteurRecu(2026), valeur: 9 } });
    await fabriquerEtudiantInscrit(m.ifs.id, m.annee, { niveau: 1, droitsInscription: 100_000, montantMensuel: 80_000, nombreMois: 10 });
    const avant = await photo();

    const etat = await actions.analyserReprise(
      formulaire(depotCsv([etu(1), etu(2)], [pai(1, "05/10/2026", 50_000), pai(2, "06/10/2026", 30_000)])),
    );

    const { rapport, signature } = reussi(etat);
    expect(etat.statut === "succes" && etat.message).toBe("Prêt à importer 2 nouveaux étudiants et 2 paiements.");
    expect(rapport.bloquant).toBe(false);
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
    expect(await photo()).toEqual(avant);
    expect(revaliderPagesEcolage).not.toHaveBeenCalled();
  });

  it("rapport allégé : récapitulatif par étudiant avec le reste dû après le dernier paiement, sans les lignes de paiements", async () => {
    const { rapport } = await analyser(
      depotCsv([etu(1), etu(2)], [pai(1, "05/10/2026", 50_000), pai(1, "20/10/2026", 100_000), pai(2, "06/10/2026", 30_000)]),
    );

    expect(rapport).not.toHaveProperty("paiements");
    expect(rapport).not.toHaveProperty("canonique");
    expect(rapport.etudiants).toMatchObject([
      { ligne: 2, numero: "1", statut: "nouveau", nom: "NOM1", prenoms: "Prenom1", filiere: "IF", niveau: 1, matricule: null, duAnnee: 900_000 },
      { ligne: 3, numero: "2", statut: "nouveau", nom: "NOM2" },
    ]);
    expect(rapport.recapPaiements).toEqual([
      { ligneEtudiant: 2, numero: "1", aImporter: 2, montantAImporter: 150_000, dejaImportes: 0, refuses: 0, resteApres: 750_000 },
      { ligneEtudiant: 3, numero: "2", aImporter: 1, montantAImporter: 30_000, dejaImportes: 0, refuses: 0, resteApres: 870_000 },
    ]);
    expect(rapport.paiementsRefuses).toEqual([]);
    expect(rapport.totaux.paiements).toMatchObject({ lus: 3, aImporter: 3, montantAImporter: 180_000 });
  });

  it("fichier bloquant : message d'erreurs, signature null, paiements refusés détaillés", async () => {
    const etat = await actions.analyserReprise(
      formulaire(depotCsv([etu(1), etu(2, { filiere: "ZZ" })], [pai(1, "05/10/2026", 5_000_000), pai(2, "06/10/2026", 10_000)])),
    );

    const { rapport, signature } = reussi(etat);
    expect(signature).toBeNull();
    expect(rapport.bloquant).toBe(true);
    expect(etat.statut === "succes" && etat.message).toBe("3 erreurs : rien ne peut être importé. Corrigez le fichier, puis déposez-le à nouveau.");
    expect(rapport.paiementsRefuses).toEqual([
      { ligne: 2, numeroEtudiant: "1", jour: "2026-10-05", montant: 5_000_000 },
      { ligne: 3, numeroEtudiant: "2", jour: "2026-10-06", montant: 10_000 },
    ]);
    expect(rapport.etudiants.map((e) => e.statut)).toEqual(["nouveau", "refuse"]);
  });

  it("sans année courante : rapport bloquant, signature null", async () => {
    await db.anneeScolaire.updateMany({ data: { estCourante: false } });

    const { rapport, signature } = await analyser(depotCsv([etu(1)]));

    expect(signature).toBeNull();
    expect(rapport.annee).toBeNull();
    expect(rapport.messages[0].texte).toMatch(/Aucune année scolaire courante/);
  });

  it("dépôt vide, illisible ou trop gros : refus affichable, sans rapport", async () => {
    const vide = await actions.analyserReprise(new FormData());
    const illisible = await actions.analyserReprise(formulaire([{ nom: "reprise.xlsx", contenu: "pas un classeur" }]));
    const gros = await actions.analyserReprise(formulaire([{ nom: "etudiants.csv", contenu: new Uint8Array(1024 * 1024 + 1).fill(0x61) }]));

    expect(vide).toMatchObject({ statut: "erreur", message: expect.stringMatching(/Déposez le fichier \.xlsx/) });
    expect(illisible).toMatchObject({ statut: "erreur", message: expect.stringMatching(/n'est pas un classeur \.xlsx lisible/) });
    expect(gros).toMatchObject({ statut: "erreur", message: expect.stringMatching(/Fichier trop volumineux/) });
  });

  it("avertit avec la vraie lecture du Compteur que des reçus de l'année existent déjà", async () => {
    await db.compteur.create({ data: { cle: cleCompteurRecu(2026), valeur: 41 } });

    const { rapport } = await analyser(depotCsv([etu(1)], [pai(1, "05/10/2026", 50_000)]));

    expect(rapport.bloquant).toBe(false);
    expect(rapport.messages.map((x) => x.texte)).toEqual([expect.stringMatching(/des reçus 2026 existent déjà \(jusqu'à R-2026-00041\)/)]);
  });
});

describe("importerReprise : refus avant toute écriture", () => {
  it("signature absente ou mal formée : « Analysez le fichier avant de l'importer »", async () => {
    const depot = depotCsv([etu(1)]);

    for (const signature of [undefined, "", "abc", "A".repeat(64), "g".repeat(64), "a".repeat(63), "a".repeat(65)]) {
      const etat = await actions.importerReprise(formulaire(depot, signature));

      expect(etat, String(signature)).toEqual({ statut: "erreur", message: "Analysez le fichier avant de l'importer." });
    }
    expect(await db.etudiant.count()).toBe(0);
    expect(revaliderPagesEcolage).not.toHaveBeenCalled();
  });

  it("signature bien formée mais d'un autre plan : « Le fichier ou la base ont changé… », rien d'écrit", async () => {
    const avant = await photo();

    const etat = await actions.importerReprise(formulaire(depotCsv([etu(1)]), "a".repeat(64)));

    expect(etat).toMatchObject({ statut: "erreur", message: expect.stringMatching(PLAN_CHANGE) });
    expect(await photo()).toEqual(avant);
    expect(revaliderPagesEcolage).not.toHaveBeenCalled();
  });

  it("signature d'un autre fichier : refusée (un montant change)", async () => {
    const { signature } = await analyser(depotCsv([etu(1)], [pai(1, "05/10/2026", 50_000)]));

    const etat = await actions.importerReprise(formulaire(depotCsv([etu(1)], [pai(1, "05/10/2026", 50_001)]), signature!));

    expect(etat).toMatchObject({ statut: "erreur", message: expect.stringMatching(PLAN_CHANGE) });
    expect(await db.paiement.count()).toBe(0);
  });

  it("rapport bloquant : refusé avec la première erreur, même avec une signature valide d'un autre fichier", async () => {
    const { signature } = await analyser(depotCsv([etu(1)]));

    const etat = await actions.importerReprise(formulaire(depotCsv([etu(1, { filiere: "ZZ" })]), signature!));

    expect(etat).toMatchObject({ statut: "erreur", message: expect.stringMatching(/^Le fichier contient des erreurs : .*filière inconnue.*Rien n'a été importé/) });
    expect(await db.etudiant.count()).toBe(0);
  });

  it("dépôt illisible : refus affichable", async () => {
    const etat = await actions.importerReprise(formulaire([{ nom: "reprise.xlsx", contenu: "pas un classeur" }], "a".repeat(64)));

    expect(etat).toMatchObject({ statut: "erreur", message: expect.stringMatching(/n'est pas un classeur/) });
  });
});

describe("importerReprise : étudiants", () => {
  const fichier = [
    etu(2, { prenoms: "Bis", droitsEnTranches: "3" }),
    etu(3, { filiere: "SF", telephone: null, adresse: null, nom: "rasoa" }),
    etu(4, { niveau: "2", anneeEntree: "2025", redoublant: "oui", cin: "501 011 012 345", sexe: "Féminin" }),
    etu(1),
  ];

  async function avecFichier() {
    await annee2025AvecTarifNiveau2();
    await db.compteur.create({ data: { cle: cleCompteurMatricule("IF", 2026), valeur: 5 } });
    return importer(depotCsv(fichier));
  }

  it("attribue les matricules par filière et année d'entrée, dans l'ordre des N°, à la suite du compteur existant", async () => {
    const résumé = reussi(await avecFichier());

    expect(résumé.etudiantsCrees).toBe(4);
    expect(résumé.etudiants.map((e) => [e.numero, e.matricule, e.nouveau])).toEqual([
      ["4", "IF-2025-0001", true],
      ["1", "IF-2026-0006", true],
      ["2", "IF-2026-0007", true],
      ["3", "SF-2026-0001", true],
    ]);
    const enBase = await db.etudiant.findMany({ orderBy: { matricule: "asc" }, select: { matricule: true } });
    expect(enBase.map((e) => e.matricule)).toEqual(["IF-2025-0001", "IF-2026-0006", "IF-2026-0007", "SF-2026-0001"]);
    const compteurs = await db.compteur.findMany({ where: { cle: { startsWith: "MATRICULE:" } }, orderBy: { cle: "asc" } });
    expect(compteurs.map((c) => [c.cle, c.valeur])).toEqual([
      ["MATRICULE:IF:2025", 1],
      ["MATRICULE:IF:2026", 7],
      ["MATRICULE:SF:2026", 1],
    ]);
  });

  it("le matricule garde l'année d'entrée du fichier, avec une seule inscription : l'année courante, au niveau indiqué", async () => {
    await avecFichier();

    const e = await db.etudiant.findFirstOrThrow({
      where: { matricule: "IF-2025-0001" },
      include: { anneeEntree: true, inscriptions: { include: { anneeScolaire: true } } },
    });

    expect(e.anneeEntree.anneeDebut).toBe(2025);
    expect(e.inscriptions).toHaveLength(1);
    expect(e.inscriptions[0]).toMatchObject({ niveau: 2, redoublement: true, droitsEnTranches: 1 });
    expect(e.inscriptions[0].anneeScolaire.anneeDebut).toBe(2026);
    expect(await db.inscription.count()).toBe(4);
  });

  it("enregistre les données du fichier normalisées et l'admin comme auteur", async () => {
    await avecFichier();

    const e = await db.etudiant.findFirstOrThrow({ where: { matricule: "IF-2025-0001" } });
    const s = await db.etudiant.findFirstOrThrow({ where: { matricule: "SF-2026-0001" } });

    expect(e).toMatchObject({
      nom: "NOM4", prenoms: "Prenom4", sexe: "F", lieuNaissance: "Toamasina", cin: "501011012345", telephone: "0341234567",
      statut: "ACTIF", creeParId: m.admin.id, recherche: "nom4 prenom4 if-2025-0001",
    });
    expect(e.dateNaissance.toISOString()).toBe("2004-05-10T00:00:00.000Z");
    expect(s).toMatchObject({ nom: "RASOA", telephone: null, adresse: null, filiereId: m.sf.id });
  });

  it("génère les échéances de l'année complète, montants copiés du tarif, droits en 1, 2 ou 3 tranches", async () => {
    await avecFichier();

    const parEtudiant = async (matricule: string) =>
      (await db.echeance.findMany({ where: { inscription: { etudiant: { matricule } } }, orderBy: { ordre: "asc" } })).map((x) => [x.type, x.tranche, x.montantDu]);

    expect(await parEtudiant("IF-2026-0007")).toEqual([
      ["DROITS", 1, 34_000], ["MENSUALITE", null, 80_000],
      ["DROITS", 2, 33_000], ["MENSUALITE", null, 80_000],
      ["DROITS", 3, 33_000], ["MENSUALITE", null, 80_000],
      ...Array.from({ length: 7 }, () => ["MENSUALITE", null, 80_000]),
    ]);
    expect(await parEtudiant("IF-2026-0006")).toHaveLength(11);
    const octobre = await db.echeance.findFirstOrThrow({ where: { inscription: { etudiant: { matricule: "IF-2026-0006" } }, ordre: 1 } });
    expect(octobre.mois.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("un changement de tarif après l'import ne réécrit pas les échéances", async () => {
    await avecFichier();

    await db.tarif.updateMany({ data: { montantMensuel: 95_000, droitsInscription: 120_000 } });

    const montants = await db.echeance.findMany({ select: { montantDu: true } });
    expect(new Set(montants.map((x) => x.montantDu))).toEqual(new Set([100_000, 80_000, 34_000, 33_000]));
  });

  it("appelle la revalidation des pages une fois, en cas de succès", async () => {
    await avecFichier();

    expect(revaliderPagesEcolage).toHaveBeenCalledTimes(1);
  });
});

describe("importerReprise : paiements", () => {
  const fichierPaiements = [
    pai(1, "20/10/2026", 100_000, { recuPapier: "0412" }),
    pai(1, "05/10/2026", 50_000, { mode: "Mobile Money", operateur: "MVola", reference: "MP261005.A1", recuPapier: "0413" }),
    pai(2, "06/10/2026", 30_000),
  ];

  it("émet les reçus R-{année civile} dans l'ordre des dates, le reste dû suit la répartition du guichet", async () => {
    const résumé = reussi(await importer(depotCsv([etu(1), etu(2)], fichierPaiements)));

    expect(résumé).toMatchObject({ paiements: 3, montant: 180_000, premierRecu: "R-2026-00001", dernierRecu: "R-2026-00003" });
    const p = await db.paiement.findMany({ orderBy: { numeroRecu: "asc" }, include: { etudiant: true } });
    expect(p.map((x) => [x.numeroRecu, x.etudiant.nom, x.montant, x.resteApres])).toEqual([
      ["R-2026-00001", "NOM1", 50_000, 850_000],
      ["R-2026-00002", "NOM2", 30_000, 870_000],
      ["R-2026-00003", "NOM1", 100_000, 750_000],
    ]);
    expect((await db.compteur.findUniqueOrThrow({ where: { cle: cleCompteurRecu(2026) } })).valeur).toBe(3);
  });

  it("répartit chaque paiement de la plus ancienne échéance à la plus récente (surplus en acompte sur la suivante)", async () => {
    await importer(depotCsv([etu(1)], [pai(1, "05/10/2026", 50_000), pai(1, "20/10/2026", 100_000)]));

    const lignes = await db.paiementLigne.findMany({
      orderBy: [{ paiement: { numeroRecu: "asc" } }, { echeance: { ordre: "asc" } }],
      include: { echeance: true },
    });
    expect(lignes.map((l) => [l.echeance.type, l.echeance.ordre, l.montant, l.resteEcheanceApres])).toEqual([
      ["DROITS", 1, 50_000, 50_000],
      ["DROITS", 1, 50_000, 0],
      ["MENSUALITE", 2, 50_000, 30_000],
    ]);
  });

  it("date le paiement du jour du fichier à 12:00 heure de Madagascar, avec observation, idClient, mode et auteur", async () => {
    await importer(depotCsv([etu(1), etu(2)], fichierPaiements));

    const mobile = await db.paiement.findFirstOrThrow({ where: { numeroRecu: "R-2026-00001" } });
    const especes = await db.paiement.findFirstOrThrow({ where: { numeroRecu: "R-2026-00003" } });

    expect(mobile.date.toISOString()).toBe("2026-10-05T09:00:00.000Z");
    expect(mobile).toMatchObject({
      mode: "MOBILE_MONEY", operateur: "MVOLA", reference: "MP261005.A1", saisiParId: m.admin.id, annule: false, aVerifier: false,
      observation: "Reprise des données · reçu papier n° 0413",
    });
    expect(mobile.idClient).toMatch(/^reprise:[0-9a-f]{40}$/);
    expect(especes).toMatchObject({ mode: "ESPECES", operateur: null, reference: null, observation: "Reprise des données · reçu papier n° 0412" });
    expect(especes.date.toISOString()).toBe("2026-10-20T09:00:00.000Z");
    expect(especes.idClient).not.toBe(mobile.idClient);
  });

  it("l'idClient de chaque paiement est la clé de reprise annoncée, aucune mention de reçu papier sans reçu papier", async () => {
    await importer(depotCsv([etu(1)], [pai(1, "05/10/2026", 50_000)]));

    const p = await db.paiement.findFirstOrThrow();

    expect(p.observation).toBe("Reprise des données");
    const relance = await analyser(depotCsv([etu(1)], [pai(1, "05/10/2026", 50_000)]));
    expect(relance.rapport.totaux.paiements.dejaImportes).toBe(1);
  });

  it("deux paiements identiques du même étudiant sont deux reçus distincts, et se reconnaissent à la relance", async () => {
    const depot = depotCsv([etu(1)], [pai(1, "05/10/2026", 50_000), pai(1, "05/10/2026", 50_000)]);

    await importer(depot);

    expect(await db.paiement.count()).toBe(2);
    expect(new Set((await db.paiement.findMany()).map((p) => p.idClient)).size).toBe(2);
    expect((await analyser(depot)).rapport.totaux.paiements).toMatchObject({ aImporter: 0, dejaImportes: 2 });
  });

  it("numérote à la suite des reçus déjà émis dans l'année", async () => {
    await db.compteur.create({ data: { cle: cleCompteurRecu(2026), valeur: 41 } });

    const résumé = reussi(await importer(depotCsv([etu(1)], [pai(1, "05/10/2026", 50_000)])));

    expect(résumé.premierRecu).toBe("R-2026-00042");
  });

  it("un reçu par année civile du paiement : fin 2026 et début 2027", async () => {
    vi.setSystemTime(new Date("2027-02-01T09:00:00Z"));

    const résumé = reussi(await importer(depotCsv([etu(1)], [pai(1, "20/12/2026", 10_000), pai(1, "10/01/2027", 10_000)])));

    expect(résumé).toMatchObject({ premierRecu: "R-2026-00001", dernierRecu: "R-2027-00001" });
    const compteurs = await db.compteur.findMany({ where: { cle: { startsWith: "RECU:" } }, orderBy: { cle: "asc" } });
    expect(compteurs.map((c) => [c.cle, c.valeur])).toEqual([["RECU:2026", 1], ["RECU:2027", 1]]);
  });

  it("sans paiement dans le fichier : étudiants créés, aucun reçu, aucun compteur de reçu", async () => {
    const résumé = reussi(await importer(depotCsv([etu(1)], [])));

    expect(résumé).toMatchObject({ etudiantsCrees: 1, paiements: 0, montant: 0, premierRecu: null, dernierRecu: null });
    expect(await db.compteur.count({ where: { cle: { startsWith: "RECU:" } } })).toBe(0);
  });

  it("le CSV des étudiants seul est accepté : aucun paiement repris", async () => {
    const résumé = reussi(await importer(depotCsv([etu(1)], null)));

    expect(résumé).toMatchObject({ etudiantsCrees: 1, paiements: 0 });
  });

  it("un étudiant déjà en base reçoit les paiements sur sa fiche, sa filière et son matricule inchangés", async () => {
    const { etudiant } = await fabriquerEtudiantInscrit(
      m.ifs.id, m.annee, { niveau: 1, droitsInscription: 100_000, montantMensuel: 80_000, nombreMois: 10 },
      { nom: "RAKOTO", prenoms: "Jean", dateNaissance: new Date(Date.UTC(2004, 4, 10)) },
    );

    const résumé = reussi(await importer(depotCsv([{ numero: "1", nom: "rakoto", prenoms: "JEAN" }], [pai(1, "05/10/2026", 50_000)])));

    expect(résumé.etudiantsCrees).toBe(0);
    expect(résumé.etudiants).toMatchObject([{ id: etudiant.id, matricule: etudiant.matricule, nouveau: false }]);
    expect(await db.etudiant.count()).toBe(1);
    expect(await db.inscription.count()).toBe(1);
    expect(await db.paiement.count({ where: { etudiantId: etudiant.id } })).toBe(1);
  });

  it("l'impayé d'une année antérieure est soldé avant l'année courante", async () => {
    const a2025 = await fabriquerAnnee({ anneeDebut: 2025, cloturee: true });
    const { etudiant } = await fabriquerEtudiantInscrit(
      m.ifs.id, m.annee, { niveau: 1, droitsInscription: 100_000, montantMensuel: 80_000, nombreMois: 10 },
      { nom: "RAKOTO", prenoms: "Jean", dateNaissance: new Date(Date.UTC(2004, 4, 10)) },
    );
    const { fabriquerInscription } = await import("../factories");
    const ancienne = await fabriquerInscription(etudiant.id, a2025.id, { niveau: 1, droitsInscription: 100_000, montantMensuel: 80_000, nombreMois: 10 }, a2025.dateDebut);
    const ancien = ancienne.echeances[0];

    await importer(depotCsv([{ numero: "1", nom: "RAKOTO", prenoms: "Jean" }], [pai(1, "05/10/2026", 60_000)]));

    const ligne = await db.paiementLigne.findFirstOrThrow({ include: { echeance: true } });
    expect(ligne.echeanceId).toBe(ancien.id);
    expect(ligne).toMatchObject({ montant: 60_000, resteEcheanceApres: 40_000 });
  });
});

describe("importerReprise : tout ou rien", () => {
  const depot = () => depotCsv([etu(1), etu(2), etu(3)], [pai(1, "05/10/2026", 50_000), pai(2, "06/10/2026", 30_000), pai(3, "07/10/2026", 20_000)]);

  async function etatInitial() {
    await db.compteur.create({ data: { cle: cleCompteurMatricule("IF", 2026), valeur: 5 } });
    await db.compteur.create({ data: { cle: cleCompteurRecu(2026), valeur: 10 } });
    return photo();
  }

  it("un paiement refusé en cours d'import (SITUATION_CHANGEE) annule tout : étudiants, reçus et compteurs", async () => {
    const signature = (await analyser(depot())).signature;
    const avant = await etatInitial();
    let appels = 0;
    enregistrer.mockImplementation((async (...args: Parameters<typeof enregistrerReel>) => {
      appels++;
      if (appels === 2) return { statut: "refus", erreur: echecCode("SITUATION_CHANGEE", "La situation de l'étudiant a changé.") };
      return enregistrerReel(...args);
    }) as typeof enregistrerReel);

    const etat = await actions.importerReprise(formulaire(depot(), signature));

    expect(appels).toBe(2);
    expect(etat).toMatchObject({
      statut: "erreur",
      message: expect.stringMatching(/^Paiements, ligne 3 : La situation de l'étudiant a changé\. Rien n'a été importé : analysez le fichier à nouveau\.$/),
    });
    expect(await photo()).toEqual(avant);
    expect(revaliderPagesEcolage).not.toHaveBeenCalled();
  });

  it("une erreur de numérotation (RangeError) en cours d'import annule tout et dit de relancer", async () => {
    const signature = (await analyser(depot())).signature;
    const avant = await etatInitial();
    enregistrer.mockImplementation((async () => {
      throw new RangeError("Plus de numéro de reçu disponible.");
    }) as typeof enregistrerReel);

    const etat = await actions.importerReprise(formulaire(depot(), signature));

    expect(etat).toEqual({ statut: "erreur", message: "Plus de numéro de reçu disponible. Rien n'a été importé : analysez le fichier à nouveau." });
    expect(await photo()).toEqual(avant);
  });

  it("une panne inattendue annule tout et remonte (jamais d'import partiel)", async () => {
    const signature = (await analyser(depot())).signature;
    const avant = await etatInitial();
    let appels = 0;
    enregistrer.mockImplementation((async (...args: Parameters<typeof enregistrerReel>) => {
      if (++appels === 3) throw new Error("connexion perdue");
      return enregistrerReel(...args);
    }) as typeof enregistrerReel);

    await expect(actions.importerReprise(formulaire(depot(), signature))).rejects.toThrow("connexion perdue");

    expect(await photo()).toEqual(avant);
    expect(revaliderPagesEcolage).not.toHaveBeenCalled();
  });

  it("un paiement saisi au guichet entre l'analyse et l'import change le plan : rien n'est importé", async () => {
    const { etudiant, inscription } = await fabriquerEtudiantInscrit(
      m.ifs.id, m.annee, { niveau: 1, droitsInscription: 100_000, montantMensuel: 80_000, nombreMois: 10 },
      { nom: "RAKOTO", prenoms: "Jean", dateNaissance: new Date(Date.UTC(2004, 4, 10)) },
    );
    const fichier = depotCsv([{ numero: "1", nom: "RAKOTO", prenoms: "Jean" }, etu(2)], [pai(1, "05/10/2026", 100_000), pai(2, "05/10/2026", 10_000)]);
    const { signature, rapport } = await analyser(fichier);
    expect(rapport.messages.map((x) => x.texte).join(" ")).not.toMatch(/guichet/);
    await fabriquerPaiement(etudiant.id, m.admin.id, [{ echeanceId: inscription.echeances[0].id, montant: 20_000 }]);
    const avant = await photo();

    const etat = await actions.importerReprise(formulaire(fichier, signature!));

    expect(etat).toMatchObject({ statut: "erreur", message: expect.stringMatching(PLAN_CHANGE) });
    expect(await photo()).toEqual(avant);
    expect(await db.etudiant.count()).toBe(1);
    expect(revaliderPagesEcolage).not.toHaveBeenCalled();
  });

  it("un étudiant créé entre l'analyse et l'import (même identité) change le plan : rien n'est importé", async () => {
    const signature = (await analyser(depot())).signature;
    await fabriquerEtudiantInscrit(
      m.ifs.id, m.annee, { niveau: 1, droitsInscription: 100_000, montantMensuel: 80_000, nombreMois: 10 },
      { nom: "NOM2", prenoms: "Prenom2", dateNaissance: new Date(Date.UTC(2004, 4, 10)) },
    );
    const avant = await photo();

    const etat = await actions.importerReprise(formulaire(depot(), signature));

    expect(etat).toMatchObject({ statut: "erreur", message: expect.stringMatching(PLAN_CHANGE) });
    expect(await photo()).toEqual(avant);
  });

  it("un tarif modifié entre l'analyse et l'import change le plan : rien n'est importé", async () => {
    const signature = (await analyser(depot())).signature;
    await db.tarif.updateMany({ where: { filiereId: m.ifs.id }, data: { montantMensuel: 85_000 } });

    const etat = await actions.importerReprise(formulaire(depot(), signature));

    expect(etat).toMatchObject({ statut: "erreur", message: expect.stringMatching(PLAN_CHANGE) });
    expect(await db.etudiant.count()).toBe(0);
  });

  it("l'année courante clôturée entre l'analyse et l'import : refusé, rien d'écrit", async () => {
    const signature = (await analyser(depot())).signature;
    await db.anneeScolaire.update({ where: { id: m.annee.id }, data: { cloturee: true } });

    const etat = await actions.importerReprise(formulaire(depot(), signature));

    expect(etat).toMatchObject({ statut: "erreur", message: expect.stringMatching(/clôturée|Le fichier contient des erreurs/) });
    expect(await db.etudiant.count()).toBe(0);
  });
});

describe("importerReprise : relance et simultanéité", () => {
  const etudiants = [etu(1), etu(2)];
  const paiements = [pai(1, "05/10/2026", 50_000), pai(2, "06/10/2026", 30_000)];

  it("relancer le même fichier ne crée rien : étudiants « déjà en base », paiements « déjà importés »", async () => {
    const depot = depotCsv(etudiants, paiements);
    await importer(depot);
    const apres1 = await photo();

    const { rapport, signature } = await analyser(depot);
    const etat = await importer(depot);

    expect(rapport.bloquant).toBe(false);
    expect(rapport.etudiants.map((e) => [e.statut, e.matricule])).toEqual([["existant", "IF-2026-0001"], ["existant", "IF-2026-0002"]]);
    expect(rapport.totaux.paiements).toMatchObject({ aImporter: 0, dejaImportes: 2 });
    expect(rapport.messages.map((x) => x.texte)).toEqual(expect.arrayContaining([expect.stringMatching(/^Rien à importer/)]));
    expect(signature).not.toBeNull();
    expect(etat).toEqual({ statut: "erreur", message: RIEN_A_IMPORTER });
    expect(await photo()).toEqual(apres1);
  });

  it("un import sans rien de nouveau est refusé sans rien écrire : ni compteur, ni étudiant, ni paiement, ni revalidation", async () => {
    const depot = depotCsv(etudiants, paiements);
    await importer(depot);
    revaliderPagesEcolage.mockClear();
    const apres1 = await photo();

    const { signature } = await analyser(depot);
    const etat = await actions.importerReprise(formulaire(depot, signature!));

    expect(etat).toEqual({ statut: "erreur", message: RIEN_A_IMPORTER });
    expect(await photo()).toEqual(apres1);
    expect(revaliderPagesEcolage).not.toHaveBeenCalled();
  });

  it("un fichier d'étudiants tous déjà en base et sans paiement est refusé de la même façon", async () => {
    await importer(depotCsv(etudiants, []));
    const apres1 = await photo();

    const etat = await importer(depotCsv(etudiants, []));

    expect(etat).toEqual({ statut: "erreur", message: RIEN_A_IMPORTER });
    expect(await photo()).toEqual(apres1);
  });

  it("un second import avec la signature d'une analyse faite avant le premier est refusé : le plan a changé, sans doublon", async () => {
    const depot = depotCsv(etudiants, paiements);
    const { signature } = await analyser(depot);
    reussi(await actions.importerReprise(formulaire(depot, signature!)));
    const apres1 = await photo();

    const etat = await actions.importerReprise(formulaire(depot, signature!));

    expect(etat).toMatchObject({ statut: "erreur", message: expect.stringMatching(PLAN_CHANGE) });
    expect(await photo()).toEqual(apres1);
  });

  it("une relance avec un paiement de plus n'importe que celui-là, à la suite des reçus", async () => {
    await importer(depotCsv(etudiants, paiements));

    const résumé = reussi(await importer(depotCsv(etudiants, [...paiements, pai(1, "15/10/2026", 10_000)])));

    expect(résumé).toMatchObject({ etudiantsCrees: 0, paiements: 1, montant: 10_000, premierRecu: "R-2026-00003" });
    expect(await db.etudiant.count()).toBe(2);
    expect(await db.paiement.count()).toBe(3);
  });

  it("un paiement repris puis annulé reste « déjà importé » : il n'est pas recréé", async () => {
    const depot = depotCsv(etudiants, paiements);
    await importer(depot);
    await db.paiement.updateMany({ where: { numeroRecu: "R-2026-00001" }, data: { annule: true, annuleParId: m.admin.id, dateAnnulation: new Date(), motifAnnulation: "Erreur" } });

    const { rapport } = await analyser(depot);
    const etat = await importer(depot);

    expect(rapport.totaux.paiements).toMatchObject({ aImporter: 0, dejaImportes: 2 });
    expect(etat).toEqual({ statut: "erreur", message: RIEN_A_IMPORTER });
    expect(await db.paiement.count()).toBe(2);
  });

  it("les paiements du guichet annulés ou repris ne comptent pas dans l'avertissement « déjà saisis au guichet »", async () => {
    const { etudiant, inscription } = await fabriquerEtudiantInscrit(
      m.ifs.id, m.annee, { niveau: 1, droitsInscription: 100_000, montantMensuel: 80_000, nombreMois: 10 },
      { nom: "RAKOTO", prenoms: "Jean", dateNaissance: new Date(Date.UTC(2004, 4, 10)) },
    );
    const ligne = [{ echeanceId: inscription.echeances[0].id, montant: 1_000 }];
    await fabriquerPaiement(etudiant.id, m.admin.id, ligne, { annule: true });
    await fabriquerPaiement(etudiant.id, m.admin.id, ligne, { idClient: "reprise:" + "0".repeat(40) });
    const fichier = depotCsv([{ numero: "1", nom: "RAKOTO", prenoms: "Jean" }], [pai(1, "05/10/2026", 10_000)]);

    const sans = await analyser(fichier);
    await fabriquerPaiement(etudiant.id, m.admin.id, ligne);
    await fabriquerPaiement(etudiant.id, m.admin.id, ligne, { idClient: "poste-1" });
    const avec = await analyser(fichier);

    expect(sans.rapport.messages.map((x) => x.texte).join(" ")).not.toMatch(/guichet/);
    expect(avec.rapport.messages.map((x) => x.texte)).toEqual(expect.arrayContaining([expect.stringMatching(/2 paiements déjà saisis au guichet/)]));
  });

  it("deux imports simultanés du même fichier : l'un passe, l'autre voit le plan changer, sans doublon", async () => {
    const depot = () => depotCsv(etudiants, paiements);
    const { signature } = await analyser(depot());

    const [a, b] = await Promise.all([actions.importerReprise(formulaire(depot(), signature!)), actions.importerReprise(formulaire(depot(), signature!))]);

    const etats = [a, b];
    expect(etats.filter((e) => e.statut === "succes")).toHaveLength(1);
    expect(etats.filter((e) => e.statut === "erreur")).toMatchObject([{ message: expect.stringMatching(PLAN_CHANGE) }]);
    expect(await db.etudiant.count()).toBe(2);
    expect(await db.paiement.count()).toBe(2);
    expect(await db.inscription.count()).toBe(2);
    expect((await db.compteur.findUniqueOrThrow({ where: { cle: cleCompteurMatricule("IF", 2026) } })).valeur).toBe(2);
  });

  it("deux imports simultanés de fichiers différents passent l'un après l'autre : matricules et reçus uniques", async () => {
    const un = depotCsv([etu(1), etu(2)], [pai(1, "05/10/2026", 10_000), pai(2, "06/10/2026", 10_000)]);
    const deux = depotCsv([etu(11), etu(12)], [pai(11, "05/10/2026", 10_000), pai(12, "06/10/2026", 10_000)]);
    const [sa, sb] = [(await analyser(un)).signature!, (await analyser(deux)).signature!];

    const [a, b] = await Promise.all([actions.importerReprise(formulaire(un, sa)), actions.importerReprise(formulaire(deux, sb))]);

    expect(a.statut).toBe("succes");
    expect(b.statut).toBe("succes");
    const matricules = (await db.etudiant.findMany()).map((e) => e.matricule).sort();
    expect(matricules).toEqual(["IF-2026-0001", "IF-2026-0002", "IF-2026-0003", "IF-2026-0004"]);
    const recus = (await db.paiement.findMany()).map((p) => p.numeroRecu).sort();
    expect(recus).toEqual(["R-2026-00001", "R-2026-00002", "R-2026-00003", "R-2026-00004"]);
  });

  it("l'import attend une création d'étudiant concurrente de la même personne : un seul étudiant à la fin", async () => {
    const depot = () => depotCsv([etu(1)], []);
    const { signature } = await analyser(depot());
    const { creerEtudiant } = await import("@/server/actions/etudiants");
    const { saisieEtudiant } = await import("../factories/scenarios");

    const [a, b] = await Promise.all([
      actions.importerReprise(formulaire(depot(), signature!)),
      creerEtudiant(saisieEtudiant(m.ifs.id, { nom: "NOM1", prenoms: "Prenom1", dateNaissance: "2004-05-10" })),
    ]);

    expect([a.statut, b.statut].filter((s) => s === "succes")).toHaveLength(1);
    expect(await db.etudiant.count({ where: { nom: "NOM1" } })).toBe(1);
  });
});

describe("classeur .xlsx et variante deux CSV", () => {
  const etudiants = [etu(2, { droitsEnTranches: "3" }), etu(1), etu(3, { filiere: "SF" })];
  const paiements = [pai(1, "05/10/2026", 50_000, { recuPapier: "0412" }), pai(2, "06/10/2026", 30_000, { mode: "Mobile Money", operateur: "Orange Money", reference: "OM1" })];

  it("donnent le même rapport et la même signature", async () => {
    const csv = await analyser(depotCsv(etudiants, paiements));
    const xlsx = await analyser(await depotXlsx(etudiants, paiements));

    expect(xlsx.rapport).toEqual(csv.rapport);
    expect(xlsx.signature).toBe(csv.signature);
    expect(csv.signature).not.toBeNull();
  });

  it("donnent le même état en base après import", async () => {
    const instantane = async () => ({
      etudiants: (await db.etudiant.findMany({ orderBy: { matricule: "asc" } })).map((e) => [e.matricule, e.nom, e.prenoms, e.filiereId]),
      echeances: (await db.echeance.count()),
      paiements: (await db.paiement.findMany({ orderBy: { numeroRecu: "asc" }, include: { etudiant: true } })).map((p) => [
        p.numeroRecu, p.etudiant.matricule, p.montant, p.mode, p.operateur, p.reference, p.observation, p.idClient, p.date.toISOString(), p.resteApres,
      ]),
    });
    reussi(await importer(depotCsv(etudiants, paiements)));
    const avecCsv = await instantane();
    await db.$executeRawUnsafe(
      `TRUNCATE TABLE "paiement_ligne", "paiement", "echeance", "inscription", "etudiant", "compteur" RESTART IDENTITY CASCADE`,
    );

    reussi(await importer(await depotXlsx(etudiants, paiements)));

    expect(await instantane()).toEqual(avecCsv);
  });

  it("la signature d'un rapport CSV autorise l'import du même contenu en classeur", async () => {
    const { signature } = await analyser(depotCsv(etudiants, paiements));

    const etat = await actions.importerReprise(formulaire(await depotXlsx(etudiants, paiements), signature!));

    expect(reussi(etat)).toMatchObject({ etudiantsCrees: 3, paiements: 2 });
  });
});

describe("importerReprise : tuteur", () => {
  it("enregistre nom, téléphone normalisé et profession du tuteur ; sans tuteur, les trois restent vides", async () => {
    const depot = depotCsv([
      etu(1, { tuteurNom: "RAKOTO Jean", tuteurTelephone: "033 12 345 67", tuteurProfession: "Commerçant" }),
      etu(2),
    ]);

    expect((await importer(depot)).statut).toBe("succes");

    const parNom = Object.fromEntries(
      (await db.etudiant.findMany({ select: { nom: true, tuteurNom: true, tuteurTelephone: true, tuteurProfession: true } })).map(
        ({ nom, ...t }) => [nom, t],
      ),
    );
    expect(parNom).toEqual({
      NOM1: { tuteurNom: "RAKOTO Jean", tuteurTelephone: "0331234567", tuteurProfession: "Commerçant" },
      NOM2: { tuteurNom: null, tuteurTelephone: null, tuteurProfession: null },
    });
  });
});
