import { describe, expect, it } from "vitest";
import { lireAnnees, lireFilieres, lireGrilleTarifs } from "@/server/lectures/parametres";
import { fabriquerAnnee, fabriquerEtudiant, fabriquerFiliere, fabriquerInscription, fabriquerTarif } from "../factories";

const jour = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("lectures des Paramètres", () => {
  it("filières : code figé et durée minimale déduits des inscrits", async () => {
    const vide = await fabriquerFiliere({ code: "SF" });
    const f = await fabriquerFiliere({ code: "IF", dureeAnnees: 3 });
    const a = await fabriquerAnnee();
    const tarif = await fabriquerTarif(f.id, a.id, { niveau: 2 });
    const e = await fabriquerEtudiant(f.id, a.id);
    await fabriquerInscription(e.id, a.id, tarif, a.dateDebut);

    const filieres = await lireFilieres();

    expect(filieres.map((x) => x.code)).toEqual(["IF", "SF"]);
    expect(filieres[0]).toMatchObject({ id: f.id, etudiantsTotal: 1, etudiantsActifs: 1, codeModifiable: false, dureeMinimale: 2 });
    expect(filieres[0].refusSuppression).toMatch(/1 étudiant/);
    expect(filieres[1]).toMatchObject({ id: vide.id, codeModifiable: true, dureeMinimale: 1, refusSuppression: null });
  });

  it("années : état selon la date injectée, refus par action et année proposée", async () => {
    await fabriquerAnnee({ anneeDebut: 2025, cloturee: true });
    await fabriquerAnnee({ anneeDebut: 2026, estCourante: true });
    await fabriquerAnnee({ anneeDebut: 2027 });

    const { annees, anneeDebutProposee } = await lireAnnees(jour("2026-11-15"));

    expect(annees.map((a) => [a.libelle, a.etat])).toEqual([
      ["2025-2026", "cloturee"],
      ["2026-2027", "courante"],
      ["2027-2028", "preparation"],
    ]);
    expect(annees[1]).toMatchObject({ dateDebut: "2026-10-01", dateFin: "2027-07-31", periode: "octobre 2026 → juillet 2027" });
    expect(annees[1].refus.supprimer).toMatch(/courante/);
    expect(annees[1].refus.cloturer).toMatch(/courante/);
    expect(annees[0].refus.definirCourante).toMatch(/clôturée/);
    expect(annees[0].refus.rouvrir).toBeNull();
    expect(annees[2].refus).toEqual({ definirCourante: null, cloturer: null, rouvrir: expect.any(String), supprimer: null });
    expect(anneeDebutProposee).toBe(2028);
  });

  it("grille : année courante par défaut, cases manquantes et inscrits par classe", async () => {
    const f = await fabriquerFiliere({ code: "IF", dureeAnnees: 3 });
    await fabriquerAnnee({ anneeDebut: 2027 });
    const courante = await fabriquerAnnee({ anneeDebut: 2026, estCourante: true });
    const tarif = await fabriquerTarif(f.id, courante.id, { niveau: 1 });
    const e = await fabriquerEtudiant(f.id, courante.id);
    await fabriquerInscription(e.id, courante.id, tarif, courante.dateDebut);

    const g = await lireGrilleTarifs(undefined, jour("2026-11-15"));

    expect(g.annee?.id).toBe(courante.id);
    expect(g.manquants).toBe(2);
    expect(g.cases.map((c) => [c.libelleNiveau, c.inscrits, c.tarif?.total ?? null])).toEqual([
      ["1re année", 1, 900_000],
      ["2e année", 0, null],
      ["3e année", 0, null],
    ]);
  });

  it("grille : aucune année en base ou identifiant inconnu", async () => {
    expect(await lireGrilleTarifs()).toEqual({ annees: [], annee: null, cases: [], manquants: 0 });
    await fabriquerAnnee();
    expect((await lireGrilleTarifs("inconnue")).annee).toBeNull();
  });
});
