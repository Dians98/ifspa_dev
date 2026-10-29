import { describe, expect, it } from "vitest";
import { schemaAnnulationPaiement, schemaEncaissement } from "@/lib/encaissement";

const UUID = "3f2b8c1e-5a47-4d0e-9b61-0c8f7e2a1d34";

const BASE = {
  etudiantId: "etu-1",
  montant: 80_000,
  mode: "ESPECES",
  idClient: UUID,
  resteDuAffiche: 240_000,
  jourAffiche: "2026-11-15",
};

function analyser(surcharge: Record<string, unknown> = {}) {
  return schemaEncaissement.safeParse({ ...BASE, ...surcharge });
}

function chemins(r: ReturnType<typeof analyser>): string[] {
  return r.success ? [] : r.error.issues.map((i) => i.path.join("."));
}

describe("schemaEncaissement", () => {
  it("accepte un paiement en espèces et normalise les champs facultatifs vides en null", () => {
    const r = analyser({ operateur: null, reference: "  ", observation: "" });
    expect(r.success).toBe(true);
    expect(r.success && r.data).toMatchObject({ montant: 80_000, mode: "ESPECES", operateur: null, reference: null, observation: null });
  });

  it("lit un montant saisi « 160 000 » comme 160000", () => {
    const r = analyser({ montant: "160 000" });
    expect(r.success && r.data.montant).toBe(160_000);
  });

  it("refuse un montant nul, négatif, décimal ou illisible", () => {
    for (const montant of [0, -5_000, 1_000.5, "1,5", "abc", ""]) {
      expect(analyser({ montant }).success, String(montant)).toBe(false);
    }
  });

  it("Mobile Money sans opérateur ni référence : refusé sur les deux champs", () => {
    expect(chemins(analyser({ mode: "MOBILE_MONEY" })).sort()).toEqual(["operateur", "reference"]);
  });

  it("Mobile Money avec opérateur mais référence blanche : refusé sur la référence", () => {
    expect(chemins(analyser({ mode: "MOBILE_MONEY", operateur: "MVOLA", reference: "   " }))).toEqual(["reference"]);
  });

  it("Mobile Money complet : accepté", () => {
    const r = analyser({ mode: "MOBILE_MONEY", operateur: "ORANGE_MONEY", reference: "MP2610.1234" });
    expect(r.success && r.data).toMatchObject({ operateur: "ORANGE_MONEY", reference: "MP2610.1234" });
  });

  it("opérateur ou référence en espèces : refusé", () => {
    expect(chemins(analyser({ operateur: "MVOLA" }))).toEqual(["operateur"]);
    expect(chemins(analyser({ reference: "ABC123" }))).toEqual(["reference"]);
  });

  it("refuse un opérateur ou un mode inconnu", () => {
    expect(analyser({ mode: "MOBILE_MONEY", operateur: "BITCOIN", reference: "x" }).success).toBe(false);
    expect(analyser({ mode: "CHEQUE" }).success).toBe(false);
  });

  it("idClient : UUID ou cuid acceptés, le reste refusé", () => {
    expect(analyser({ idClient: UUID.toUpperCase() }).success).toBe(true);
    expect(analyser({ idClient: "cm1abcdefghij0123456789xy" }).success).toBe(true);
    for (const idClient of ["", "abc", "3f2b8c1e-5a47-4d0e-9b61", `${UUID}0`, 12345, undefined]) {
      expect(analyser({ idClient }).success, String(idClient)).toBe(false);
    }
  });

  it("resteDuAffiche : entier positif ou nul seulement", () => {
    expect(analyser({ resteDuAffiche: 0 }).success).toBe(true);
    for (const resteDuAffiche of [-1, 1.5, "100", undefined]) {
      expect(analyser({ resteDuAffiche }).success, String(resteDuAffiche)).toBe(false);
    }
  });

  it("refuse un étudiant absent, une référence ou une observation trop longues", () => {
    expect(analyser({ etudiantId: "" }).success).toBe(false);
    expect(analyser({ mode: "MOBILE_MONEY", operateur: "MVOLA", reference: "R".repeat(61) }).success).toBe(false);
    expect(analyser({ observation: "o".repeat(201) }).success).toBe(false);
  });
});

describe("schemaEncaissement : jour affiché", () => {
  it("exige le jour de la situation affichée, au format AAAA-MM-JJ", () => {
    expect(analyser({ jourAffiche: undefined }).success).toBe(false);
    for (const jourAffiche of ["", "15/11/2026", "2026-11-1", "2026-02-30", "2026-13-01", 20261115]) {
      expect(chemins(analyser({ jourAffiche })), String(jourAffiche)).toContain("jourAffiche");
    }
    const r = analyser({ jourAffiche: "2027-03-31" });
    expect(r.success && r.data.jourAffiche).toBe("2027-03-31");
  });
});

describe("schemaAnnulationPaiement", () => {
  it("accepte un motif de 5 caractères au moins, rogné", () => {
    const r = schemaAnnulationPaiement.safeParse({ paiementId: "p1", motif: "  erreur de saisie  " });
    expect(r.success && r.data.motif).toBe("erreur de saisie");
    expect(schemaAnnulationPaiement.safeParse({ paiementId: "p1", motif: "12345" }).success).toBe(true);
  });

  it("refuse un motif de moins de 5 caractères, espaces comptés pour rien", () => {
    for (const motif of ["", "abcd", "  ab  ", "    abcd "]) {
      expect(schemaAnnulationPaiement.safeParse({ paiementId: "p1", motif }).success, motif).toBe(false);
    }
  });

  it("refuse un motif absent, trop long, ou un paiement non identifié", () => {
    expect(schemaAnnulationPaiement.safeParse({ paiementId: "p1" }).success).toBe(false);
    expect(schemaAnnulationPaiement.safeParse({ paiementId: "p1", motif: "m".repeat(301) }).success).toBe(false);
    expect(schemaAnnulationPaiement.safeParse({ paiementId: "", motif: "doublon" }).success).toBe(false);
  });
});
