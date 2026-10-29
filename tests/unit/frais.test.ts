import { describe, expect, it } from "vitest";
import {
  controleAnneeFrais,
  controleModificationFrais,
  controleMoisFrais,
  controleSuppressionFrais,
  moisDeLAnnee,
  moisPossiblesFrais,
  phraseRecapitulatifFrais,
  schemaApercuFrais,
  schemaCreationFrais,
  schemaModificationFrais,
  schemaSuppressionFrais,
  STATUTS_SANS_NOUVEAU_FRAIS,
} from "@/lib/frais";

const ANNEE = { anneeDebut: 2026, moisDebutEcolage: 10, libelle: "2026-2027" };
const CLASSES = [{ filiereId: "fil-if", niveau: 1 }];
const BASE = { anneeScolaireId: "annee-1", montant: 15_000, mois: "2027-03", classes: CLASSES };
const messages = (r: { success: boolean; error?: { issues: { message: string }[] } }) => (r.success ? [] : r.error!.issues.map((i) => i.message));

describe("moisDeLAnnee, moisPossiblesFrais", () => {
  it("dix mois, d'octobre à juillet, en traversant l'année civile", () => {
    const m = moisDeLAnnee(ANNEE);
    expect(m).toHaveLength(10);
    expect(m[0]).toBe("2026-10-01");
    expect(m[9]).toBe("2027-07-01");
  });

  it("propose le mois en cours et les mois à venir seulement", () => {
    expect(moisPossiblesFrais(ANNEE, "2027-03-15").map((m) => m.valeur)).toEqual(["2027-03-01", "2027-04-01", "2027-05-01", "2027-06-01", "2027-07-01"]);
    expect(moisPossiblesFrais(ANNEE, "2027-03-15")[0].libelle).toBe("Mars 2027");
  });

  it("avant la rentrée : toute l'année ; après juillet : rien", () => {
    expect(moisPossiblesFrais(ANNEE, "2026-08-10")).toHaveLength(10);
    expect(moisPossiblesFrais(ANNEE, "2027-08-10")).toEqual([]);
  });
});

describe("controleMoisFrais", () => {
  it("accepte le mois en cours et un mois à venir de l'année", () => {
    expect(controleMoisFrais("2027-03-01", ANNEE, "2027-03-31")).toBeNull();
    expect(controleMoisFrais("2027-07-01", ANNEE, "2027-03-31")).toBeNull();
  });

  it("refuse un mois passé", () => {
    expect(controleMoisFrais("2027-02-01", ANNEE, "2027-03-01")).toMatch(/déjà passé/);
    expect(controleMoisFrais("2026-10-01", ANNEE, "2027-03-01")).toMatch(/déjà passé/);
  });

  it("refuse août et tout mois hors de l'année, avec les bornes de l'année", () => {
    for (const mois of ["2027-08-01", "2026-09-01", "2028-03-01"]) {
      expect(controleMoisFrais(mois, ANNEE, "2026-10-01"), mois).toBe("Choisissez un mois de l'année 2026-2027, de octobre à juillet.");
    }
  });
});

describe("contrôles de l'année et du verrouillage", () => {
  it("une année clôturée refuse tout", () => {
    expect(controleAnneeFrais({ libelle: "2025-2026", cloturee: true })).toMatch(/2025-2026 est clôturée/);
    expect(controleAnneeFrais({ libelle: "2026-2027", cloturee: false })).toBeNull();
  });

  it("après un paiement, même annulé : montant ou mois refusés, libellé seul accepté", () => {
    expect(controleModificationFrais({ lignesPaiement: 1, montantOuMoisChange: true })).toMatch(/seul son libellé peut encore changer/);
    expect(controleModificationFrais({ lignesPaiement: 1, montantOuMoisChange: false })).toBeNull();
    expect(controleModificationFrais({ lignesPaiement: 0, montantOuMoisChange: true })).toBeNull();
  });

  it("la suppression est refusée dès une ligne de paiement, même annulée", () => {
    expect(controleSuppressionFrais(0)).toBeNull();
    expect(controleSuppressionFrais(1)).toMatch(/ne peut plus être supprimé/);
  });
});

describe("phraseRecapitulatifFrais", () => {
  it("pluriel : « 42 étudiants recevront 15 000 Ar, exigibles en mars 2027. »", () => {
    expect(phraseRecapitulatifFrais({ nombre: 42, montant: 15_000, mois: "2027-03-01" }).replace(/\s/g, " ")).toMatch(
      /^42 étudiants recevront 15.000.Ar, exigibles en mars 2027\.$/,
    );
  });

  it("singulier : « 1 étudiant recevra »", () => {
    expect(phraseRecapitulatifFrais({ nombre: 1, montant: 5_000, mois: "2027-05-01" })).toMatch(/^1 étudiant recevra 5.000.Ar, exigibles en mai 2027\.$/);
  });

  it("zéro étudiant : annonce que les inscrits plus tard le recevront", () => {
    expect(phraseRecapitulatifFrais({ nombre: 0, montant: 15_000, mois: "2027-03-01" })).toMatch(/^Aucun étudiant .* ceux inscrits plus tard recevront/);
  });
});

describe("schémas des actions frais", () => {
  it("création : libellé nettoyé, mois « 2027-03 » complété en « 2027-03-01 »", () => {
    const r = schemaCreationFrais.safeParse({ ...BASE, libelle: "  Frais d'examen " });
    expect(r.success && r.data).toMatchObject({ libelle: "Frais d'examen", mois: "2027-03-01", montant: 15_000 });
    expect(schemaCreationFrais.safeParse({ ...BASE, mois: "2027-03-01", libelle: "Stage" }).success).toBe(true);
  });

  it("refuse un libellé vide, trop court ou trop long", () => {
    for (const libelle of ["", " ", "x", "x".repeat(81)]) expect(schemaCreationFrais.safeParse({ ...BASE, libelle }).success, libelle).toBe(false);
  });

  it("refuse un mois mal formé ou inexistant", () => {
    for (const mois of ["", "mars", "2027-3", "2027-13", "2027-03-15", "2027-02-30"]) {
      expect(schemaApercuFrais.safeParse({ ...BASE, mois }).success, mois).toBe(false);
    }
  });

  it("refuse un montant nul, négatif ou décimal", () => {
    for (const montant of [0, -1, 1_000.5]) expect(schemaApercuFrais.safeParse({ ...BASE, montant }).success, String(montant)).toBe(false);
  });

  it("exige au moins une classe, sans doublon, niveau valide", () => {
    expect(messages(schemaApercuFrais.safeParse({ ...BASE, classes: [] }))).toContain("Choisissez au moins une classe.");
    expect(messages(schemaApercuFrais.safeParse({ ...BASE, classes: [...CLASSES, ...CLASSES] }))).toContain("Une classe est choisie deux fois.");
    expect(schemaApercuFrais.safeParse({ ...BASE, classes: [{ filiereId: "f", niveau: 0 }] }).success).toBe(false);
    expect(schemaApercuFrais.safeParse({ ...BASE, classes: [{ filiereId: "", niveau: 1 }] }).success).toBe(false);
  });

  it("modification : libellé, montant et mois, sans les classes ; suppression : un identifiant", () => {
    expect(schemaModificationFrais.safeParse({ id: "f1", libelle: "Stage", montant: 10_000, mois: "2027-04" }).success).toBe(true);
    expect(schemaModificationFrais.safeParse({ id: "", libelle: "Stage", montant: 10_000, mois: "2027-04" }).success).toBe(false);
    expect(schemaSuppressionFrais.safeParse({ id: "f1" }).success).toBe(true);
    expect(schemaSuppressionFrais.safeParse({}).success).toBe(false);
  });
});

describe("étudiants sortis", () => {
  it("un nouveau frais ne s'applique ni aux abandons, ni aux exclus, ni aux diplômés", () => {
    expect([...STATUTS_SANS_NOUVEAU_FRAIS].sort()).toEqual(["ABANDON", "DIPLOME", "EXCLU"]);
  });
});
