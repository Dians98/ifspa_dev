import { beforeEach, describe, expect, it, vi } from "vitest";
import { fabriquerAnnee, fabriquerEtudiant, fabriquerFrais, fabriquerInscription } from "../factories";
import { fabriquerEtudiantInscrit, fabriquerMonde, type Monde } from "../factories/scenarios";
import { reprise } from "../factories/reprise";

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const { db } = await import("@/lib/db");
const { lireContexteReprise } = await import("@/server/lectures/import");

const TARIF = { niveau: 1, droitsInscription: 100_000, montantMensuel: 80_000, nombreMois: 10 };
const naissance = (jour: number) => new Date(Date.UTC(2004, 4, jour));

type Ligne = Parameters<typeof reprise>[0][number];
const ligne = (n: number, jour: string): Ligne => ({ numero: String(n), nom: `NOM${n}`, prenoms: `Prenom${n}`, dateNaissance: jour });

let m: Monde;

beforeEach(async () => {
  m = await fabriquerMonde();
});

describe("lireContexteReprise : année, filières, tarifs", () => {
  it("rend l'année courante, toutes les années, toutes les filières (désactivées comprises) et les tarifs de l'année courante seulement", async () => {
    const autre = await fabriquerAnnee({ anneeDebut: 2025, cloturee: true });
    await db.tarif.create({ data: { filiereId: m.ifs.id, anneeScolaireId: autre.id, niveau: 1, droitsInscription: 1, montantMensuel: 1, nombreMois: 10 } });
    await db.filiere.update({ where: { id: m.sf.id }, data: { actif: false } });

    const ctx = await lireContexteReprise(db, reprise([{}]));

    expect(ctx.anneeCourante).toEqual({
      id: m.annee.id, anneeDebut: 2026, libelle: "2026-2027", cloturee: false, moisDebutEcolage: 10,
    });
    expect(ctx.annees.map((a) => a.anneeDebut).sort()).toEqual([2025, 2026]);
    expect(ctx.filieres.map((f) => [f.code, f.actif]).sort()).toEqual([["IF", true], ["SF", false]]);
    expect(ctx.tarifs).toHaveLength(2);
    expect(ctx.tarifs.every((t) => t.droitsInscription === 100_000)).toBe(true);
  });

  it("rend les frais de l'année courante seulement, par ordre de création, avec leurs classes", async () => {
    const autre = await fabriquerAnnee({ anneeDebut: 2025, cloturee: true });
    const mars = new Date(Date.UTC(2027, 2, 1));
    const a = await fabriquerFrais(m.annee.id, { classes: [{ filiereId: m.ifs.id, niveau: 1 }, { filiereId: m.sf.id, niveau: 1 }], montant: 15_000, mois: mars });
    const b = await fabriquerFrais(m.annee.id, { classes: [{ filiereId: m.ifs.id, niveau: 2 }], montant: 5_000, mois: new Date(Date.UTC(2027, 4, 1)) });
    await fabriquerFrais(autre.id, { classes: [{ filiereId: m.ifs.id, niveau: 1 }], mois: new Date(Date.UTC(2026, 2, 1)) });

    const ctx = await lireContexteReprise(db, reprise([{}]));

    expect(ctx.frais.map((f) => [f.id, f.montant, f.mois.toISOString().slice(0, 10), f.rang])).toEqual([
      [a.frais.id, 15_000, "2027-03-01", a.frais.rang],
      [b.frais.id, 5_000, "2027-05-01", b.frais.rang],
    ]);
    expect(ctx.frais[0].classes).toHaveLength(2);
    expect(ctx.frais[1].classes).toEqual([{ filiereId: m.ifs.id, niveau: 2 }]);
  });

  it("sans année courante : contexte vide mais filières et années connues", async () => {
    await db.anneeScolaire.updateMany({ data: { estCourante: false } });

    const ctx = await lireContexteReprise(db, reprise([ligne(1, "10/05/2004")]));

    expect(ctx).toMatchObject({ anneeCourante: null, tarifs: [], etudiantsEnBase: [] });
    expect(ctx.filieres).toHaveLength(2);
    expect(ctx.annees).toHaveLength(1);
  });

  it("lu dans une transaction, donne le même contexte", async () => {
    await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF, { dateNaissance: naissance(10) });
    const lu = reprise([ligne(1, "10/05/2004")]);

    const direct = await lireContexteReprise(db, lu);
    const enTransaction = await db.$transaction((tx) => lireContexteReprise(tx, lu));

    expect(enTransaction).toEqual(direct);
  });
});

describe("lireContexteReprise : étudiants en base", () => {
  it("ne charge que les étudiants nés les jours cités par le fichier", async () => {
    const a = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF, { dateNaissance: naissance(10) });
    const b = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF, { dateNaissance: naissance(11) });
    await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF, { dateNaissance: naissance(12) });

    const ctx = await lireContexteReprise(db, reprise([ligne(1, "10/05/2004"), ligne(2, "11/05/2004")]));

    expect(ctx.etudiantsEnBase.map((e) => e.id).sort()).toEqual([a.etudiant.id, b.etudiant.id].sort());
  });

  it("aucune date lisible dans le fichier : aucun étudiant chargé", async () => {
    await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF, { dateNaissance: naissance(10) });

    const ctx = await lireContexteReprise(db, reprise([ligne(1, "n'importe quoi")]));

    expect(ctx.etudiantsEnBase).toEqual([]);
  });

  it("rend l'identité, la filière, l'année d'entrée et l'inscription de l'année courante", async () => {
    const entree = await fabriquerAnnee({ anneeDebut: 2025, cloturee: true });
    const { etudiant, inscription } = await fabriquerEtudiantInscrit(
      m.sf.id, m.annee, { ...TARIF, niveau: 2 }, { dateNaissance: naissance(10), nom: "RAKOTO", prenoms: "Jean", matricule: "SF-2025-0001", anneeEntreeId: entree.id, statut: "ABANDON" },
    );
    await db.inscription.update({ where: { id: inscription.id }, data: { redoublement: true } });

    const ctx = await lireContexteReprise(db, reprise([ligne(1, "10/05/2004")]));

    expect(ctx.etudiantsEnBase).toMatchObject([
      {
        id: etudiant.id, matricule: "SF-2025-0001", nom: "RAKOTO", prenoms: "Jean", filiereId: m.sf.id, anneeEntree: 2025, statut: "ABANDON",
        inscriptionCourante: { niveau: 2, redoublement: true },
      },
    ]);
    expect(ctx.etudiantsEnBase[0].dateNaissance.toISOString()).toBe("2004-05-10T00:00:00.000Z");
  });

  it("sans inscription sur l'année courante, inscriptionCourante est null (une ancienne inscription ne compte pas)", async () => {
    const ancienne = await fabriquerAnnee({ anneeDebut: 2025, cloturee: true });
    const etudiant = await fabriquerEtudiant(m.ifs.id, ancienne.id, { dateNaissance: naissance(10) });
    await fabriquerInscription(etudiant.id, ancienne.id, TARIF, ancienne.dateDebut);

    const ctx = await lireContexteReprise(db, reprise([ligne(1, "10/05/2004")]));

    expect(ctx.etudiantsEnBase).toHaveLength(1);
    expect(ctx.etudiantsEnBase[0].inscriptionCourante).toBeNull();
  });

  it("ne charge ni échéances ni paiements : l'import ne reprend plus de paiement", async () => {
    await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF, { dateNaissance: naissance(10) });

    const ctx = await lireContexteReprise(db, reprise([ligne(1, "10/05/2004")]));

    expect(Object.keys(ctx).sort()).toEqual(["anneeCourante", "annees", "etudiantsEnBase", "filieres", "frais", "tarifs"].sort());
    expect(Object.keys(ctx.etudiantsEnBase[0]).sort()).toEqual(
      ["anneeEntree", "dateNaissance", "filiereId", "id", "inscriptionCourante", "matricule", "nom", "prenoms", "statut"].sort(),
    );
  });
});

describe("lireContexteReprise : lecture seule", () => {
  it("ne modifie rien en base", async () => {
    await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF, { dateNaissance: naissance(10) });
    const avant = [await db.compteur.findMany(), await db.etudiant.findMany(), await db.echeance.findMany()];

    await lireContexteReprise(db, reprise([ligne(1, "10/05/2004")]));

    expect([await db.compteur.findMany(), await db.etudiant.findMany(), await db.echeance.findMany()]).toEqual(avant);
  });
});
