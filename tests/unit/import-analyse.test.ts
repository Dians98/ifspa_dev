import writeXlsxFile from "write-excel-file/node";
import { describe, expect, it } from "vitest";
import {
  allegerRapport,
  analyserReprise,
  anneesPaiementsCitees,
  cleReprisePaiement,
  instantReprise,
  joursNaissanceCites,
  observationReprise,
  PREFIXE_CLE_REPRISE,
  signatureReprise,
  type ContexteReprise,
  type ElementsClePaiement,
  type RapportReprise,
} from "@/lib/import-analyse";
import { PARAMETRES_MODELE_EXEMPLE } from "@/lib/import-modele";
import { csvEtudiants, csvPaiements, feuillesModele } from "@/lib/import-modele-fichiers";
import { lireFichiersReprise } from "@/server/import/lire-fichiers";
import {
  contexteReprise,
  echeancesPayees,
  etudiantEnBase,
  JOUR_ANALYSE,
  reprise,
  TARIF_STANDARD,
} from "../factories/reprise";

type LigneE = Parameters<typeof reprise>[0][number];
type LigneP = NonNullable<Parameters<typeof reprise>[1]>[number];

const DU_ANNEE = 900_000;

/** Étudiant n° `n` d'identité propre, pour que deux lignes ne soient jamais prises pour un doublon. */
const etu = (n: number, surcharge: LigneE = {}): LigneE => ({ numero: String(n), nom: `NOM${n}`, prenoms: `Prenom${n}`, ...surcharge });

function analyser(
  etudiants: LigneE[] = [{}],
  paiements: LigneP[] | null = [],
  ctx: ContexteReprise = contexteReprise(),
  jour = JOUR_ANALYSE,
  options?: Parameters<typeof reprise>[2],
): RapportReprise {
  return analyserReprise(reprise(etudiants, paiements, options), ctx, jour);
}

const textes = (r: RapportReprise, gravite: "erreur" | "avertissement") => r.messages.filter((m) => m.gravite === gravite).map((m) => m.texte);
const erreurs = (r: RapportReprise) => textes(r, "erreur");
const avertissements = (r: RapportReprise) => textes(r, "avertissement");

describe("contrôles globaux", () => {
  it("sans année courante : bloquant, aucun plan, une seule erreur claire", () => {
    const r = analyser([{}], [], contexteReprise({ anneeCourante: null }));

    expect(r.bloquant).toBe(true);
    expect(r.annee).toBeNull();
    expect(erreurs(r)).toEqual([expect.stringMatching(/^Aucune année scolaire courante : définissez-la dans Paramètres › Années/)]);
    expect(r.etudiants).toEqual([]);
    expect(r.paiements).toEqual([]);
    expect(r.totaux.etudiants.lus).toBe(1);
    expect(r.canonique).toBe("");
  });

  it("année courante clôturée : bloquant, aucun plan", () => {
    const base = contexteReprise();
    const r = analyser([{}], [], contexteReprise({ anneeCourante: { ...base.anneeCourante!, cloturee: true } }));

    expect(r.bloquant).toBe(true);
    expect(r.annee).toEqual({ id: "annee-2026", libelle: "2026-2027" });
    expect(erreurs(r)).toEqual([expect.stringMatching(/L'année 2026-2027 est clôturée/)]);
    expect(r.etudiants).toEqual([]);
  });

  it("erreur de structure du fichier : bloquant, pas de plan, l'erreur de lecture est conservée", () => {
    const r = analyser([{}], [], contexteReprise(), JOUR_ANALYSE, { sans: ["nom"] });

    expect(r.bloquant).toBe(true);
    expect(erreurs(r)).toEqual([expect.stringMatching(/colonne obligatoire « Nom » absente/)]);
    expect(r.etudiants).toEqual([]);
  });

  it("« Niveau X » doit être l'année courante : un modèle d'une autre année est refusé", () => {
    const r = analyser([{}], [], contexteReprise(), JOUR_ANALYSE, { enteteNiveau: "Niveau 2025-2026 *" });

    expect(r.bloquant).toBe(true);
    expect(erreurs(r)).toEqual([expect.stringMatching(/Niveau 2025-2026.*ne correspond pas à l'année courante 2026-2027 : téléchargez le modèle de 2026-2027/)]);
  });

  it("un en-tête « Niveau » sans année est refusé", () => {
    const r = analyser([{}], [], contexteReprise(), JOUR_ANALYSE, { enteteNiveau: "Niveau *" });

    expect(erreurs(r)).toEqual([expect.stringMatching(/l'en-tête doit dire l'année : « Niveau 2026-2027 »/)]);
  });

  it("l'en-tête de l'année courante est accepté, avec « * » ou sans", () => {
    expect(analyser([{}], [], contexteReprise(), JOUR_ANALYSE, { enteteNiveau: "Niveau 2026-2027" }).bloquant).toBe(false);
    expect(analyser([{}]).bloquant).toBe(false);
  });

  it("un fichier sans étudiant est refusé", () => {
    const r = analyser([]);

    expect(r.bloquant).toBe(true);
    expect(erreurs(r)).toEqual([expect.stringMatching(/la feuille ne contient aucun étudiant/)]);
  });
});

describe("étudiant nouveau", () => {
  it("planifie l'inscription : filière, année d'entrée, tarif copié, dû de l'année", () => {
    const r = analyser([{}]);

    expect(r.bloquant).toBe(false);
    expect(r.messages).toEqual([]);
    expect(r.etudiants).toHaveLength(1);
    expect(r.etudiants[0]).toMatchObject({
      ligne: 2, numero: "1", statut: "nouveau", filiereId: "fil-if", anneeEntreeId: "annee-2026",
      tarif: TARIF_STANDARD, duAnnee: DU_ANNEE, existant: null,
    });
    expect(r.totaux.etudiants).toEqual({ lus: 1, nouveaux: 1, existants: 0, refuses: 0 });
  });

  it("copie les montants du tarif de la classe (droits + N mensualités) dans le plan", () => {
    const ctx = contexteReprise({ tarifs: [{ filiereId: "fil-if", niveau: 1, droitsInscription: 120_000, montantMensuel: 90_000, nombreMois: 8 }] });

    const r = analyser([{}], [], ctx);

    expect(r.etudiants[0].tarif).toEqual({ droitsInscription: 120_000, montantMensuel: 90_000, nombreMois: 8 });
    expect(r.etudiants[0].duAnnee).toBe(120_000 + 8 * 90_000);
  });

  it("filière inconnue : refusé, avec la liste des filières actives", () => {
    const r = analyser([{ filiere: "ZZ" }]);

    expect(r.bloquant).toBe(true);
    expect(r.etudiants[0].statut).toBe("refuse");
    expect(erreurs(r)).toEqual([expect.stringMatching(/^Étudiants, ligne 2, colonne « Filière » \(« ZZ »\) : filière inconnue \(filières : IF, SF\)/)]);
  });

  it("filière désactivée : refusé", () => {
    const r = analyser([{ filiere: "old" }]);

    expect(r.etudiants[0].statut).toBe("refuse");
    expect(erreurs(r)).toEqual([expect.stringMatching(/la filière OLD est désactivée/)]);
  });

  it("niveau au-delà de la durée de la filière : refusé", () => {
    const ctx = contexteReprise({
      filieres: [{ id: "fil-if", code: "IF", nom: "Infirmier(e)s", dureeAnnees: 2, actif: true }],
    });

    const r = analyser([{ niveau: "3", anneeEntree: "2024" }], [], ctx);

    expect(r.etudiants[0].statut).toBe("refuse");
    expect(erreurs(r)).toEqual([expect.stringMatching(/la filière IF dure 2 ans : pas de 3e année/)]);
  });

  it("année d'entrée absente de la base : un message par année, qui regroupe les lignes", () => {
    const r = analyser([etu(1, { anneeEntree: "2023", niveau: "3" }), etu(2, { anneeEntree: "2023", niveau: "3" }), etu(3, { anneeEntree: "2022", niveau: "3" }), etu(4)]);

    expect(r.etudiants.filter((e) => e.statut === "refuse").map((e) => e.numero).sort()).toEqual(["1", "2", "3"]);
    expect(erreurs(r)).toEqual([
      expect.stringMatching(/l'année 2022-2023 n'existe pas \(ligne 4\) : créez l'année 2022-2023 dans Paramètres › Années, puis clôturez-la/),
      expect.stringMatching(/l'année 2023-2024 n'existe pas \(lignes 2, 3\) : créez l'année 2023-2024 dans Paramètres › Années, puis clôturez-la/),
    ]);
  });

  it("année d'entrée postérieure à l'année courante : refusé", () => {
    const r = analyser([{ anneeEntree: "2027" }]);

    expect(r.etudiants[0].statut).toBe("refuse");
    expect(erreurs(r)).toEqual([expect.stringMatching(/année d'entrée postérieure à l'année courante 2026-2027/)]);
  });

  it("tarif manquant : un message par classe (filière + niveau), qui regroupe les lignes", () => {
    const r = analyser([
      etu(1, { filiere: "SF", niveau: "2", anneeEntree: "2025" }),
      etu(2, { filiere: "SF", niveau: "2", anneeEntree: "2025" }),
      etu(3, { filiere: "SF", niveau: "3", anneeEntree: "2024" }),
      etu(4, { filiere: "SF" }),
    ]);

    expect(r.bloquant).toBe(true);
    expect(r.etudiants.filter((e) => e.statut === "refuse")).toHaveLength(3);
    expect(erreurs(r)).toEqual([
      expect.stringMatching(/tarif manquant pour Sage-femmes 2e année en 2026-2027 \(lignes 2, 3\) : saisissez-le dans Paramètres › Tarifs/),
      expect.stringMatching(/tarif manquant pour Sage-femmes 3e année en 2026-2027 \(ligne 4\)/),
    ]);
  });

  it("droits trop faibles pour être payés en 3 fois : refusé sur la colonne « Droits en »", () => {
    const ctx = contexteReprise({ tarifs: [{ filiereId: "fil-if", niveau: 1, droitsInscription: 2_000, montantMensuel: 80_000, nombreMois: 10 }] });

    const trois = analyser([{ droitsEnTranches: "3" }], [], ctx);
    const une = analyser([{ droitsEnTranches: "1" }], [], ctx);

    expect(trois.etudiants[0].statut).toBe("refuse");
    expect(erreurs(trois)).toEqual([expect.stringMatching(/colonne « Droits en » \(« 3 »\) : Les droits d'inscription \(2.000.Ar\) sont trop faibles pour être payés en 3 fois/)]);
    expect(une.etudiants[0].statut).toBe("nouveau");
  });

  it("droits en 3 tranches : l'étudiant est planifié, le dû de l'année ne change pas", () => {
    const r = analyser([{ droitsEnTranches: "3" }]);

    expect(r.etudiants[0]).toMatchObject({ statut: "nouveau", duAnnee: DU_ANNEE });
  });

  it("même étudiant deux fois dans le fichier (N° différents, accents et casse ignorés) : les deux lignes refusées", () => {
    const r = analyser([
      { numero: "1", nom: "RAKOTO", prenoms: "Jéan" },
      { numero: "2", nom: "rakoto", prenoms: "JEAN" },
      etu(3),
    ]);

    expect(r.etudiants.map((e) => [e.numero, e.statut])).toEqual([["1", "refuse"], ["2", "refuse"], ["3", "nouveau"]]);
    expect(erreurs(r)).toEqual([
      expect.stringMatching(/ligne 2, colonne « Nom ».*même nom, prénoms et date de naissance qu'à la ligne 3/),
      expect.stringMatching(/ligne 3, colonne « Nom ».*qu'à la ligne 2/),
    ]);
  });

  it("niveau et année d'entrée incohérents : avertissement seulement, l'étudiant reste planifié", () => {
    const directe = analyser([{ niveau: "2", anneeEntree: "2026" }]);
    const oubli = analyser([{ niveau: "1", anneeEntree: "2025" }]);
    const redoublantNeuf = analyser([{ redoublant: "oui", anneeEntree: "2026" }]);
    const coherent = analyser([{ niveau: "2", anneeEntree: "2025" }]);

    expect(avertissements(directe)).toEqual([expect.stringMatching(/2e année pour une entrée en 2026 : inscription directe/)]);
    expect(avertissements(oubli)).toEqual([expect.stringMatching(/entré en 2025, il serait en 2e année : indiquez « oui » dans Redoublant/)]);
    expect(avertissements(redoublantNeuf)).toEqual([expect.stringMatching(/redoublant, mais entré cette année/)]);
    expect(coherent.messages).toEqual([]);
    for (const r of [directe, oubli, redoublantNeuf, coherent]) {
      expect(r.bloquant).toBe(false);
      expect(r.etudiants[0].statut).toBe("nouveau");
    }
  });
});

describe("étudiant déjà en base", () => {
  const avec = (...e: ReturnType<typeof etudiantEnBase>[]) => contexteReprise({ etudiantsEnBase: e });

  it("n'est pas recréé : statut « existant », matricule cité, avertissement, rien à importer", () => {
    const r = analyser([{}], [], avec(etudiantEnBase()));

    expect(r.bloquant).toBe(false);
    expect(r.etudiants[0]).toMatchObject({ statut: "existant", existant: { id: "etu-1", matricule: "IF-2026-0001" }, filiereId: null, tarif: null });
    expect(avertissements(r)).toEqual([
      expect.stringMatching(/^Rien à importer/),
      expect.stringMatching(/déjà en base sous le matricule IF-2026-0001 : il n'est pas recréé/),
    ]);
    expect(r.totaux.etudiants).toMatchObject({ nouveaux: 0, existants: 1 });
    expect(r.canonique).toContain('["existant",2,"1","etu-1"]');
    expect(r.canonique).not.toContain('"nouveau"');
  });

  it("est reconnu sans tenir compte des accents ni de la casse", () => {
    const r = analyser([{ nom: "rakoto", prenoms: "JÉAN" }], [], avec(etudiantEnBase({ nom: "Rakoto", prenoms: "Jean" })));

    expect(r.etudiants[0].statut).toBe("existant");
  });

  it("un homonyme né un autre jour est un nouvel étudiant", () => {
    const r = analyser([{}], [], avec(etudiantEnBase({ dateNaissance: new Date(Date.UTC(2004, 4, 11)) })));

    expect(r.etudiants[0].statut).toBe("nouveau");
  });

  it("filière différente de celle de la base : bloquant", () => {
    const r = analyser([{ filiere: "SF" }], [], avec(etudiantEnBase()));

    expect(r.bloquant).toBe(true);
    expect(r.etudiants[0]).toMatchObject({ statut: "refuse", existant: { matricule: "IF-2026-0001" } });
    expect(erreurs(r)).toEqual([expect.stringMatching(/étudiant déjà en base \(IF-2026-0001\) en filière IF : la filière d'un étudiant ne change pas/)]);
  });

  it("niveau différent de son inscription courante : bloquant", () => {
    const r = analyser([{ niveau: "1" }], [], avec(etudiantEnBase({ inscriptionCourante: { niveau: 2, redoublement: false, droitsEnTranches: 1 } })));

    expect(r.etudiants[0].statut).toBe("refuse");
    expect(erreurs(r)).toEqual([expect.stringMatching(/inscrit en 2e année en 2026-2027 : corrigez le niveau du fichier/)]);
  });

  it("sans inscription sur l'année courante : bloquant", () => {
    const r = analyser([{}], [], avec(etudiantEnBase({ inscriptionCourante: null })));

    expect(r.etudiants[0].statut).toBe("refuse");
    expect(erreurs(r)).toEqual([expect.stringMatching(/sans inscription en 2026-2027 : inscrivez-le \(Admissions\) ou retirez la ligne/)]);
  });

  it("plusieurs correspondances en base : bloquant, sans choisir", () => {
    const r = analyser([{}], [], avec(etudiantEnBase(), etudiantEnBase({ id: "etu-2", matricule: "IF-2026-0002" })));

    expect(r.etudiants[0]).toMatchObject({ statut: "refuse", existant: null });
    expect(erreurs(r)).toEqual([expect.stringMatching(/plusieurs étudiants en base portent ce nom.*IF-2026-0001, IF-2026-0002/)]);
  });

  it("redoublant, droits en N fois et année d'entrée qui diffèrent : simples avertissements, la base fait foi", () => {
    const base = etudiantEnBase({ anneeEntree: 2025, inscriptionCourante: { niveau: 1, redoublement: true, droitsEnTranches: 3 } });

    const r = analyser([{ redoublant: "non", droitsEnTranches: "1", anneeEntree: "2026" }], [], avec(base));

    expect(r.bloquant).toBe(false);
    expect(r.etudiants[0].statut).toBe("existant");
    expect(avertissements(r)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/la base l'indique redoublant : la base fait foi/),
        expect.stringMatching(/droits en 3 fois dans la base : la base fait foi/),
        expect.stringMatching(/année d'entrée 2025 dans la base : le matricule IF-2026-0001 est conservé/),
      ]),
    );
  });

  it("étudiant sorti : avertissement, ses paiements sont imputés quand même", () => {
    const r = analyser([{}], [{}], avec(etudiantEnBase({ statut: "ABANDON" })));

    expect(r.bloquant).toBe(false);
    expect(avertissements(r)).toEqual(expect.arrayContaining([expect.stringMatching(/étudiant sorti \(Abandon\) : ses paiements sont imputés quand même/)]));
    expect(r.paiements[0].statut).toBe("a_importer");
  });

  it("paiements déjà saisis au guichet : avertissement seulement si le fichier importe un paiement pour lui", () => {
    const un = analyser([{}], [{}], avec(etudiantEnBase({ paiementsHorsReprise: 1 })));
    const deux = analyser([{}], [{}], avec(etudiantEnBase({ paiementsHorsReprise: 2 })));
    const sansPaiement = analyser([{}], [], avec(etudiantEnBase({ paiementsHorsReprise: 2 })));

    expect(avertissements(un)).toEqual(expect.arrayContaining([expect.stringMatching(/1 paiement déjà saisi au guichet/)]));
    expect(avertissements(deux)).toEqual(expect.arrayContaining([expect.stringMatching(/2 paiements déjà saisis au guichet/)]));
    expect(avertissements(sansPaiement).join(" ")).not.toMatch(/guichet/);
  });

  it("un nouvel étudiant n'a aucun avertissement de guichet ni d'impayés antérieurs", () => {
    const r = analyser([{}], [{}]);

    expect(avertissements(r).join(" ")).not.toMatch(/guichet|précédentes/);
  });
});

describe("simulation des paiements", () => {
  it("répartit chaque paiement sur le reste dû, du plus ancien au plus récent, et suit le reste dû", () => {
    const r = analyser([{}], [{ date: "05/10/2026", montant: "100000" }, { date: "20/10/2026", montant: "160000" }]);

    expect(r.bloquant).toBe(false);
    expect(r.paiements.map((p) => [p.statut, p.resteDuAvant, p.resteDuApres, p.anneeRecu])).toEqual([
      ["a_importer", 900_000, 800_000, 2026],
      ["a_importer", 800_000, 640_000, 2026],
    ]);
    expect(r.totaux.paiements).toEqual({ lus: 2, aImporter: 2, dejaImportes: 0, refuses: 0, montantAImporter: 260_000 });
  });

  it("simule dans l'ordre des dates même si le fichier est dans le désordre, et à date égale dans l'ordre des lignes", () => {
    const r = analyser([{}], [
      { date: "20/10/2026", montant: "160000" },
      { date: "05/10/2026", montant: "100000" },
      { date: "20/10/2026", montant: "10000" },
    ]);

    expect(r.paiements.map((p) => [p.ligne, p.donnees?.jour, p.resteDuAvant])).toEqual([
      [3, "2026-10-05", 900_000],
      [2, "2026-10-20", 800_000],
      [4, "2026-10-20", 640_000],
    ]);
  });

  it("un paiement partiel (montant libre) est accepté", () => {
    const r = analyser([{}], [{ montant: "20000" }]);

    expect(r.paiements[0]).toMatchObject({ statut: "a_importer", resteDuAvant: 900_000, resteDuApres: 880_000 });
  });

  it("refuse un trop-perçu au-delà du reste dû de l'étudiant, et le fichier devient bloquant", () => {
    const r = analyser([{}], [{ montant: String(DU_ANNEE + 1) }]);

    expect(r.bloquant).toBe(true);
    expect(r.paiements[0]).toMatchObject({ statut: "refuse", resteDuAvant: null, resteDuApres: null });
    expect(erreurs(r)).toEqual([expect.stringMatching(/Paiements, ligne 2, colonne « Montant \(Ar\) ».*dépasse le reste dû de l'étudiant n° 1 \(900.000.Ar après les paiements précédents\) : trop-perçu refusé/)]);
  });

  it("le montant exact du reste dû est accepté, le suivant n'a plus rien à payer", () => {
    const r = analyser([{}], [{ date: "05/10/2026", montant: String(DU_ANNEE) }, { date: "06/10/2026", montant: "1" }]);

    expect(r.paiements.map((p) => p.statut)).toEqual(["a_importer", "refuse"]);
    expect(r.paiements[0].resteDuApres).toBe(0);
    expect(erreurs(r)).toEqual([expect.stringMatching(/l'étudiant n° 1 n'a plus rien à payer après les paiements précédents : trop-perçu refusé/)]);
  });

  it("un paiement refusé ne consomme rien : le suivant est simulé sur le même reste", () => {
    const r = analyser([{}], [{ date: "05/10/2026", montant: "1000000" }, { date: "06/10/2026", montant: "100000" }]);

    expect(r.paiements.map((p) => [p.statut, p.resteDuAvant])).toEqual([["refuse", null], ["a_importer", 900_000]]);
  });

  it("simule les étudiants séparément", () => {
    const r = analyser([etu(1), etu(2)], [{ numeroEtudiant: "1", montant: "900000" }, { numeroEtudiant: "2", montant: "900000" }]);

    expect(r.bloquant).toBe(false);
    expect(r.paiements.map((p) => p.resteDuAvant)).toEqual([900_000, 900_000]);
  });

  describe("toutes années confondues, la plus ancienne d'abord", () => {
    const echeances = (payeAvant: (ordre: number) => number) => [...echeancesPayees(2025, payeAvant), ...echeancesPayees(2026, (o) => (o === 1 ? 100_000 : 80_000))];
    /** 2025 : tout payé sauf 50 000 Ar sur la 1re mensualité ; 2026 : tout payé. */
    const unResteDe50000 = (o: number) => (o === 1 ? 100_000 : o === 2 ? 30_000 : 80_000);

    it("l'impayé d'une année passée est encaissable, au franc près", () => {
      const ctx = contexteReprise({ etudiantsEnBase: [etudiantEnBase({ echeances: echeances(unResteDe50000) })] });

      const juste = analyser([{}], [{ montant: "50000" }], ctx);
      const trop = analyser([{}], [{ montant: "50001" }], ctx);

      expect(juste.paiements[0]).toMatchObject({ statut: "a_importer", resteDuAvant: 50_000, resteDuApres: 0 });
      expect(trop.paiements[0].statut).toBe("refuse");
      expect(erreurs(trop)).toEqual([expect.stringMatching(/50.001.Ar dépasse le reste dû de l'étudiant n° 1 \(50.000.Ar/)]);
    });

    it("avertit que les impayés des années précédentes seront soldés en premier", () => {
      const ctx = contexteReprise({ etudiantsEnBase: [etudiantEnBase({ echeances: echeances(unResteDe50000) })] });

      const r = analyser([{}], [{ montant: "10000" }], ctx);

      expect(avertissements(r)).toEqual(
        expect.arrayContaining([expect.stringMatching(/ses impayés des années précédentes \(50.000.Ar\) seront soldés en premier/)]),
      );
    });

    it("pas d'avertissement d'impayés antérieurs quand il n'y en a pas", () => {
      const ctx = contexteReprise({ etudiantsEnBase: [etudiantEnBase({ echeances: echeancesPayees(2026, (o) => (o === 1 ? 100_000 : 0)) })] });

      const r = analyser([{}], [{ montant: "10000" }], ctx);

      expect(avertissements(r).join(" ")).not.toMatch(/précédentes/);
    });

    it("les échéances « non dues » après une sortie sortent du reste dû", () => {
      const toutesPayees = echeancesPayees(2026, (o) => (o === 1 ? 100_000 : 80_000));
      const nonDue = { ...toutesPayees[toutesPayees.length - 1], paye: 0, nonDueSortie: true };
      const ctx = contexteReprise({ etudiantsEnBase: [etudiantEnBase({ echeances: [...toutesPayees.slice(0, -1), nonDue] })] });

      const r = analyser([{}], [{ montant: "1000" }], ctx);

      expect(r.paiements[0].statut).toBe("refuse");
      expect(erreurs(r)).toEqual([expect.stringMatching(/n'a plus rien à payer/)]);
    });
  });

  describe("cascade", () => {
    it("les paiements d'un étudiant refusé sont refusés avec sa ligne citée, et le fichier est bloquant", () => {
      const r = analyser([etu(1, { filiere: "ZZ" }), etu(2)], [{ numeroEtudiant: "1", montant: "50000" }, { numeroEtudiant: "2", montant: "50000" }]);

      expect(r.bloquant).toBe(true);
      const cascade = r.paiements.find((p) => p.numeroEtudiant === "1")!;
      expect(cascade).toMatchObject({ statut: "refuse", ligneEtudiant: 2, resteDuAvant: null, cle: null });
      expect(cascade.donnees).not.toBeNull();
      expect(r.paiements.find((p) => p.numeroEtudiant === "2")?.statut).toBe("a_importer");
      expect(erreurs(r)).toEqual(
        expect.arrayContaining([expect.stringMatching(/^Paiements, ligne 2, colonne « N° étudiant » \(« 1 »\) : refusé car l'étudiant de ce N° est refusé \(Étudiants, ligne 2\)/)]),
      );
    });

    it("un N° d'étudiant en double refuse ses paiements sans désigner une seule ligne", () => {
      const r = analyser([etu(1), etu(1, { nom: "AUTRE", prenoms: "Soa" })], [{ numeroEtudiant: "1" }]);

      expect(r.paiements[0]).toMatchObject({ statut: "refuse", ligneEtudiant: null });
      expect(erreurs(r)).toEqual(expect.arrayContaining([expect.stringMatching(/refusé car l'étudiant de ce N° est refusé \(Étudiants, lignes 2, 3\)/)]));
    });

    it("un paiement dont le N° n'existe pas, ou illisible, est refusé sans donnée et rangé en fin de liste", () => {
      const r = analyser([{}], [{ numeroEtudiant: "9", date: "01/10/2026" }, { montant: "0", date: "02/10/2026" }, { date: "30/10/2026" }]);

      expect(r.paiements.map((p) => [p.ligne, p.statut, p.donnees === null])).toEqual([
        [4, "a_importer", false],
        [2, "refuse", true],
        [3, "refuse", true],
      ]);
      expect(r.paiements[1].numeroEtudiant).toBe("9");
    });
  });
});

describe("clé d'un paiement repris", () => {
  const elements: ElementsClePaiement = {
    nom: "RAKOTO", prenoms: "Jean", dateNaissance: "2004-05-10", jour: "2026-10-05", montant: 100_000,
    mode: "ESPECES", operateur: null, reference: null, recuPapier: null, rang: 1,
  };

  it("a la forme « reprise: » + 40 caractères hexadécimaux", () => {
    expect(cleReprisePaiement(elements)).toMatch(new RegExp(`^${PREFIXE_CLE_REPRISE}[0-9a-f]{40}$`));
  });

  it("ne tient pas compte des accents, de la casse, des espaces de la référence ni des zéros du reçu papier", () => {
    const a = cleReprisePaiement({ ...elements, nom: "Rakoto", prenoms: "JÉAN", reference: "mp 12 3", recuPapier: "0412" });
    const b = cleReprisePaiement({ ...elements, nom: "RAKOTO", prenoms: "jean", reference: "MP123", recuPapier: "412" });

    expect(a).toBe(b);
  });

  it("change dès qu'un élément du paiement change", () => {
    const base = cleReprisePaiement(elements);
    const variantes: Partial<ElementsClePaiement>[] = [
      { montant: 100_001 }, { jour: "2026-10-06" }, { mode: "MOBILE_MONEY" }, { operateur: "MVOLA" }, { reference: "X" },
      { recuPapier: "1" }, { rang: 2 }, { nom: "RASOA" }, { prenoms: "Soa" }, { dateNaissance: "2004-05-11" },
    ];

    for (const v of variantes) expect(cleReprisePaiement({ ...elements, ...v }), JSON.stringify(v)).not.toBe(base);
  });

  it("deux paiements identiques du même étudiant reçoivent des clés différentes (rang), stables d'une analyse à l'autre", () => {
    const fichier = [{ montant: "50000" }, { montant: "50000" }];

    const a = analyser([{}], fichier);
    const b = analyser([{}], fichier);

    const cles = a.paiements.map((p) => p.cle);
    expect(new Set(cles).size).toBe(2);
    expect(b.paiements.map((p) => p.cle)).toEqual(cles);
  });

  it("l'ordre des lignes du fichier ne change pas l'ensemble des clés ; le N° et la ligne n'y entrent pas", () => {
    const a = analyser([{ numero: "1" }], [{ date: "05/10/2026", montant: "50000" }, { date: "06/10/2026", montant: "70000" }]);
    const b = analyser([{ numero: "42" }], [{ numeroEtudiant: "42", date: "06/10/2026", montant: "70000" }, { numeroEtudiant: "42", date: "05/10/2026", montant: "50000" }]);

    expect(b.paiements.map((p) => p.cle)).toEqual(a.paiements.map((p) => p.cle));
  });

  it("un paiement identique à un autre mais de rang 2 se reconnaît dès le premier import : rang 1 déjà importé, rang 2 à importer", () => {
    const fichier = [{ montant: "50000" }, { montant: "50000" }];
    const premiere = analyser([{}], fichier);
    const [cle1] = premiere.paiements.map((p) => p.cle!);

    const seconde = analyser([{}], fichier, contexteReprise({ clesReprise: new Set([cle1]) }));

    expect(seconde.paiements.map((p) => p.statut)).toEqual(["deja_importe", "a_importer"]);
  });
});

describe("paiement déjà importé", () => {
  const fichier = [{ date: "05/10/2026", montant: "900000" }, { date: "06/10/2026", montant: "100000" }];

  it("est reconnu par sa clé, non simulé et exclu du plan à écrire", () => {
    const premiere = analyser([{}], fichier);
    const cle = premiere.paiements[0].cle!;

    const r = analyser([{}], fichier, contexteReprise({ clesReprise: new Set([cle]) }));

    expect(r.paiements[0]).toMatchObject({ statut: "deja_importe", resteDuAvant: null, resteDuApres: null, anneeRecu: null });
    expect(r.paiements[1]).toMatchObject({ statut: "a_importer", resteDuAvant: 900_000 });
    expect(r.totaux.paiements).toMatchObject({ aImporter: 1, dejaImportes: 1, montantAImporter: 100_000 });
    expect(r.canonique).not.toContain(cle);
    expect(r.canonique).toContain(r.paiements[1].cle);
  });

  it("tout déjà en base : « Rien à importer », sans erreur", () => {
    const premiere = analyser([{}], [{ montant: "50000" }]);
    const ctx = contexteReprise({ etudiantsEnBase: [etudiantEnBase()], clesReprise: new Set([premiere.paiements[0].cle!]) });

    const r = analyser([{}], [{ montant: "50000" }], ctx);

    expect(r.bloquant).toBe(false);
    expect(r.paiements[0].statut).toBe("deja_importe");
    expect(avertissements(r)).toEqual(expect.arrayContaining([expect.stringMatching(/^Rien à importer/)]));
  });

  it("une clé de reprise inconnue du fichier n'a aucun effet", () => {
    const deux = [{ date: "05/10/2026", montant: "500000" }, { date: "06/10/2026", montant: "100000" }];

    const r = analyser([{}], deux, contexteReprise({ clesReprise: new Set([`${PREFIXE_CLE_REPRISE}${"0".repeat(40)}`]) }));

    expect(r.paiements.map((p) => p.statut)).toEqual(["a_importer", "a_importer"]);
  });
});

describe("ordre du plan", () => {
  it("étudiants par filière, année d'entrée puis N° numérique ; lignes illisibles à la fin", () => {
    const r = analyser([
      etu(2, { filiere: "SF" }),
      etu(10),
      etu(3, { niveau: "2", anneeEntree: "2025" }),
      etu(9),
      etu(1),
      etu(4, { sexe: "?" }),
    ]);

    expect(r.etudiants.map((e) => [e.numero, e.statut])).toEqual([
      ["3", "nouveau"], ["1", "nouveau"], ["9", "nouveau"], ["10", "nouveau"], ["2", "nouveau"], ["4", "refuse"],
    ]);
    expect(r.etudiants.at(-1)?.donnees).toBeNull();
  });

  it("paiements par date puis par ligne ; les lignes illisibles à la fin", () => {
    const r = analyser([{}], [{ date: "09/10/2026" }, { date: "01/10/2026" }, { montant: "x" }, { date: "09/10/2026" }]);

    expect(r.paiements.map((p) => p.ligne)).toEqual([3, 2, 5, 4]);
  });

  it("messages : lignes dans l'ordre, erreur avant avertissement sur une même ligne, Étudiants avant Paiements", () => {
    const r = analyser(
      [etu(1, { filiere: "ZZ", niveau: "2", anneeEntree: "2026" }), etu(2, { sexe: "?" })],
      [{ numeroEtudiant: "1", montant: "x" }],
    );

    expect(r.messages.map((m) => [m.feuille, m.ligne, m.gravite])).toEqual([
      ["Étudiants", 2, "erreur"],
      ["Étudiants", 2, "avertissement"],
      ["Étudiants", 3, "erreur"],
      ["Paiements", 2, "erreur"],
    ]);
  });
});

describe("rapport signé", () => {
  const fichier = (montant = "100000") => [{ montant }];

  it("le canonique est identique d'une analyse à l'autre, quel que soit l'ordre des tarifs du contexte", () => {
    const base = contexteReprise();
    const a = analyser([{}], fichier());
    const b = analyser([{}], fichier(), contexteReprise({ tarifs: [...base.tarifs].reverse(), filieres: [...base.filieres].reverse() }));

    expect(b.canonique).toBe(a.canonique);
    expect(signatureReprise(a.canonique)).toBe(signatureReprise(b.canonique));
    expect(signatureReprise(a.canonique)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("une ligne JSON par élément à écrire, l'année d'abord", () => {
    const lignes = analyser([{}], fichier()).canonique.split("\n");

    expect(lignes).toHaveLength(3);
    expect(lignes[0]).toBe('["annee","annee-2026","2026-2027"]');
    expect(lignes[1]).toMatch(/^\["nouveau",2,"1","RAKOTO","Jean","M","2004-05-10"/);
    expect(lignes[2]).toMatch(/^\["paiement",2,"reprise:[0-9a-f]{40}",2,"2026-10-05",100000,"ESPECES"/);
  });

  it("la signature change quand un paiement, un étudiant ou un tarif change", () => {
    const base = signatureReprise(analyser([{}], fichier()).canonique);
    const autres = [
      analyser([{}], fichier("100001")),
      analyser([{ adresse: "Autre adresse" }], fichier()),
      analyser([{ niveau: "2", anneeEntree: "2025" }], fichier()),
      analyser([{}], fichier(), contexteReprise({ tarifs: [{ filiereId: "fil-if", niveau: 1, ...TARIF_STANDARD, montantMensuel: 85_000 }] })),
      analyser([{}], [...fichier(), { date: "07/10/2026" }]),
    ];

    for (const r of autres) expect(signatureReprise(r.canonique)).not.toBe(base);
  });

  it("la signature ne dépend pas des avertissements : un reçu émis entre le rapport et l'import ne la change pas", () => {
    const a = analyser([{}], fichier());
    const b = analyser([{}], fichier(), contexteReprise({ compteursRecu: { 2026: 12 } }));

    expect(b.messages).not.toEqual(a.messages);
    expect(b.canonique).toBe(a.canonique);
  });

  it("les paiements refusés n'entrent pas dans le canonique", () => {
    const r = analyser([{}], [{ montant: "100000" }, { montant: "5000000", date: "06/10/2026" }]);

    expect(r.canonique.split("\n").filter((l) => l.startsWith('["paiement"'))).toHaveLength(1);
  });
});

describe("reçus déjà émis", () => {
  const fichier = [{ date: "05/10/2026" }];

  it("avertit que l'ordre des dates ne sera plus suivi quand des reçus de l'année existent", () => {
    const r = analyser([{}], fichier, contexteReprise({ compteursRecu: { 2026: 42 } }));

    expect(r.bloquant).toBe(false);
    expect(avertissements(r)).toEqual([expect.stringMatching(/des reçus 2026 existent déjà \(jusqu'à R-2026-00042\).*ne suivront plus l'ordre des dates/)]);
  });

  it("aucun avertissement sans reçu existant, ou sans paiement à importer cette année-là", () => {
    expect(analyser([{}], fichier, contexteReprise({ compteursRecu: { 2026: 0 } })).messages).toEqual([]);
    expect(analyser([{}], fichier, contexteReprise({ compteursRecu: {} })).messages).toEqual([]);
    expect(analyser([{}], [], contexteReprise({ compteursRecu: { 2026: 42 } })).messages).toEqual([]);
  });

  it("le numéro cité ne dépasse jamais la séquence maximale", () => {
    const r = analyser([{}], fichier, contexteReprise({ compteursRecu: { 2026: 123_456 } }));

    expect(avertissements(r)).toEqual([expect.stringMatching(/jusqu'à R-2026-99999/)]);
  });

  it("un avertissement par année civile de reçu concernée", () => {
    const r = analyser([{}], [{ date: "20/12/2026", montant: "10000" }, { date: "10/01/2027", montant: "10000" }], contexteReprise({ compteursRecu: { 2026: 3, 2027: 5 } }), "2027-02-01");

    expect(avertissements(r)).toEqual([expect.stringMatching(/reçus 2026.*R-2026-00003/), expect.stringMatching(/reçus 2027.*R-2027-00005/)]);
    expect(r.paiements.map((p) => p.anneeRecu)).toEqual([2026, 2027]);
  });
});

describe("un seul CSV et lectures préalables", () => {
  it("sans fichier de paiements : les étudiants sont planifiés, aucun paiement", () => {
    const r = analyser([{}], null);

    expect(r.bloquant).toBe(false);
    expect(r.etudiants).toHaveLength(1);
    expect(r.paiements).toEqual([]);
    expect(r.totaux.paiements.lus).toBe(0);
  });

  it("jours de naissance cités : uniques, triés, les dates illisibles ignorées", () => {
    const lu = reprise([etu(1, { dateNaissance: "10/05/2004" }), etu(2, { dateNaissance: "01/02/2003" }), etu(3, { dateNaissance: "10/05/2004" }), etu(4, { dateNaissance: "n'importe quoi" })]);

    expect(joursNaissanceCites(lu)).toEqual(["2003-02-01", "2004-05-10"]);
  });

  it("années civiles des paiements citées : uniques, triées", () => {
    const lu = reprise([{}], [{ date: "10/01/2027" }, { date: "05/10/2026" }, { date: "20/12/2026" }, { date: "xx" }]);

    expect(anneesPaiementsCitees(lu)).toEqual([2026, 2027]);
  });
});

describe("écriture d'un paiement repris", () => {
  it("date le paiement du jour du fichier à 12:00 heure de Madagascar (09:00 UTC)", () => {
    expect(instantReprise("2026-10-05").toISOString()).toBe("2026-10-05T09:00:00.000Z");
  });

  it("garde le reçu papier en observation, ou une mention seule sans reçu papier", () => {
    expect(observationReprise("0412")).toBe("Reprise des données · reçu papier n° 0412");
    expect(observationReprise(null)).toBe("Reprise des données");
  });
});

describe("modèle brut téléchargé", () => {
  const lignesExemple = (r: RapportReprise) => erreurs(r).filter((t) => /ligne d'exemple du modèle/.test(t));

  async function analyserFichiers(fichiers: { nom: string; octets: Uint8Array }[]) {
    const lu = await lireFichiersReprise(fichiers);
    if (!lu.ok) throw new Error(lu.erreur);
    return analyserReprise(lu.lu, contexteReprise(), JOUR_ANALYSE);
  }

  it("est refusé en CSV : ses 3 étudiants et ses 3 paiements d'exemple sont bloquants", async () => {
    const enc = new TextEncoder();
    const r = await analyserFichiers([
      { nom: "etudiants.csv", octets: enc.encode(csvEtudiants(PARAMETRES_MODELE_EXEMPLE)) },
      { nom: "paiements.csv", octets: enc.encode(csvPaiements(PARAMETRES_MODELE_EXEMPLE)) },
    ]);

    expect(r.bloquant).toBe(true);
    expect(lignesExemple(r)).toHaveLength(6);
    expect(r.totaux.etudiants).toMatchObject({ lus: 3, nouveaux: 0, refuses: 3 });
    expect(r.totaux.paiements).toMatchObject({ lus: 3, aImporter: 0, refuses: 3 });
  });

  it("est refusé en xlsx, avec les mêmes lignes d'exemple", async () => {
    const classeur = new Uint8Array(await writeXlsxFile(feuillesModele(PARAMETRES_MODELE_EXEMPLE)).toBuffer());

    const r = await analyserFichiers([{ nom: "modele.xlsx", octets: classeur }]);

    expect(r.bloquant).toBe(true);
    expect(lignesExemple(r)).toHaveLength(6);
  });
});

describe("allegerRapport", () => {
  const rapport = () =>
    analyser(
      [etu(1), etu(2, { filiere: "ZZ" }), etu(3, { sexe: "?" })],
      [
        { numeroEtudiant: "1", date: "05/10/2026", montant: "50000" },
        { numeroEtudiant: "1", date: "20/10/2026", montant: "100000" },
        { numeroEtudiant: "1", date: "21/10/2026", montant: "5000000" },
        { numeroEtudiant: "2", date: "06/10/2026", montant: "10000" },
        { numeroEtudiant: "9", date: "07/10/2026", montant: "10000" },
      ],
    );

  it("ne garde ni les lignes de paiements ni le canonique", () => {
    const allege = allegerRapport(rapport());

    expect(allege).not.toHaveProperty("paiements");
    expect(allege).not.toHaveProperty("canonique");
    expect(Object.keys(allege).sort()).toEqual(["annee", "bloquant", "etudiants", "messages", "paiementsRefuses", "recapPaiements", "totaux"]);
  });

  it("récapitule les paiements par étudiant accepté, avec le reste dû après le dernier paiement importé", () => {
    const allege = allegerRapport(rapport());

    expect(allege.recapPaiements).toEqual([
      { ligneEtudiant: 2, numero: "1", aImporter: 2, montantAImporter: 150_000, dejaImportes: 0, refuses: 1, resteApres: 750_000 },
    ]);
  });

  it("liste les paiements refusés (trop-perçu, étudiant refusé, illisible) avec ce qu'on en sait", () => {
    const allege = allegerRapport(rapport());

    expect(allege.paiementsRefuses).toEqual([
      { ligne: 5, numeroEtudiant: "2", jour: "2026-10-06", montant: 10_000 },
      { ligne: 4, numeroEtudiant: "1", jour: "2026-10-21", montant: 5_000_000 },
      { ligne: 6, numeroEtudiant: "9", jour: null, montant: null },
    ]);
  });

  it("étudiants : identité lue pour les lignes valides, null pour une ligne illisible", () => {
    const allege = allegerRapport(rapport());

    expect(allege.etudiants.map((e) => [e.numero, e.statut, e.nom, e.filiere, e.duAnnee])).toEqual([
      ["1", "nouveau", "NOM1", "IF", 900_000],
      ["2", "refuse", "NOM2", "ZZ", null],
      ["3", "refuse", null, null, null],
    ]);
  });

  it("un étudiant sans paiement n'a pas de récapitulatif ; un paiement déjà importé est compté à part", () => {
    const premiere = analyser([etu(1), etu(2)], [{ numeroEtudiant: "1", montant: "50000" }]);
    const cle = premiere.paiements[0].cle!;

    const allege = allegerRapport(analyser([etu(1), etu(2)], [{ numeroEtudiant: "1", montant: "50000" }], contexteReprise({ clesReprise: new Set([cle]) })));

    expect(allege.recapPaiements).toEqual([
      { ligneEtudiant: 2, numero: "1", aImporter: 0, montantAImporter: 0, dejaImportes: 1, refuses: 0, resteApres: null },
    ]);
  });
});
