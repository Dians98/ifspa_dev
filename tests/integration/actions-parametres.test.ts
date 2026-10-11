import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fabriquerAnnee,
  fabriquerEtudiant,
  fabriquerFiliere,
  fabriquerInscription,
  fabriquerTarif,
} from "../factories";

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));

vi.mock("@/server/acces", () => ({
  exigerAdmin: vi.fn(async () => ({ session: { user: { id: "admin-test", role: "admin" } }, refus: null })),
}));
vi.mock("next/cache", () => ({ revalidatePath }));

const { db } = await import("@/lib/db");
const { indexEnConflit } = await import("@/server/erreurs");
const actions = await import("@/server/actions/parametres");

const ligne = (filiereId: string, niveau = 1, montantMensuel: number | string = 80_000, nombreMois = 10) => ({
  filiereId,
  niveau,
  droitsInscription: 100_000,
  montantMensuel,
  nombreMois,
});

beforeEach(() => revalidatePath.mockClear());

describe("définir l'année courante", () => {
  it("laisse une seule année courante en base", async () => {
    const a = await fabriquerAnnee({ anneeDebut: 2025, estCourante: true });
    const b = await fabriquerAnnee({ anneeDebut: 2026 });

    const r = await actions.definirAnneeCourante({ id: b.id });

    expect(r.statut).toBe("succes");
    const courantes = await db.anneeScolaire.findMany({ where: { estCourante: true }, select: { id: true } });
    expect(courantes).toEqual([{ id: b.id }]);
    expect((await db.anneeScolaire.findUniqueOrThrow({ where: { id: a.id } })).estCourante).toBe(false);
    expect(revalidatePath).toHaveBeenCalledWith("/app/parametres", "layout");
  });

  it("fonctionne aussi quand aucune année n'est encore courante", async () => {
    const a = await fabriquerAnnee();
    expect((await actions.definirAnneeCourante({ id: a.id })).statut).toBe("succes");
    expect(await db.anneeScolaire.count({ where: { estCourante: true } })).toBe(1);
  });

  it("refuse une année clôturée et ne change pas l'année courante", async () => {
    const a = await fabriquerAnnee({ anneeDebut: 2025, cloturee: true });
    const b = await fabriquerAnnee({ anneeDebut: 2026, estCourante: true });

    const r = await actions.definirAnneeCourante({ id: a.id });

    expect(r).toMatchObject({ statut: "erreur", message: expect.stringMatching(/clôturée/) });
    const courantes = await db.anneeScolaire.findMany({ where: { estCourante: true }, select: { id: true } });
    expect(courantes).toEqual([{ id: b.id }]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("l'index unique partiel refuse une deuxième année courante écrite directement", async () => {
    await fabriquerAnnee({ anneeDebut: 2025, estCourante: true });
    const err = await fabriquerAnnee({ anneeDebut: 2026, estCourante: true }).catch((e: unknown) => e);
    expect(indexEnConflit(err)).toBe("annee_scolaire_une_seule_courante");

    const b = await fabriquerAnnee({ anneeDebut: 2027 });
    await expect(db.anneeScolaire.update({ where: { id: b.id }, data: { estCourante: true } })).rejects.toThrow();
    expect(await db.anneeScolaire.count({ where: { estCourante: true } })).toBe(1);
  });

  it("l'index ne contraint pas les années non courantes", async () => {
    await fabriquerAnnee({ anneeDebut: 2025 });
    await fabriquerAnnee({ anneeDebut: 2026 });
    await fabriquerAnnee({ anneeDebut: 2027 });
    expect(await db.anneeScolaire.count({ where: { estCourante: false } })).toBe(3);
  });
});

describe("clôture d'une année", () => {
  it("bloque l'enregistrement de ses tarifs, puis la réouverture le rétablit", async () => {
    const f = await fabriquerFiliere();
    const a = await fabriquerAnnee({ anneeDebut: 2025 });

    expect((await actions.cloturerAnnee({ id: a.id })).statut).toBe("succes");
    const refuse = await actions.enregistrerTarifs({ anneeId: a.id, lignes: [ligne(f.id)] });
    expect(refuse).toMatchObject({ statut: "erreur", message: expect.stringMatching(/2025-2026 est clôturée/) });
    expect(await db.tarif.count()).toBe(0);

    expect((await actions.rouvrirAnnee({ id: a.id })).statut).toBe("succes");
    expect((await actions.enregistrerTarifs({ anneeId: a.id, lignes: [ligne(f.id)] })).statut).toBe("succes");
    expect(await db.tarif.count()).toBe(1);
  });

  it("refuse de clôturer l'année courante", async () => {
    const a = await fabriquerAnnee({ estCourante: true });
    expect((await actions.cloturerAnnee({ id: a.id })).statut).toBe("erreur");
    expect((await db.anneeScolaire.findUniqueOrThrow({ where: { id: a.id } })).cloturee).toBe(false);
  });
});

describe("enregistrement des tarifs", () => {
  it("tout ou rien : une ligne refusée par le contrôle et rien n'est écrit, pas même les lignes valides", async () => {
    const f = await fabriquerFiliere({ dureeAnnees: 3 });
    const a = await fabriquerAnnee();
    await fabriquerTarif(f.id, a.id, { niveau: 2, montantMensuel: 70_000 });

    const r = await actions.enregistrerTarifs({
      anneeId: a.id,
      lignes: [ligne(f.id, 1), ligne(f.id, 2, 95_000), ligne(f.id, 4)],
    });

    expect(r).toMatchObject({ statut: "erreur", erreurs: { "lignes.2.niveau": expect.stringMatching(/pas de 4e année/) } });
    const tarifs = await db.tarif.findMany({ select: { niveau: true, montantMensuel: true } });
    expect(tarifs).toEqual([{ niveau: 2, montantMensuel: 70_000 }]);
  });

  it("tout ou rien : une ligne invalide à la saisie (11 mois) et rien n'est écrit", async () => {
    const f = await fabriquerFiliere();
    const a = await fabriquerAnnee();

    const r = await actions.enregistrerTarifs({ anneeId: a.id, lignes: [ligne(f.id, 1), ligne(f.id, 2, 80_000, 11)] });

    expect(r).toMatchObject({ statut: "erreur", erreurs: { "lignes.1.nombreMois": expect.any(String) } });
    expect(await db.tarif.count()).toBe(0);
  });

  it("refuse une filière désactivée sans rien écrire", async () => {
    const active = await fabriquerFiliere();
    const inactive = await fabriquerFiliere({ actif: false });
    const a = await fabriquerAnnee();

    const r = await actions.enregistrerTarifs({ anneeId: a.id, lignes: [ligne(active.id), ligne(inactive.id)] });

    expect(r).toMatchObject({ statut: "erreur", erreurs: { "lignes.1.filiereId": expect.stringMatching(/désactivée/) } });
    expect(await db.tarif.count()).toBe(0);
  });

  it("crée puis met à jour les tarifs, montants saisis en texte convertis en entiers", async () => {
    const f = await fabriquerFiliere();
    const a = await fabriquerAnnee();

    expect((await actions.enregistrerTarifs({ anneeId: a.id, lignes: [ligne(f.id, 1, "80 000 Ar")] })).statut).toBe("succes");
    expect((await actions.enregistrerTarifs({ anneeId: a.id, lignes: [ligne(f.id, 1, 85_000)] })).statut).toBe("succes");

    const tarifs = await db.tarif.findMany({ select: { niveau: true, montantMensuel: true, droitsInscription: true } });
    expect(tarifs).toEqual([{ niveau: 1, montantMensuel: 85_000, droitsInscription: 100_000 }]);
  });

  it("n'écrit jamais dans les échéances : les inscrits gardent le montant copié", async () => {
    const f = await fabriquerFiliere();
    const a = await fabriquerAnnee({ anneeDebut: 2026, estCourante: true });
    const tarif = await fabriquerTarif(f.id, a.id, { niveau: 1, montantMensuel: 80_000, droitsInscription: 100_000 });
    const e = await fabriquerEtudiant(f.id, a.id);
    await fabriquerInscription(e.id, a.id, tarif, a.dateDebut);
    const avant = await db.echeance.findMany({ orderBy: { ordre: "asc" } });

    const r = await actions.enregistrerTarifs({
      anneeId: a.id,
      lignes: [{ ...ligne(f.id, 1, 95_000), droitsInscription: 150_000 }],
    });

    expect(r.statut).toBe("succes");
    expect((await db.tarif.findUniqueOrThrow({ where: { id: tarif.id } })).montantMensuel).toBe(95_000);
    expect(await db.echeance.findMany({ orderBy: { ordre: "asc" } })).toEqual(avant);
    expect(avant.filter((x) => x.type === "MENSUALITE").every((x) => x.montantDu === 80_000)).toBe(true);
  });
});

describe("suppression d'une filière", () => {
  it("supprime la filière avec ses tarifs, toutes années confondues", async () => {
    const f = await fabriquerFiliere();
    const autre = await fabriquerFiliere();
    const a1 = await fabriquerAnnee();
    const a2 = await fabriquerAnnee();
    await fabriquerTarif(f.id, a1.id);
    await fabriquerTarif(f.id, a2.id, { niveau: 2 });
    await fabriquerTarif(autre.id, a1.id);

    const r = await actions.supprimerFiliere({ id: f.id });

    expect(r.statut).toBe("succes");
    expect(await db.filiere.findUnique({ where: { id: f.id } })).toBeNull();
    expect(await db.tarif.findMany({ select: { filiereId: true } })).toEqual([{ filiereId: autre.id }]);
  });

  it("est refusée si un étudiant la référence, et ne supprime rien", async () => {
    const f = await fabriquerFiliere();
    const a = await fabriquerAnnee();
    await fabriquerTarif(f.id, a.id);
    await fabriquerEtudiant(f.id, a.id);

    const r = await actions.supprimerFiliere({ id: f.id });

    expect(r).toMatchObject({ statut: "erreur", message: expect.stringMatching(/1 étudiant y est rattaché/) });
    expect(await db.filiere.count({ where: { id: f.id } })).toBe(1);
    expect(await db.tarif.count({ where: { filiereId: f.id } })).toBe(1);
  });

  it("répond proprement pour une filière qui n'existe plus", async () => {
    expect(await actions.supprimerFiliere({ id: "inconnue" })).toMatchObject({ statut: "erreur" });
  });
});

describe("filières : création et modification", () => {
  it("signale un code déjà utilisé sur le champ code", async () => {
    await fabriquerFiliere({ code: "IF" });
    const r = await actions.creerFiliere({ code: "if", nom: "Doublon", dureeAnnees: 3 });
    expect(r).toMatchObject({ statut: "erreur", erreurs: { code: "Le code IF est déjà utilisé par une autre filière." } });
  });

  it("fige le code et la durée minimale d'une filière qui a des inscrits", async () => {
    const f = await fabriquerFiliere({ code: "IF", dureeAnnees: 3 });
    const a = await fabriquerAnnee();
    const tarif = await fabriquerTarif(f.id, a.id, { niveau: 2 });
    const e = await fabriquerEtudiant(f.id, a.id);
    await fabriquerInscription(e.id, a.id, tarif, a.dateDebut);

    const code = await actions.modifierFiliere({ id: f.id, code: "INF", nom: f.nom, dureeAnnees: 3 });
    expect(code).toMatchObject({ statut: "erreur", message: expect.stringMatching(/code ne peut plus changer/) });
    const duree = await actions.modifierFiliere({ id: f.id, code: "IF", nom: f.nom, dureeAnnees: 1 });
    expect(duree).toMatchObject({ statut: "erreur", message: expect.stringMatching(/sous 2 ans/) });
    expect(await db.filiere.findUniqueOrThrow({ where: { id: f.id } })).toMatchObject({ code: "IF", dureeAnnees: 3 });

    expect((await actions.modifierFiliere({ id: f.id, code: "IF", nom: "Infirmiers", dureeAnnees: 2 })).statut).toBe("succes");
  });
});

describe("années : création et suppression", () => {
  it("crée l'année avec ses dates calculées, en préparation", async () => {
    const r = await actions.creerAnnee({ anneeDebut: 2030, moisDebutEcolage: 9 });
    expect(r.statut).toBe("succes");
    const a = await db.anneeScolaire.findUniqueOrThrow({ where: { anneeDebut: 2030 } });
    expect(a).toMatchObject({ libelle: "2030-2031", moisDebutEcolage: 9, estCourante: false, cloturee: false });
    expect(a.dateDebut.toISOString().slice(0, 10)).toBe("2030-09-01");
    expect(a.dateFin.toISOString().slice(0, 10)).toBe("2031-06-30");

    const doublon = await actions.creerAnnee({ anneeDebut: 2030 });
    expect(doublon).toMatchObject({ statut: "erreur", erreurs: { anneeDebut: "L'année 2030-2031 existe déjà." } });
  });

  it("supprime une année inutilisée avec ses tarifs, jamais l'année courante", async () => {
    const f = await fabriquerFiliere();
    const libre = await fabriquerAnnee();
    const courante = await fabriquerAnnee({ estCourante: true });
    await fabriquerTarif(f.id, libre.id);
    await fabriquerTarif(f.id, courante.id);

    expect((await actions.supprimerAnnee({ id: libre.id })).statut).toBe("succes");
    expect(await db.tarif.count({ where: { anneeScolaireId: libre.id } })).toBe(0);

    expect((await actions.supprimerAnnee({ id: courante.id })).statut).toBe("erreur");
    expect(await db.anneeScolaire.count({ where: { id: courante.id } })).toBe(1);
    expect(await db.tarif.count({ where: { anneeScolaireId: courante.id } })).toBe(1);
  });
});
