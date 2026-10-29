import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PAIEMENTS_IGNORES } from "@/lib/import-lecture";
import { cleCompteurMatricule, cleCompteurRecu } from "@/lib/matricule";
import { fabriquerAnnee, fabriquerFrais, fabriquerTarif } from "../factories";
import { connecter, fabriquerEtudiantInscrit, fabriquerMonde, MAINTENANT, reussi, type Monde } from "../factories/scenarios";
import { depotCsv, depotXlsx, formulaire, tableauEtudiants, versCsv, type Depot } from "../factories/reprise";

const { getSession, revaliderPagesEcolage } = vi.hoisted(() => ({ getSession: vi.fn(), revaliderPagesEcolage: vi.fn() }));

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/ecolage-revalidation", () => ({ revaliderPagesEcolage }));
// Appelle le vrai compteur, sauf quand un test lui fait échouer un matricule en cours d'import.
vi.mock("@/server/compteur", async (importOriginal) => {
  const o = await importOriginal<typeof import("@/server/compteur")>();
  return { ...o, prochainNumero: vi.fn(o.prochainNumero) };
});

const { db } = await import("@/lib/db");
const actions = await import("@/server/actions/import");
const { prochainNumero } = await import("@/server/compteur");

const numero = vi.mocked(prochainNumero);
const numeroReel = numero.getMockImplementation()!;

const REFUS_ADMIN = { statut: "erreur", message: "Cette action est réservée à l'administrateur." };
const RIEN_A_IMPORTER = "Rien à importer : les étudiants du fichier sont déjà en base. Rien n'a été modifié.";
const PLAN_CHANGE = /Le fichier ou la base ont changé depuis le rapport\. Rien n'a été importé/;
const MENSUALITES = ["2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05", "2027-06", "2027-07"];
const TARIF_BASE = { niveau: 1, droitsInscription: 100_000, montantMensuel: 80_000, nombreMois: 10 };

type LigneE = Parameters<typeof depotCsv>[0][number];

let m: Monde;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(MAINTENANT) });
  revaliderPagesEcolage.mockClear();
  getSession.mockReset();
  numero.mockImplementation(numeroReel);
  m = await fabriquerMonde();
  connecter(getSession, m.admin);
});

afterEach(() => vi.useRealTimers());

/** Étudiant n° `n` d'identité propre (même date de naissance par défaut : le 10/05/2004). */
const etu = (n: number, surcharge: LigneE = {}): LigneE => ({ numero: String(n), nom: `NOM${n}`, prenoms: `Prenom${n}`, ...surcharge });

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

    expect(await actions.analyserReprise(new FormData())).toEqual(REFUS_ADMIN);
    expect(await actions.analyserReprise(formulaire(depot))).toEqual(REFUS_ADMIN);
    expect(await actions.importerReprise(new FormData())).toEqual(REFUS_ADMIN);
    expect(await actions.importerReprise(formulaire(depot, "a".repeat(64)))).toEqual(REFUS_ADMIN);
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
    await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF_BASE);
    const avant = await photo();

    const etat = await actions.analyserReprise(formulaire(depotCsv([etu(1), etu(2)])));

    const { rapport, signature } = reussi(etat);
    expect(etat.statut === "succes" && etat.message).toBe("Prêt à importer 2 nouveaux étudiants.");
    expect(rapport.bloquant).toBe(false);
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
    expect(await photo()).toEqual(avant);
    expect(revaliderPagesEcolage).not.toHaveBeenCalled();
  });

  it("un seul nouvel étudiant : message au singulier", async () => {
    const etat = await actions.analyserReprise(formulaire(depotCsv([etu(1)])));

    expect(etat.statut === "succes" && etat.message).toBe("Prêt à importer 1 nouvel étudiant.");
  });

  it("rapport allégé : un récapitulatif par étudiant avec le dû de l'année, rien sur les paiements", async () => {
    const { rapport } = await analyser(depotCsv([etu(1), etu(2)]));

    expect(Object.keys(rapport).sort()).toEqual(["annee", "bloquant", "etudiants", "messages", "totaux"]);
    expect(rapport.etudiants).toMatchObject([
      { ligne: 2, numero: "1", statut: "nouveau", nom: "NOM1", prenoms: "Prenom1", filiere: "IF", niveau: 1, matricule: null, duAnnee: 900_000 },
      { ligne: 3, numero: "2", statut: "nouveau", nom: "NOM2", duAnnee: 900_000 },
    ]);
    expect(rapport.totaux).toEqual({ etudiants: { lus: 2, nouveaux: 2, existants: 0, refuses: 0 }, erreurs: 0, avertissements: 0 });
  });

  it("fichier bloquant : message d'erreurs, signature null, ligne refusée", async () => {
    const etat = await actions.analyserReprise(formulaire(depotCsv([etu(1), etu(2, { filiere: "ZZ" })])));

    const { rapport, signature } = reussi(etat);
    expect(signature).toBeNull();
    expect(rapport.bloquant).toBe(true);
    expect(etat.statut === "succes" && etat.message).toBe("1 erreur : rien ne peut être importé. Corrigez le fichier, puis déposez-le à nouveau.");
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

  it("un paiements.csv seul, sans CSV des étudiants, est refusé", async () => {
    const [, paiements] = depotCsv([etu(1)], 2);

    const etat = await actions.analyserReprise(formulaire([paiements]));

    expect(etat).toMatchObject({ statut: "erreur", message: expect.stringMatching(/Ajoutez le CSV des étudiants/) });
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

  it("signature d'un autre fichier : refusée (un nom change)", async () => {
    const { signature } = await analyser(depotCsv([etu(1)]));

    const etat = await actions.importerReprise(formulaire(depotCsv([etu(1, { nom: "AUTRE" })]), signature!));

    expect(etat).toMatchObject({ statut: "erreur", message: expect.stringMatching(PLAN_CHANGE) });
    expect(await db.etudiant.count()).toBe(0);
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
    etu(2, { prenoms: "Bis" }),
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

    expect(Object.keys(résumé).sort()).toEqual(["etudiants", "etudiantsCrees"]);
    expect(résumé.etudiantsCrees).toBe(4);
    expect(résumé.etudiants.map((e) => [e.numero, e.matricule, e.nouveau])).toEqual([
      ["4", "IF-2025-0001", true],
      ["1", "IF-2026-0006", true],
      ["2", "IF-2026-0007", true],
      ["3", "SF-2026-0001", true],
    ]);
    const enBase = await db.etudiant.findMany({ orderBy: { matricule: "asc" }, select: { matricule: true } });
    expect(enBase.map((e) => e.matricule)).toEqual(["IF-2025-0001", "IF-2026-0006", "IF-2026-0007", "SF-2026-0001"]);
    const compteurs = await db.compteur.findMany({ orderBy: { cle: "asc" } });
    expect(compteurs.map((c) => [c.cle, c.valeur])).toEqual([
      ["MATRICULE:IF:2025", 1],
      ["MATRICULE:IF:2026", 7],
      ["MATRICULE:SF:2026", 1],
    ]);
  });

  it("le message de succès annonce le nombre d'étudiants créés", async () => {
    await annee2025AvecTarifNiveau2();

    const un = await importer(depotCsv([etu(1)]));
    const deux = await importer(depotCsv([etu(1), etu(2), etu(3)]));

    expect(un.statut === "succes" && un.message).toBe("Import terminé : 1 étudiant créé.");
    expect(deux.statut === "succes" && deux.message).toBe("Import terminé : 2 étudiants créés.");
  });

  it("le matricule garde l'année d'entrée du fichier, avec une seule inscription : l'année courante, au niveau indiqué", async () => {
    await avecFichier();

    const e = await db.etudiant.findFirstOrThrow({
      where: { matricule: "IF-2025-0001" },
      include: { anneeEntree: true, inscriptions: { include: { anneeScolaire: true } } },
    });

    expect(e.anneeEntree.anneeDebut).toBe(2025);
    expect(e.inscriptions).toHaveLength(1);
    expect(e.inscriptions[0]).toMatchObject({ niveau: 2, redoublement: true });
    expect(e.inscriptions[0].anneeScolaire.anneeDebut).toBe(2026);
    expect(await db.inscription.count()).toBe(4);
  });

  it("aucune inscription n'est créée sur une année précédente, même pour un redoublant entré en 2025", async () => {
    const a2025 = await annee2025AvecTarifNiveau2();

    reussi(await importer(depotCsv([etu(1, { niveau: "2", anneeEntree: "2025", redoublant: "oui" }), etu(2)])));

    expect(await db.inscription.count({ where: { anneeScolaireId: a2025.id } })).toBe(0);
    expect(await db.inscription.count({ where: { anneeScolaireId: { not: m.annee.id } } })).toBe(0);
    expect(await db.inscription.count({ where: { anneeScolaireId: m.annee.id } })).toBe(2);
    const sur2025 = await db.echeance.count({ where: { mois: { lt: new Date(Date.UTC(2026, 9, 1)) } } });
    expect(sur2025).toBe(0);
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

  it("appelle la revalidation des pages une fois, en cas de succès", async () => {
    await avecFichier();

    expect(revaliderPagesEcolage).toHaveBeenCalledTimes(1);
  });

  it("enregistre nom, téléphone normalisé et profession du tuteur ; sans tuteur, les trois restent vides", async () => {
    const depot = depotCsv([
      etu(1, { tuteurNom: "RAKOTO Jean", tuteurTelephone: "033 12 345 67", tuteurProfession: "Commerçant" }),
      etu(2),
    ]);

    reussi(await importer(depot));

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

describe("importerReprise : écolage de l'année courante entièrement dû", () => {
  it("11 échéances par étudiant (droits + 10 mensualités), montants copiés du tarif, aucune ligne de paiement", async () => {
    reussi(await importer(depotCsv([etu(1), etu(2)])));

    const echeances = await db.echeance.findMany({ where: { inscription: { etudiant: { nom: "NOM1" } } }, orderBy: [{ mois: "asc" }, { type: "asc" }] });
    expect(echeances.map((x) => [x.type, x.mois.toISOString().slice(0, 7), x.montantDu])).toEqual([
      ["DROITS", "2026-10", 100_000],
      ...MENSUALITES.map((mois) => ["MENSUALITE", mois, 80_000]),
    ]);
    expect(await db.echeance.count()).toBe(22);
    expect(await db.paiementLigne.count()).toBe(0);
    expect(await db.paiement.count()).toBe(0);
  });

  it("le dû de l'année est le total de l'inscription, rien n'est soldé ni en acompte", async () => {
    const { rapport } = await analyser(depotCsv([etu(1)]));
    reussi(await importer(depotCsv([etu(1)])));

    const total = await db.echeance.aggregate({ _sum: { montantDu: true } });
    expect(total._sum.montantDu).toBe(900_000);
    expect(rapport.etudiants[0].duAnnee).toBe(900_000);
  });

  it("les droits sont exigibles au 1er mois de l'année (novembre quand l'écolage commence en novembre)", async () => {
    await db.anneeScolaire.update({ where: { id: m.annee.id }, data: { moisDebutEcolage: 11 } });

    reussi(await importer(depotCsv([etu(1)])));

    const echeances = await db.echeance.findMany({ orderBy: [{ mois: "asc" }, { type: "asc" }] });
    expect(echeances).toHaveLength(11);
    expect(echeances.filter((x) => x.type === "DROITS").map((x) => x.mois.toISOString().slice(0, 7))).toEqual(["2026-11"]);
    expect(echeances[0].mois.toISOString().slice(0, 7)).toBe("2026-11");
    expect(echeances.at(-1)!.mois.toISOString().slice(0, 7)).toBe("2027-08");
  });

  it("un changement de tarif après l'import ne réécrit pas les échéances", async () => {
    reussi(await importer(depotCsv([etu(1)])));

    await db.tarif.updateMany({ data: { montantMensuel: 95_000, droitsInscription: 120_000 } });

    const montants = await db.echeance.findMany({ select: { montantDu: true } });
    expect(new Set(montants.map((x) => x.montantDu))).toEqual(new Set([100_000, 80_000]));
  });

  it("la colonne « Droits en » d'un ancien fichier est ignorée sans erreur ni avertissement : une seule échéance de droits", async () => {
    const ligneAncienne = (r: (string | number | Date | null)[], i: number) => [...r, i === 0 ? "Droits en" : "3"];
    const depot: Depot = [{ nom: "etudiants.csv", contenu: versCsv(tableauEtudiants([etu(1)]).map(ligneAncienne)) }];

    const { rapport, signature } = await analyser(depot);

    expect(rapport.bloquant).toBe(false);
    expect(rapport.messages.map((x) => x.texte).join(" ")).not.toMatch(/Droits|tranche/i);
    reussi(await actions.importerReprise(formulaire(depot, signature)));
    const echeances = await db.echeance.findMany();
    expect(echeances).toHaveLength(11);
    expect(echeances.filter((x) => x.type === "DROITS").map((x) => x.montantDu)).toEqual([100_000]);
  });
});

describe("importerReprise : frais de l'année", () => {
  it("les frais prévus pour la classe sont copiés sur les étudiants importés dans cette classe, et eux seuls", async () => {
    await fabriquerTarif(m.ifs.id, m.annee.id, { niveau: 2 });
    const frais = await fabriquerFrais(m.annee.id, { classes: [{ filiereId: m.ifs.id, niveau: 1 }], montant: 15_000, mois: new Date(Date.UTC(2027, 2, 1)) });

    reussi(await importer(depotCsv([etu(1), etu(2, { niveau: "2" }), etu(3, { filiere: "SF" })])));

    const fraisPar = async (nom: string) => db.echeance.findMany({ where: { type: "FRAIS", inscription: { etudiant: { nom } } } });
    expect(await fraisPar("NOM1")).toMatchObject([{ fraisId: frais.frais.id, montantDu: 15_000, nonDueSortie: false }]);
    expect((await fraisPar("NOM1"))[0].mois.toISOString().slice(0, 7)).toBe("2027-03");
    expect(await fraisPar("NOM2")).toEqual([]);
    expect(await fraisPar("NOM3")).toEqual([]);
    expect(await db.paiementLigne.count()).toBe(0);
  });

  it("plusieurs frais sur la même classe : tous copiés, avec leur propre montant", async () => {
    const classes = [{ filiereId: m.ifs.id, niveau: 1 }];
    await fabriquerFrais(m.annee.id, { classes, libelle: "Frais d'examen", montant: 15_000, mois: new Date(Date.UTC(2027, 2, 1)) });
    await fabriquerFrais(m.annee.id, { classes, libelle: "Frais de stage", montant: 25_000, mois: new Date(Date.UTC(2027, 4, 1)) });

    reussi(await importer(depotCsv([etu(1)])));

    const frais = await db.echeance.findMany({ where: { type: "FRAIS" }, include: { frais: true }, orderBy: { mois: "asc" } });
    expect(frais.map((x) => [x.frais?.libelle, x.montantDu])).toEqual([["Frais d'examen", 15_000], ["Frais de stage", 25_000]]);
  });

  it("le rapport compte le frais dans le dû de l'année, et la signature change quand un frais est ajouté", async () => {
    const sans = await analyser(depotCsv([etu(1)]));
    await fabriquerFrais(m.annee.id, { classes: [{ filiereId: m.ifs.id, niveau: 1 }], montant: 15_000 });

    const avec = await analyser(depotCsv([etu(1)]));

    expect(avec.rapport.etudiants[0].duAnnee).toBe(915_000);
    expect(avec.signature).not.toBe(sans.signature);
    expect(await importer(depotCsv([etu(1)]), sans.signature!)).toMatchObject({ statut: "erreur", message: expect.stringMatching(PLAN_CHANGE) });
  });
});

describe("ancien fichier avec des paiements : étudiants importés, paiements ignorés", () => {
  const etudiants = [etu(2), etu(1), etu(3, { filiere: "SF" })];
  const avertissementIgnores = expect.objectContaining({ gravite: "avertissement", feuille: null, texte: PAIEMENTS_IGNORES });

  it("un ancien couple de CSV : avertissement PAIEMENTS_IGNORES, analyse non bloquante", async () => {
    const { rapport, signature } = await analyser(depotCsv(etudiants, 3));

    expect(rapport.bloquant).toBe(false);
    expect(signature).not.toBeNull();
    expect(rapport.messages).toEqual([avertissementIgnores]);
    expect(rapport.totaux).toMatchObject({ erreurs: 0, avertissements: 1, etudiants: { lus: 3, nouveaux: 3 } });
  });

  it("un ancien classeur .xlsx avec sa feuille Paiements : même avertissement, même rapport qu'avec les CSV", async () => {
    const xlsx = await analyser(await depotXlsx(etudiants, 3));
    const csv = await analyser(depotCsv(etudiants, 3));

    expect(xlsx.rapport.messages).toEqual([avertissementIgnores]);
    expect(xlsx.rapport).toEqual(csv.rapport);
    expect(xlsx.signature).toBe(csv.signature);
  });

  it("l'import d'un ancien couple de CSV crée les étudiants, aucun Paiement ni compteur RECU:", async () => {
    const résumé = reussi(await importer(depotCsv(etudiants, 3)));

    expect(résumé.etudiantsCrees).toBe(3);
    expect(await db.etudiant.count()).toBe(3);
    expect(await db.paiement.count()).toBe(0);
    expect(await db.paiementLigne.count()).toBe(0);
    expect(await db.compteur.count({ where: { cle: { startsWith: "RECU:" } } })).toBe(0);
  });

  it("l'import d'un ancien classeur .xlsx crée les étudiants, aucun Paiement ni compteur RECU:", async () => {
    const résumé = reussi(await importer(await depotXlsx(etudiants, 3)));

    expect(résumé.etudiantsCrees).toBe(3);
    expect(await db.paiement.count()).toBe(0);
    expect(await db.paiementLigne.count()).toBe(0);
    expect(await db.compteur.count({ where: { cle: { startsWith: "RECU:" } } })).toBe(0);
  });

  it("un paiements.csv vide (en-têtes seuls) est aussi ignoré avec l'avertissement", async () => {
    const { rapport } = await analyser(depotCsv(etudiants, 0));

    expect(rapport.messages).toEqual([avertissementIgnores]);
  });

  it("les reçus déjà émis dans l'année ne changent rien : leur compteur reste intact et sans avertissement", async () => {
    await db.compteur.create({ data: { cle: cleCompteurRecu(2026), valeur: 41 } });

    const { rapport } = await analyser(depotCsv([etu(1)]));
    reussi(await importer(depotCsv([etu(1)], 2)));

    expect(rapport.messages).toEqual([]);
    expect((await db.compteur.findUniqueOrThrow({ where: { cle: cleCompteurRecu(2026) } })).valeur).toBe(41);
  });

  it("des paiements déjà saisis au guichet pour un étudiant du fichier ne bloquent pas l'import et ne sont pas touchés", async () => {
    const { etudiant, inscription } = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF_BASE, { nom: "RAKOTO", prenoms: "Jean", dateNaissance: new Date(Date.UTC(2004, 4, 10)) });
    const { fabriquerPaiement } = await import("../factories");
    await fabriquerPaiement(etudiant.id, m.admin.id, [{ echeanceId: inscription.echeances[0].id, montant: 20_000 }]);
    const avant = await photo();

    const { rapport } = await analyser(depotCsv([{ numero: "1", nom: "RAKOTO", prenoms: "Jean" }, etu(2)], 2));
    reussi(await importer(depotCsv([{ numero: "1", nom: "RAKOTO", prenoms: "Jean" }, etu(2)], 2)));

    expect(rapport.messages.map((x) => x.texte).join(" ")).not.toMatch(/déjà saisis au guichet/);
    const apres = await photo();
    expect(apres.paiements).toEqual(avant.paiements);
    expect(apres.lignes).toEqual(avant.lignes);
  });
});

describe("étudiant déjà en base ou sorti : jamais recréé", () => {
  it("un étudiant actif déjà en base garde son matricule, sa filière et son inscription ; rien n'est ajouté pour lui", async () => {
    const { etudiant } = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF_BASE, { nom: "RAKOTO", prenoms: "Jean", dateNaissance: new Date(Date.UTC(2004, 4, 10)) });
    const avant = await db.echeance.count();

    const résumé = reussi(await importer(depotCsv([{ numero: "1", nom: "rakoto", prenoms: "JEAN" }, etu(2)])));

    expect(résumé.etudiantsCrees).toBe(1);
    expect(résumé.etudiants).toMatchObject([
      { id: etudiant.id, matricule: etudiant.matricule, nouveau: false },
      { nom: "NOM2", nouveau: true },
    ]);
    expect(await db.etudiant.count()).toBe(2);
    expect(await db.inscription.count({ where: { etudiantId: etudiant.id } })).toBe(1);
    expect(await db.echeance.count()).toBe(avant + 11);
  });

  it.each(["ABANDON", "EXCLU", "DIPLOME"] as const)("un étudiant sorti (%s) n'est pas recréé, avec un avertissement", async (statut) => {
    const { etudiant } = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF_BASE, { nom: "RAKOTO", prenoms: "Jean", dateNaissance: new Date(Date.UTC(2004, 4, 10)), statut });
    const fichier = depotCsv([{ numero: "1", nom: "RAKOTO", prenoms: "Jean" }, etu(2)]);

    const { rapport } = await analyser(fichier);
    reussi(await importer(fichier));

    expect(rapport.etudiants[0]).toMatchObject({ statut: "existant", matricule: etudiant.matricule });
    expect(rapport.messages.map((x) => x.texte)).toEqual([expect.stringMatching(/déjà en base sous le matricule .*, sorti/)]);
    expect((await db.etudiant.findUniqueOrThrow({ where: { id: etudiant.id } })).statut).toBe(statut);
    expect(await db.etudiant.count({ where: { nom: "RAKOTO" } })).toBe(1);
    expect(await db.inscription.count({ where: { etudiantId: etudiant.id } })).toBe(1);
  });

  it("un étudiant en base sans inscription cette année bloque le fichier au lieu d'être recréé", async () => {
    const entree = await fabriquerAnnee({ anneeDebut: 2025, cloturee: true });
    await fabriquerEtudiantInscrit(m.ifs.id, entree, TARIF_BASE, { nom: "RAKOTO", prenoms: "Jean", dateNaissance: new Date(Date.UTC(2004, 4, 10)) });

    const { rapport, signature } = await analyser(depotCsv([{ numero: "1", nom: "RAKOTO", prenoms: "Jean" }]));

    expect(signature).toBeNull();
    expect(rapport.messages[0].texte).toMatch(/sans inscription en 2026-2027/);
    expect(await db.etudiant.count()).toBe(1);
  });
});

describe("importerReprise : tout ou rien", () => {
  const depot = () => depotCsv([etu(1), etu(2), etu(3)]);

  async function etatInitial() {
    await db.compteur.create({ data: { cle: cleCompteurMatricule("IF", 2026), valeur: 5 } });
    return photo();
  }

  it("une erreur de numérotation (RangeError) sur le 3e étudiant annule tout et dit de relancer", async () => {
    const signature = (await analyser(depot())).signature;
    const avant = await etatInitial();
    let appels = 0;
    numero.mockImplementation((async (...args: Parameters<typeof numeroReel>) => {
      if (++appels === 3) throw new RangeError("Plus de numéro disponible.");
      return numeroReel(...args);
    }) as typeof numeroReel);

    const etat = await actions.importerReprise(formulaire(depot(), signature));

    expect(etat).toEqual({ statut: "erreur", message: "Plus de numéro disponible. Rien n'a été importé : analysez le fichier à nouveau." });
    expect(await photo()).toEqual(avant);
    expect(revaliderPagesEcolage).not.toHaveBeenCalled();
  });

  it("une panne inattendue annule tout et remonte (jamais d'import partiel)", async () => {
    const signature = (await analyser(depot())).signature;
    const avant = await etatInitial();
    let appels = 0;
    numero.mockImplementation((async (...args: Parameters<typeof numeroReel>) => {
      if (++appels === 3) throw new Error("connexion perdue");
      return numeroReel(...args);
    }) as typeof numeroReel);

    await expect(actions.importerReprise(formulaire(depot(), signature))).rejects.toThrow("connexion perdue");

    expect(await photo()).toEqual(avant);
    expect(revaliderPagesEcolage).not.toHaveBeenCalled();
  });

  it("un étudiant créé entre l'analyse et l'import (même identité) change le plan : rien n'est importé", async () => {
    const signature = (await analyser(depot())).signature;
    await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF_BASE, { nom: "NOM2", prenoms: "Prenom2", dateNaissance: new Date(Date.UTC(2004, 4, 10)) });
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

  it("un frais ajouté entre l'analyse et l'import change le plan : rien n'est importé", async () => {
    const signature = (await analyser(depot())).signature;
    await fabriquerFrais(m.annee.id, { classes: [{ filiereId: m.ifs.id, niveau: 1 }] });

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

  it("relancer le même fichier ne crée rien : rapport « déjà en base » puis état « rien à importer »", async () => {
    const depot = depotCsv(etudiants);
    reussi(await importer(depot));
    const apres1 = await photo();

    const { rapport, signature } = await analyser(depot);
    const etat = await importer(depot);

    expect(rapport.bloquant).toBe(false);
    expect(rapport.etudiants.map((e) => [e.statut, e.matricule])).toEqual([["existant", "IF-2026-0001"], ["existant", "IF-2026-0002"]]);
    expect(rapport.totaux.etudiants).toMatchObject({ nouveaux: 0, existants: 2 });
    expect(rapport.messages.map((x) => x.texte)).toEqual(expect.arrayContaining([expect.stringMatching(/^Rien à importer/)]));
    expect(signature).not.toBeNull();
    expect(etat).toEqual({ statut: "erreur", message: RIEN_A_IMPORTER });
    expect(await photo()).toEqual(apres1);
  });

  it("la relance crée 0 étudiant, aucune écriture ni compteur, aucune revalidation", async () => {
    const depot = depotCsv(etudiants);
    reussi(await importer(depot));
    revaliderPagesEcolage.mockClear();
    const apres1 = await photo();

    const { signature } = await analyser(depot);
    const etat = await actions.importerReprise(formulaire(depot, signature!));

    expect(etat).toEqual({ statut: "erreur", message: RIEN_A_IMPORTER });
    expect(await db.etudiant.count()).toBe(2);
    expect(await photo()).toEqual(apres1);
    expect(revaliderPagesEcolage).not.toHaveBeenCalled();
  });

  it("la relance d'un ancien fichier avec paiements est aussi « rien à importer », sans paiement créé", async () => {
    const depot = depotCsv(etudiants, 2);
    reussi(await importer(depot));
    const apres1 = await photo();

    const etat = await importer(depot);

    expect(etat).toEqual({ statut: "erreur", message: RIEN_A_IMPORTER });
    expect(await photo()).toEqual(apres1);
    expect(await db.paiement.count()).toBe(0);
  });

  it("une relance avec un étudiant de plus n'importe que celui-là, à la suite des matricules", async () => {
    reussi(await importer(depotCsv(etudiants)));

    const résumé = reussi(await importer(depotCsv([...etudiants, etu(3)])));

    expect(résumé.etudiantsCrees).toBe(1);
    expect(résumé.etudiants.map((e) => [e.matricule, e.nouveau])).toEqual([["IF-2026-0001", false], ["IF-2026-0002", false], ["IF-2026-0003", true]]);
    expect(await db.etudiant.count()).toBe(3);
    expect(await db.inscription.count()).toBe(3);
  });

  it("un second import avec la signature d'une analyse faite avant le premier est refusé : le plan a changé, sans doublon", async () => {
    const depot = depotCsv(etudiants);
    const { signature } = await analyser(depot);
    reussi(await actions.importerReprise(formulaire(depot, signature!)));
    const apres1 = await photo();

    const etat = await actions.importerReprise(formulaire(depot, signature!));

    expect(etat).toMatchObject({ statut: "erreur", message: expect.stringMatching(PLAN_CHANGE) });
    expect(await photo()).toEqual(apres1);
  });

  it("deux imports simultanés du même fichier : l'un passe, l'autre voit le plan changer, sans doublon", async () => {
    const depot = () => depotCsv(etudiants);
    const { signature } = await analyser(depot());

    const etats = await Promise.all([actions.importerReprise(formulaire(depot(), signature!)), actions.importerReprise(formulaire(depot(), signature!))]);

    expect(etats.filter((e) => e.statut === "succes")).toHaveLength(1);
    expect(etats.filter((e) => e.statut === "erreur")).toMatchObject([{ message: expect.stringMatching(PLAN_CHANGE) }]);
    expect(await db.etudiant.count()).toBe(2);
    expect(await db.inscription.count()).toBe(2);
    expect((await db.compteur.findUniqueOrThrow({ where: { cle: cleCompteurMatricule("IF", 2026) } })).valeur).toBe(2);
  });

  it("deux imports simultanés de fichiers différents passent l'un après l'autre : matricules uniques", async () => {
    const un = depotCsv([etu(1), etu(2)]);
    const deux = depotCsv([etu(11), etu(12)]);
    const [sa, sb] = [(await analyser(un)).signature!, (await analyser(deux)).signature!];

    const [a, b] = await Promise.all([actions.importerReprise(formulaire(un, sa)), actions.importerReprise(formulaire(deux, sb))]);

    expect(a.statut).toBe("succes");
    expect(b.statut).toBe("succes");
    const matricules = (await db.etudiant.findMany()).map((e) => e.matricule).sort();
    expect(matricules).toEqual(["IF-2026-0001", "IF-2026-0002", "IF-2026-0003", "IF-2026-0004"]);
  });

  it("l'import attend une création d'étudiant concurrente de la même personne : un seul étudiant à la fin", async () => {
    const depot = () => depotCsv([etu(1)]);
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

describe("classeur .xlsx et CSV", () => {
  const etudiants = [etu(2), etu(1), etu(3, { filiere: "SF" })];

  it("donnent le même rapport et la même signature", async () => {
    const csv = await analyser(depotCsv(etudiants));
    const xlsx = await analyser(await depotXlsx(etudiants));

    expect(xlsx.rapport).toEqual(csv.rapport);
    expect(xlsx.signature).toBe(csv.signature);
    expect(csv.signature).not.toBeNull();
  });

  it("donnent le même état en base après import", async () => {
    const instantane = async () => ({
      etudiants: (await db.etudiant.findMany({ orderBy: { matricule: "asc" } })).map((e) => [e.matricule, e.nom, e.prenoms, e.filiereId]),
      echeances: (await db.echeance.findMany({ orderBy: [{ mois: "asc" }, { type: "asc" }] })).map((x) => [x.type, x.mois.toISOString(), x.montantDu]),
    });
    reussi(await importer(depotCsv(etudiants)));
    const avecCsv = await instantane();
    await db.$executeRawUnsafe(
      `TRUNCATE TABLE "paiement_ligne", "paiement", "echeance", "inscription", "etudiant", "compteur" RESTART IDENTITY CASCADE`,
    );

    reussi(await importer(await depotXlsx(etudiants)));

    expect(await instantane()).toEqual(avecCsv);
  });

  it("la signature d'un rapport CSV autorise l'import du même contenu en classeur", async () => {
    const { signature } = await analyser(depotCsv(etudiants));

    const etat = await actions.importerReprise(formulaire(await depotXlsx(etudiants), signature!));

    expect(reussi(etat)).toMatchObject({ etudiantsCrees: 3 });
  });
});
