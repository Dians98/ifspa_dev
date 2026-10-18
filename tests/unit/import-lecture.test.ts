import writeXlsxFile from "write-excel-file/node";
import { describe, expect, it } from "vitest";
import {
  anneeDeEnteteNiveau,
  cellule,
  colonneDeEntete,
  decouperCsv,
  ETUDIANTS_MAX,
  lettreColonne,
  lireCsv,
  lireReprise,
  messageImport,
  natureTableau,
  normaliserEntete,
  PAIEMENTS_MAX,
  texteCellule,
} from "@/lib/import-lecture";
import { COLONNES_ETUDIANTS, COLONNES_PAIEMENTS, PARAMETRES_MODELE_EXEMPLE } from "@/lib/import-modele";
import { csvEtudiants, csvPaiements, feuillesModele } from "@/lib/import-modele-fichiers";
import { fichiersDepuisFormData, lireFichiersReprise, TAILLE_MAX_OCTETS, type FichierRecu } from "@/server/import/lire-fichiers";
import { reprise, tableauEtudiants, tableauPaiements } from "../factories/reprise";

const octets = (t: string) => new TextEncoder().encode(t);
const fichier = (nom: string, contenu: Uint8Array | string): FichierRecu => ({ nom, octets: typeof contenu === "string" ? octets(contenu) : contenu });
const erreurs = <M extends { gravite: string }>(m: M[]) => m.filter((x) => x.gravite === "erreur");
const avertissements = <M extends { gravite: string }>(m: M[]) => m.filter((x) => x.gravite === "avertissement");

describe("lecture d'un CSV", () => {
  it("retire le BOM UTF-8 et lit le point-virgule", () => {
    const lu = lireCsv(octets("\uFEFFN°;Nom\r\n1;RAKOTO\r\n"), "etudiants.csv");

    expect(lu).toEqual({ ok: true, lignes: [["N°", "Nom"], ["1", "RAKOTO"]], avertissement: null });
  });

  it("accepte les retours à la ligne CRLF, LF et une dernière ligne sans retour", () => {
    const attendu = [["a", "b"], ["1", "2"], ["3", "4"]];

    for (const texte of ["a;b\r\n1;2\r\n3;4\r\n", "a;b\n1;2\n3;4", "a;b\r\n1;2\n3;4\r\n"]) {
      expect(decouperCsv(texte), JSON.stringify(texte)).toEqual({ ok: true, lignes: attendu });
    }
  });

  it("lit les guillemets doublés, un point-virgule et un retour à la ligne dans un champ entre guillemets", () => {
    const lu = decouperCsv('1;"Nom ""cité""";"a;b";"ligne 1\r\nligne 2";fin\r\n');

    expect(lu).toEqual({ ok: true, lignes: [["1", 'Nom "cité"', "a;b", "ligne 1\r\nligne 2", "fin"]] });
  });

  it("garde un guillemet au milieu d'un champ non cité", () => {
    expect(decouperCsv('5" haut;x')).toEqual({ ok: true, lignes: [['5" haut', "x"]] });
  });

  it("refuse un guillemet ouvert jamais refermé en citant la ligne où il s'ouvre", () => {
    const lu = lireCsv(octets('a;b\r\n1;"ouvert\r\n2;3\r\n'), "etudiants.csv");

    expect(lu).toMatchObject({ ok: false, erreur: expect.stringMatching(/« etudiants\.csv », ligne 2 : guillemet ouvert/) });
  });

  it("lit un CSV Windows (ANSI) avec un avertissement, accents conservés", () => {
    const ansi = Buffer.from("Nom;Lieu\nRAKOTO;Fénérive-Est\n", "latin1");

    const lu = lireCsv(new Uint8Array(ansi), "etudiants.csv");

    expect(lu).toMatchObject({ ok: true, lignes: [["Nom", "Lieu"], ["RAKOTO", "Fénérive-Est"]] });
    expect(lu.ok && lu.avertissement).toMatch(/« etudiants\.csv » n'est pas en UTF-8.*CSV Windows \(ANSI\)/);
  });

  it("ne signale rien pour un UTF-8 valide avec accents", () => {
    const lu = lireCsv(octets("Nom;Lieu\nRAKOTO;Fénérive-Est\n"), "etudiants.csv");

    expect(lu).toMatchObject({ ok: true, avertissement: null });
  });

  it("refuse un CSV en Unicode UTF-16 (little et big endian)", () => {
    for (const bom of [[0xff, 0xfe], [0xfe, 0xff]]) {
      const lu = lireCsv(new Uint8Array([...bom, 0x4e, 0x00, 0x3b, 0x00]), "etudiants.csv");

      expect(lu).toMatchObject({ ok: false, erreur: expect.stringMatching(/UTF-16.*CSV UTF-8/) });
    }
  });

  it("refuse un séparateur virgule ou tabulation, avec la marche à suivre", () => {
    for (const texte of ["N°,Nom,Prénoms\n1,RAKOTO,Jean\n", "N°\tNom\tPrénoms\n1\tRAKOTO\tJean\n"]) {
      const lu = lireCsv(octets(texte), "etudiants.csv");

      expect(lu).toMatchObject({ ok: false, erreur: expect.stringMatching(/n'utilise pas le point-virgule/) });
    }
  });

  it("ne confond pas une virgule dans un champ avec un mauvais séparateur quand le point-virgule est là", () => {
    const lu = lireCsv(octets("Nom;Adresse\nRAKOTO;Lot 12, Tanambao\n"), "etudiants.csv");

    expect(lu).toMatchObject({ ok: true, lignes: [["Nom", "Adresse"], ["RAKOTO", "Lot 12, Tanambao"]] });
  });
});

describe("cellules", () => {
  it("ramène chaque valeur à une forme neutre : vide, texte rogné, nombre, date", () => {
    expect(cellule(null)).toEqual({ type: "vide" });
    expect(cellule(undefined)).toEqual({ type: "vide" });
    expect(cellule("   ")).toEqual({ type: "vide" });
    expect(cellule("  RAKOTO ")).toEqual({ type: "texte", texte: "RAKOTO" });
    expect(cellule(412)).toEqual({ type: "nombre", nombre: 412 });
    expect(cellule(Number.NaN)).toEqual({ type: "vide" });
    expect(cellule(true)).toEqual({ type: "texte", texte: "oui" });
    expect(cellule(new Date("invalide"))).toEqual({ type: "vide" });
    expect(cellule(new Date(Date.UTC(2007, 2, 14)))).toEqual({ type: "date", jour: "2007-03-14" });
  });

  it("cite une valeur comme l'utilisateur la voit (date en JJ/MM/AAAA)", () => {
    expect(texteCellule({ type: "date", jour: "2007-03-14" })).toBe("14/03/2007");
    expect(texteCellule({ type: "nombre", nombre: 80000 })).toBe("80000");
    expect(texteCellule({ type: "vide" })).toBe("");
  });

  it("lettre de colonne Excel : A, Z, AA, ZZ, AAA", () => {
    expect([0, 25, 26, 27, 701, 702].map(lettreColonne)).toEqual(["A", "Z", "AA", "AB", "ZZ", "AAA"]);
  });
});

describe("messages", () => {
  it("cite la feuille, la ligne, la colonne et la valeur dans une phrase complète", () => {
    const m = messageImport("erreur", "obligatoire.", { feuille: "Étudiants", ligne: 5, colonne: "Nom", valeur: "X" });

    expect(m).toMatchObject({ gravite: "erreur", feuille: "Étudiants", ligne: 5, colonne: "Nom", valeur: "X" });
    expect(m.texte).toBe("Étudiants, ligne 5, colonne « Nom » (« X ») : obligatoire.");
  });

  it("sans lieu, le texte est la raison seule ; une valeur vide n'est pas citée", () => {
    expect(messageImport("avertissement", "Rien à signaler.").texte).toBe("Rien à signaler.");
    expect(messageImport("erreur", "vide.", { feuille: "Paiements", ligne: 3, colonne: "Date", valeur: "" }).texte).toBe(
      "Paiements, ligne 3, colonne « Date » : vide.",
    );
  });

  it("tronque une valeur démesurée à 60 caractères", () => {
    const m = messageImport("erreur", "trop long.", { feuille: "Étudiants", ligne: 2, valeur: "x".repeat(200) });

    expect(m.valeur).toHaveLength(60);
    expect(m.valeur?.endsWith("…")).toBe(true);
  });
});

describe("en-têtes", () => {
  it("normalise sans astérisque, accents, casse ni ponctuation", () => {
    expect(normaliserEntete("N° étudiant *")).toBe("n etudiant");
    expect(normaliserEntete("  PRÉNOMS* ")).toBe("prenoms");
    expect(normaliserEntete("Montant (Ar) *")).toBe("montant ar");
    expect(normaliserEntete("***")).toBe("");
  });

  it("reconnaît les en-têtes du modèle avec ou sans « * », accents et casse", () => {
    for (const c of COLONNES_ETUDIANTS) {
      if (c.prefixe) continue;
      for (const entete of [c.entete, `${c.entete} *`, c.entete.toUpperCase(), c.entete.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()]) {
        expect(colonneDeEntete(COLONNES_ETUDIANTS, entete)?.cle, entete).toBe(c.cle);
      }
    }
    for (const c of COLONNES_PAIEMENTS) {
      for (const entete of [c.entete, `${c.entete} *`, c.entete.toUpperCase()]) {
        expect(colonneDeEntete(COLONNES_PAIEMENTS, entete)?.cle, entete).toBe(c.cle);
      }
    }
  });

  it("reconnaît les autres écritures d'un en-tête (alias)", () => {
    const cle = (e: string) => colonneDeEntete(COLONNES_ETUDIANTS, e)?.cle;

    expect([cle("Prenom"), cle("Né le"), cle("N° CIN"), cle("Tel"), cle("Code filière"), cle("Annee entree"), cle("Droits")]).toEqual([
      "prenoms", "dateNaissance", "cin", "telephone", "filiere", "anneeEntree", "droitsEnTranches",
    ]);
    expect(colonneDeEntete(COLONNES_PAIEMENTS, "Montant")?.cle).toBe("montant");
    expect(colonneDeEntete(COLONNES_PAIEMENTS, "N° reçu papier")?.cle).toBe("recuPapier");
  });

  it("« Niveau » est reconnu avec ou sans année, mais pas « Niveaux »", () => {
    const cle = (e: string) => colonneDeEntete(COLONNES_ETUDIANTS, e)?.cle;

    expect([cle("Niveau"), cle("Niveau 2026-2027 *"), cle("niveau 2026/2027")]).toEqual(["niveau", "niveau", "niveau"]);
    expect(colonneDeEntete(COLONNES_ETUDIANTS, "Niveaux")).toBeNull();
    expect(colonneDeEntete(COLONNES_ETUDIANTS, "")).toBeNull();
  });

  it("lit l'année dans « Niveau 2026-2027 » (tiret, barre oblique), null sans année", () => {
    expect(anneeDeEnteteNiveau("Niveau 2026-2027")).toBe("2026-2027");
    expect(anneeDeEnteteNiveau("Niveau 2026/2027 *")).toBe("2026-2027");
    expect(anneeDeEnteteNiveau("Niveau 2026 – 2027")).toBe("2026-2027");
    expect(anneeDeEnteteNiveau("Niveau")).toBeNull();
    expect(anneeDeEnteteNiveau(undefined)).toBeNull();
  });

  it("reconnaît la nature d'un tableau d'après ses en-têtes, quel que soit le nom du fichier", () => {
    expect(natureTableau(tableauEtudiants([{}]))).toBe("Étudiants");
    expect(natureTableau(tableauPaiements([{}]))).toBe("Paiements");
    expect(natureTableau([["Foo", "Bar"], ["1", "2"]])).toBeNull();
    expect(natureTableau([["Nom", "Date"]])).toBeNull();
  });
});

describe("lecture de la feuille Étudiants", () => {
  it("rend les cellules par colonne du modèle, avec le n° de ligne Excel (en-têtes en ligne 1)", () => {
    const lu = reprise([{ numero: "1", nom: "RAKOTO" }, { numero: "2", nom: "RASOA" }]);

    expect(lu.etudiants.ligneEntetes).toBe(1);
    expect(lu.etudiants.lignes.map((l) => l.ligne)).toEqual([2, 3]);
    expect(lu.etudiants.lignes[1].cellules.nom).toEqual({ type: "texte", texte: "RASOA" });
    expect(lu.etudiants.lignes[0].cellules.cin).toEqual({ type: "vide" });
    expect(lu.messages).toEqual([]);
  });

  it("garde le n° de ligne Excel malgré les lignes vides et saute la ligne d'aide du modèle", () => {
    const csv = [
      "N° *;Nom *;Prénoms *;Sexe *;Date de naissance *;Lieu de naissance *;CIN;Téléphone;Adresse;Filière *;Année d'entrée *;Niveau 2026-2027 *;Redoublant;Droits en",
      "Numéro de ligne, unique.;En majuscules ou non.;;F ou M.;JJ/MM/AAAA.;;12 chiffres, en texte.;;;Code de la filière : IF ou SF.;;1, 2 ou 3.;;",
      "1;RAKOTO;Jean;M;10/05/2004;Toamasina;;;;IF;2026;1;;",
      ";;;;;;;;;;;;;",
      "",
      "2;RASOA;Fanja;F;02/11/2005;Toamasina;;;;SF;2026;1;;",
    ].join("\r\n");
    const lu = lireReprise({ etudiants: decouperCsvLignes(csv), paiements: null });

    expect(lu.etudiants.lignes.map((l) => [l.ligne, l.cellules.numero])).toEqual([
      [3, { type: "texte", texte: "1" }],
      [6, { type: "texte", texte: "2" }],
    ]);
  });

  it("saute la ligne d'aide du modèle téléchargé (CSV), les exemples commencent en ligne 3", () => {
    const lignes = decouperCsvLignes(csvEtudiants(PARAMETRES_MODELE_EXEMPLE));

    const lu = lireReprise({ etudiants: lignes, paiements: null });

    expect(lu.etudiants.lignes.map((l) => l.ligne)).toEqual([3, 4, 5]);
    expect(lu.etudiants.lignes[0].cellules.nom).toEqual({ type: "texte", texte: "RAKOTOMALALA" });
  });

  it("garde une vraie première ligne de données quand la ligne d'aide a été supprimée", () => {
    const lu = reprise([{ numero: "1", nom: "RAKOTO" }]);

    expect(lu.etudiants.lignes).toHaveLength(1);
    expect(lu.etudiants.lignes[0].ligne).toBe(2);
  });

  it("cherche les en-têtes dans les premières lignes : un titre au-dessus ne gêne pas", () => {
    const tableau = [["Reprise IFSPA 2026"], [], ...tableauEtudiants([{ numero: "1" }])];

    const lu = lireReprise({ etudiants: tableau, paiements: null });

    expect(lu.etudiants.ligneEntetes).toBe(3);
    expect(lu.etudiants.lignes.map((l) => l.ligne)).toEqual([4]);
    expect(erreurs(lu.messages)).toEqual([]);
  });

  it("en-têtes introuvables : une erreur qui renvoie au modèle, sans ligne lue", () => {
    const lu = lireReprise({ etudiants: [["a", "b"], ["1", "2"]], paiements: null });

    expect(lu.etudiants.ligneEntetes).toBeNull();
    expect(lu.etudiants.lignes).toEqual([]);
    expect(erreurs(lu.messages)).toHaveLength(1);
    expect(lu.messages[0].texte).toMatch(/^Étudiants : en-têtes du modèle introuvables.*Téléchargez le modèle/);
  });

  it("une colonne obligatoire absente est une erreur qui la nomme, une colonne facultative absente non", () => {
    const sans = reprise([{ numero: "1" }], [], { sans: ["nom", "redoublant", "cin"] });

    const bloquantes = erreurs(sans.messages);
    expect(bloquantes).toHaveLength(1);
    expect(bloquantes[0]).toMatchObject({ feuille: "Étudiants", ligne: 1 });
    expect(bloquantes[0].texte).toMatch(/colonne obligatoire « Nom » absente/);
    expect(sans.etudiants.colonnes).not.toContain("nom");
    expect(sans.etudiants.lignes[0].cellules.redoublant).toEqual({ type: "vide" });
  });

  it("une colonne inconnue est un avertissement, ignorée, sans erreur", () => {
    const base = tableauEtudiants([{ numero: "1" }]);
    const tableau = [[...base[0], "Commentaire"], [...base[1], "à voir"]];

    const lu = reprise([]);
    const avecInconnue = lireReprise({ etudiants: tableau, paiements: null });

    expect(lu.messages).toEqual([]);
    expect(erreurs(avecInconnue.messages)).toEqual([]);
    expect(avertissements(avecInconnue.messages)).toHaveLength(1);
    expect(avecInconnue.messages[0]).toMatchObject({ gravite: "avertissement", colonne: "Commentaire", ligne: 1 });
    expect(avecInconnue.messages[0].texte).toMatch(/colonne inconnue du modèle, ignorée/);
    expect(avecInconnue.etudiants.lignes).toHaveLength(1);
  });

  it("une colonne sans en-tête mais avec des données est signalée par sa lettre", () => {
    const base = tableauEtudiants([{ numero: "1" }]);
    const tableau = [[...base[0], ""], [...base[1], "oubli"]];

    const lu = lireReprise({ etudiants: tableau, paiements: null });

    expect(lu.messages).toHaveLength(1);
    expect(lu.messages[0]).toMatchObject({ gravite: "avertissement", colonne: "O" });
    expect(lu.messages[0].texte).toMatch(/colonne sans en-tête, ignorée/);
  });

  it("une colonne en double est une erreur qui cite les deux colonnes", () => {
    const base = tableauEtudiants([{ numero: "1" }]);
    const tableau = [[...base[0], "Nom"], [...base[1], "AUTRE"]];

    const lu = lireReprise({ etudiants: tableau, paiements: null });

    const bloquantes = erreurs(lu.messages);
    expect(bloquantes).toHaveLength(1);
    expect(bloquantes[0].texte).toMatch(/la colonne « Nom » apparaît deux fois \(colonnes B et O\)/);
    expect(lu.etudiants.lignes[0].cellules.nom).toEqual({ type: "texte", texte: "RAKOTO" });
  });

  it("l'année de « Niveau 2026-2027 » est rendue, null quand l'en-tête n'en porte pas", () => {
    expect(reprise([{}]).anneeNiveau).toBe("2026-2027");
    expect(reprise([{}], [], { enteteNiveau: "Niveau 2025-2026 *" }).anneeNiveau).toBe("2025-2026");
    expect(reprise([{}], [], { enteteNiveau: "Niveau *" }).anneeNiveau).toBeNull();
  });
});

describe("limites de lignes", () => {
  it("accepte exactement 2 000 étudiants", () => {
    const lu = reprise(Array.from({ length: ETUDIANTS_MAX }, (_, i) => ({ numero: String(i + 1) })));

    expect(lu.etudiants.lignes).toHaveLength(ETUDIANTS_MAX);
    expect(erreurs(lu.messages)).toEqual([]);
  });

  it("refuse 2 001 étudiants : erreur, seules les 2 000 premières lignes sont gardées", () => {
    const lu = reprise(Array.from({ length: ETUDIANTS_MAX + 1 }, (_, i) => ({ numero: String(i + 1) })));

    expect(lu.etudiants.lignes).toHaveLength(ETUDIANTS_MAX);
    expect(erreurs(lu.messages).map((m) => m.texte)).toEqual([expect.stringMatching(/^Étudiants : plus de 2000 lignes/)]);
  });

  it("accepte 10 000 paiements et refuse 10 001", () => {
    const paiements = (n: number) => Array.from({ length: n }, () => ({}));

    const limite = reprise([{}], paiements(PAIEMENTS_MAX));
    const trop = reprise([{}], paiements(PAIEMENTS_MAX + 1));

    expect(limite.paiements.lignes).toHaveLength(PAIEMENTS_MAX);
    expect(erreurs(limite.messages)).toEqual([]);
    expect(trop.paiements.lignes).toHaveLength(PAIEMENTS_MAX);
    expect(erreurs(trop.messages).map((m) => m.texte)).toEqual([expect.stringMatching(/^Paiements : plus de 10000 lignes/)]);
  });
});

describe("lecture de la feuille Paiements", () => {
  it("sans fichier de paiements (un seul CSV) : feuille vide, aucun message", () => {
    const lu = reprise([{ numero: "1" }], null);

    expect(lu.paiements.lignes).toEqual([]);
    expect(lu.messages).toEqual([]);
  });

  it("garde le n° de ligne Excel et ignore une ligne entièrement vide", () => {
    const tableau = [...tableauPaiements([{ montant: "34000" }]), ["", "", "", "", "", "", ""], ...tableauPaiements([{ montant: "80000" }]).slice(1)];

    const lu = lireReprise({ etudiants: tableauEtudiants([{}]), paiements: tableau });

    expect(lu.paiements.lignes.map((l) => [l.ligne, l.cellules.montant])).toEqual([
      [2, { type: "texte", texte: "34000" }],
      [4, { type: "texte", texte: "80000" }],
    ]);
  });

  it("colonne obligatoire absente : erreur sur la feuille Paiements", () => {
    const tableau = tableauPaiements([{}]).map((r) => r.filter((_, i) => i !== 2));

    const lu = lireReprise({ etudiants: tableauEtudiants([{}]), paiements: tableau });

    expect(erreurs(lu.messages).map((m) => m.texte)).toEqual([expect.stringMatching(/^Paiements, ligne 1 : colonne obligatoire « Montant \(Ar\) » absente/)]);
  });

  it("les messages de lecture du dépôt (encodage) passent en tête des messages", () => {
    const m = messageImport("avertissement", "lu en ANSI.");

    const lu = lireReprise({ etudiants: tableauEtudiants([{}]), paiements: null }, [m]);

    expect(lu.messages[0]).toBe(m);
  });
});

describe("lireFichiersReprise : CSV", () => {
  it("lit le modèle CSV téléchargé (étudiants + paiements), reconnus par leurs en-têtes et non par leur nom", async () => {
    const lu = await lireFichiersReprise([
      fichier("export-final.csv", csvPaiements(PARAMETRES_MODELE_EXEMPLE)),
      fichier("liste.csv", csvEtudiants(PARAMETRES_MODELE_EXEMPLE)),
    ]);

    expect(lu.ok).toBe(true);
    if (!lu.ok) return;
    expect(lu.lu.etudiants.lignes).toHaveLength(3);
    expect(lu.lu.paiements.lignes).toHaveLength(3);
    expect(lu.lu.anneeNiveau).toBe("2026-2027");
    expect(lu.lu.messages).toEqual([]);
  });

  it("accepte le CSV des étudiants seul : aucun paiement (décision 57)", async () => {
    const lu = await lireFichiersReprise([fichier("etudiants.csv", csvEtudiants(PARAMETRES_MODELE_EXEMPLE))]);

    expect(lu).toMatchObject({ ok: true });
    expect(lu.ok && lu.lu.paiements.lignes).toEqual([]);
  });

  it("refuse le CSV des paiements seul : les paiements se rattachent aux étudiants par leur N°", async () => {
    const lu = await lireFichiersReprise([fichier("paiements.csv", csvPaiements(PARAMETRES_MODELE_EXEMPLE))]);

    expect(lu).toEqual({ ok: false, erreur: expect.stringMatching(/Ajoutez le CSV des étudiants/) });
  });

  it("refuse deux CSV de la même feuille", async () => {
    const e = csvEtudiants(PARAMETRES_MODELE_EXEMPLE);

    const lu = await lireFichiersReprise([fichier("a.csv", e), fichier("b.csv", e)]);

    expect(lu).toEqual({ ok: false, erreur: expect.stringMatching(/« a\.csv » et « b\.csv » contiennent tous deux la feuille Étudiants/) });
  });

  it("refuse un CSV qui n'a les en-têtes d'aucune feuille", async () => {
    const lu = await lireFichiersReprise([fichier("autre.csv", "Foo;Bar\n1;2\n")]);

    expect(lu).toEqual({ ok: false, erreur: expect.stringMatching(/« autre\.csv » n'a ni les en-têtes de la feuille Étudiants ni ceux de la feuille Paiements/) });
  });

  it("propage l'avertissement ANSI dans les messages de lecture", async () => {
    const ansi = new Uint8Array(Buffer.from(csvEtudiants(PARAMETRES_MODELE_EXEMPLE).replace("\uFEFF", ""), "latin1"));

    const lu = await lireFichiersReprise([fichier("etudiants.csv", ansi)]);

    expect(lu.ok && avertissements(lu.lu.messages).map((m) => m.texte)).toEqual([expect.stringMatching(/n'est pas en UTF-8/)]);
  });

  it("refuse l'UTF-16 et le mauvais séparateur sans rien lire", async () => {
    const utf16 = await lireFichiersReprise([fichier("etudiants.csv", new Uint8Array([0xff, 0xfe, 0x4e, 0x00]))]);
    const virgule = await lireFichiersReprise([fichier("etudiants.csv", "N°,Nom\n1,RAKOTO\n")]);

    expect(utf16).toEqual({ ok: false, erreur: expect.stringMatching(/UTF-16/) });
    expect(virgule).toEqual({ ok: false, erreur: expect.stringMatching(/point-virgule/) });
  });

  it("refuse un dépôt vide, un fichier vide, trois fichiers et un fichier trop gros", async () => {
    const e = csvEtudiants(PARAMETRES_MODELE_EXEMPLE);
    const p = csvPaiements(PARAMETRES_MODELE_EXEMPLE);

    expect(await lireFichiersReprise([])).toEqual({ ok: false, erreur: expect.stringMatching(/Déposez le fichier \.xlsx/) });
    expect(await lireFichiersReprise([fichier("vide.csv", "")])).toEqual({ ok: false, erreur: "« vide.csv » est vide." });
    expect(await lireFichiersReprise([fichier("a.csv", e), fichier("b.csv", p), fichier("c.csv", p)])).toEqual({
      ok: false,
      erreur: expect.stringMatching(/Trois fichiers ou plus/),
    });
    expect(await lireFichiersReprise([fichier("gros.csv", new Uint8Array(TAILLE_MAX_OCTETS + 1).fill(0x61))])).toEqual({
      ok: false,
      erreur: expect.stringMatching(/Fichier trop volumineux.*1 Mo au plus/),
    });
  });
});

describe("lireFichiersReprise : xlsx", () => {
  const xlsx = async (feuilles: Parameters<typeof writeXlsxFile>[0]) => new Uint8Array(await writeXlsxFile(feuilles).toBuffer());

  it("lit le classeur généré par feuillesModele avec les mêmes lignes que les CSV du modèle", async () => {
    const classeur = await xlsx(feuillesModele(PARAMETRES_MODELE_EXEMPLE));

    const depuisXlsx = await lireFichiersReprise([fichier("modele.xlsx", classeur)]);
    const depuisCsv = await lireFichiersReprise([
      fichier("etudiants.csv", csvEtudiants(PARAMETRES_MODELE_EXEMPLE)),
      fichier("paiements.csv", csvPaiements(PARAMETRES_MODELE_EXEMPLE)),
    ]);

    expect(depuisXlsx.ok && depuisCsv.ok).toBe(true);
    if (!depuisXlsx.ok || !depuisCsv.ok) return;
    expect(depuisXlsx.lu.etudiants.lignes.map((l) => l.ligne)).toEqual([3, 4, 5]);
    expect(depuisXlsx.lu.etudiants.lignes).toEqual(depuisCsv.lu.etudiants.lignes);
    expect(depuisXlsx.lu.paiements.lignes).toEqual(depuisCsv.lu.paiements.lignes);
    expect(depuisXlsx.lu.anneeNiveau).toBe(depuisCsv.lu.anneeNiveau);
    expect(depuisXlsx.lu.messages).toEqual([]);
  });

  it("une cellule date d'Excel donne le bon jour, quel que soit le fuseau du serveur", async () => {
    const classeur = await xlsx([
      { sheet: "Étudiants", data: [["N° *", "Nom *", "Date de naissance *"], [{ value: "1" }, { value: "RAKOTO" }, { value: new Date(Date.UTC(2007, 2, 14)), type: Date, format: "dd/mm/yyyy" }]] },
      { sheet: "Paiements", data: [["N° étudiant *", "Date *"], [{ value: "1" }, { value: new Date(Date.UTC(2026, 9, 5)), type: Date, format: "dd/mm/yyyy" }]] },
    ]);

    const lu = await lireFichiersReprise([fichier("modele.xlsx", classeur)]);

    expect(lu.ok && lu.lu.etudiants.lignes[0].cellules.dateNaissance).toEqual({ type: "date", jour: "2007-03-14" });
    expect(lu.ok && lu.lu.paiements.lignes[0].cellules.date).toEqual({ type: "date", jour: "2026-10-05" });
  });

  it("un nombre saisi dans Excel reste un nombre (montant, numéro de série)", async () => {
    const classeur = await xlsx([
      { sheet: "Étudiants", data: [["N° *", "Nom *"], [{ value: 1, type: Number }, { value: "RAKOTO" }]] },
      { sheet: "Paiements", data: [["N° étudiant *", "Montant (Ar) *"], [{ value: 1, type: Number }, { value: 80000, type: Number }]] },
    ]);

    const lu = await lireFichiersReprise([fichier("modele.xlsx", classeur)]);

    expect(lu.ok && lu.lu.paiements.lignes[0].cellules.montant).toEqual({ type: "nombre", nombre: 80000 });
    expect(lu.ok && lu.lu.etudiants.lignes[0].cellules.numero).toEqual({ type: "nombre", nombre: 1 });
  });

  it("nomme les feuilles manquantes et celles du classeur", async () => {
    const classeur = await xlsx([{ sheet: "Étudiants", data: [["N° *", "Nom *"], [{ value: "1" }, { value: "X" }]] }]);

    const lu = await lireFichiersReprise([fichier("modele.xlsx", classeur)]);

    expect(lu).toEqual({ ok: false, erreur: expect.stringMatching(/Feuille « Paiements » introuvable dans « modele\.xlsx » \(feuilles du classeur : Étudiants\)/) });
  });

  it("refuse un classeur Excel ancien format (.xls) par sa signature, quel que soit le nom", async () => {
    const ole2 = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);

    const lu = await lireFichiersReprise([fichier("ancien.xlsx", ole2)]);

    expect(lu).toEqual({ ok: false, erreur: expect.stringMatching(/ancien format \(\.xls\).*\.xlsx/) });
  });

  it("refuse un faux .xlsx (contenu texte) et un zip qui n'est pas un classeur", async () => {
    const faux = await lireFichiersReprise([fichier("modele.xlsx", "ceci n'est pas un classeur")]);
    const zip = await lireFichiersReprise([fichier("modele.xlsx", new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 0, 0]))]);

    expect(faux).toEqual({ ok: false, erreur: expect.stringMatching(/n'est pas un classeur \.xlsx lisible/) });
    expect(zip).toEqual({ ok: false, erreur: expect.stringMatching(/n'est pas un classeur \.xlsx lisible/) });
  });

  it("refuse un classeur déposé avec un autre fichier", async () => {
    const classeur = await xlsx(feuillesModele(PARAMETRES_MODELE_EXEMPLE));

    const lu = await lireFichiersReprise([fichier("modele.xlsx", classeur), fichier("etudiants.csv", csvEtudiants(PARAMETRES_MODELE_EXEMPLE))]);

    expect(lu).toEqual({ ok: false, erreur: expect.stringMatching(/soit le classeur \.xlsx seul, soit les CSV/) });
  });
});

describe("fichiersDepuisFormData", () => {
  it("rend les fichiers non vides du champ « fichiers »", async () => {
    const form = new FormData();
    form.append("fichiers", new File(["a;b"], "etudiants.csv"));
    form.append("fichiers", new File([""], "vide.csv"));
    form.append("autre", new File(["x"], "autre.csv"));

    const r = await fichiersDepuisFormData(form);

    expect(Array.isArray(r) && r.map((f) => [f.nom, f.octets.byteLength])).toEqual([["etudiants.csv", 3]]);
  });

  it("refuse avant de lire un dépôt de plus de 1 Mo", async () => {
    const form = new FormData();
    form.append("fichiers", new File([new Uint8Array(TAILLE_MAX_OCTETS + 1)], "gros.csv"));

    expect(await fichiersDepuisFormData(form)).toEqual({ erreur: expect.stringMatching(/Fichier trop volumineux.*1 Mo au plus/) });
  });
});

/** Lignes d'un CSV du modèle, comme les rend `lireCsv`. */
function decouperCsvLignes(texte: string): string[][] {
  const lu = lireCsv(octets(texte), "x.csv");
  if (!lu.ok) throw new Error(lu.erreur);
  return lu.lignes;
}
