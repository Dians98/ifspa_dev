import { describe, expect, it } from "vitest";
import { rendreReleve } from "@/pdf/Releve";
import { extraireLignesPdf } from "../factories/pdf-texte";
import { fabriquerReleve, paiementFiche } from "../factories/releve";

const texteDe = async (options: Parameters<typeof fabriquerReleve>[0]) =>
  extraireLignesPdf(await rendreReleve(fabriquerReleve(options)));

describe("relevé PDF : texte extrait", () => {
  it("après un relevé avec paiements, celui sans paiement se termine par « étudiante. » sans caractère parasite", async () => {
    const avec = await texteDe({ sexe: "F", paiements: [paiementFiche()] });
    expect(avec).toContain("R-2026-00001");
    expect(avec).not.toContain("Aucun paiement enregistré pour cette étudiante.");

    const sans = await texteDe({ sexe: "F" });

    expect(sans).toContain("Aucun paiement enregistré pour cette étudiante.");
    expect(sans.join("")).not.toContain("�");
  });

  it("étudiant : « cet étudiant. » ; étudiante : « cette étudiante. »", async () => {
    expect(await texteDe({ sexe: "M" })).toContain("Aucun paiement enregistré pour cet étudiant.");
    expect(await texteDe({ sexe: "F" })).toContain("Aucun paiement enregistré pour cette étudiante.");
  });

  it("sans inscription : « Aucune inscription enregistrée pour cet étudiant. » accordé selon le sexe", async () => {
    expect(await texteDe({ sexe: "M", sansInscription: true })).toContain("Aucune inscription enregistrée pour cet étudiant.");
    expect(await texteDe({ sexe: "F", sansInscription: true })).toContain("Aucune inscription enregistrée pour cette étudiante.");
  });

  it("statut accordé : « Active » pour une étudiante, « Actif » pour un étudiant", async () => {
    expect(await texteDe({ sexe: "F" })).toContain("Active");
    expect(await texteDe({ sexe: "M" })).toContain("Actif");
  });
});
