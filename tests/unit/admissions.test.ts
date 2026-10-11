import { describe, expect, it } from "vitest";
import type { DecisionAdmission } from "@/generated/prisma/enums";
import {
  anneesDuPassage,
  compterDecisions,
  controleAnnulation,
  creeInscription,
  decisionsPossibles,
  estDerniereAnnee,
  etatClasse,
  libelleDecision,
  listerNoms,
  MESSAGE_CLASSE_CHANGEE,
  planifierPassage,
  planifierRestauration,
  resumeDecisions,
  schemaValidationClasse,
  statutEtudiantApres,
  type AnneePassage,
  type ContexteAnnulation,
  type ContextePassage,
  type InscriptionClasse,
  type LigneAnnulation,
  type LigneRestauration,
} from "@/lib/admissions";
import { dateDuJour } from "@/lib/dates";
import { genererEcheances } from "@/lib/ecolage";

const TARIF_1 = { droitsInscription: 100_000, montantMensuel: 80_000, nombreMois: 10 };
const TARIF_2 = { droitsInscription: 125_000, montantMensuel: 90_000, nombreMois: 10 };

const SOURCE = { libelle: "2026-2027", anneeDebut: 2026, cloturee: false };
const CIBLE = { libelle: "2027-2028", anneeDebut: 2027, moisDebutEcolage: 10, cloturee: false };
const FILIERE = { nom: "Infirmier(e)s", dureeAnnees: 3 };
const JOUR = "2027-07-20";

function etu(n: number, surcharge: Partial<InscriptionClasse> = {}): InscriptionClasse {
  return {
    inscriptionId: `ins${n}`,
    etudiantId: `etu${n}`,
    nom: `NOM${n}`,
    prenoms: `Prénom${n}`,
    droitsEnTranches: 1,
    statutInscription: "EN_COURS",
    statutEtudiant: "ACTIF",
    dateSortie: null,
    motifSortie: null,
    ...surcharge,
  };
}

/** `decisions` : numéro d'étudiant vers décision. */
function contexte(
  inscriptions: InscriptionClasse[],
  decisions: Record<number, DecisionAdmission>,
  surcharge: Partial<ContextePassage> = {},
): ContextePassage {
  return {
    jour: JOUR,
    anneeSource: SOURCE,
    anneeCible: CIBLE,
    filiere: FILIERE,
    niveau: 1,
    inscriptions,
    decisions: Object.entries(decisions).map(([n, decision]) => ({ inscriptionId: `ins${n}`, decision })),
    tarifs: { niveauSuivant: TARIF_2, memeNiveau: TARIF_1 },
    ...surcharge,
  };
}

function plan(c: ContextePassage) {
  const r = planifierPassage(c);
  if (!r.ok) throw new Error(`Passage refusé : ${r.erreur}`);
  return r.plan;
}

function refus(c: ContextePassage) {
  const r = planifierPassage(c);
  if (r.ok) throw new Error("Refus attendu");
  return r;
}

describe("planifierPassage : décisions", () => {
  it("admis : niveau +1, sans redoublement, montants du tarif du niveau suivant de l'année cible", () => {
    const p = plan(contexte([etu(1)], { 1: "ADMIS" }));

    expect(p.inscriptions).toHaveLength(1);
    expect(p.inscriptions[0]).toMatchObject({ etudiantId: "etu1", inscriptionSourceId: "ins1", niveau: 2, redoublement: false });
    const { echeances } = p.inscriptions[0];
    expect(echeances).toHaveLength(11);
    expect(echeances[0]).toMatchObject({ type: "DROITS", tranche: 1, montantDu: 125_000 });
    expect(echeances[0].mois).toEqual(new Date(Date.UTC(2027, 9, 1)));
    expect(echeances.filter((e) => e.type === "MENSUALITE").every((e) => e.montantDu === 90_000)).toBe(true);
    expect(echeances.at(-1)?.mois).toEqual(new Date(Date.UTC(2028, 6, 1)));
    expect(p.inscriptionsSource).toEqual([{ id: "ins1", statut: "ADMIS" }]);
    expect(p.etudiants).toEqual([]);
  });

  it("redoublant : même niveau, redoublement=true, montants du tarif du même niveau, étudiant resté actif", () => {
    const p = plan(contexte([etu(1)], { 1: "REDOUBLANT" }));

    expect(p.inscriptions[0]).toMatchObject({ niveau: 1, redoublement: true });
    expect(p.inscriptions[0].echeances[0].montantDu).toBe(100_000);
    expect(p.inscriptions[0].echeances[1].montantDu).toBe(80_000);
    expect(p.inscriptionsSource).toEqual([{ id: "ins1", statut: "REDOUBLE" }]);
    expect(p.etudiants).toEqual([]);
  });

  it("reprend les tranches de droits de l'inscription source, avec l'arrondi du tarif cible", () => {
    const p = plan(contexte([etu(1, { droitsEnTranches: 3 }), etu(2, { droitsEnTranches: 2 })], { 1: "ADMIS", 2: "REDOUBLANT" }));

    const [admis, redoublant] = p.inscriptions;
    expect(admis.droitsEnTranches).toBe(3);
    expect(admis.echeances.filter((e) => e.type === "DROITS").map((e) => e.montantDu)).toEqual([43_000, 41_000, 41_000]);
    expect(redoublant.droitsEnTranches).toBe(2);
    expect(redoublant.echeances.filter((e) => e.type === "DROITS").map((e) => e.montantDu)).toEqual([50_000, 50_000]);
    expect(admis.echeances).toEqual(genererEcheances(TARIF_2, CIBLE, 3));
  });

  it("suit le mois de début d'écolage de l'année cible", () => {
    const p = plan(contexte([etu(1)], { 1: "ADMIS" }, { anneeCible: { ...CIBLE, moisDebutEcolage: 9 } }));
    expect(p.inscriptions[0].echeances[0].mois).toEqual(new Date(Date.UTC(2027, 8, 1)));
    expect(p.inscriptions[0].echeances.at(-1)?.mois).toEqual(new Date(Date.UTC(2028, 5, 1)));
  });

  it("diplômé en dernière année : aucune inscription cible, étudiant sorti le jour du passage, sans motif", () => {
    const p = plan(contexte([etu(1)], { 1: "DIPLOME" }, { niveau: 3, tarifs: { niveauSuivant: null, memeNiveau: null } }));

    expect(p.inscriptions).toEqual([]);
    expect(p.inscriptionsSource).toEqual([{ id: "ins1", statut: "DIPLOME" }]);
    expect(p.etudiants).toEqual([{ id: "etu1", statut: "DIPLOME", dateSortie: dateDuJour(JOUR), motifSortie: null }]);
  });

  it("abandon : aucune inscription cible, étudiant sorti avec la date du jour et un motif nommant l'année cible", () => {
    const p = plan(contexte([etu(1)], { 1: "ABANDON" }));

    expect(p.inscriptions).toEqual([]);
    expect(p.inscriptionsSource).toEqual([{ id: "ins1", statut: "ABANDON" }]);
    expect(p.etudiants).toHaveLength(1);
    expect(p.etudiants[0]).toMatchObject({ id: "etu1", statut: "ABANDON", dateSortie: dateDuJour(JOUR) });
    expect(p.etudiants[0].motifSortie).toMatch(/^Ne poursuit pas en 2027-2028/);
    expect(p.etudiants[0].motifSortie).toContain("20/07/2027");
  });

  it("une ligne par étudiant garde l'état d'avant, y compris une ancienne date et un ancien motif de sortie", () => {
    const ancienne = new Date(Date.UTC(2026, 0, 5));
    const p = plan(contexte([etu(1, { dateSortie: ancienne, motifSortie: "ancien motif" }), etu(2)], { 1: "ABANDON", 2: "ADMIS" }));

    expect(p.lignes).toEqual([
      {
        etudiantId: "etu1",
        decision: "ABANDON",
        inscriptionSourceId: "ins1",
        ancienStatutInscription: "EN_COURS",
        ancienStatutEtudiant: "ACTIF",
        ancienneDateSortie: ancienne,
        ancienMotifSortie: "ancien motif",
      },
      {
        etudiantId: "etu2",
        decision: "ADMIS",
        inscriptionSourceId: "ins2",
        ancienStatutInscription: "EN_COURS",
        ancienStatutEtudiant: "ACTIF",
        ancienneDateSortie: null,
        ancienMotifSortie: null,
      },
    ]);
    expect(p.comptes).toEqual({ admis: 1, redoublants: 0, diplomes: 0, abandons: 1 });
  });

  it("classe mêlée : chaque décision produit son effet, un seul plan", () => {
    const p = plan(contexte([etu(1), etu(2), etu(3)], { 1: "ADMIS", 2: "REDOUBLANT", 3: "ABANDON" }));

    expect(p.inscriptions.map((i) => [i.etudiantId, i.niveau, i.redoublement])).toEqual([
      ["etu1", 2, false],
      ["etu2", 1, true],
    ]);
    expect(p.inscriptionsSource.map((s) => s.statut)).toEqual(["ADMIS", "REDOUBLE", "ABANDON"]);
    expect(p.etudiants.map((e) => e.id)).toEqual(["etu3"]);
  });
});

describe("planifierPassage : refus", () => {
  it("décision manquante pour un étudiant de la classe : liste changée", () => {
    const r = refus(contexte([etu(1), etu(2)], { 1: "ADMIS" }));
    expect(r).toEqual({ ok: false, erreur: MESSAGE_CLASSE_CHANGEE, raison: "classe_changee" });
  });

  it("décision pour un étudiant qui n'est plus dans la classe : liste changée", () => {
    expect(refus(contexte([etu(1)], { 1: "ADMIS", 2: "ADMIS" })).raison).toBe("classe_changee");
    expect(refus(contexte([etu(1)], { 2: "ADMIS" })).raison).toBe("classe_changee");
  });

  it("étudiant sorti ou inscription non en cours : exclu de la liste attendue, donc le décider est refusé", () => {
    const sorti = etu(2, { statutEtudiant: "ABANDON" });
    const deja = etu(3, { statutInscription: "ADMIS" });

    expect(plan(contexte([etu(1), sorti, deja], { 1: "ADMIS" })).inscriptions).toHaveLength(1);
    expect(refus(contexte([etu(1), sorti], { 1: "ADMIS", 2: "ADMIS" })).raison).toBe("classe_changee");
    expect(refus(contexte([etu(1), deja], { 1: "ADMIS", 3: "ADMIS" })).raison).toBe("classe_changee");
  });

  it("admis en dernière année : refusé en nommant l'étudiant et la durée de la filière", () => {
    const r = refus(contexte([etu(1), etu(2)], { 1: "ADMIS", 2: "DIPLOME" }, { niveau: 3 }));
    expect(r.erreur).toMatch(/NOM1 Prénom1 : la filière Infirmier\(e\)s dure 3 ans, pas de 4e année/);
    expect(r.raison).toBeUndefined();
  });

  it("diplômé hors dernière année : refusé en nommant l'étudiant", () => {
    const r = refus(contexte([etu(1)], { 1: "DIPLOME" }, { niveau: 2 }));
    expect(r.erreur).toMatch(/NOM1 Prénom1 : le diplôme se décide en 3e année/);
  });

  it("tarif du niveau suivant manquant dans l'année cible : refusé avec la classe et l'année", () => {
    const r = refus(contexte([etu(1)], { 1: "ADMIS" }, { tarifs: { niveauSuivant: null, memeNiveau: TARIF_1 } }));
    expect(r.erreur).toMatch(/Tarif manquant pour Infirmier\(e\)s 2e année en 2027-2028/);
  });

  it("tarif du même niveau manquant : bloque seulement s'il y a un redoublant, en le nommant", () => {
    const sansMemeNiveau = { niveauSuivant: TARIF_2, memeNiveau: null };

    expect(plan(contexte([etu(1), etu(2)], { 1: "ADMIS", 2: "ABANDON" }, { tarifs: sansMemeNiveau })).inscriptions).toHaveLength(1);
    const r = refus(contexte([etu(1), etu(2)], { 1: "ADMIS", 2: "REDOUBLANT" }, { tarifs: sansMemeNiveau }));
    expect(r.erreur).toMatch(/Tarif manquant pour Infirmier\(e\)s 1re année en 2027-2028.*redoublants \(NOM2 Prénom2\)/);
  });

  it("tarif du niveau suivant sans importance quand personne ne passe", () => {
    const p = plan(contexte([etu(1), etu(2)], { 1: "REDOUBLANT", 2: "ABANDON" }, { tarifs: { niveauSuivant: null, memeNiveau: TARIF_1 } }));
    expect(p.inscriptions).toHaveLength(1);
  });

  it("dernière année : diplômés et abandons passent sans aucun tarif", () => {
    const p = plan(contexte([etu(1), etu(2)], { 1: "DIPLOME", 2: "ABANDON" }, { niveau: 3, tarifs: { niveauSuivant: null, memeNiveau: null } }));
    expect(p.etudiants.map((e) => e.statut)).toEqual(["DIPLOME", "ABANDON"]);
  });

  it("année cible absente, clôturée ou année source clôturée : refus nommé", () => {
    expect(refus(contexte([etu(1)], { 1: "ADMIS" }, { anneeCible: null })).erreur).toMatch(/2027-2028 n'existe pas encore/);
    expect(refus(contexte([etu(1)], { 1: "ADMIS" }, { anneeCible: { ...CIBLE, cloturee: true } })).erreur).toMatch(/2027-2028 est clôturée/);
    expect(refus(contexte([etu(1)], { 1: "ADMIS" }, { anneeSource: { ...SOURCE, cloturee: true } })).erreur).toMatch(/2026-2027 est clôturée/);
  });

  it("année cible qui ne suit pas l'année source : erreur de programmation", () => {
    expect(() => planifierPassage(contexte([etu(1)], { 1: "ADMIS" }, { anneeCible: { ...CIBLE, anneeDebut: 2029 } }))).toThrow(RangeError);
  });

  it("droits trop faibles pour les tranches reprises : refus nommant l'étudiant", () => {
    const tarifPetit = { droitsInscription: 2_000, montantMensuel: 80_000, nombreMois: 10 };
    const r = refus(contexte([etu(1, { droitsEnTranches: 3 })], { 1: "ADMIS" }, { tarifs: { niveauSuivant: tarifPetit, memeNiveau: TARIF_1 } }));
    expect(r.erreur).toMatch(/NOM1 Prénom1 : Les droits d'inscription .* trop faibles pour être payés en 3 fois/);
  });

  it("liste de noms tronquée au-delà de 5", () => {
    const etudiants = Array.from({ length: 7 }, (_, k) => etu(k + 1));
    const decisions = Object.fromEntries(etudiants.map((_, k) => [k + 1, "DIPLOME" as const]));
    const r = refus(contexte(etudiants, decisions, { niveau: 1 }));
    expect(r.erreur).toMatch(/NOM5 Prénom5 et 2 autres :/);
  });
});

const annee = (anneeDebut: number, surcharge: Partial<AnneePassage> = {}): AnneePassage => ({
  id: `a${anneeDebut}`,
  libelle: `${anneeDebut}-${anneeDebut + 1}`,
  anneeDebut,
  moisDebutEcolage: 10,
  estCourante: false,
  cloturee: false,
  ...surcharge,
});

const enCours = (...paires: [number, number][]) => new Map(paires.map(([a, n]) => [`a${a}`, n]));

describe("anneesDuPassage", () => {
  it("sans année courante : aucune source, refus", () => {
    const r = anneesDuPassage([annee(2026)], enCours());
    expect(r).toMatchObject({ source: null, cible: null, libelleCible: null });
    expect(r.refus).toMatch(/Aucune année scolaire courante/);
  });

  it("source = année courante, cible = l'année suivante quand elle existe", () => {
    const r = anneesDuPassage([annee(2026, { estCourante: true }), annee(2027)], enCours([2026, 12]));
    expect(r.source?.anneeDebut).toBe(2026);
    expect(r.cible?.anneeDebut).toBe(2027);
    expect(r.libelleCible).toBe("2027-2028");
    expect(r.refus).toBeNull();
  });

  it("cible absente : libellé quand même annoncé, cible jamais créée, refus", () => {
    const r = anneesDuPassage([annee(2026, { estCourante: true })], enCours([2026, 3]));
    expect(r.cible).toBeNull();
    expect(r.libelleCible).toBe("2027-2028");
    expect(r.refus).toMatch(/2027-2028 n'existe pas encore/);
  });

  it("cible clôturée : refus", () => {
    const r = anneesDuPassage([annee(2026, { estCourante: true }), annee(2027, { cloturee: true })], enCours([2026, 3]));
    expect(r.refus).toMatch(/2027-2028 est clôturée/);
  });

  it("année courante clôturée : refus", () => {
    const r = anneesDuPassage([annee(2026, { estCourante: true, cloturee: true }), annee(2027)], enCours());
    expect(r.refus).toMatch(/2026-2027 est clôturée/);
  });

  it("la plus ancienne année non clôturée qui a encore des inscriptions en cours passe avant la courante", () => {
    const annees = [annee(2025), annee(2026, { estCourante: true }), annee(2027)];

    const r = anneesDuPassage(annees, enCours([2025, 2], [2026, 40]));

    expect(r.source?.anneeDebut).toBe(2025);
    expect(r.cible?.anneeDebut).toBe(2026);
    expect(r.refus).toBeNull();
  });

  it("une ancienne année sans inscription en cours, clôturée ou postérieure à la courante n'est pas source", () => {
    const annees = [annee(2024, { cloturee: true }), annee(2025), annee(2026, { estCourante: true }), annee(2027)];

    expect(anneesDuPassage(annees, enCours([2024, 5], [2025, 0], [2026, 10], [2027, 8])).source?.anneeDebut).toBe(2026);
  });
});

describe("etatClasse", () => {
  const base = { effectif: 10, operationActive: false, cibleDisponible: true, tarifRequisPresent: true };

  it("classe à faire quand tout est prêt", () => {
    expect(etatClasse(base)).toBe("a_faire");
  });

  it("classe vide : « vide » sans opération, « validée » avec une opération, quel que soit le reste", () => {
    expect(etatClasse({ ...base, effectif: 0 })).toBe("vide");
    expect(etatClasse({ ...base, effectif: 0, operationActive: true })).toBe("validee");
    expect(etatClasse({ ...base, effectif: 0, cibleDisponible: false, tarifRequisPresent: false })).toBe("vide");
  });

  it("année cible indisponible prime sur le tarif manquant", () => {
    expect(etatClasse({ ...base, cibleDisponible: false, tarifRequisPresent: false })).toBe("cible_absente");
  });

  it("tarif manquant bloque une classe non vide", () => {
    expect(etatClasse({ ...base, tarifRequisPresent: false })).toBe("tarif_manquant");
  });

  it("passage complémentaire : une classe déjà validée avec un nouvel inscrit redevient « à faire »", () => {
    expect(etatClasse({ ...base, operationActive: true, effectif: 1 })).toBe("a_faire");
  });
});

describe("décisions possibles et libellés", () => {
  it("la décision par défaut vient en tête : Passe en N+1, ou Diplômé(e) en dernière année", () => {
    expect(decisionsPossibles(1, 3)).toEqual(["ADMIS", "REDOUBLANT", "ABANDON"]);
    expect(decisionsPossibles(3, 3)).toEqual(["DIPLOME", "REDOUBLANT", "ABANDON"]);
    expect(decisionsPossibles(4, 3)[0]).toBe("DIPLOME");
    expect(estDerniereAnnee(2, 3)).toBe(false);
    expect(estDerniereAnnee(3, 3)).toBe(true);
  });

  it("libellés", () => {
    expect(libelleDecision("ADMIS", 1)).toBe("Passe en 2e année");
    expect(libelleDecision("DIPLOME", 3)).toBe("Diplômé(e)");
    expect(libelleDecision("REDOUBLANT", 2)).toBe("Redouble");
    expect(libelleDecision("ABANDON", 2)).toBe("Abandon");
  });

  it("seuls admis et redoublants créent une inscription ; seuls diplômés et abandons changent le statut de l'étudiant", () => {
    expect(creeInscription("ADMIS")).toBe(true);
    expect(creeInscription("REDOUBLANT")).toBe(true);
    expect(creeInscription("DIPLOME")).toBe(false);
    expect(creeInscription("ABANDON")).toBe(false);
    expect(statutEtudiantApres("ADMIS")).toBeNull();
    expect(statutEtudiantApres("REDOUBLANT")).toBeNull();
    expect(statutEtudiantApres("DIPLOME")).toBe("DIPLOME");
    expect(statutEtudiantApres("ABANDON")).toBe("ABANDON");
  });

  it("résumé de la barre : décisions absentes omises, accords au singulier et au pluriel", () => {
    expect(resumeDecisions({ admis: 40, redoublants: 1, diplomes: 0, abandons: 1 }, 1)).toBe(
      "40 passent en 2e année · 1 redouble · 1 abandon",
    );
    expect(resumeDecisions({ admis: 1, redoublants: 2, diplomes: 0, abandons: 3 }, 2)).toBe(
      "1 passe en 3e année · 2 redoublent · 3 abandons",
    );
    expect(resumeDecisions({ admis: 0, redoublants: 0, diplomes: 2, abandons: 0 }, 3)).toBe("2 diplômé(e)s");
    expect(compterDecisions([{ decision: "ADMIS" }, { decision: "ADMIS" }, { decision: "DIPLOME" }, { decision: "ABANDON" }])).toEqual({
      admis: 2,
      redoublants: 0,
      diplomes: 1,
      abandons: 1,
    });
  });

  it("listerNoms : tronque à 5 noms", () => {
    const noms = ["A", "B", "C", "D", "E", "F", "G"];
    expect(listerNoms(noms.slice(0, 5))).toBe("A, B, C, D, E");
    expect(listerNoms(noms.slice(0, 6))).toBe("A, B, C, D, E et 1 autre");
    expect(listerNoms(noms)).toBe("A, B, C, D, E et 2 autres");
    expect(listerNoms(noms, 2)).toBe("A, B et 5 autres");
  });
});

describe("schemaValidationClasse", () => {
  const valide = {
    anneeSourceId: "a1",
    filiereId: "f1",
    niveau: 1,
    decisions: [{ inscriptionId: "i1", decision: "ADMIS" as const }],
  };

  it("accepte une entrée complète", () => {
    expect(schemaValidationClasse.safeParse(valide).success).toBe(true);
  });

  it.each([
    ["aucune décision", { ...valide, decisions: [] }],
    ["décision inconnue", { ...valide, decisions: [{ inscriptionId: "i1", decision: "EXCLU" }] }],
    ["étudiant dupliqué", { ...valide, decisions: [valide.decisions[0], { inscriptionId: "i1", decision: "ABANDON" }] }],
    ["niveau 0", { ...valide, niveau: 0 }],
    ["niveau décimal", { ...valide, niveau: 1.5 }],
    ["niveau en texte", { ...valide, niveau: "1" }],
    ["année vide", { ...valide, anneeSourceId: "" }],
    ["filière absente", { ...valide, filiereId: undefined }],
    ["identifiant trop long", { ...valide, filiereId: "x".repeat(41) }],
    ["plus de 1000 étudiants", { ...valide, decisions: Array.from({ length: 1001 }, (_, k) => ({ inscriptionId: `i${k}`, decision: "ADMIS" })) }],
  ])("refuse : %s", (_nom, entree) => {
    expect(schemaValidationClasse.safeParse(entree).success).toBe(false);
  });
});

function ligne(n: number, surcharge: Partial<LigneAnnulation> = {}): LigneAnnulation {
  return {
    etudiantId: `etu${n}`,
    nom: `NOM${n}`,
    prenoms: `Prénom${n}`,
    decision: "ADMIS",
    ancienStatutEtudiant: "ACTIF",
    inscriptionCibleId: `cib${n}`,
    statutEtudiantActuel: "ACTIF",
    statutInscriptionSourceActuel: "ADMIS",
    statutInscriptionCibleActuel: "EN_COURS",
    ...surcharge,
  };
}

function annulation(lignes: LigneAnnulation[], surcharge: Partial<ContexteAnnulation> = {}): ContexteAnnulation {
  return { annulee: false, lignes, recus: [], ciblesReprises: new Set(), ...surcharge };
}

describe("controleAnnulation", () => {
  it("autorise un passage dont l'état n'a pas bougé, toutes décisions confondues", () => {
    const lignes = [
      ligne(1),
      ligne(2, { decision: "REDOUBLANT", statutInscriptionSourceActuel: "REDOUBLE" }),
      ligne(3, { decision: "ABANDON", inscriptionCibleId: null, statutEtudiantActuel: "ABANDON", statutInscriptionSourceActuel: "ABANDON", statutInscriptionCibleActuel: null }),
      ligne(4, { decision: "DIPLOME", inscriptionCibleId: null, statutEtudiantActuel: "DIPLOME", statutInscriptionSourceActuel: "DIPLOME", statutInscriptionCibleActuel: null }),
    ];
    expect(controleAnnulation(annulation(lignes))).toBeNull();
  });

  it("déjà annulé", () => {
    expect(controleAnnulation(annulation([ligne(1)], { annulee: true }))).toBe("Ce passage est déjà annulé.");
  });

  it("paiement sur une inscription créée : bloqué, reçus listés, blocage dit définitif (annulés compris)", () => {
    const message = controleAnnulation(annulation([ligne(1)], { recus: ["R-2026-00003", "R-2026-00009"] }));
    expect(message).toMatch(/R-2026-00003, R-2026-00009/);
    expect(message).toMatch(/même s'il est annulé/);
    expect(message).toMatch(/définitif/);
  });

  it("passage suivant déjà validé : bloqué, étudiant nommé", () => {
    const message = controleAnnulation(annulation([ligne(1), ligne(2)], { ciblesReprises: new Set(["cib2"]) }));
    expect(message).toMatch(/passage suivant a déjà été validé pour NOM2 Prénom2/);
  });

  it("ordre des raisons : déjà annulé, puis reçus, puis passage suivant, puis dérive", () => {
    const derive = ligne(1, { statutEtudiantActuel: "ABANDON" });
    const tout = { recus: ["R-1"], ciblesReprises: new Set(["cib1"]) };
    expect(controleAnnulation(annulation([derive], { ...tout, annulee: true }))).toMatch(/déjà annulé/);
    expect(controleAnnulation(annulation([derive], tout))).toMatch(/paiements ont été enregistrés/);
    expect(controleAnnulation(annulation([derive], { ciblesReprises: new Set(["cib1"]) }))).toMatch(/passage suivant/);
    expect(controleAnnulation(annulation([derive]))).toMatch(/NOM1 Prénom1 a changé/);
  });

  it.each([
    ["admis sorti depuis", ligne(1, { statutEtudiantActuel: "ABANDON" })],
    ["admis redevenu diplômé", ligne(1, { statutEtudiantActuel: "DIPLOME" })],
    ["inscription source modifiée", ligne(1, { statutInscriptionSourceActuel: "EN_COURS" })],
    ["inscription source introuvable", ligne(1, { statutInscriptionSourceActuel: null })],
    ["inscription cible sortie", ligne(1, { statutInscriptionCibleActuel: "ABANDON" })],
    ["inscription cible déjà passée", ligne(1, { statutInscriptionCibleActuel: "ADMIS" })],
    ["inscription cible introuvable", ligne(1, { statutInscriptionCibleActuel: null })],
    ["abandon redevenu actif", ligne(1, { decision: "ABANDON", inscriptionCibleId: null, statutEtudiantActuel: "ACTIF", statutInscriptionSourceActuel: "ABANDON", statutInscriptionCibleActuel: null })],
    ["diplômé réactivé", ligne(1, { decision: "DIPLOME", inscriptionCibleId: null, statutEtudiantActuel: "ACTIF", statutInscriptionSourceActuel: "DIPLOME", statutInscriptionCibleActuel: null })],
  ])("situation dérivée : %s", (_nom, l) => {
    expect(controleAnnulation(annulation([l]))).toMatch(/a changé depuis ce passage/);
  });
});

describe("planifierRestauration", () => {
  const ancienne = new Date(Date.UTC(2026, 0, 5));
  const lignes: LigneRestauration[] = [
    { etudiantId: "e1", decision: "ADMIS", inscriptionSourceId: "s1", inscriptionCibleId: "c1", ancienStatutInscription: "EN_COURS", ancienStatutEtudiant: "ACTIF", ancienneDateSortie: null, ancienMotifSortie: null },
    { etudiantId: "e2", decision: "REDOUBLANT", inscriptionSourceId: "s2", inscriptionCibleId: "c2", ancienStatutInscription: "EN_COURS", ancienStatutEtudiant: "ACTIF", ancienneDateSortie: null, ancienMotifSortie: null },
    { etudiantId: "e3", decision: "ABANDON", inscriptionSourceId: "s3", inscriptionCibleId: null, ancienStatutInscription: "EN_COURS", ancienStatutEtudiant: "ACTIF", ancienneDateSortie: ancienne, ancienMotifSortie: "ancien" },
    { etudiantId: "e4", decision: "DIPLOME", inscriptionSourceId: "s4", inscriptionCibleId: null, ancienStatutInscription: "EN_COURS", ancienStatutEtudiant: "ACTIF", ancienneDateSortie: null, ancienMotifSortie: null },
  ];

  it("supprime les inscriptions créées et remet les statuts d'avant", () => {
    const p = planifierRestauration(lignes);

    expect(p.inscriptionsASupprimer).toEqual(["c1", "c2"]);
    expect(p.inscriptionsSource).toEqual([
      { id: "s1", statut: "EN_COURS" },
      { id: "s2", statut: "EN_COURS" },
      { id: "s3", statut: "EN_COURS" },
      { id: "s4", statut: "EN_COURS" },
    ]);
  });

  it("ne touche aux étudiants que pour les diplômés et abandons, avec leur ancienne date et leur ancien motif", () => {
    const p = planifierRestauration(lignes);

    expect(p.etudiants).toEqual([
      { id: "e3", statut: "ACTIF", dateSortie: ancienne, motifSortie: "ancien" },
      { id: "e4", statut: "ACTIF", dateSortie: null, motifSortie: null },
    ]);
  });
});
