import writeXlsxFile from "write-excel-file/node";
import { describe, expect, it } from "vitest";
import {
  allegerRapport,
  analyserReprise,
  joursNaissanceCites,
  signatureReprise,
  type ContexteReprise,
  type RapportReprise,
} from "@/lib/import-analyse";
import { messageImport, PAIEMENTS_IGNORES } from "@/lib/import-lecture";
import { PARAMETRES_MODELE_EXEMPLE } from "@/lib/import-modele";
import { csvEtudiants, feuillesModele } from "@/lib/import-modele-fichiers";
import { lireFichiersReprise } from "@/server/import/lire-fichiers";
import { contexteReprise, etudiantEnBase, JOUR_ANALYSE, reprise, TARIF_STANDARD } from "../factories/reprise";

type LigneE = Parameters<typeof reprise>[0][number];

const DU_ANNEE = 900_000;

/** Étudiant n° `n` d'identité propre, pour que deux lignes ne soient jamais prises pour un doublon. */
const etu = (n: number, surcharge: LigneE = {}): LigneE => ({ numero: String(n), nom: `NOM${n}`, prenoms: `Prenom${n}`, ...surcharge });

function analyser(
  etudiants: LigneE[] = [{}],
  ctx: ContexteReprise = contexteReprise(),
  jour = JOUR_ANALYSE,
  options?: Parameters<typeof reprise>[1],
): RapportReprise {
  return analyserReprise(reprise(etudiants, options), ctx, jour);
}

const textes = (r: RapportReprise, gravite: "erreur" | "avertissement") => r.messages.filter((m) => m.gravite === gravite).map((m) => m.texte);
const erreurs = (r: RapportReprise) => textes(r, "erreur");
const avertissements = (r: RapportReprise) => textes(r, "avertissement");

describe("contrôles globaux", () => {
  it("sans année courante : bloquant, aucun plan, une seule erreur claire", () => {
    const r = analyser([{}], contexteReprise({ anneeCourante: null }));

    expect(r.bloquant).toBe(true);
    expect(r.annee).toBeNull();
    expect(erreurs(r)).toEqual([expect.stringMatching(/^Aucune année scolaire courante : définissez-la dans Paramètres › Années/)]);
    expect(r.etudiants).toEqual([]);
    expect(r.totaux.etudiants.lus).toBe(1);
    expect(r.canonique).toBe("");
  });

  it("année courante clôturée : bloquant, aucun plan", () => {
    const base = contexteReprise();
    const r = analyser([{}], contexteReprise({ anneeCourante: { ...base.anneeCourante!, cloturee: true } }));

    expect(r.bloquant).toBe(true);
    expect(r.annee).toEqual({ id: "annee-2026", libelle: "2026-2027" });
    expect(erreurs(r)).toEqual([expect.stringMatching(/L'année 2026-2027 est clôturée/)]);
    expect(r.etudiants).toEqual([]);
  });

  it("erreur de structure du fichier : bloquant, pas de plan, l'erreur de lecture est conservée", () => {
    const r = analyser([{}], contexteReprise(), JOUR_ANALYSE, { sans: ["nom"] });

    expect(r.bloquant).toBe(true);
    expect(erreurs(r)).toEqual([expect.stringMatching(/colonne obligatoire « Nom » absente/)]);
    expect(r.etudiants).toEqual([]);
  });

  it("« Niveau X » doit être l'année courante : un modèle d'une autre année est refusé", () => {
    const r = analyser([{}], contexteReprise(), JOUR_ANALYSE, { enteteNiveau: "Niveau 2025-2026 *" });

    expect(r.bloquant).toBe(true);
    expect(erreurs(r)).toEqual([expect.stringMatching(/Niveau 2025-2026.*ne correspond pas à l'année courante 2026-2027 : téléchargez le modèle de 2026-2027/)]);
  });

  it("un en-tête « Niveau » sans année est refusé", () => {
    const r = analyser([{}], contexteReprise(), JOUR_ANALYSE, { enteteNiveau: "Niveau *" });

    expect(erreurs(r)).toEqual([expect.stringMatching(/l'en-tête doit dire l'année : « Niveau 2026-2027 »/)]);
  });

  it("l'en-tête de l'année courante est accepté, avec « * » ou sans", () => {
    expect(analyser([{}], contexteReprise(), JOUR_ANALYSE, { enteteNiveau: "Niveau 2026-2027" }).bloquant).toBe(false);
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

    const r = analyser([{}], ctx);

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

    const r = analyser([{ niveau: "3", anneeEntree: "2024" }], ctx);

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

  it("droits du tarif invalides : refusé, signalé sur la colonne du niveau", () => {
    const ctx = contexteReprise({ tarifs: [{ filiereId: "fil-if", niveau: 1, droitsInscription: 0, montantMensuel: 80_000, nombreMois: 10 }] });

    const r = analyser([{}], ctx);

    expect(r.etudiants[0].statut).toBe("refuse");
    expect(erreurs(r)).toEqual([expect.stringMatching(/colonne « Niveau » \(« 1 »\) : Les droits d'inscription du tarif sont invalides/)]);
  });

  it("de petits droits ne sont plus refusés : une seule échéance de droits, pas de découpage", () => {
    const ctx = contexteReprise({ tarifs: [{ filiereId: "fil-if", niveau: 1, droitsInscription: 2_000, montantMensuel: 80_000, nombreMois: 10 }] });

    const r = analyser([{}], ctx);

    expect(r.etudiants[0]).toMatchObject({ statut: "nouveau", duAnnee: 2_000 + 800_000 });
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

describe("frais de l'année courante", () => {
  const FRAIS_IF_1 = { id: "frais-examen", montant: 15_000, mois: new Date(Date.UTC(2027, 2, 1)), rang: 1, classes: [{ filiereId: "fil-if", niveau: 1 }] };
  const FRAIS_IF_2_ET_SF_1 = {
    id: "frais-stage",
    montant: 20_000,
    mois: new Date(Date.UTC(2027, 4, 1)),
    rang: 2,
    classes: [{ filiereId: "fil-if", niveau: 2 }, { filiereId: "fil-sf", niveau: 1 }],
  };
  const avecFrais = () => contexteReprise({ frais: [FRAIS_IF_1, FRAIS_IF_2_ET_SF_1] });

  it("un nouvel étudiant reçoit les frais de sa classe, et eux seuls ; le dû de l'année les compte", () => {
    const r = analyser([etu(1), etu(2, { filiere: "SF" }), etu(3, { niveau: "2" }), etu(4, { niveau: "3" })], avecFrais());

    const parNumero = Object.fromEntries(r.etudiants.map((e) => [e.numero, e]));
    expect(parNumero["1"]).toMatchObject({ statut: "nouveau", fraisIds: ["frais-examen"], duAnnee: DU_ANNEE + 15_000 });
    expect(parNumero["2"]).toMatchObject({ fraisIds: ["frais-stage"], duAnnee: DU_ANNEE + 20_000 });
    expect(parNumero["3"]).toMatchObject({ fraisIds: ["frais-stage"], duAnnee: DU_ANNEE + 20_000 });
    expect(parNumero["4"]).toMatchObject({ fraisIds: [], duAnnee: DU_ANNEE });
  });

  it("deux frais d'une même classe : dans l'ordre de création", () => {
    const second = { ...FRAIS_IF_1, id: "frais-second", rang: 5 };
    const premier = { ...FRAIS_IF_1, id: "frais-premier", rang: 3 };

    const r = analyser([{}], contexteReprise({ frais: [second, premier] }));

    expect(r.etudiants[0].fraisIds).toEqual(["frais-premier", "frais-second"]);
  });

  it("sans frais dans le contexte : aucune échéance de frais, dû inchangé", () => {
    const r = analyser([{}]);
    expect(r.etudiants[0]).toMatchObject({ fraisIds: [], duAnnee: DU_ANNEE });
  });

  it("les frais copiés entrent dans le plan signé : un frais de plus change la signature de confirmation", () => {
    const sans = analyser([{}]);
    const avec = analyser([{}], avecFrais());

    expect(avec.canonique).toContain("frais-examen");
    expect(signatureReprise(avec.canonique)).not.toBe(signatureReprise(sans.canonique));
  });
});

describe("étudiant déjà en base", () => {
  const avec = (...e: ReturnType<typeof etudiantEnBase>[]) => contexteReprise({ etudiantsEnBase: e });

  it("n'est pas recréé : statut « existant », matricule cité, avertissement, rien à importer", () => {
    const r = analyser([{}], avec(etudiantEnBase()));

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
    const r = analyser([{ nom: "rakoto", prenoms: "JÉAN" }], avec(etudiantEnBase({ nom: "Rakoto", prenoms: "Jean" })));

    expect(r.etudiants[0].statut).toBe("existant");
  });

  it("un homonyme né un autre jour est un nouvel étudiant", () => {
    const r = analyser([{}], avec(etudiantEnBase({ dateNaissance: new Date(Date.UTC(2004, 4, 11)) })));

    expect(r.etudiants[0].statut).toBe("nouveau");
  });

  it("filière différente de celle de la base : bloquant", () => {
    const r = analyser([{ filiere: "SF" }], avec(etudiantEnBase()));

    expect(r.bloquant).toBe(true);
    expect(r.etudiants[0]).toMatchObject({ statut: "refuse", existant: { matricule: "IF-2026-0001" } });
    expect(erreurs(r)).toEqual([expect.stringMatching(/étudiant déjà en base \(IF-2026-0001\) en filière IF : la filière d'un étudiant ne change pas/)]);
  });

  it("niveau différent de son inscription courante : bloquant", () => {
    const r = analyser([{ niveau: "1" }], avec(etudiantEnBase({ inscriptionCourante: { niveau: 2, redoublement: false } })));

    expect(r.etudiants[0].statut).toBe("refuse");
    expect(erreurs(r)).toEqual([expect.stringMatching(/inscrit en 2e année en 2026-2027 : corrigez le niveau du fichier/)]);
  });

  it("sans inscription sur l'année courante : bloquant", () => {
    const r = analyser([{}], avec(etudiantEnBase({ inscriptionCourante: null })));

    expect(r.etudiants[0].statut).toBe("refuse");
    expect(erreurs(r)).toEqual([expect.stringMatching(/sans inscription en 2026-2027 : inscrivez-le \(Admissions\) ou retirez la ligne/)]);
  });

  it("plusieurs correspondances en base : bloquant, sans choisir", () => {
    const r = analyser([{}], avec(etudiantEnBase(), etudiantEnBase({ id: "etu-2", matricule: "IF-2026-0002" })));

    expect(r.etudiants[0]).toMatchObject({ statut: "refuse", existant: null });
    expect(erreurs(r)).toEqual([expect.stringMatching(/plusieurs étudiants en base portent ce nom.*IF-2026-0001, IF-2026-0002/)]);
  });

  it("redoublant et année d'entrée qui diffèrent : simples avertissements, la base fait foi", () => {
    const base = etudiantEnBase({ anneeEntree: 2025, inscriptionCourante: { niveau: 1, redoublement: true } });

    const r = analyser([{ redoublant: "non", anneeEntree: "2026" }], avec(base));

    expect(r.bloquant).toBe(false);
    expect(r.etudiants[0].statut).toBe("existant");
    expect(avertissements(r)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/la base l'indique redoublant : la base fait foi/),
        expect.stringMatching(/année d'entrée 2025 dans la base : le matricule IF-2026-0001 est conservé/),
      ]),
    );
  });

  it("étudiant sorti : signalé dans l'avertissement « déjà en base », rien n'est écrit pour lui", () => {
    const r = analyser([{}], avec(etudiantEnBase({ statut: "ABANDON" })));

    expect(r.bloquant).toBe(false);
    expect(r.etudiants[0].statut).toBe("existant");
    expect(avertissements(r)).toEqual(expect.arrayContaining([expect.stringMatching(/déjà en base sous le matricule IF-2026-0001, sorti \(Abandon\) : il n'est pas recréé\.$/)]));
  });
});

describe("ancien fichier avec des paiements", () => {
  it("l'avertissement de la feuille Paiements ignorée ne bloque pas : les étudiants sont planifiés", () => {
    const lu = { ...reprise([{}]), messages: [messageImport("avertissement", PAIEMENTS_IGNORES)] };

    const r = analyserReprise(lu, contexteReprise(), JOUR_ANALYSE);

    expect(r.bloquant).toBe(false);
    expect(r.etudiants[0]).toMatchObject({ statut: "nouveau", duAnnee: DU_ANNEE });
    expect(r.messages).toEqual([expect.objectContaining({ gravite: "avertissement", feuille: null, texte: PAIEMENTS_IGNORES })]);
  });

  it("le plan et sa signature ne dépendent pas des paiements ignorés", () => {
    const sans = analyser([{}]);
    const avec = analyserReprise({ ...reprise([{}]), messages: [messageImport("avertissement", PAIEMENTS_IGNORES)] }, contexteReprise(), JOUR_ANALYSE);

    expect(avec.canonique).toBe(sans.canonique);
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

  it("messages : globaux d'abord, puis lignes dans l'ordre, erreur avant avertissement sur une même ligne", () => {
    const lu = { ...reprise([etu(1, { filiere: "ZZ", niveau: "2", anneeEntree: "2026" }), etu(2, { sexe: "?" })]), messages: [messageImport("avertissement", PAIEMENTS_IGNORES)] };

    const r = analyserReprise(lu, contexteReprise(), JOUR_ANALYSE);

    expect(r.messages.map((m) => [m.feuille, m.ligne, m.gravite])).toEqual([
      [null, null, "avertissement"],
      ["Étudiants", 2, "erreur"],
      ["Étudiants", 2, "avertissement"],
      ["Étudiants", 3, "erreur"],
    ]);
  });
});

describe("rapport signé", () => {
  it("le canonique est identique d'une analyse à l'autre, quel que soit l'ordre des tarifs du contexte", () => {
    const base = contexteReprise();
    const a = analyser([{}]);
    const b = analyser([{}], contexteReprise({ tarifs: [...base.tarifs].reverse(), filieres: [...base.filieres].reverse() }));

    expect(b.canonique).toBe(a.canonique);
    expect(signatureReprise(a.canonique)).toBe(signatureReprise(b.canonique));
    expect(signatureReprise(a.canonique)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("une ligne JSON par élément à écrire, l'année d'abord, aucun paiement", () => {
    const lignes = analyser([{}]).canonique.split("\n");

    expect(lignes).toHaveLength(2);
    expect(lignes[0]).toBe('["annee","annee-2026","2026-2027"]');
    expect(lignes[1]).toMatch(/^\["nouveau",2,"1","RAKOTO","Jean","M","2004-05-10"/);
  });

  it("la signature change quand un étudiant ou un tarif change", () => {
    const base = signatureReprise(analyser([{}]).canonique);
    const autres = [
      analyser([{ adresse: "Autre adresse" }]),
      analyser([{ niveau: "2", anneeEntree: "2025" }]),
      analyser([{}, etu(2)]),
      analyser([{}], contexteReprise({ tarifs: [{ filiereId: "fil-if", niveau: 1, ...TARIF_STANDARD, montantMensuel: 85_000 }] })),
    ];

    for (const r of autres) expect(signatureReprise(r.canonique)).not.toBe(base);
  });

  it("les étudiants refusés n'entrent pas dans le canonique", () => {
    const r = analyser([{}, etu(2, { filiere: "ZZ" })]);

    expect(r.canonique.split("\n").filter((l) => l.startsWith('["nouveau"'))).toHaveLength(1);
  });
});

describe("lectures préalables", () => {
  it("jours de naissance cités : uniques, triés, les dates illisibles ignorées", () => {
    const lu = reprise([etu(1, { dateNaissance: "10/05/2004" }), etu(2, { dateNaissance: "01/02/2003" }), etu(3, { dateNaissance: "10/05/2004" }), etu(4, { dateNaissance: "n'importe quoi" })]);

    expect(joursNaissanceCites(lu)).toEqual(["2003-02-01", "2004-05-10"]);
  });
});

describe("modèle brut téléchargé", () => {
  const lignesExemple = (r: RapportReprise) => erreurs(r).filter((t) => /ligne d'exemple du modèle/.test(t));

  async function analyserFichiers(fichiers: { nom: string; octets: Uint8Array }[]) {
    const lu = await lireFichiersReprise(fichiers);
    if (!lu.ok) throw new Error(lu.erreur);
    return analyserReprise(lu.lu, contexteReprise(), JOUR_ANALYSE);
  }

  it("est refusé en CSV : ses 3 étudiants d'exemple sont bloquants", async () => {
    const r = await analyserFichiers([{ nom: "etudiants.csv", octets: new TextEncoder().encode(csvEtudiants(PARAMETRES_MODELE_EXEMPLE)) }]);

    expect(r.bloquant).toBe(true);
    expect(lignesExemple(r)).toHaveLength(3);
    expect(r.totaux.etudiants).toMatchObject({ lus: 3, nouveaux: 0, refuses: 3 });
  });

  it("est refusé en xlsx, avec les mêmes lignes d'exemple", async () => {
    const classeur = new Uint8Array(await writeXlsxFile(feuillesModele(PARAMETRES_MODELE_EXEMPLE)).toBuffer());

    const r = await analyserFichiers([{ nom: "modele.xlsx", octets: classeur }]);

    expect(r.bloquant).toBe(true);
    expect(lignesExemple(r)).toHaveLength(3);
  });
});

describe("allegerRapport", () => {
  const rapport = () => analyser([etu(1), etu(2, { filiere: "ZZ" }), etu(3, { sexe: "?" })]);

  it("ne garde que ce que l'écran affiche : ni plan interne ni canonique", () => {
    const allege = allegerRapport(rapport());

    expect(allege).not.toHaveProperty("canonique");
    expect(Object.keys(allege).sort()).toEqual(["annee", "bloquant", "etudiants", "messages", "totaux"]);
    expect(Object.keys(allege.totaux).sort()).toEqual(["avertissements", "erreurs", "etudiants"]);
  });

  it("étudiants : identité lue pour les lignes valides, null pour une ligne illisible", () => {
    const allege = allegerRapport(rapport());

    expect(allege.etudiants.map((e) => [e.numero, e.statut, e.nom, e.filiere, e.duAnnee])).toEqual([
      ["1", "nouveau", "NOM1", "IF", 900_000],
      ["2", "refuse", "NOM2", "ZZ", null],
      ["3", "refuse", null, null, null],
    ]);
    expect(allege.etudiants[0]).not.toHaveProperty("tarif");
    expect(allege.etudiants[0]).not.toHaveProperty("filiereId");
  });
});
