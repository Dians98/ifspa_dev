import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  controleActionUtilisateur,
  controleCloture,
  controleDefinirCourante,
  controleLignesTarifs,
  controleModificationFiliere,
  controleReouverture,
  controleSuppressionAnnee,
  controleSuppressionFiliere,
  datesAnnee,
  etatAnnee,
  grilleTarifs,
  jourISO,
  libelleAnnee,
  libelleNiveau,
  NOMBRE_MOIS_MAX,
  periodeAnnee,
  schemaActivationFiliere,
  schemaAnnee,
  schemaChangementRole,
  schemaFiliere,
  schemaIdentifiant,
  schemaLigneTarif,
  schemaModificationFiliere,
  schemaNouvelUtilisateur,
  schemaTarifs,
  schemaUtilisateurCible,
  totalAnnuel,
  type ContexteActionUtilisateur,
  type FiliereGrille,
} from "@/lib/parametres";

const jour = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("années scolaires : dates et libellés", () => {
  it("2026 avec début en octobre couvre du 2026-10-01 au 2027-07-31", () => {
    const { dateDebut, dateFin } = datesAnnee(2026, 10);
    expect(jourISO(dateDebut)).toBe("2026-10-01");
    expect(jourISO(dateFin)).toBe("2027-07-31");
  });

  it("couvre 10 mois quel que soit le mois de début, avec passage d'année", () => {
    expect([9, 10, 11].map((m) => Object.values(datesAnnee(2026, m)).map(jourISO))).toEqual([
      ["2026-09-01", "2027-06-30"],
      ["2026-10-01", "2027-07-31"],
      ["2026-11-01", "2027-08-31"],
    ]);
  });

  it("place les dates à minuit UTC, comme une colonne @db.Date", () => {
    const { dateDebut, dateFin } = datesAnnee(2026, 10);
    expect(dateDebut.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(dateFin.toISOString()).toBe("2027-07-31T00:00:00.000Z");
  });

  it("décrit la période en toutes lettres", () => {
    expect(periodeAnnee(2026, 10)).toBe("octobre 2026 → juillet 2027");
    expect(periodeAnnee(2026, 9)).toBe("septembre 2026 → juin 2027");
    expect(periodeAnnee(2026, 11)).toBe("novembre 2026 → août 2027");
  });

  it("nomme l'année et les niveaux", () => {
    expect(libelleAnnee(2026)).toBe("2026-2027");
    expect(libelleNiveau(1)).toBe("1re année");
    expect(libelleNiveau(2)).toBe("2e année");
    expect(libelleNiveau(3)).toBe("3e année");
  });
});

describe("etatAnnee", () => {
  const debut = jour("2026-10-01");
  const annee = (estCourante: boolean, cloturee: boolean) => ({ estCourante, cloturee, dateDebut: debut });

  it("courante prime sur clôturée et sur la date", () => {
    expect(etatAnnee(annee(true, true), jour("2025-01-01"))).toBe("courante");
    expect(etatAnnee(annee(true, false), jour("2030-01-01"))).toBe("courante");
  });

  it("clôturée prime sur la date", () => {
    expect(etatAnnee(annee(false, true), jour("2026-09-30"))).toBe("cloturee");
    expect(etatAnnee(annee(false, true), jour("2027-01-01"))).toBe("cloturee");
  });

  it("en préparation avant son premier jour, ouverte à partir de ce jour", () => {
    expect(etatAnnee(annee(false, false), jour("2026-09-30"))).toBe("preparation");
    expect(etatAnnee(annee(false, false), debut)).toBe("ouverte");
    expect(etatAnnee(annee(false, false), jour("2028-01-01"))).toBe("ouverte");
  });
});

describe("tarifs : total et grille", () => {
  it("total annuel = droits + mensualité × nombre de mois", () => {
    expect(totalAnnuel({ droitsInscription: 100_000, montantMensuel: 80_000, nombreMois: 10 })).toBe(900_000);
    expect(totalAnnuel({ droitsInscription: 0, montantMensuel: 50_000, nombreMois: 1 })).toBe(50_000);
  });

  const filieres: FiliereGrille[] = [
    { id: "sf", code: "SF", nom: "Sage-femmes", dureeAnnees: 2, actif: true },
    { id: "if", code: "IF", nom: "Infirmiers", dureeAnnees: 3, actif: true },
    { id: "xx", code: "XX", nom: "Ancienne", dureeAnnees: 2, actif: false },
  ];
  const tarif = (filiereId: string, niveau: number) => ({
    filiereId,
    niveau,
    droitsInscription: 100_000,
    montantMensuel: 80_000,
    nombreMois: 10,
  });

  it("une case par filière active et par niveau, triée par code puis niveau", () => {
    const { cases } = grilleTarifs(filieres, []);
    expect(cases.map((c) => `${c.codeFiliere}${c.niveau}`)).toEqual(["IF1", "IF2", "IF3", "SF1", "SF2"]);
  });

  it("ignore les filières inactives et les niveaux au-delà de la durée", () => {
    const { cases } = grilleTarifs(filieres, [tarif("xx", 1), tarif("if", 4), tarif("sf", 3)]);
    expect(cases.some((c) => c.filiereId === "xx")).toBe(false);
    expect(cases.every((c) => c.niveau <= (c.filiereId === "if" ? 3 : 2))).toBe(true);
    expect(cases.every((c) => c.tarif === null)).toBe(true);
  });

  it("compte les cases sans tarif et calcule le total des autres", () => {
    const { cases, manquants } = grilleTarifs(filieres, [tarif("if", 1), tarif("if", 2), tarif("sf", 1)]);
    expect(manquants).toBe(2);
    expect(cases.filter((c) => c.tarif === null).map((c) => `${c.codeFiliere}${c.niveau}`)).toEqual(["IF3", "SF2"]);
    expect(cases.find((c) => c.codeFiliere === "IF" && c.niveau === 1)?.tarif).toEqual({
      droitsInscription: 100_000,
      montantMensuel: 80_000,
      nombreMois: 10,
      total: 900_000,
    });
  });

  it("une filière sans aucun tarif compte toutes ses cases comme manquantes", () => {
    expect(grilleTarifs(filieres, []).manquants).toBe(5);
  });
});

describe("contrôles de suppression", () => {
  it("filière : refusée si un étudiant y est rattaché, avec accord du pluriel", () => {
    expect(controleSuppressionFiliere({ etudiants: 1, admissions: 0 })).toMatch(/1 étudiant y est rattaché\./);
    expect(controleSuppressionFiliere({ etudiants: 12, admissions: 0 })).toMatch(/12 étudiants y sont rattachés/);
  });

  it("filière : refusée si des admissions y ont été enregistrées", () => {
    expect(controleSuppressionFiliere({ etudiants: 0, admissions: 2 })).toMatch(/admissions/);
  });

  it("filière : permise sans étudiant ni admission", () => {
    expect(controleSuppressionFiliere({ etudiants: 0, admissions: 0 })).toBeNull();
  });

  const sansUsage = { inscriptions: 0, etudiantsEntres: 0, admissions: 0 };

  it("année : l'année courante n'est jamais supprimable, même vide", () => {
    expect(controleSuppressionAnnee({ estCourante: true }, sansUsage)).toMatch(/courante ne peut pas être supprimée/);
  });

  it("année : refusée si des inscriptions, des étudiants entrés ou des admissions la concernent", () => {
    expect(controleSuppressionAnnee({ estCourante: false }, { ...sansUsage, inscriptions: 3 })).toMatch(/3 étudiants y sont inscrits/);
    expect(controleSuppressionAnnee({ estCourante: false }, { ...sansUsage, etudiantsEntres: 1 })).toMatch(/1 étudiant y est inscrit\./);
    expect(controleSuppressionAnnee({ estCourante: false }, { ...sansUsage, admissions: 1 })).toMatch(/admissions/);
  });

  it("année : permise si elle n'est ni courante ni utilisée", () => {
    expect(controleSuppressionAnnee({ estCourante: false }, sansUsage)).toBeNull();
  });
});

describe("controleModificationFiliere", () => {
  const actuelle = { code: "IF", dureeAnnees: 3 };

  it("fige le code dès qu'un étudiant a un matricule dans la filière", () => {
    expect(controleModificationFiliere(actuelle, { code: "INF", dureeAnnees: 3 }, { etudiants: 1, niveauMaxInscrit: 1 })).toMatch(
      /code ne peut plus changer/,
    );
  });

  it("laisse changer le code d'une filière sans étudiant", () => {
    expect(controleModificationFiliere(actuelle, { code: "INF", dureeAnnees: 3 }, { etudiants: 0, niveauMaxInscrit: null })).toBeNull();
  });

  it("refuse une durée sous le plus haut niveau inscrit, accepte cette durée exacte", () => {
    const usage = { etudiants: 5, niveauMaxInscrit: 3 };
    expect(controleModificationFiliere(actuelle, { code: "IF", dureeAnnees: 2 }, usage)).toMatch(/sous 3 ans.*3e année/);
    expect(controleModificationFiliere(actuelle, { code: "IF", dureeAnnees: 3 }, usage)).toBeNull();
    expect(controleModificationFiliere(actuelle, { code: "IF", dureeAnnees: 4 }, usage)).toBeNull();
  });

  it("laisse réduire la durée tant qu'aucune inscription n'existe", () => {
    expect(controleModificationFiliere(actuelle, { code: "IF", dureeAnnees: 1 }, { etudiants: 0, niveauMaxInscrit: null })).toBeNull();
  });
});

describe("statut d'une année : courante, clôture, réouverture", () => {
  const ouverte = { estCourante: false, cloturee: false };
  const courante = { estCourante: true, cloturee: false };
  const cloturee = { estCourante: false, cloturee: true };

  it("une année clôturée ne peut pas devenir courante", () => {
    expect(controleDefinirCourante(cloturee)).toMatch(/clôturée ne peut pas devenir l'année courante/);
    expect(controleDefinirCourante(courante)).toMatch(/déjà l'année courante/);
    expect(controleDefinirCourante(ouverte)).toBeNull();
  });

  it("l'année courante ne peut pas être clôturée, ni une année déjà clôturée", () => {
    expect(controleCloture(courante)).toMatch(/courante ne peut pas être clôturée/);
    expect(controleCloture(cloturee)).toMatch(/déjà clôturée/);
    expect(controleCloture(ouverte)).toBeNull();
  });

  it("seule une année clôturée peut être rouverte", () => {
    expect(controleReouverture(cloturee)).toBeNull();
    expect(controleReouverture(ouverte)).toMatch(/n'est pas clôturée/);
  });
});

describe("controleLignesTarifs", () => {
  const filieres = [
    { id: "if", code: "IF", dureeAnnees: 3, actif: true },
    { id: "xx", code: "XX", dureeAnnees: 2, actif: false },
  ];
  const annee = { cloturee: false, libelle: "2026-2027" };

  it("refuse tout enregistrement sur une année clôturée", () => {
    const r = controleLignesTarifs({ cloturee: true, libelle: "2025-2026" }, filieres, [{ filiereId: "if", niveau: 1 }]);
    expect(r?.message).toMatch(/2025-2026 est clôturée/);
  });

  it("signale chaque ligne fautive à son chemin de champ", () => {
    const r = controleLignesTarifs(annee, filieres, [
      { filiereId: "if", niveau: 1 },
      { filiereId: "inconnue", niveau: 1 },
      { filiereId: "xx", niveau: 1 },
      { filiereId: "if", niveau: 4 },
      { filiereId: "if", niveau: 1 },
    ]);
    expect(r?.message).toMatch(/rien n'a été modifié/);
    expect(Object.keys(r?.erreurs ?? {}).sort()).toEqual([
      "lignes.1.filiereId",
      "lignes.2.filiereId",
      "lignes.3.niveau",
      "lignes.4.niveau",
    ]);
    expect(r?.erreurs["lignes.2.filiereId"]).toMatch(/XX est désactivée/);
    expect(r?.erreurs["lignes.3.niveau"]).toMatch(/dure 3 ans : pas de 4e année/);
    expect(r?.erreurs["lignes.4.niveau"]).toMatch(/deux fois/);
  });

  it("accepte des lignes valides", () => {
    expect(controleLignesTarifs(annee, filieres, [{ filiereId: "if", niveau: 1 }, { filiereId: "if", niveau: 3 }])).toBeNull();
  });
});

describe("controleActionUtilisateur", () => {
  const base = { acteurId: "a1", cibleId: "c1", cibleEstAdmin: false, cibleActive: true, adminsActifs: 2 };
  const ctl = (c: Partial<ContexteActionUtilisateur> & Pick<ContexteActionUtilisateur, "action">) =>
    controleActionUtilisateur({ ...base, ...c });

  it("interdit d'agir sur son propre compte (rôle, désactivation, mot de passe)", () => {
    const soi = { cibleId: "a1", cibleEstAdmin: true };
    expect(ctl({ ...soi, action: "changerRole", nouveauRole: "user" })).toMatch(/propre rôle/);
    expect(ctl({ ...soi, action: "desactiver" })).toMatch(/propre compte/);
    expect(ctl({ ...soi, action: "reinitialiserMotDePasse" })).toMatch(/propre mot de passe/);
  });

  it("refuse d'attribuer le rôle déjà détenu", () => {
    expect(ctl({ action: "changerRole", nouveauRole: "user" })).toMatch(/déjà ce rôle/);
    expect(ctl({ action: "changerRole", cibleEstAdmin: true, nouveauRole: "admin" })).toMatch(/déjà ce rôle/);
  });

  it("protège le dernier administrateur actif contre la rétrogradation et la désactivation", () => {
    const dernier = { cibleEstAdmin: true, adminsActifs: 1 };
    expect(ctl({ ...dernier, action: "changerRole", nouveauRole: "user" })).toMatch(/dernier administrateur actif/);
    expect(ctl({ ...dernier, action: "desactiver" })).toMatch(/dernier administrateur actif/);
  });

  it("permet de rétrograder ou désactiver un administrateur s'il en reste un autre actif", () => {
    const admin = { cibleEstAdmin: true, adminsActifs: 2 };
    expect(ctl({ ...admin, action: "changerRole", nouveauRole: "user" })).toBeNull();
    expect(ctl({ ...admin, action: "desactiver" })).toBeNull();
  });

  it("permet de promouvoir un utilisateur", () => {
    expect(ctl({ action: "changerRole", nouveauRole: "admin" })).toBeNull();
  });

  it("refuse de désactiver un compte déjà désactivé et de réactiver un compte actif", () => {
    expect(ctl({ action: "desactiver", cibleActive: false })).toMatch(/déjà désactivé/);
    expect(ctl({ action: "reactiver", cibleActive: true })).toMatch(/déjà actif/);
    expect(ctl({ action: "reactiver", cibleActive: false })).toBeNull();
  });

  it("permet de réinitialiser le mot de passe d'un autre compte", () => {
    expect(ctl({ action: "reinitialiserMotDePasse" })).toBeNull();
  });
});

describe("schémas de saisie", () => {
  const filiere = { code: "IF", nom: "Infirmier(e)s", dureeAnnees: 3 };
  const ligne = { filiereId: "if", niveau: 1, droitsInscription: "100 000", montantMensuel: 80_000, nombreMois: 10 };

  it("met le code de filière en majuscules et retire les espaces", () => {
    expect(schemaFiliere.parse({ ...filiere, code: " if " }).code).toBe("IF");
    expect(schemaFiliere.parse({ ...filiere, code: "sfa" }).code).toBe("SFA");
  });

  it("refuse un code hors 2-3 lettres ou accentué", () => {
    for (const code of ["I", "ABCD", "ÉF", "éf", "IF1", "I-F", ""]) {
      const r = schemaFiliere.safeParse({ ...filiere, code });
      expect(r.success, code).toBe(false);
    }
    const r = schemaFiliere.safeParse({ ...filiere, code: "ÉF" });
    expect(r.error?.issues[0].message).toBe("Le code compte 2 ou 3 lettres sans accent (ex. IF).");
  });

  it("filière active par défaut, durée entière entre 1 et 6 ans", () => {
    expect(schemaFiliere.parse(filiere).actif).toBe(true);
    for (const dureeAnnees of [0, 7, 2.5]) expect(schemaFiliere.safeParse({ ...filiere, dureeAnnees }).success).toBe(false);
  });

  it("année : début d'écolage en septembre, octobre (par défaut) ou novembre uniquement", () => {
    expect(schemaAnnee.parse({ anneeDebut: 2026 }).moisDebutEcolage).toBe(10);
    for (const m of [9, 10, 11]) expect(schemaAnnee.safeParse({ anneeDebut: 2026, moisDebutEcolage: m }).success).toBe(true);
    for (const m of [8, 12, 1]) expect(schemaAnnee.safeParse({ anneeDebut: 2026, moisDebutEcolage: m }).success).toBe(false);
  });

  it(`tarif : nombre de mois plafonné à ${NOMBRE_MOIS_MAX}, un tarif à 11 mois est refusé`, () => {
    expect(NOMBRE_MOIS_MAX).toBe(10);
    expect(schemaLigneTarif.safeParse({ ...ligne, nombreMois: 10 }).success).toBe(true);
    const r = schemaLigneTarif.safeParse({ ...ligne, nombreMois: 11 });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe("Le nombre de mois est compris entre 1 et 10.");
    expect(schemaLigneTarif.safeParse({ ...ligne, nombreMois: 0 }).success).toBe(false);
  });

  it("tarif : montants lus depuis la saisie ou un nombre, entiers et strictement positifs", () => {
    const ok = schemaLigneTarif.parse(ligne);
    expect(ok.droitsInscription).toBe(100_000);
    expect(ok.montantMensuel).toBe(80_000);
    for (const montant of ["80.000", "0", "-5", 1.5, 0, "abc"]) {
      expect(schemaLigneTarif.safeParse({ ...ligne, montantMensuel: montant }).success, String(montant)).toBe(false);
    }
  });

  it("utilisateur : courriel normalisé en minuscules, rôle admin ou user uniquement", () => {
    const u = schemaNouvelUtilisateur.parse({ nom: "Rasoa Hanta", email: " Rasoa@IFSPA.mg ", role: "user" });
    expect(u.email).toBe("rasoa@ifspa.mg");
    expect(schemaNouvelUtilisateur.safeParse({ nom: "Rasoa", email: "rasoa@ifspa.mg", role: "superadmin" }).success).toBe(false);
  });

  it("utilisateur : courriel vide ou d'espaces demande de l'indiquer, courriel mal formé est signalé invalide", () => {
    const messageEmail = (email: unknown) => {
      const r = schemaNouvelUtilisateur.safeParse({ nom: "Rasoa Hanta", email, role: "user" });
      return r.error?.issues.filter((i) => i.path[0] === "email").map((i) => i.message);
    };
    expect(messageEmail("")).toEqual(["Indiquez le courriel."]);
    expect(messageEmail("   ")).toEqual(["Indiquez le courriel."]);
    expect(messageEmail("abc")).toEqual(["Adresse e-mail invalide."]);
    expect(messageEmail(undefined)).toEqual(["Indiquez le courriel."]);
  });

  describe("aucun message d'erreur en anglais", () => {
    const anglais = /\b(invalid|expected|received|required|too (small|big)|must|string|number|boolean|array|object|input|option|undefined|null)\b/i;
    const cas: [string, z.ZodType, unknown][] = [
      ["filière null", schemaFiliere, null],
      ["filière vide", schemaFiliere, {}],
      ["filière mal typée", schemaFiliere, { code: 5, nom: 3, dureeAnnees: "3", actif: "oui" }],
      ["filière nom trop long", schemaFiliere, { ...filiere, nom: "x".repeat(81) }],
      ["modification sans id", schemaModificationFiliere, filiere],
      ["modification id vide", schemaModificationFiliere, { ...filiere, id: "" }],
      ["année vide", schemaAnnee, {}],
      ["année texte", schemaAnnee, "2026"],
      ["année hors bornes", schemaAnnee, { anneeDebut: 1999, moisDebutEcolage: 12 }],
      ["année décimale", schemaAnnee, { anneeDebut: 2026.5, moisDebutEcolage: "10" }],
      ["tarifs vide", schemaTarifs, {}],
      ["tarifs lignes texte", schemaTarifs, { anneeId: "a", lignes: "x" }],
      ["tarifs sans ligne", schemaTarifs, { anneeId: "a", lignes: [] }],
      ["tarifs ligne null", schemaTarifs, { anneeId: "a", lignes: [null] }],
      ["tarifs ligne vide", schemaTarifs, { anneeId: "a", lignes: [{}] }],
      [
        "tarifs ligne mal typée",
        schemaTarifs,
        { anneeId: 1, lignes: [{ filiereId: 1, niveau: "1", droitsInscription: true, montantMensuel: null, nombreMois: 11 }] },
      ],
      ["identifiant absent", schemaIdentifiant, {}],
      ["activation sans booléen", schemaActivationFiliere, { id: "x", actif: "oui" }],
      ["utilisateur vide", schemaNouvelUtilisateur, {}],
      ["utilisateur mal typé", schemaNouvelUtilisateur, { nom: 1, email: "pas-un-courriel", role: 3 }],
      ["cible vide", schemaUtilisateurCible, undefined],
      ["changement de rôle", schemaChangementRole, { userId: "", role: "root" }],
    ];

    it.each(cas)("%s", (_nom, schema, entree) => {
      const r = schema.safeParse(entree);
      expect(r.success).toBe(false);
      for (const issue of r.error?.issues ?? []) {
        expect(issue.message, `${issue.path.join(".")} : ${issue.message}`).not.toMatch(anglais);
      }
    });
  });
});
