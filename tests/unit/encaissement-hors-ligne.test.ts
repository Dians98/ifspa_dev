import { describe, expect, it } from "vitest";
import type { StatutEtudiant } from "@/generated/prisma/enums";
import { jourDeDate } from "@/lib/dates";
import { genererEcheances } from "@/lib/ecolage";
import {
  anneeDuRecu,
  anneesABloquer,
  appliquerFile,
  construireSituationGuichet,
  elaguerPourCopie,
  horlogeIncoherente,
  imputerJusquAuReste,
  instantCorrige,
  MAX_ELEMENTS_SYNCHRO,
  rechercheLocale,
  recuHorsLigne,
  schemaDemandeBlocs,
  schemaElementFile,
  schemaSynchronisation,
  type CopieGuichet,
  type EcheanceCopie,
  type EtudiantCopie,
} from "@/lib/encaissement-hors-ligne";
import { lireNumeroRecu } from "@/lib/matricule";

const POSTE = "3f2b8c1e-5a47-4d0e-9b61-0c8f7e2a1d34";
const ID_CLIENT = "7a1d2c3e-9b8f-4e6a-a5d4-1f0e2b3c4d5e";

const TARIF = { droitsInscription: 100_000, montantMensuel: 80_000, nombreMois: 10 };

/** Échéancier généré comme en production, ids lisibles `{annee}-{ordre}`. */
function echeancesAnnee(anneeDebut: number, payeParOrdre: Record<number, number> = {}, droitsEnTranches = 1): EcheanceCopie[] {
  return genererEcheances(TARIF, { anneeDebut, moisDebutEcolage: 10 }, droitsEnTranches).map((e) => ({
    id: `${anneeDebut}-${e.ordre}`,
    anneeDebut,
    anneeLibelle: `${anneeDebut}-${anneeDebut + 1}`,
    type: e.type,
    tranche: e.tranche,
    droitsEnTranches,
    mois: jourDeDate(e.mois),
    ordre: e.ordre,
    montantDu: e.montantDu,
    paye: payeParOrdre[e.ordre] ?? 0,
  }));
}

let compteur = 0;

function etudiant(surcharge: Partial<EtudiantCopie> = {}): EtudiantCopie {
  compteur++;
  return {
    id: `etu-${compteur}`,
    matricule: `IF-2026-${String(compteur).padStart(4, "0")}`,
    nom: `NOM${compteur}`,
    prenoms: `Prénom${compteur}`,
    statut: "ACTIF",
    filiereCode: "IF",
    filiereNom: "Infirmier(e)s",
    inscriptions: [{ anneeDebut: 2026, libelle: "2026-2027", niveau: 1, redoublement: false }],
    echeances: echeancesAnnee(2026),
    ...surcharge,
  };
}

const copie = (...etudiants: EtudiantCopie[]): CopieGuichet => ({ genereeLeISO: "2026-11-15T09:00:00.000Z", etudiants });

const payeParId = (e: EtudiantCopie) => Object.fromEntries(e.echeances.map((x) => [x.id, x.paye]));

describe("appliquerFile", () => {
  it("deux paiements du même étudiant se cumulent : le second part des restes déjà diminués", () => {
    const e = etudiant();

    const vue = appliquerFile(copie(e), [
      { etudiantId: e.id, montant: 100_000 },
      { etudiantId: e.id, montant: 100_000 },
    ]);

    expect(payeParId(vue.etudiants[0])).toMatchObject({ "2026-1": 100_000, "2026-2": 80_000, "2026-3": 20_000, "2026-4": 0 });
  });

  it("un montant inférieur à une échéance reste en acompte sur elle", () => {
    const e = etudiant({ echeances: echeancesAnnee(2026, { 1: 100_000 }) });

    const vue = appliquerFile(copie(e), [{ etudiantId: e.id, montant: 30_000 }]);

    expect(vue.etudiants[0].echeances.find((x) => x.id === "2026-2")?.paye).toBe(30_000);
  });

  it("n'impute jamais au-delà du reste dû, même pour un montant plus grand", () => {
    const e = etudiant();

    const vue = appliquerFile(copie(e), [{ etudiantId: e.id, montant: 5_000_000 }]);

    expect(vue.etudiants[0].echeances.every((x) => x.paye === x.montantDu)).toBe(true);
  });

  it("ignore un étudiant inconnu, un montant nul ou décimal, sans toucher aux autres", () => {
    const a = etudiant();
    const b = etudiant();

    const vue = appliquerFile(copie(a, b), [
      { etudiantId: "inconnu", montant: 50_000 },
      { etudiantId: a.id, montant: 0 },
      { etudiantId: a.id, montant: 1_000.5 },
      { etudiantId: b.id, montant: 80_000 },
    ]);

    expect(payeParId(vue.etudiants[0])).toEqual(payeParId(a));
    expect(vue.etudiants[1].echeances[0].paye).toBe(80_000);
  });

  it("ne modifie pas la copie d'origine", () => {
    const e = etudiant();
    const origine = copie(e);

    appliquerFile(origine, [{ etudiantId: e.id, montant: 100_000 }]);

    expect(origine.etudiants[0].echeances.every((x) => x.paye === 0)).toBe(true);
  });

  it("répartit sur plusieurs années, la plus ancienne d'abord", () => {
    const e = etudiant({
      inscriptions: [
        { anneeDebut: 2025, libelle: "2025-2026", niveau: 1, redoublement: false },
        { anneeDebut: 2026, libelle: "2026-2027", niveau: 2, redoublement: false },
      ],
      echeances: [...echeancesAnnee(2026), ...echeancesAnnee(2025)],
    });

    const vue = appliquerFile(copie(e), [{ etudiantId: e.id, montant: 950_000 }]);

    const paye = payeParId(vue.etudiants[0]);
    expect(paye["2025-1"]).toBe(100_000);
    expect(paye["2025-11"]).toBe(80_000);
    expect(paye["2026-1"]).toBe(50_000);
    expect(paye["2026-2"]).toBe(0);
  });
});

describe("imputerJusquAuReste", () => {
  const nonSoldees = [
    { id: "a", reste: 80_000 },
    { id: "b", reste: 80_000 },
  ];

  it("rend le surplus au-delà du reste dû au lieu de refuser", () => {
    const r = imputerJusquAuReste(nonSoldees, 200_000);

    expect(r.impute).toBe(160_000);
    expect(r.surplus).toBe(40_000);
    expect(r.lignes.map((l) => [l.echeanceId, l.montant, l.resteEcheance])).toEqual([["a", 80_000, 0], ["b", 80_000, 0]]);
  });

  it("sans reste dû : aucune ligne, tout le montant en surplus", () => {
    expect(imputerJusquAuReste([], 50_000)).toEqual({ lignes: [], impute: 0, surplus: 50_000 });
  });

  it("refuse un montant nul ou décimal", () => {
    expect(() => imputerJusquAuReste(nonSoldees, 0)).toThrow(RangeError);
    expect(() => imputerJusquAuReste(nonSoldees, 10.5)).toThrow(RangeError);
  });
});

describe("rechercheLocale", () => {
  const JOUR = "2026-11-15";

  it("ignore les accents et la casse, et exige tous les mots", () => {
    const eloise = etudiant({ nom: "RAKOTO", prenoms: "Éloïse" });
    const autre = etudiant({ nom: "RAKOTO", prenoms: "Hanta" });
    const c = copie(eloise, autre);

    expect(rechercheLocale(c, "eloise", JOUR).map((r) => r.id)).toEqual([eloise.id]);
    expect(rechercheLocale(c, "RAKOTO hanta", JOUR).map((r) => r.id)).toEqual([autre.id]);
    expect(rechercheLocale(c, "rakoto", JOUR)).toHaveLength(2);
  });

  it("trouve par matricule", () => {
    const e = etudiant({ matricule: "SF-2025-0042" });
    expect(rechercheLocale(copie(e, etudiant()), "sf-2025-0042", JOUR).map((r) => r.id)).toEqual([e.id]);
  });

  it("recherche vide ou sans résultat : liste vide", () => {
    const c = copie(etudiant());
    expect(rechercheLocale(c, "   ", JOUR)).toEqual([]);
    expect(rechercheLocale(c, "introuvable", JOUR)).toEqual([]);
  });

  it("actifs d'abord, puis par nom, les sortis qui doivent encore restant trouvables", () => {
    const sortiDebiteur = etudiant({ nom: "ABEL", prenoms: "Zo", statut: "ABANDON" });
    const actifZ = etudiant({ nom: "ZAFY", prenoms: "Zo" });
    const actifB = etudiant({ nom: "BAO", prenoms: "Zo" });

    const r = rechercheLocale(copie(sortiDebiteur, actifZ, actifB), "zo", JOUR);

    expect(r.map((x) => x.nom)).toEqual(["BAO", "ZAFY", "ABEL"]);
    expect(r[2]).toMatchObject({ sorti: true, statut: "ABANDON" });
  });

  it("exclut un sorti qui ne doit plus rien, garde un actif soldé", () => {
    const toutPaye = echeancesAnnee(2026).map((e) => ({ ...e, paye: e.montantDu }));
    const sortiSolde = etudiant({ nom: "SOLDE", statut: "DIPLOME" as StatutEtudiant, echeances: toutPaye });
    const actifSolde = etudiant({ nom: "SOLDE", echeances: toutPaye });

    const r = rechercheLocale(copie(sortiSolde, actifSolde), "solde", JOUR);

    expect(r.map((x) => x.id)).toEqual([actifSolde.id]);
  });

  it("au plus 10 résultats", () => {
    const tous = Array.from({ length: 15 }, () => etudiant({ prenoms: "Commun" }));
    expect(rechercheLocale(copie(...tous), "commun", JOUR)).toHaveLength(10);
  });

  it("calcule les restes au jour donné : en retard à partir du 1er du mois suivant", () => {
    const e = etudiant();
    const veille = rechercheLocale(copie(e), e.matricule, "2026-10-31")[0];
    const lendemain = rechercheLocale(copie(e), e.matricule, "2026-11-01")[0];

    expect(veille).toMatchObject({ resteDu: 900_000, resteEnRetard: 0 });
    expect(lendemain).toMatchObject({ resteDu: 900_000, resteEnRetard: 180_000 });
  });
});

describe("construireSituationGuichet", () => {
  const jour = "2026-11-15";

  it("étudiant soldé : refus explicite, rien à encaisser", () => {
    const e = etudiant({ echeances: echeancesAnnee(2026).map((x) => ({ ...x, paye: x.montantDu })) });

    const s = construireSituationGuichet(e, e.echeances, jour);

    expect(s.refus).toMatch(/Rien à encaisser/);
    expect(s).toMatchObject({ resteDuTotal: 0, resteEnRetard: 0, echeances: [], annees: [], preselection: [] });
    expect(s.anneeEnCours).toMatchObject({ du: 900_000, paye: 900_000, reste: 0 });
  });

  it("sans inscription ni échéance : pas d'année en cours, pas de niveau", () => {
    const e = etudiant({ inscriptions: [], echeances: [] });

    const s = construireSituationGuichet(e, [], jour);

    expect(s.anneeEnCours).toBeNull();
    expect(s.etudiant).toMatchObject({ niveau: null, resteDu: 0 });
    expect(s.refus).not.toBeNull();
  });

  it("présélectionne les échéances en retard et marque un sorti", () => {
    const e = etudiant({ statut: "EXCLU" });

    const s = construireSituationGuichet(e, e.echeances, jour);

    expect(s.etudiant).toMatchObject({ sorti: true, libelleStatut: expect.any(String) });
    expect(s.preselection).toEqual(["2026-1", "2026-2"]);
    expect(s).toMatchObject({ resteDuTotal: 900_000, resteEnRetard: 180_000 });
  });

  it("plusieurs années : seulement les échéances non soldées, par année, la plus ancienne d'abord", () => {
    const e = etudiant({
      inscriptions: [
        { anneeDebut: 2025, libelle: "2025-2026", niveau: 1, redoublement: false },
        { anneeDebut: 2026, libelle: "2026-2027", niveau: 2, redoublement: true },
      ],
      echeances: [...echeancesAnnee(2026, { 1: 100_000 }), ...echeancesAnnee(2025, { 1: 100_000, 2: 80_000, 3: 30_000 })],
    });

    const s = construireSituationGuichet(e, e.echeances, jour);

    expect(s.annees.map((a) => [a.anneeDebut, a.niveau])).toEqual([[2025, "1re année"], [2026, "2e année (redoublant)"]]);
    expect(s.echeances[0]).toMatchObject({ id: "2025-3", paye: 30_000, reste: 50_000, statut: "retard" });
    expect(s.echeances.every((x) => x.reste > 0)).toBe(true);
    expect(s.resteDuTotal).toBe(900_000 - 210_000 + 900_000 - 100_000);
  });
});

describe("elaguerPourCopie", () => {
  it("ne change rien à la situation affichée, quel que soit le jour", () => {
    const e = etudiant({
      inscriptions: [
        { anneeDebut: 2025, libelle: "2025-2026", niveau: 1, redoublement: false },
        { anneeDebut: 2026, libelle: "2026-2027", niveau: 2, redoublement: false },
      ],
      echeances: [
        ...echeancesAnnee(2025, Object.fromEntries(Array.from({ length: 11 }, (_, i) => [i + 1, i === 0 ? 100_000 : 80_000]))),
        ...echeancesAnnee(2026, { 1: 100_000, 2: 40_000 }),
      ],
    });
    const elague = elaguerPourCopie(e);

    expect(elague.echeances.length).toBeLessThan(e.echeances.length);
    for (const jour of ["2025-09-01", "2026-10-31", "2026-11-01", "2027-08-01"]) {
      expect(construireSituationGuichet(elague, elague.echeances, jour), jour).toEqual(construireSituationGuichet(e, e.echeances, jour));
    }
  });

  it("garde toutes les échéances de l'année la plus récente, soldées comprises", () => {
    const e = etudiant({ echeances: echeancesAnnee(2026, { 1: 100_000 }) });
    expect(elaguerPourCopie(e).echeances).toHaveLength(e.echeances.length);
  });

  it("retire les échéances soldées d'une année plus ancienne", () => {
    const e = etudiant({
      inscriptions: [
        { anneeDebut: 2025, libelle: "2025-2026", niveau: 1, redoublement: false },
        { anneeDebut: 2026, libelle: "2026-2027", niveau: 2, redoublement: false },
      ],
      echeances: [...echeancesAnnee(2025, { 1: 100_000, 2: 40_000 }), ...echeancesAnnee(2026)],
    });

    const ids = elaguerPourCopie(e).echeances.map((x) => x.id);

    expect(ids).not.toContain("2025-1");
    expect(ids).toContain("2025-2");
  });
});

describe("recuHorsLigne", () => {
  const instant = new Date("2026-11-15T07:24:00Z");
  const saisie = (e: EtudiantCopie, montant: number) =>
    ({ etudiant: e, montant, mode: "ESPECES", operateur: null, reference: null, numeroRecu: "R-2026-00007", instant, caissier: "Caissier Test" }) as const;

  it("refuse un montant nul", () => {
    expect(recuHorsLigne(saisie(etudiant(), 0))).toMatchObject({ ok: false });
  });

  it("refuse un montant au-delà du reste dû, toutes années comprises", () => {
    const r = recuHorsLigne(saisie(etudiant(), 900_001));
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.erreur).toMatch(/dépasse/);
  });

  it("refuse tout paiement d'un étudiant soldé", () => {
    const solde = etudiant({ echeances: echeancesAnnee(2026).map((x) => ({ ...x, paye: x.montantDu })) });
    expect(recuHorsLigne(saisie(solde, 1_000))).toMatchObject({ ok: false });
  });

  it("100 000 pour des droits de 100 000 : lignes, restes et reste avant", () => {
    const r = recuHorsLigne(saisie(etudiant(), 100_000));

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.resteDuAvant).toBe(900_000);
    expect(r.recu).toMatchObject({
      paiementId: null,
      numero: "R-2026-00007",
      total: 100_000,
      resteApres: 800_000,
      retardApres: 80_000,
      caissier: "Caissier Test",
      date: "15/11/2026",
      heure: "10:24",
    });
    expect(r.recu.lignes).toEqual([{ libelle: "Droits d'inscription", montant: 100_000, acompte: false, resteEcheance: 0 }]);
  });

  it("le surplus sur l'échéance suivante est un acompte", () => {
    const r = recuHorsLigne(saisie(etudiant({ echeances: echeancesAnnee(2026, { 1: 100_000 }) }), 100_000));

    expect(r.ok && r.recu.lignes).toEqual([
      { libelle: "Octobre 2026", montant: 80_000, acompte: false, resteEcheance: 0 },
      { libelle: "Novembre 2026", montant: 20_000, acompte: true, resteEcheance: 60_000 },
    ]);
  });
});

describe("lireNumeroRecu", () => {
  it("lit l'année et le numéro d'un reçu bien formé", () => {
    expect(lireNumeroRecu("R-2027-00023")).toEqual({ annee: 2027, numero: 23 });
    expect(lireNumeroRecu("R-2026-99999")).toEqual({ annee: 2026, numero: 99_999 });
  });

  it("rend null pour tout ce qui n'est pas au format R-AAAA-NNNNN", () => {
    for (const faux of ["", "R-2027-23", "r-2027-00023", "R-2027-000231", "R-27-00023", " R-2027-00023", "R-2027-00023\n", "R-2027-00000", "R-0999-00001", "IF-2026-0001"]) {
      expect(lireNumeroRecu(faux), JSON.stringify(faux)).toBeNull();
    }
  });
});

describe("années et horloge du poste", () => {
  it("anneesABloquer : l'année suivante n'est demandée que dès le 1er décembre", () => {
    expect(anneesABloquer("2026-11-30")).toEqual([2026]);
    expect(anneesABloquer("2026-12-01")).toEqual([2026, 2027]);
    expect(anneesABloquer("2026-12-31")).toEqual([2026, 2027]);
    expect(anneesABloquer("2027-01-01")).toEqual([2027]);
  });

  it("anneeDuRecu : année civile à Madagascar, pas en UTC", () => {
    expect(anneeDuRecu(new Date("2026-12-31T20:59:59Z"))).toBe(2026);
    expect(anneeDuRecu(new Date("2026-12-31T21:00:00Z"))).toBe(2027);
  });

  it("instantCorrige : ajoute le décalage serveur moins poste, positif ou négatif", () => {
    const poste = new Date("2026-11-15T09:00:00Z");
    expect(instantCorrige(poste, 120_000).toISOString()).toBe("2026-11-15T09:02:00.000Z");
    expect(instantCorrige(poste, -3_600_000).toISOString()).toBe("2026-11-15T08:00:00.000Z");
  });

  it("instantCorrige : un décalage inconnu ou invalide laisse l'heure du poste", () => {
    const poste = new Date("2026-11-15T09:00:00Z");
    expect(instantCorrige(poste, Number.NaN).getTime()).toBe(poste.getTime());
    expect(instantCorrige(poste, Number.POSITIVE_INFINITY).getTime()).toBe(poste.getTime());
  });

  it("horlogeIncoherente : seulement si l'heure du poste précède la dernière synchronisation", () => {
    const synchro = new Date("2026-11-15T09:00:00Z");
    expect(horlogeIncoherente(new Date("2026-11-15T08:59:59Z"), synchro)).toBe(true);
    expect(horlogeIncoherente(new Date("2026-11-15T09:00:00Z"), synchro)).toBe(false);
    expect(horlogeIncoherente(new Date("2026-11-16T09:00:00Z"), synchro)).toBe(false);
    expect(horlogeIncoherente(new Date("2020-01-01T00:00:00Z"), null)).toBe(false);
  });
});

describe("schemaElementFile", () => {
  const BASE = {
    etudiantId: "etu-1",
    montant: 80_000,
    mode: "ESPECES",
    idClient: ID_CLIENT,
    resteDuAffiche: 900_000,
    poste: POSTE,
    numeroRecu: "R-2026-00007",
    instantSaisie: "2026-11-15T09:00:00.000Z",
    saisiParId: "user-1",
  };
  const analyser = (surcharge: Record<string, unknown> = {}) => schemaElementFile.safeParse({ ...BASE, ...surcharge });
  const chemins = (r: ReturnType<typeof analyser>) => (r.success ? [] : r.error.issues.map((i) => i.path.join(".")));

  it("accepte un paiement en espèces et normalise les champs facultatifs vides en null", () => {
    const r = analyser({ operateur: null, reference: "  " });
    expect(r.success && r.data).toMatchObject({ montant: 80_000, operateur: null, reference: null, observation: null });
  });

  it("Mobile Money : opérateur et référence obligatoires", () => {
    expect(chemins(analyser({ mode: "MOBILE_MONEY" })).sort()).toEqual(["operateur", "reference"]);
    expect(analyser({ mode: "MOBILE_MONEY", operateur: "MVOLA", reference: "MP123" }).success).toBe(true);
  });

  it("espèces avec opérateur ou référence : refusé", () => {
    expect(chemins(analyser({ operateur: "MVOLA", reference: "X" })).sort()).toEqual(["operateur", "reference"]);
  });

  it("instant de saisie : ISO 8601 avec fuseau uniquement", () => {
    expect(analyser({ instantSaisie: "2026-11-15T12:00:00+03:00" }).success).toBe(true);
    for (const faux of ["15/11/2026", "2026-11-15", "2026-11-15T09:00:00", "hier", "", 1_763_197_200_000]) {
      expect(chemins(analyser({ instantSaisie: faux })), String(faux)).toContain("instantSaisie");
    }
  });

  it("n'impose pas le format du numéro (un numéro refusé est remplacé au serveur), mais refuse vide ou démesuré", () => {
    expect(analyser({ numeroRecu: "n'importe quoi" }).success).toBe(true);
    expect(chemins(analyser({ numeroRecu: "   " }))).toContain("numeroRecu");
    expect(chemins(analyser({ numeroRecu: "R".repeat(31) }))).toContain("numeroRecu");
  });

  it("refuse un poste ou un idClient qui n'est pas un identifiant, et un montant nul ou décimal", () => {
    expect(chemins(analyser({ poste: "poste-1" }))).toContain("poste");
    expect(chemins(analyser({ idClient: "abc" }))).toContain("idClient");
    for (const montant of [0, -1, 100.5]) expect(chemins(analyser({ montant })), String(montant)).toContain("montant");
  });

  it("exige l'auteur de la saisie", () => {
    expect(chemins(analyser({ saisiParId: "" }))).toContain("saisiParId");
    expect(chemins(analyser({ saisiParId: undefined }))).toContain("saisiParId");
  });
});

describe("schemaSynchronisation", () => {
  const lot = (n: number, surcharge: Record<string, unknown> = {}) => ({
    poste: POSTE,
    elements: Array.from({ length: n }, (_, i) => ({ i })),
    ...surcharge,
  });

  it("accepte de 1 à 100 éléments, sans les valider un par un", () => {
    expect(schemaSynchronisation.safeParse(lot(1)).success).toBe(true);
    expect(schemaSynchronisation.safeParse(lot(MAX_ELEMENTS_SYNCHRO)).success).toBe(true);
  });

  it("refuse 0 élément et 101 éléments", () => {
    expect(schemaSynchronisation.safeParse(lot(0)).success).toBe(false);
    expect(schemaSynchronisation.safeParse(lot(MAX_ELEMENTS_SYNCHRO + 1)).success).toBe(false);
  });

  it("refuse un corps absent, un poste invalide ou des éléments qui ne sont pas une liste", () => {
    expect(schemaSynchronisation.safeParse(undefined).success).toBe(false);
    expect(schemaSynchronisation.safeParse(lot(1, { poste: "x" })).success).toBe(false);
    expect(schemaSynchronisation.safeParse(lot(1, { elements: "abc" })).success).toBe(false);
  });

  it("schemaDemandeBlocs : un poste valide suffit, les années sont choisies par le serveur", () => {
    expect(schemaDemandeBlocs.safeParse({ poste: POSTE }).success).toBe(true);
    expect(schemaDemandeBlocs.safeParse({ poste: "x" }).success).toBe(false);
    expect(schemaDemandeBlocs.safeParse({}).success).toBe(false);
  });
});
