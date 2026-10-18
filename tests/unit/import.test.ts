import { describe, expect, it } from "vitest";
import {
  jourDeSerieExcel,
  lireAnneeEntree,
  lireCin,
  lireDate,
  lireMode,
  lireMontantCellule,
  lireNiveau,
  lireOperateur,
  lireRedoublant,
  lireSexe,
  lireTelephone,
  lireTranches,
  MOIS_AVANT_RENTREE,
  normaliserNumero,
  normaliserRecuPapier,
  validerEtudiants,
  validerPaiements,
  type CadreValidation,
} from "@/lib/import";
import { type Cellule } from "@/lib/import-lecture";
import { IDENTITES_EXEMPLES } from "@/lib/import-modele";
import { reprise, nombre, texte, vide } from "../factories/reprise";

const CADRE: CadreValidation = { jour: "2026-11-15", dateDebutAnnee: "2026-10-01" };
const date = (jour: string): Cellule => ({ type: "date", jour });
const serie = (jour: string) => Math.round((Date.parse(jour) - Date.UTC(1899, 11, 30)) / 86_400_000);

type LigneE = Parameters<typeof reprise>[0][number];
type LigneP = NonNullable<Parameters<typeof reprise>[1]>[number];

const etudiants = (lignes: LigneE[], cadre = CADRE) => validerEtudiants(reprise(lignes).etudiants, cadre);
const paiements = (lignes: LigneP[], numeros: string[] = ["1"], cadre = CADRE) =>
  validerPaiements(reprise([{}], lignes).paiements, new Set(numeros), cadre);
const erreurs = (v: { messages: { gravite: string; texte: string }[] }) => v.messages.filter((m) => m.gravite === "erreur").map((m) => m.texte);
const avertissements = (v: { messages: { gravite: string; texte: string }[] }) => v.messages.filter((m) => m.gravite === "avertissement").map((m) => m.texte);

describe("dates", () => {
  it("lit JJ/MM/AAAA dans cet ordre (03/04/2007 est le 3 avril), avec / . - comme séparateurs", () => {
    expect(lireDate(texte("14/03/2007"))).toEqual({ ok: true, valeur: "2007-03-14" });
    expect(lireDate(texte("03/04/2007"))).toEqual({ ok: true, valeur: "2007-04-03" });
    expect(lireDate(texte("3/4/2007"))).toEqual({ ok: true, valeur: "2007-04-03" });
    expect(lireDate(texte("14.03.2007"))).toEqual({ ok: true, valeur: "2007-03-14" });
    expect(lireDate(texte("14-03-2007"))).toEqual({ ok: true, valeur: "2007-03-14" });
  });

  it("accepte AAAA-MM-JJ et une heure nulle collée par un export", () => {
    expect(lireDate(texte("2007-03-14"))).toEqual({ ok: true, valeur: "2007-03-14" });
    expect(lireDate(texte("14/03/2007 00:00:00"))).toEqual({ ok: true, valeur: "2007-03-14" });
  });

  it("garde le jour d'une cellule date d'Excel (Date UTC)", () => {
    expect(lireDate(date("2007-03-14"))).toEqual({ ok: true, valeur: "2007-03-14" });
  });

  it("convertit un numéro de série Excel (≥ 61), partie décimale ignorée", () => {
    expect(lireDate(nombre(serie("2007-03-14")))).toEqual({ ok: true, valeur: "2007-03-14" });
    expect(lireDate(nombre(serie("2007-03-14") + 0.75))).toEqual({ ok: true, valeur: "2007-03-14" });
    expect(lireDate(nombre(61))).toEqual({ ok: true, valeur: "1900-03-01" });
    expect(jourDeSerieExcel(45000)).toBe("2023-03-15");
  });

  it("refuse un numéro de série avant le 01/03/1900 (le 29/02/1900 d'Excel n'existe pas) ou hors plage", () => {
    for (const n of [-1, 0, 1, 59, 60, 2958466, Number.NaN]) expect(lireDate(nombre(n)).ok, String(n)).toBe(false);
    expect(jourDeSerieExcel(2958465)).toBe("9999-12-31");
  });

  it("refuse une date inexistante, une année sur 2 chiffres, un texte libre et une cellule vide", () => {
    expect(lireDate(texte("31/02/2026"))).toMatchObject({ ok: false, raison: expect.stringMatching(/cette date n'existe pas/) });
    expect(lireDate(texte("31/04/2026")).ok).toBe(false);
    expect(lireDate(texte("29/02/2023")).ok).toBe(false);
    expect(lireDate(texte("29/02/2024")).ok).toBe(true);
    expect(lireDate(texte("14/03/07"))).toMatchObject({ ok: false, raison: expect.stringMatching(/année sur 4 chiffres/) });
    expect(lireDate(texte("hier"))).toMatchObject({ ok: false, raison: expect.stringMatching(/JJ\/MM\/AAAA/) });
    expect(lireDate(vide).ok).toBe(false);
  });
});

describe("champs d'un étudiant", () => {
  it("restitue le 0 du téléphone que l'Excel a retiré (9 chiffres commençant par 3)", () => {
    for (const saisie of [texte("341234567"), nombre(341234567), texte("34 12 345 67"), texte("034 12 345 67"), texte("+261 34 12 345 67"), texte("0341234567")]) {
      expect(lireTelephone(saisie), JSON.stringify(saisie)).toEqual({ ok: true, valeur: "0341234567" });
    }
  });

  it("ne restitue le 0 que si le numéro obtenu est un numéro malgache valide", () => {
    for (const saisie of [texte("391234567"), texte("301234567"), texte("3412345678"), texte("34123456"), texte("012345678"), texte("abc")]) {
      expect(lireTelephone(saisie).ok, JSON.stringify(saisie)).toBe(false);
    }
  });

  it("le téléphone et le CIN vides sont permis", () => {
    expect(lireTelephone(vide)).toEqual({ ok: true, valeur: null });
    expect(lireCin(vide)).toEqual({ ok: true, valeur: null });
  });

  it("le CIN compte 12 chiffres, espaces et points tolérés ; un nombre Excel est accepté", () => {
    expect(lireCin(texte("501 011 012 345"))).toEqual({ ok: true, valeur: "501011012345" });
    expect(lireCin(texte("501.011.012.345"))).toEqual({ ok: true, valeur: "501011012345" });
    expect(lireCin(nombre(501011012345))).toEqual({ ok: true, valeur: "501011012345" });
    for (const saisie of [texte("50101101234"), texte("5010110123456"), nombre(50101101234), texte("50101101234A")]) {
      expect(lireCin(saisie).ok, JSON.stringify(saisie)).toBe(false);
    }
  });

  it("le sexe accepte F, M, féminin, masculin, femme, homme (casse et accents libres)", () => {
    for (const s of ["F", "f", "Féminin", "FEMININ", "femme"]) expect(lireSexe(texte(s)), s).toEqual({ ok: true, valeur: "F" });
    for (const s of ["M", "m", "Masculin", "homme"]) expect(lireSexe(texte(s)), s).toEqual({ ok: true, valeur: "M" });
    for (const s of ["X", "oui", "FM"]) expect(lireSexe(texte(s)).ok, s).toBe(false);
    expect(lireSexe(vide).ok).toBe(false);
  });

  it("le niveau accepte 1, « 2e », « 3ème », « 1re année » ; refuse 0 et plus que la durée maximale", () => {
    for (const [saisie, attendu] of [[nombre(1), 1], [texte("2"), 2], [texte("2e"), 2], [texte("3ème"), 3], [texte("1re année"), 1], [texte("1ère"), 1]] as const) {
      expect(lireNiveau(saisie), JSON.stringify(saisie)).toEqual({ ok: true, valeur: attendu });
    }
    for (const saisie of [nombre(0), nombre(7), texte("première"), nombre(1.5), vide]) expect(lireNiveau(saisie).ok, JSON.stringify(saisie)).toBe(false);
  });

  it("l'année d'entrée accepte 2025 ou « 2025-2026 » et refuse une période incohérente ou hors bornes", () => {
    for (const saisie of [nombre(2025), texte("2025"), texte("2025-2026"), texte("2025/2026")]) {
      expect(lireAnneeEntree(saisie), JSON.stringify(saisie)).toEqual({ ok: true, valeur: 2025 });
    }
    for (const saisie of [texte("2025-2027"), nombre(1999), nombre(2101), texte("25"), vide, nombre(2025.5)]) {
      expect(lireAnneeEntree(saisie).ok, JSON.stringify(saisie)).toBe(false);
    }
  });

  it("redoublant : vide = non, oui/non en clair, autre valeur refusée", () => {
    expect(lireRedoublant(vide)).toEqual({ ok: true, valeur: false });
    expect(lireRedoublant(texte("Oui"))).toEqual({ ok: true, valeur: true });
    expect(lireRedoublant(texte("redoublante"))).toEqual({ ok: true, valeur: true });
    expect(lireRedoublant(texte("NON"))).toEqual({ ok: true, valeur: false });
    expect(lireRedoublant(texte("peut-être")).ok).toBe(false);
  });

  it("droits en tranches : vide = 1 fois, « 3 fois », 2, refuse 0 et 4", () => {
    expect(lireTranches(vide)).toEqual({ ok: true, valeur: 1 });
    expect(lireTranches(texte("3 fois"))).toEqual({ ok: true, valeur: 3 });
    expect(lireTranches(nombre(2))).toEqual({ ok: true, valeur: 2 });
    for (const saisie of [nombre(0), nombre(4), texte("trois")]) expect(lireTranches(saisie).ok, JSON.stringify(saisie)).toBe(false);
  });

  it("un N° se compare sans zéros initiaux ni casse : « 007 » = 7, « a12 » = « A12 »", () => {
    expect(normaliserNumero("007")).toBe("7");
    expect(normaliserNumero("  a12 ")).toBe("A12");
    expect(normaliserRecuPapier("0412")).toBe(normaliserRecuPapier("412"));
  });
});

describe("champs d'un paiement", () => {
  it("le montant est un entier positif : nombre, « 80 000 », « 80000 Ar »", () => {
    expect(lireMontantCellule(nombre(80000))).toEqual({ ok: true, valeur: 80000 });
    expect(lireMontantCellule(texte("80 000"))).toEqual({ ok: true, valeur: 80000 });
    expect(lireMontantCellule(texte("80000 Ar"))).toEqual({ ok: true, valeur: 80000 });
  });

  it("refuse un montant nul, négatif, décimal, ambigu (point), en texte ou une date", () => {
    for (const saisie of [nombre(0), nombre(-5), nombre(1500.5), texte("80.000"), texte("80,5"), texte("beaucoup"), date("2026-10-05"), vide]) {
      expect(lireMontantCellule(saisie).ok, JSON.stringify(saisie)).toBe(false);
    }
    expect(lireMontantCellule(nombre(0))).toMatchObject({ raison: expect.stringMatching(/^le montant doit être supérieur à 0/) });
  });

  it("le mode accepte Espèces et Mobile Money sous leurs écritures courantes", () => {
    for (const s of ["Espèces", "especes", "ESPÈCES", "cash"]) expect(lireMode(texte(s)), s).toEqual({ ok: true, valeur: "ESPECES" });
    for (const s of ["Mobile Money", "mobile-money", "MM", "mobile"]) expect(lireMode(texte(s)), s).toEqual({ ok: true, valeur: "MOBILE_MONEY" });
    expect(lireMode(texte("Chèque")).ok).toBe(false);
    expect(lireMode(vide).ok).toBe(false);
  });

  it("l'opérateur accepte MVola, Orange Money, Airtel Money ; vide = aucun", () => {
    expect(lireOperateur(vide)).toEqual({ ok: true, valeur: null });
    expect(lireOperateur(texte("Telma MVola"))).toEqual({ ok: true, valeur: "MVOLA" });
    expect(lireOperateur(texte("orange"))).toEqual({ ok: true, valeur: "ORANGE_MONEY" });
    expect(lireOperateur(texte("Airtel Money"))).toEqual({ ok: true, valeur: "AIRTEL_MONEY" });
    expect(lireOperateur(texte("Visa")).ok).toBe(false);
  });
});

describe("validerEtudiants", () => {
  it("rend les valeurs typées d'une ligne valide : nom en majuscules, filière en majuscules, N° normalisé", () => {
    const v = etudiants([{ numero: "007", nom: "rakoto", filiere: "if", telephone: "34 12 345 67", cin: "501 011 012 345", redoublant: "Oui", droitsEnTranches: "3" }]);

    expect(v.messages).toEqual([]);
    expect(v.refusees).toEqual([]);
    expect(v.valides).toEqual([
      {
        ligne: 2, numero: "7", nom: "RAKOTO", prenoms: "Jean", sexe: "M", dateNaissance: "2004-05-10", lieuNaissance: "Toamasina",
        cin: "501011012345", telephone: "0341234567", adresse: "Tanambao V", filiere: "IF", anneeEntree: 2026, niveau: 1,
        redoublant: true, droitsEnTranches: 3,
      },
    ]);
  });

  it("applique les défauts : adresse vide = null, redoublant = non, droits en 1 fois", () => {
    const v = etudiants([{ adresse: null, redoublant: null, droitsEnTranches: null, telephone: null }]);

    expect(v.valides[0]).toMatchObject({ adresse: null, redoublant: false, droitsEnTranches: 1, telephone: null, cin: null });
  });

  it("lit les dates d'Excel (cellule date et numéro de série) comme le texte JJ/MM/AAAA", () => {
    const v = etudiants([{ numero: "1", dateNaissance: new Date(Date.UTC(2004, 4, 10)) }, { numero: "2", nom: "AUTRE", dateNaissance: serie("2004-05-10") }]);

    expect(v.valides.map((e) => e.dateNaissance)).toEqual(["2004-05-10", "2004-05-10"]);
  });

  it("cite la ligne Excel, la colonne et la valeur dans le message d'une cellule refusée", () => {
    const v = etudiants([{ telephone: "12345" }]);

    expect(v.valides).toEqual([]);
    expect(v.refusees).toEqual([{ ligne: 2, numero: "1" }]);
    expect(erreurs(v)).toEqual([expect.stringMatching(/^Étudiants, ligne 2, colonne « Téléphone » \(« 12345 »\) : numéro malgache attendu/)]);
  });

  it("une cellule obligatoire vide bloque la ligne, une par colonne manquante", () => {
    const v = etudiants([{ nom: null, sexe: null, filiere: null }]);

    expect(erreurs(v)).toHaveLength(3);
    for (const colonne of ["Nom", "Sexe", "Filière"]) {
      expect(erreurs(v).some((t) => t.includes(`colonne « ${colonne} »`) && t.includes("obligatoire, la cellule est vide")), colonne).toBe(true);
    }
    expect(v.refusees).toEqual([{ ligne: 2, numero: "1" }]);
  });

  it("refuse un téléphone ou un CIN invalide au lieu de les vider (décision 58)", () => {
    const v = etudiants([{ numero: "1", cin: "12345" }, { numero: "2", nom: "AUTRE", telephone: "0123456789" }]);

    expect(v.valides).toEqual([]);
    expect(erreurs(v)).toEqual([expect.stringMatching(/colonne « CIN »/), expect.stringMatching(/colonne « Téléphone »/)]);
  });

  it("un N° en double refuse toutes les lignes qui le portent, en citant les autres lignes", () => {
    const v = etudiants([
      { numero: "7", nom: "RAKOTO" },
      { numero: "007", nom: "RASOA", prenoms: "Fanja" },
      { numero: "8", nom: "RANDRIA", prenoms: "Tojo" },
      { numero: "7", nom: "RABE", prenoms: "Soa" },
    ]);

    expect(v.valides.map((e) => e.numero)).toEqual(["8"]);
    expect(v.refusees).toEqual([{ ligne: 2, numero: "7" }, { ligne: 3, numero: "7" }, { ligne: 5, numero: "7" }]);
    expect(erreurs(v)).toEqual([
      expect.stringMatching(/ligne 2, colonne « N° » \(« 7 »\) : N° déjà utilisé par les lignes 3, 5/),
      expect.stringMatching(/ligne 3, colonne « N° » \(« 7 »\) : N° déjà utilisé par les lignes 2, 5/),
      expect.stringMatching(/ligne 5, colonne « N° » \(« 7 »\) : N° déjà utilisé par les lignes 2, 3/),
    ]);
  });

  it("une ligne refusée garde son N° pour refuser en cascade les paiements, un N° illisible reste null", () => {
    const v = etudiants([{ numero: "3", sexe: "?" }, { numero: null, nom: "AUTRE" }]);

    expect(v.refusees).toEqual([{ ligne: 2, numero: "3" }, { ligne: 3, numero: null }]);
  });

  it("refuse les lignes d'exemple du modèle, même retapées sans accents ni majuscules", () => {
    for (const ex of IDENTITES_EXEMPLES) {
      const [annee, mois, jour] = ex.dateNaissance.split("-");
      const v = etudiants([{ nom: ex.nom.toLowerCase(), prenoms: ex.prenoms.toUpperCase(), dateNaissance: `${jour}/${mois}/${annee}` }]);

      expect(v.valides, ex.nom).toEqual([]);
      expect(erreurs(v), ex.nom).toEqual([expect.stringMatching(/ligne d'exemple du modèle/)]);
    }
  });

  it("accepte le même nom avec une autre date de naissance : ce n'est plus l'exemple", () => {
    const v = etudiants([{ nom: "RAKOTOMALALA", prenoms: "Hanitra Mialy", dateNaissance: "15/03/2007" }]);

    expect(v.messages).toEqual([]);
    expect(v.valides).toHaveLength(1);
  });

  it("refuse une date de naissance future ou du jour de l'analyse, accepte la veille", () => {
    const sur = (d: string) => etudiants([{ dateNaissance: d }]);

    expect(erreurs(sur("16/11/2026"))).toEqual([expect.stringMatching(/colonne « Date de naissance ».*la date de naissance doit être passée/)]);
    expect(erreurs(sur("15/11/2026"))).toHaveLength(1);
    expect(sur("14/11/2026").valides).toHaveLength(1);
  });

  it("refuse une date de naissance avant 1900", () => {
    expect(erreurs(etudiants([{ dateNaissance: "01/01/1899" }]))).toEqual([expect.stringMatching(/date de naissance invalide/)]);
  });

  it("une colonne facultative absente du fichier n'empêche pas la ligne d'être valide", () => {
    const v = validerEtudiants(reprise([{}], [], { sans: ["redoublant", "droitsEnTranches", "cin", "adresse", "telephone"] }).etudiants, CADRE);

    expect(v.messages).toEqual([]);
    expect(v.valides[0]).toMatchObject({ redoublant: false, droitsEnTranches: 1, cin: null, adresse: null, telephone: null });
  });
});

describe("validerPaiements", () => {
  it("rend les valeurs typées d'un paiement valide (N° et date lus, référence vide = null)", () => {
    const v = paiements([{ numeroEtudiant: "001", date: "05/10/2026", montant: "80 000", mode: "Mobile Money", operateur: "MVola", reference: "MP1", recuPapier: "0600" }]);

    expect(v.messages).toEqual([]);
    expect(v.valides).toEqual([
      { ligne: 2, numeroEtudiant: "1", jour: "2026-10-05", montant: 80000, mode: "MOBILE_MONEY", operateur: "MVOLA", reference: "MP1", recuPapier: "0600" },
    ]);
  });

  it("refuse un paiement dont le N° étudiant n'est pas dans la feuille Étudiants", () => {
    const v = paiements([{ numeroEtudiant: "9" }]);

    expect(v.valides).toEqual([]);
    expect(v.refusees).toEqual([{ ligne: 2, numero: "9" }]);
    expect(erreurs(v)).toEqual([expect.stringMatching(/colonne « N° étudiant » \(« 9 »\) : aucun étudiant ne porte ce N°/)]);
  });

  it("refuse une date future, accepte le jour même", () => {
    expect(erreurs(paiements([{ date: "16/11/2026" }]))).toEqual([expect.stringMatching(/date future/)]);
    expect(paiements([{ date: "15/11/2026" }]).valides).toHaveLength(1);
  });

  it(`un paiement de moins de ${MOIS_AVANT_RENTREE} mois avant la rentrée est accepté avec un avertissement`, () => {
    for (const jour of ["01/07/2026", "30/09/2026"]) {
      const v = paiements([{ date: jour }]);

      expect(v.valides, jour).toHaveLength(1);
      expect(avertissements(v), jour).toEqual([expect.stringMatching(/avant la rentrée du 01\/10\/2026/)]);
    }
  });

  it("un paiement plus ancien de 3 mois avant la rentrée est bloquant", () => {
    const v = paiements([{ date: "30/06/2026" }]);

    expect(v.valides).toEqual([]);
    expect(erreurs(v)).toEqual([expect.stringMatching(/antérieur au 01\/07\/2026 : les paiements des années précédentes ne sont pas repris/)]);
  });

  it("un paiement à partir de la rentrée n'a aucun message de date", () => {
    expect(paiements([{ date: "01/10/2026" }]).messages).toEqual([]);
  });

  it("sans rentrée connue, seule la date future est contrôlée", () => {
    const v = paiements([{ date: "01/01/2020" }], ["1"], { jour: "2026-11-15", dateDebutAnnee: null });

    expect(v.messages).toEqual([]);
    expect(v.valides).toHaveLength(1);
  });

  it("Mobile Money sans opérateur est bloquant", () => {
    const v = paiements([{ mode: "Mobile Money", operateur: null, reference: "MP1" }]);

    expect(v.valides).toEqual([]);
    expect(erreurs(v)).toEqual([expect.stringMatching(/colonne « Opérateur ».*opérateur obligatoire pour un paiement Mobile Money/)]);
  });

  it("Mobile Money sans référence est accepté avec un avertissement, référence vide (décision 54)", () => {
    const v = paiements([{ mode: "Mobile Money", operateur: "Orange Money", reference: null }]);

    expect(v.valides).toMatchObject([{ mode: "MOBILE_MONEY", operateur: "ORANGE_MONEY", reference: null }]);
    expect(avertissements(v)).toEqual([expect.stringMatching(/colonne « Référence ».*sans référence/)]);
    expect(erreurs(v)).toEqual([]);
  });

  it("Mobile Money complet n'a aucun message", () => {
    expect(paiements([{ mode: "Mobile Money", operateur: "Airtel Money", reference: "AM123" }]).messages).toEqual([]);
  });

  it("Espèces avec un opérateur ou une référence est bloquant, un message par colonne", () => {
    expect(erreurs(paiements([{ mode: "Espèces", operateur: "MVola" }]))).toEqual([expect.stringMatching(/colonne « Opérateur ».*ne concerne que le Mobile Money/)]);
    expect(erreurs(paiements([{ mode: "Espèces", reference: "MP1" }]))).toEqual([expect.stringMatching(/colonne « Référence ».*ne concerne que le Mobile Money/)]);
    const les2 = paiements([{ mode: "Espèces", operateur: "MVola", reference: "MP1" }]);
    expect(les2.valides).toEqual([]);
    expect(erreurs(les2)).toHaveLength(2);
  });

  it("un mode illisible ne déclenche pas les contrôles d'opérateur", () => {
    const v = paiements([{ mode: "Chèque", operateur: "MVola" }]);

    expect(erreurs(v)).toEqual([expect.stringMatching(/colonne « Mode ».*indiquez Espèces ou Mobile Money/)]);
  });

  it("refuse les lignes d'exemple du modèle, « 412 » valant « 0412 »", () => {
    for (const recu of ["0412", "412", 412]) {
      const v = paiements([{ numeroEtudiant: "1", montant: "34000", mode: "Espèces", recuPapier: recu }]);

      expect(v.valides, String(recu)).toEqual([]);
      expect(erreurs(v), String(recu)).toEqual([expect.stringMatching(/ligne d'exemple du modèle/)]);
    }
    const mobile = paiements([{ numeroEtudiant: "1", montant: "80000", mode: "Mobile Money", operateur: "MVola", reference: "MP1", recuPapier: "413" }]);
    expect(erreurs(mobile)).toEqual([expect.stringMatching(/ligne d'exemple du modèle/)]);
  });

  it("accepte le même montant avec un autre reçu papier ou un autre étudiant : ce n'est plus l'exemple", () => {
    expect(paiements([{ montant: "34000", recuPapier: "0999" }]).valides).toHaveLength(1);
    expect(paiements([{ numeroEtudiant: "5", montant: "34000", recuPapier: "0412" }], ["5"]).valides).toHaveLength(1);
    expect(paiements([{ montant: "34000", recuPapier: null }]).valides).toHaveLength(1);
  });

  it("refuse un montant nul et garde le N° pour la cascade", () => {
    const v = paiements([{ montant: "0" }]);

    expect(v.refusees).toEqual([{ ligne: 2, numero: "1" }]);
    expect(erreurs(v)).toEqual([expect.stringMatching(/colonne « Montant \(Ar\) » \(« 0 »\) : le montant doit être supérieur à 0/)]);
  });
});
