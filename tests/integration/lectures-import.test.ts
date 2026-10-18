import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleCompteurRecu } from "@/lib/matricule";
import { fabriquerAnnee, fabriquerEtudiant, fabriquerInscription, fabriquerPaiement } from "../factories";
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
      id: m.annee.id, anneeDebut: 2026, libelle: "2026-2027", cloturee: false, moisDebutEcolage: 10, dateDebut: "2026-10-01",
    });
    expect(ctx.annees.map((a) => a.anneeDebut).sort()).toEqual([2025, 2026]);
    expect(ctx.filieres.map((f) => [f.code, f.actif]).sort()).toEqual([["IF", true], ["SF", false]]);
    expect(ctx.tarifs).toHaveLength(2);
    expect(ctx.tarifs.every((t) => t.droitsInscription === 100_000)).toBe(true);
  });

  it("sans année courante : contexte vide mais filières et années connues", async () => {
    await db.anneeScolaire.updateMany({ data: { estCourante: false } });

    const ctx = await lireContexteReprise(db, reprise([ligne(1, "10/05/2004")]));

    expect(ctx).toMatchObject({ anneeCourante: null, tarifs: [], etudiantsEnBase: [], compteursRecu: {} });
    expect(ctx.clesReprise.size).toBe(0);
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
      m.sf.id, m.annee, { ...TARIF, niveau: 2 }, { dateNaissance: naissance(10), nom: "RAKOTO", prenoms: "Jean", matricule: "SF-2025-0001", anneeEntreeId: entree.id, statut: "ABANDON" }, 3,
    );
    await db.inscription.update({ where: { id: inscription.id }, data: { redoublement: true } });

    const ctx = await lireContexteReprise(db, reprise([ligne(1, "10/05/2004")]));

    expect(ctx.etudiantsEnBase).toMatchObject([
      {
        id: etudiant.id, matricule: "SF-2025-0001", nom: "RAKOTO", prenoms: "Jean", filiereId: m.sf.id, anneeEntree: 2025, statut: "ABANDON",
        inscriptionCourante: { niveau: 2, redoublement: true, droitsEnTranches: 3 },
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
    expect(ctx.etudiantsEnBase[0].echeances).toHaveLength(11);
    expect(ctx.etudiantsEnBase[0].echeances.every((e) => e.anneeDebut === 2025)).toBe(true);
  });

  it("échéances de toutes les années dans l'ordre de solde, payé = paiements non annulés, « non dues » exclues", async () => {
    const ancienne = await fabriquerAnnee({ anneeDebut: 2025, cloturee: true });
    const { etudiant, inscription } = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF, { dateNaissance: naissance(10) });
    const vieille = await fabriquerInscription(etudiant.id, ancienne.id, TARIF, ancienne.dateDebut);
    await db.echeance.update({ where: { id: inscription.echeances[10].id }, data: { nonDueSortie: true } });
    await fabriquerPaiement(etudiant.id, m.admin.id, [{ echeanceId: inscription.echeances[0].id, montant: 30_000 }]);
    await fabriquerPaiement(etudiant.id, m.admin.id, [{ echeanceId: inscription.echeances[0].id, montant: 20_000 }], { annule: true });

    const ctx = await lireContexteReprise(db, reprise([ligne(1, "10/05/2004")]));

    const echeances = ctx.etudiantsEnBase[0].echeances;
    expect(echeances).toHaveLength(11 + 10);
    expect(echeances.slice(0, 11).every((e) => e.anneeDebut === 2025)).toBe(true);
    expect(echeances.map((e) => e.id)).not.toContain(inscription.echeances[10].id);
    expect(echeances.map((e) => e.id)).toContain(vieille.echeances[0].id);
    expect(echeances.find((e) => e.id === inscription.echeances[0].id)?.paye).toBe(30_000);
  });

  it("paiementsHorsReprise : exclut les paiements annulés et ceux de la reprise, garde ceux du guichet (avec ou sans idClient)", async () => {
    const { etudiant, inscription } = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF, { dateNaissance: naissance(10) });
    const lignes = [{ echeanceId: inscription.echeances[0].id, montant: 1_000 }];
    await fabriquerPaiement(etudiant.id, m.admin.id, lignes);
    await fabriquerPaiement(etudiant.id, m.admin.id, lignes, { idClient: "poste-1" });
    await fabriquerPaiement(etudiant.id, m.admin.id, lignes, { annule: true });
    await fabriquerPaiement(etudiant.id, m.admin.id, lignes, { idClient: `reprise:${"a".repeat(40)}` });
    await fabriquerPaiement(etudiant.id, m.admin.id, lignes, { idClient: `reprise:${"b".repeat(40)}`, annule: true });

    const ctx = await lireContexteReprise(db, reprise([ligne(1, "10/05/2004")]));

    expect(ctx.etudiantsEnBase[0].paiementsHorsReprise).toBe(2);
  });

  it("un étudiant sans paiement a zéro paiement hors reprise", async () => {
    await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF, { dateNaissance: naissance(10) });

    const ctx = await lireContexteReprise(db, reprise([ligne(1, "10/05/2004")]));

    expect(ctx.etudiantsEnBase[0].paiementsHorsReprise).toBe(0);
  });
});

describe("lireContexteReprise : clés de reprise et compteurs de reçus", () => {
  it("clesReprise : tous les idClient « reprise: », annulés compris, de tous les étudiants ; pas les autres", async () => {
    const { etudiant, inscription } = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF, { dateNaissance: naissance(20) });
    const lignes = [{ echeanceId: inscription.echeances[0].id, montant: 1_000 }];
    await fabriquerPaiement(etudiant.id, m.admin.id, lignes, { idClient: "reprise:aaa" });
    await fabriquerPaiement(etudiant.id, m.admin.id, lignes, { idClient: "reprise:bbb", annule: true });
    await fabriquerPaiement(etudiant.id, m.admin.id, lignes, { idClient: "poste-1" });
    await fabriquerPaiement(etudiant.id, m.admin.id, lignes);

    const ctx = await lireContexteReprise(db, reprise([ligne(1, "10/05/2004")]));

    expect([...ctx.clesReprise].sort()).toEqual(["reprise:aaa", "reprise:bbb"]);
  });

  it("compteursRecu : valeur du Compteur de chaque année civile citée par les paiements du fichier, 0 si absent", async () => {
    await db.compteur.createMany({
      data: [
        { cle: cleCompteurRecu(2026), valeur: 42 },
        { cle: cleCompteurRecu(2025), valeur: 7 },
        { cle: cleCompteurRecu(2027), valeur: 9 },
      ],
    });

    const dates = (...jours: string[]) => reprise([{}], jours.map((date) => ({ date })));

    expect((await lireContexteReprise(db, dates("05/10/2026", "20/12/2026"))).compteursRecu).toEqual({ 2026: 42 });
    expect((await lireContexteReprise(db, dates("20/12/2026", "10/01/2027"))).compteursRecu).toEqual({ 2026: 42, 2027: 9 });
    expect((await lireContexteReprise(db, dates("05/10/2028"))).compteursRecu).toEqual({ 2028: 0 });
    expect((await lireContexteReprise(db, reprise([{}], []))).compteursRecu).toEqual({});
  });

  it("ne modifie rien en base", async () => {
    await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF, { dateNaissance: naissance(10) });
    await db.compteur.create({ data: { cle: cleCompteurRecu(2026), valeur: 3 } });
    const avant = [await db.compteur.findMany(), await db.etudiant.findMany(), await db.echeance.findMany()];

    await lireContexteReprise(db, reprise([ligne(1, "10/05/2004")], [{ date: "05/10/2026" }]));

    expect([await db.compteur.findMany(), await db.etudiant.findMany(), await db.echeance.findMany()]).toEqual(avant);
  });
});
