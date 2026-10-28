import { describe, expect, it } from "vitest";
import {
  controleCreation,
  controleDateNaissance,
  controleModifTranches,
  formaterTelephone,
  motsRecherche,
  normaliserRecherche,
  normaliserTelephone,
  schemaCreationEtudiant,
  schemaModifTranches,
  schemaModificationEtudiant,
  texteRecherche,
  type ContexteCreation,
  type EntreeCreationEtudiant,
} from "@/lib/etudiants";

const SAISIE: EntreeCreationEtudiant = {
  nom: "Rakotomalala",
  prenoms: "Hanta Voahangy",
  sexe: "F",
  dateNaissance: "2005-03-14",
  lieuNaissance: "Toamasina",
  cin: "",
  telephone: "034 12 345 67",
  email: "",
  adresse: "Lot 12 Ambodiatafana",
  filiereId: "filiere-1",
  niveau: 1,
};

function analyser(surcharge: Partial<Record<keyof EntreeCreationEtudiant, unknown>> = {}) {
  return schemaCreationEtudiant.safeParse({ ...SAISIE, ...surcharge });
}

function messages(r: ReturnType<typeof analyser>): string[] {
  return r.success ? [] : r.error.issues.map((i) => i.message);
}

describe("schemaCreationEtudiant", () => {
  it("accepte une saisie complète et applique les valeurs par défaut", () => {
    const r = analyser();
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toMatchObject({
      telephone: "0341234567",
      cin: null,
      email: null,
      droitsEnTranches: 1,
      confirmerDoublon: false,
    });
    expect(r.data.dateNaissance.toISOString()).toBe("2005-03-14T00:00:00.000Z");
  });

  it("met le nom en majuscules et compacte les espaces, sans toucher aux prénoms", () => {
    const r = analyser({ nom: "  rakoto   malala ", prenoms: "hanta   voahangy" });
    expect(r.success && r.data.nom).toBe("RAKOTO MALALA");
    expect(r.success && r.data.prenoms).toBe("hanta voahangy");
  });

  it("met en majuscules un nom accentué", () => {
    const r = analyser({ nom: "Éloïse" });
    expect(r.success && r.data.nom).toBe("ÉLOÏSE");
  });

  it("refuse un nom vide ou trop long", () => {
    expect(messages(analyser({ nom: "   " }))).toContain("Indiquez le nom.");
    expect(analyser({ nom: "A".repeat(81) }).success).toBe(false);
  });

  it("normalise un téléphone avec espaces, et l'indicatif +261", () => {
    for (const saisie of ["034 12 345 67", "034.12.345.67", "0341234567", "+261 34 12 345 67", "+261341234567", "00261341234567", "261341234567"]) {
      const r = analyser({ telephone: saisie });
      expect(r.success && r.data.telephone, saisie).toBe("0341234567");
    }
  });

  it("refuse un téléphone hors format malgache", () => {
    for (const saisie of ["0301234567", "034123456", "03412345678", "0141234567", "abc", "+33 6 12 34 56 78"]) {
      expect(analyser({ telephone: saisie }).success, saisie).toBe(false);
    }
    expect(messages(analyser({ telephone: "12" })).join()).toMatch(/Numéro malgache/);
    expect(messages(analyser({ telephone: "" }))).toContain("Indiquez le numéro de téléphone.");
  });

  it("CIN vide ou absent devient null ; 12 chiffres acceptés (espaces tolérés)", () => {
    expect((analyser({ cin: "" }) as { data: { cin: unknown } }).data.cin).toBeNull();
    expect((analyser({ cin: undefined }) as { data: { cin: unknown } }).data.cin).toBeNull();
    expect((analyser({ cin: null }) as { data: { cin: unknown } }).data.cin).toBeNull();
    const r = analyser({ cin: "101 231 123 456" });
    expect(r.success && r.data.cin).toBe("101231123456");
  });

  it("refuse un CIN qui ne compte pas 12 chiffres", () => {
    for (const cin of ["12345", "10123112345", "1012311234567", "10123112345a"]) {
      expect(messages(analyser({ cin })), cin).toContain("Le numéro de CIN compte 12 chiffres.");
    }
  });

  it("e-mail vide → null, valide mis en minuscules, invalide refusé", () => {
    expect(analyser({ email: "" }).success).toBe(true);
    const r = analyser({ email: "Hanta@Example.MG" });
    expect(r.success && r.data.email).toBe("hanta@example.mg");
    expect(messages(analyser({ email: "pas-un-mail" }))).toContain("Adresse e-mail invalide.");
  });

  it("niveau entre 1 et la durée maximale ; hors bornes ou décimal refusé", () => {
    expect(analyser({ niveau: 1 }).success).toBe(true);
    expect(analyser({ niveau: 6 }).success).toBe(true);
    for (const niveau of [0, 7, 1.5, "2", undefined]) {
      expect(analyser({ niveau }).success, String(niveau)).toBe(false);
    }
  });

  it("droits en 1, 2 ou 3 tranches seulement", () => {
    for (const droitsEnTranches of [1, 2, 3]) expect(analyser({ droitsEnTranches }).success).toBe(true);
    for (const droitsEnTranches of [0, 4, "3", 2.5]) {
      expect(messages(analyser({ droitsEnTranches })), String(droitsEnTranches)).toContain(
        "Choisissez un paiement des droits en 1, 2 ou 3 fois.",
      );
    }
  });

  it("refuse une date de naissance inexistante ou antérieure à 1900", () => {
    expect(messages(analyser({ dateNaissance: "2005-02-30" }))).toContain("Date de naissance invalide.");
    expect(messages(analyser({ dateNaissance: "1850-01-01" }))).toContain("Date de naissance invalide.");
    expect(analyser({ dateNaissance: "" }).success).toBe(false);
  });

  it("refuse un sexe hors M/F et une filière absente", () => {
    expect(analyser({ sexe: "X" }).success).toBe(false);
    expect(analyser({ filiereId: "" }).success).toBe(false);
  });

  it("une entrée qui n'est pas un objet donne le message générique", () => {
    const r = schemaCreationEtudiant.safeParse("n'importe quoi");
    expect(r.success).toBe(false);
  });
});

describe("schemaModificationEtudiant et schemaModifTranches", () => {
  it("la modification reprend l'identité et exige l'identifiant, sans filière ni niveau", () => {
    const { filiereId: _f, niveau: _n, ...identite } = SAISIE;
    expect(schemaModificationEtudiant.safeParse({ id: "e1", ...identite }).success).toBe(true);
    expect(schemaModificationEtudiant.safeParse(identite).success).toBe(false);
    const r = schemaModificationEtudiant.safeParse({ id: "e1", ...identite, telephone: "+261 32 00 000 00" });
    expect(r.success && r.data.telephone).toBe("0320000000");
  });

  it("le redécoupage des droits accepte 1, 2 ou 3 et rien d'autre", () => {
    expect(schemaModifTranches.safeParse({ inscriptionId: "i1", droitsEnTranches: 2 }).success).toBe(true);
    expect(schemaModifTranches.safeParse({ inscriptionId: "i1", droitsEnTranches: 4 }).success).toBe(false);
    expect(schemaModifTranches.safeParse({ inscriptionId: "", droitsEnTranches: 2 }).success).toBe(false);
  });
});

describe("téléphone", () => {
  it("normaliserTelephone : null si le format n'est pas malgache", () => {
    expect(normaliserTelephone("034 12 345 67")).toBe("0341234567");
    expect(normaliserTelephone("039 12 345 67")).toBeNull();
  });

  it("formaterTelephone : « 034 12 345 67 », saisie inchangée si illisible", () => {
    expect(formaterTelephone("0341234567")).toBe("034 12 345 67");
    expect(formaterTelephone("+261341234567")).toBe("034 12 345 67");
    expect(formaterTelephone("n/a")).toBe("n/a");
  });
});

describe("recherche", () => {
  it("normaliserRecherche : minuscules, sans accents, espaces compactés", () => {
    expect(normaliserRecherche("  Éléonore   RAKOTO ")).toBe("eleonore rakoto");
    expect(normaliserRecherche("Œuvre Æon")).toBe("oeuvre aeon");
  });

  it("texteRecherche : nom, prénoms et matricule en un texte normalisé", () => {
    expect(texteRecherche({ nom: "RAKOTOMALALA", prenoms: "Hantà", matricule: "IF-2026-0001" })).toBe(
      "rakotomalala hanta if-2026-0001",
    );
  });

  it("motsRecherche : un mot par terme, ordre libre, 6 mots au plus, vide si rien", () => {
    expect(motsRecherche("  Hanta   RAKOTO ")).toEqual(["hanta", "rakoto"]);
    expect(motsRecherche("a b c d e f g h")).toHaveLength(6);
    expect(motsRecherche("   ")).toEqual([]);
  });

  it("une recherche sans accent ni casse retrouve la fiche", () => {
    const recherche = texteRecherche({ nom: "ANDRIAMAMPIANINA", prenoms: "Éloïse", matricule: "SF-2026-0003" });
    expect(motsRecherche("eloise andria").every((m) => recherche.includes(m))).toBe(true);
    expect(motsRecherche("sf-2026-0003").every((m) => recherche.includes(m))).toBe(true);
  });
});

describe("controleDateNaissance", () => {
  it("la date doit être passée : aujourd'hui et le futur sont refusés", () => {
    const naissance = (iso: string) => new Date(`${iso}T00:00:00Z`);
    expect(controleDateNaissance(naissance("2005-03-14"), "2026-10-11")).toBeNull();
    expect(controleDateNaissance(naissance("2026-10-10"), "2026-10-11")).toBeNull();
    expect(controleDateNaissance(naissance("2026-10-11"), "2026-10-11")).toMatch(/passée/);
    expect(controleDateNaissance(naissance("2030-01-01"), "2026-10-11")).toMatch(/passée/);
  });
});

describe("controleCreation", () => {
  const valide: ContexteCreation = {
    annee: { libelle: "2026-2027", cloturee: false },
    filiere: { code: "IF", nom: "Infirmier(e)s", dureeAnnees: 3, actif: true },
    niveau: 1,
    tarif: { droitsInscription: 100_000, montantMensuel: 80_000, nombreMois: 10 },
    droitsEnTranches: 1,
  };

  it("contexte complet : aucun refus", () => {
    expect(controleCreation(valide)).toBeNull();
  });

  it("refuse sans année courante", () => {
    expect(controleCreation({ ...valide, annee: null })).toMatch(/Aucune année scolaire courante/);
  });

  it("refuse dans une année clôturée", () => {
    expect(controleCreation({ ...valide, annee: { libelle: "2025-2026", cloturee: true } })).toMatch(
      /2025-2026 est clôturée/,
    );
  });

  it("refuse une filière absente ou désactivée", () => {
    expect(controleCreation({ ...valide, filiere: null })).toMatch(/n'existe plus/);
    expect(controleCreation({ ...valide, filiere: { ...valide.filiere!, actif: false } })).toMatch(/IF est désactivée/);
  });

  it("refuse un niveau au-delà de la durée de la filière", () => {
    expect(controleCreation({ ...valide, niveau: 4 })).toMatch(/dure 3 ans : pas de 4e année/);
    expect(controleCreation({ ...valide, niveau: 3 })).toBeNull();
  });

  it("refuse un tarif manquant avec le chemin pour le saisir", () => {
    const refus = controleCreation({ ...valide, tarif: null });
    expect(refus).toBe(
      "Tarif manquant pour Infirmier(e)s 1re année en 2026-2027 : demandez à l'administrateur de le saisir dans Paramètres › Tarifs.",
    );
  });

  it("refuse des droits trop faibles pour le nombre de tranches choisi", () => {
    const tarif = { ...valide.tarif!, droitsInscription: 2_000 };
    expect(controleCreation({ ...valide, tarif, droitsEnTranches: 3 })).toMatch(/trop faibles/);
    expect(controleCreation({ ...valide, tarif, droitsEnTranches: 1 })).toBeNull();
  });
});

describe("controleModifTranches", () => {
  it("refus dès une ligne de paiement, même annulée", () => {
    expect(controleModifTranches(0)).toBeNull();
    expect(controleModifTranches(1)).toMatch(/même annulés/);
    expect(controleModifTranches(5)).not.toBeNull();
  });
});

describe("tuteur (facultatif, un par étudiant)", () => {
  it("absent ou vide : les trois champs valent null", () => {
    const r = analyser({ tuteurNom: "  ", tuteurTelephone: "", tuteurProfession: undefined });
    expect(r.success && [r.data.tuteurNom, r.data.tuteurTelephone, r.data.tuteurProfession]).toEqual([null, null, null]);
  });

  it("nom et profession aux espaces réduits, téléphone normalisé", () => {
    const r = analyser({ tuteurNom: " RAKOTO   Jean ", tuteurTelephone: "+261 33 12 345 67", tuteurProfession: "Commerçant " });
    expect(r.success && [r.data.tuteurNom, r.data.tuteurTelephone, r.data.tuteurProfession]).toEqual([
      "RAKOTO Jean",
      "0331234567",
      "Commerçant",
    ]);
  });

  it("téléphone non malgache : refusé sur le champ du tuteur", () => {
    const r = analyser({ tuteurNom: "RAKOTO Jean", tuteurTelephone: "12345" });
    expect(r.success).toBe(false);
    expect(!r.success && r.error.issues.map((i) => i.path.join("."))).toEqual(["tuteurTelephone"]);
  });

  it("téléphone ou profession sans nom : le nom du tuteur est demandé", () => {
    for (const surcharge of [{ tuteurTelephone: "033 12 345 67" }, { tuteurProfession: "Commerçant" }]) {
      const r = analyser(surcharge);
      expect(!r.success && r.error.issues.map((i) => i.path.join("."))).toEqual(["tuteurNom"]);
    }
    const { filiereId: _f, niveau: _n, ...identite } = SAISIE;
    const r = schemaModificationEtudiant.safeParse({ id: "e1", ...identite, tuteurProfession: "Commerçant" });
    expect(!r.success && r.error.issues.map((i) => i.path.join("."))).toEqual(["tuteurNom"]);
  });

  it("nom seul accepté ; nom ou profession trop longs refusés", () => {
    expect(analyser({ tuteurNom: "RAKOTO Jean" }).success).toBe(true);
    expect(messages(analyser({ tuteurNom: "x".repeat(121) }))).toEqual(["Nom du tuteur trop long (120 caractères maximum)."]);
    expect(messages(analyser({ tuteurNom: "A", tuteurProfession: "x".repeat(81) }))).toEqual([
      "Profession trop longue (80 caractères maximum).",
    ]);
  });
});
