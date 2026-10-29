import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NOMBRE_MOIS_ECOLAGE } from "@/lib/parametres";
import {
  colonnesEtudiantsModele,
  consignesImport,
  exemplesEtudiants,
  IDENTITES_EXEMPLES,
  parametresModele,
  PARAMETRES_MODELE_EXEMPLE,
  type DonneesParametresModele,
} from "@/lib/import-modele";
import { csvEtudiants, estFormatModele, feuillesModele, nomFichierModele } from "@/lib/import-modele-fichiers";
import { lireFichiersReprise } from "@/server/import/lire-fichiers";

const donnees = (surcharge: Partial<DonneesParametresModele> = {}): DonneesParametresModele => ({
  anneeDebut: 2026,
  moisDebutEcolage: 10,
  nombresMois: [10, 10],
  filieres: [{ code: "SF", dureeAnnees: 3 }, { code: "IF", dureeAnnees: 3 }],
  anneesExistantes: [2026],
  ...surcharge,
});

const DOSSIER_MODELE = path.resolve(__dirname, "../../docs/modele-import");

describe("paramètres du modèle", () => {
  it("nomme l'année courante, trie les codes de filière et lit la durée la plus longue", () => {
    const p = parametresModele(donnees({ filieres: [{ code: "SF", dureeAnnees: 3 }, { code: "IF", dureeAnnees: 4 }, { code: "IF", dureeAnnees: 4 }] }));

    expect(p).toMatchObject({ anneeDebut: 2026, libelle: "2026-2027", codesFilieres: ["IF", "SF"], niveauMax: 4 });
  });

  it("liste les années d'entrée possibles d'un 2e ou 3e année absentes de la base", () => {
    expect(parametresModele(donnees({ anneesExistantes: [2026] })).anneesACreer).toEqual(["2024-2025", "2025-2026"]);
    expect(parametresModele(donnees({ anneesExistantes: [2025, 2026] })).anneesACreer).toEqual(["2024-2025"]);
    expect(parametresModele(donnees({ anneesExistantes: [2024, 2025, 2026] })).anneesACreer).toEqual([]);
  });

  it("ne remonte pas plus loin que la durée de la plus longue filière", () => {
    const deuxAns = parametresModele(donnees({ filieres: [{ code: "IF", dureeAnnees: 2 }] }));
    const sansFiliere = parametresModele(donnees({ filieres: [] }));

    expect(deuxAns.anneesACreer).toEqual(["2025-2026"]);
    expect(sansFiliere).toMatchObject({ niveauMax: 1, anneesACreer: [], codesFilieres: [] });
  });

  it("nombre de mensualités : commun à tous les tarifs, null s'il varie, 10 sans tarif", () => {
    expect(parametresModele(donnees({ nombresMois: [10, 10] })).nombreMois).toBe(10);
    expect(parametresModele(donnees({ nombresMois: [8] })).nombreMois).toBe(8);
    expect(parametresModele(donnees({ nombresMois: [10, 8] })).nombreMois).toBeNull();
    expect(parametresModele(donnees({ nombresMois: [] })).nombreMois).toBe(NOMBRE_MOIS_ECOLAGE);
  });
});

describe("colonnes, exemples et consignes du modèle", () => {
  const p = parametresModele(donnees());

  it("l'en-tête du niveau porte l'année courante et l'aide cite les niveaux possibles", () => {
    const niveau = colonnesEtudiantsModele(p).find((c) => c.cle === "niveau")!;

    expect(niveau.entete).toBe("Niveau 2026-2027");
    expect(niveau.aide).toBe("1, 2 ou 3 : la classe suivie en 2026-2027.");
  });

  it("l'aide de la filière cite les codes actifs", () => {
    expect(colonnesEtudiantsModele(p).find((c) => c.cle === "filiere")!.aide).toBe("Code de la filière : IF ou SF.");
  });

  it("les lignes d'exemple reprennent exactement les identités reconnues comme exemples", () => {
    const exemplesE = exemplesEtudiants(PARAMETRES_MODELE_EXEMPLE);

    expect(exemplesE.map((e) => [e.nom, e.prenoms, e.dateNaissance.split("/").reverse().join("-")])).toEqual(
      IDENTITES_EXEMPLES.map((i) => [i.nom, i.prenoms, i.dateNaissance]),
    );
  });

  it("les consignes citent l'année, les mensualités et les années à créer", () => {
    const texte = consignesImport(p).join("\n");

    expect(texte).toContain("année 2026-2027");
    expect(texte).toContain("10 mensualités (octobre à juillet)");
    expect(texte).toContain("années absentes aujourd'hui de Paramètres › Années : 2024-2025, 2025-2026");
    expect(texte).toContain("créez l'année 2025-2026 dans Paramètres › Années, puis clôturez-la");
  });

  it("les consignes disent que les paiements ne sont pas repris et ne demandent plus de feuille Paiements", () => {
    const texte = consignesImport(p).join("\n");

    expect(texte).toContain("les paiements ne sont pas repris : tout l'écolage de 2026-2027 est dû");
    expect(texte).toContain("s'encaisse au guichet");
    expect(texte).not.toMatch(/Feuille « Paiements »|paiements\.csv|reçu R-|Mobile Money/);
  });

  it("les consignes renvoient au tarif de chaque classe quand le nombre de mensualités varie", () => {
    const texte = consignesImport(parametresModele(donnees({ nombresMois: [10, 8] }))).join("\n");

    expect(texte).toContain("les mensualités prévues par le tarif de chaque classe");
  });
});

describe("fichiers du modèle", () => {
  it("noms de fichier : l'année courante dans le nom", () => {
    const p = PARAMETRES_MODELE_EXEMPLE;

    expect(nomFichierModele("xlsx", p)).toBe("modele-import-ifspa-2026-2027.xlsx");
    expect(nomFichierModele("etudiants.csv", p)).toBe("etudiants-2026-2027.csv");
  });

  it("ne reconnaît que les deux formats du modèle : le CSV Paiements n'existe plus", () => {
    expect(["xlsx", "etudiants.csv"].every(estFormatModele)).toBe(true);
    for (const format of ["pdf", "csv", "", "XLSX", "paiements.csv", null]) expect(estFormatModele(format), String(format)).toBe(false);
  });

  it("le classeur n'a que les feuilles Lisez-moi et Étudiants", () => {
    expect(feuillesModele(PARAMETRES_MODELE_EXEMPLE).map((f) => f.sheet)).toEqual(["Lisez-moi", "Étudiants"]);
  });

  it("le CSV a un BOM UTF-8, des points-virgules, des fins de ligne CRLF, en-têtes puis ligne d'aide puis exemples", () => {
    const csv = csvEtudiants(PARAMETRES_MODELE_EXEMPLE);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.split("\r\n")).toHaveLength(6);
    expect(csvEtudiants(PARAMETRES_MODELE_EXEMPLE).split("\r\n")[0]).toMatch(/Niveau 2026-2027 \*;Redoublant$/);
    expect(csvEtudiants(PARAMETRES_MODELE_EXEMPLE)).not.toMatch(/Droits en|tranche/i);
  });

  it("docs/modele-import/ est à jour : le CSV du dépôt est celui que le générateur produit, sans paiements.csv", () => {
    expect(readFileSync(path.join(DOSSIER_MODELE, "etudiants.csv"), "utf8")).toBe(csvEtudiants(PARAMETRES_MODELE_EXEMPLE));
    expect(existsSync(path.join(DOSSIER_MODELE, "paiements.csv"))).toBe(false);
  });

  it("le classeur du dépôt contient les mêmes lignes que le CSV du modèle, sans feuille Paiements", async () => {
    const classeur = new Uint8Array(readFileSync(path.join(DOSSIER_MODELE, "modele-import-ifspa.xlsx")));
    const enc = new TextEncoder();

    const xlsx = await lireFichiersReprise([{ nom: "modele-import-ifspa.xlsx", octets: classeur }]);
    const csv = await lireFichiersReprise([{ nom: "etudiants.csv", octets: enc.encode(csvEtudiants(PARAMETRES_MODELE_EXEMPLE)) }]);

    expect(xlsx.ok && csv.ok).toBe(true);
    if (!xlsx.ok || !csv.ok) return;
    expect(xlsx.lu.etudiants.lignes).toEqual(csv.lu.etudiants.lignes);
    expect(xlsx.lu.messages).toEqual([]);
  });
});
