import { describe, expect, it } from "vitest";
import { construireRecu, type LigneRecuSource, type SourceRecu } from "@/lib/encaissement";
import { montantEnLettres } from "@/lib/montant-en-lettres";
import { controleTranchesModifiables, estDoublon, libelleNiveauInscription } from "@/lib/etudiants";

const mois = (iso: string) => new Date(`${iso}T00:00:00Z`);

function ligne(
  type: "DROITS" | "MENSUALITE",
  moisIso: string,
  ordre: number,
  montant: number,
  resteEcheanceApres = 0,
  options: { tranche?: number | null; anneeDebut?: number; droitsEnTranches?: number } = {},
): LigneRecuSource {
  const anneeDebut = options.anneeDebut ?? 2026;
  return {
    montant,
    resteEcheanceApres,
    echeance: {
      type,
      tranche: options.tranche ?? (type === "DROITS" ? 1 : null),
      mois: mois(moisIso),
      ordre,
      droitsEnTranches: options.droitsEnTranches ?? 1,
      anneeDebut,
      anneeLibelle: `${anneeDebut}-${anneeDebut + 1}`,
    },
  };
}

function source(lignes: LigneRecuSource[], surcharge: Partial<SourceRecu> = {}): SourceRecu {
  return {
    paiementId: "p1",
    numero: "R-2026-00001",
    instant: new Date("2026-11-15T07:24:00Z"),
    etudiant: { matricule: "IF-2026-0001", nom: "RAKOTO", prenoms: "Hanta", filiere: "Infirmier(e)s" },
    inscription: { niveau: 1, redoublement: false, anneeLibelle: "2026-2027" },
    lignes,
    montant: lignes.reduce((s, l) => s + l.montant, 0),
    mode: "ESPECES",
    operateur: null,
    reference: null,
    resteApres: 640_000,
    retardApres: 0,
    caissier: "Caissier Test",
    annulation: null,
    ...surcharge,
  };
}

describe("construireRecu", () => {
  const trois = [
    ligne("MENSUALITE", "2026-11-01", 4, 20_000, 60_000),
    ligne("DROITS", "2026-10-01", 1, 100_000),
    ligne("MENSUALITE", "2026-10-01", 2, 80_000),
  ];

  it("trie les lignes dans l'ordre de solde et marque l'acompte avec le reste de l'échéance", () => {
    const r = construireRecu(source(trois));
    expect(r.lignes).toEqual([
      { libelle: "Droits d'inscription", montant: 100_000, acompte: false, resteEcheance: 0 },
      { libelle: "Octobre 2026", montant: 80_000, acompte: false, resteEcheance: 0 },
      { libelle: "Novembre 2026", montant: 20_000, acompte: true, resteEcheance: 60_000 },
    ]);
  });

  it("date et heure de Madagascar, total, montant en lettres, niveau et année", () => {
    const r = construireRecu(source(trois));
    expect(r).toMatchObject({
      paiementId: "p1",
      numero: "R-2026-00001",
      dateISO: "2026-11-15T07:24:00.000Z",
      date: "15/11/2026",
      heure: "10:24",
      total: 200_000,
      totalEnLettres: montantEnLettres(200_000),
      resteApres: 640_000,
      retardApres: 0,
      caissier: "Caissier Test",
      annulation: null,
      mode: "ESPECES",
      modeLibelle: "Espèces",
      operateur: null,
      operateurLibelle: null,
      etudiant: { matricule: "IF-2026-0001", filiere: "Infirmier(e)s", niveau: "1re année", anneeScolaire: "2026-2027" },
    });
    expect(r.totalEnLettres).toMatch(/ariary$/);
  });

  it("le même reçu reconstruit deux fois, lignes dans un autre ordre, est identique", () => {
    const a = construireRecu(source(trois));
    const b = construireRecu(source([...trois].reverse()));
    expect(b).toEqual(a);
  });

  it("tranches de droits : « Droits — tranche 2/3 » placée entre les mensualités de son mois", () => {
    const lignes = [
      ligne("MENSUALITE", "2026-11-01", 4, 80_000, 0, { droitsEnTranches: 3 }),
      ligne("DROITS", "2026-11-01", 3, 33_000, 0, { tranche: 2, droitsEnTranches: 3 }),
      ligne("DROITS", "2026-10-01", 1, 34_000, 0, { tranche: 1, droitsEnTranches: 3 }),
    ];
    expect(construireRecu(source(lignes)).lignes.map((l) => l.libelle)).toEqual([
      "Droits — tranche 1/3",
      "Droits — tranche 2/3",
      "Novembre 2026",
    ]);
  });

  it("deux années sur un reçu : les droits portent l'année, les mensualités gardent leur mois", () => {
    const lignes = [
      ligne("DROITS", "2026-10-01", 1, 50_000, 50_000),
      ligne("MENSUALITE", "2026-07-01", 11, 70_000, 0, { anneeDebut: 2025 }),
      ligne("DROITS", "2025-10-01", 1, 100_000, 0, { anneeDebut: 2025 }),
    ];
    const r = construireRecu(source(lignes, { inscription: { niveau: 2, redoublement: false, anneeLibelle: "2026-2027" } }));
    expect(r.lignes.map((l) => l.libelle)).toEqual([
      "Droits d'inscription 2025-2026",
      "Juillet 2026",
      "Droits d'inscription 2026-2027",
    ]);
    expect(r.etudiant).toMatchObject({ niveau: "2e année", anneeScolaire: "2026-2027" });
  });

  it("une seule année : les droits restent sans année", () => {
    expect(construireRecu(source([ligne("DROITS", "2026-10-01", 1, 100_000)])).lignes[0].libelle).toBe("Droits d'inscription");
  });

  it("Mobile Money : libellés du mode et de l'opérateur, référence conservée", () => {
    const r = construireRecu(source(trois, { mode: "MOBILE_MONEY", operateur: "ORANGE_MONEY", reference: "MP1234" }));
    expect(r).toMatchObject({ modeLibelle: "Mobile Money", operateurLibelle: "Orange Money", reference: "MP1234" });
  });

  it("redoublant : niveau suivi de « (redoublant) »", () => {
    const r = construireRecu(source(trois, { inscription: { niveau: 2, redoublement: true, anneeLibelle: "2026-2027" } }));
    expect(r.etudiant.niveau).toBe("2e année (redoublant)");
  });

  it("annulation : date de Madagascar (21 h UTC = lendemain), auteur et motif ; les montants ne bougent pas", () => {
    const sans = construireRecu(source(trois));
    const avec = construireRecu(
      source(trois, { annulation: { instant: new Date("2026-11-15T21:30:00Z"), par: "Admin Test", motif: "erreur de saisie" } }),
    );
    expect(avec.annulation).toEqual({ date: "16/11/2026", par: "Admin Test", motif: "erreur de saisie" });
    expect({ ...avec, annulation: null }).toEqual(sans);
  });

  it("reçu hors ligne : pas d'identifiant de paiement", () => {
    expect(construireRecu(source(trois, { paiementId: null })).paiementId).toBeNull();
  });
});

describe("estDoublon", () => {
  const base = { nom: "RAKOTOMALALA", prenoms: "Éloïse Hanta", dateNaissance: mois("2005-03-14") };

  it("même nom, prénoms et jour : doublon, sans égard à la casse, aux accents ni aux espaces superflus", () => {
    expect(estDoublon(base, { nom: "rakotomalala", prenoms: "eloise  hanta", dateNaissance: mois("2005-03-14") })).toBe(true);
    expect(estDoublon(base, { ...base })).toBe(true);
  });

  it("un seul critère différent suffit à écarter le doublon", () => {
    expect(estDoublon(base, { ...base, nom: "RAKOTO" })).toBe(false);
    expect(estDoublon(base, { ...base, prenoms: "Hanta" })).toBe(false);
    expect(estDoublon(base, { ...base, dateNaissance: mois("2005-03-15") })).toBe(false);
  });

  it("l'ordre des prénoms compte : deux personnes différentes", () => {
    expect(estDoublon(base, { ...base, prenoms: "Hanta Éloïse" })).toBe(false);
  });

  it("l'heure de la date est ignorée : seul le jour compte", () => {
    expect(estDoublon(base, { ...base, dateNaissance: new Date("2005-03-14T10:00:00Z") })).toBe(true);
  });
});

describe("controleTranchesModifiables", () => {
  it("modifiable : année ouverte et aucune ligne de paiement sur les droits", () => {
    expect(controleTranchesModifiables({ lignesPaiementDroits: 0, anneeLibelle: "2026-2027", anneeCloturee: false })).toBeNull();
  });

  it("refusé dès une ligne de paiement sur les droits (même annulée)", () => {
    expect(controleTranchesModifiables({ lignesPaiementDroits: 1, anneeLibelle: "2026-2027", anneeCloturee: false })).toMatch(/même annulés/);
  });

  it("refusé sur une année clôturée, avec son libellé ; la clôture est annoncée avant les paiements", () => {
    expect(controleTranchesModifiables({ lignesPaiementDroits: 0, anneeLibelle: "2025-2026", anneeCloturee: true })).toBe(
      "L'année 2025-2026 est clôturée : son échéancier ne se modifie plus.",
    );
    expect(controleTranchesModifiables({ lignesPaiementDroits: 3, anneeLibelle: "2025-2026", anneeCloturee: true })).toMatch(/clôturée/);
  });
});

describe("libelleNiveauInscription", () => {
  it("1re année, 2e année, et « (redoublant) » si redoublement", () => {
    expect(libelleNiveauInscription(1, false)).toBe("1re année");
    expect(libelleNiveauInscription(3, false)).toBe("3e année");
    expect(libelleNiveauInscription(1, true)).toBe("1re année (redoublant)");
    expect(libelleNiveauInscription(2, true)).toBe("2e année (redoublant)");
  });
});
