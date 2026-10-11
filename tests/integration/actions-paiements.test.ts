import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { montantEnLettres } from "@/lib/montant-en-lettres";
import type { EntreeEncaissement } from "@/lib/encaissement";
import { fabriquerAnnee, fabriquerEtudiant, fabriquerInscription } from "../factories";
import {
  connecter,
  fabriquerEtudiantInscrit,
  fabriquerMonde,
  MAINTENANT,
  reussi,
  type Monde,
} from "../factories/scenarios";

const { getSession, revaliderPagesEcolage } = vi.hoisted(() => ({ getSession: vi.fn(), revaliderPagesEcolage: vi.fn() }));

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/ecolage-revalidation", () => ({ revaliderPagesEcolage }));

const { db } = await import("@/lib/db");
const actions = await import("@/server/actions/paiements");
const { lireFicheEtudiant } = await import("@/server/lectures/etudiants");
const { lireRecu } = await import("@/server/lectures/paiements");

const REFUS_ADMIN = { statut: "erreur", message: "Cette action est réservée à l'administrateur." };

let m: Monde;
let tarif: { niveau: number; droitsInscription: number; montantMensuel: number; nombreMois: number };

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(MAINTENANT) });
  revaliderPagesEcolage.mockClear();
  getSession.mockReset();
  m = await fabriquerMonde();
  tarif = { niveau: 1, droitsInscription: 100_000, montantMensuel: 80_000, nombreMois: 10 };
  connecter(getSession, m.user);
});

afterEach(() => vi.useRealTimers());

const etudiantStandard = async (droitsEnTranches = 1, donnees = {}) =>
  (await fabriquerEtudiantInscrit(m.ifs.id, m.annee, tarif, donnees, droitsEnTranches)).etudiant;

const resteDu = async (id: string) => (await actions.chargerSituationGuichet(id))!.resteDuTotal;

/** Encaisse avec le reste dû relu juste avant, comme le fait l'écran. */
async function payer(etudiantId: string, montant: EntreeEncaissement["montant"], extra: Partial<EntreeEncaissement> = {}) {
  return actions.encaisser({
    etudiantId,
    montant,
    mode: "ESPECES",
    idClient: randomUUID(),
    resteDuAffiche: extra.resteDuAffiche ?? (await resteDu(etudiantId)),
    ...extra,
  });
}

const compteurs = async () => Object.fromEntries((await db.compteur.findMany()).map((c) => [c.cle, c.valeur]));

/** Statuts des échéances de la 1re inscription, à un jour donné. */
const statuts = async (id: string, jour: string) =>
  (await lireFicheEtudiant(id, jour))!.parcours[0].echeances.map((e) => e.statut);

describe("encaisser : répartition", () => {
  it("deux mois d'un coup : droits, octobre et novembre soldés, reste et reçu corrects", async () => {
    const e = await etudiantStandard();

    const recu = reussi(await payer(e.id, 260_000));

    expect(recu.numero).toBe("R-2026-00001");
    expect(recu.lignes).toEqual([
      { libelle: "Droits d'inscription", montant: 100_000, acompte: false, resteEcheance: 0 },
      { libelle: "Octobre 2026", montant: 80_000, acompte: false, resteEcheance: 0 },
      { libelle: "Novembre 2026", montant: 80_000, acompte: false, resteEcheance: 0 },
    ]);
    expect(recu).toMatchObject({
      total: 260_000,
      totalEnLettres: montantEnLettres(260_000),
      resteApres: 640_000,
      retardApres: 0,
      caissier: "Caissier Test",
      mode: "ESPECES",
      annulation: null,
    });
    expect(recu.etudiant).toMatchObject({ niveau: "1re année", anneeScolaire: "2026-2027" });
    expect((await statuts(e.id, "2026-11-15")).slice(0, 5)).toEqual(["paye", "paye", "paye", "a_venir", "a_venir"]);
    expect(revaliderPagesEcolage).toHaveBeenCalledTimes(1);
  });

  it("100 000 pour une mensualité de 80 000 : mois soldé et 20 000 d'acompte sur le suivant (partiel)", async () => {
    const e = await etudiantStandard();
    reussi(await payer(e.id, 100_000));

    const recu = reussi(await payer(e.id, 100_000));

    expect(recu.lignes).toEqual([
      { libelle: "Octobre 2026", montant: 80_000, acompte: false, resteEcheance: 0 },
      { libelle: "Novembre 2026", montant: 20_000, acompte: true, resteEcheance: 60_000 },
    ]);
    expect(recu).toMatchObject({ resteApres: 700_000, retardApres: 0, numero: "R-2026-00002" });
    const fiche = await lireFicheEtudiant(e.id, "2026-11-15");
    const novembre = fiche!.parcours[0].echeances.find((x) => x.libelle === "Novembre 2026")!;
    expect(novembre).toMatchObject({ statut: "partiel", paye: 20_000, reste: 60_000, montantDu: 80_000 });
  });

  it("un montant inférieur à une mensualité la paie en partie, puis le complément la solde", async () => {
    const e = await etudiantStandard();
    reussi(await payer(e.id, 100_000));

    const partiel = reussi(await payer(e.id, 30_000));
    expect(partiel.lignes).toEqual([{ libelle: "Octobre 2026", montant: 30_000, acompte: true, resteEcheance: 50_000 }]);

    const complement = reussi(await payer(e.id, 50_000));
    expect(complement.lignes).toEqual([{ libelle: "Octobre 2026", montant: 50_000, acompte: false, resteEcheance: 0 }]);
    expect(await resteDu(e.id)).toBe(900_000 - 180_000);
  });

  it("une tranche de droits payée en partie : partielle avant le 1er novembre, en retard ensuite", async () => {
    const e = await etudiantStandard(3);

    const recu = reussi(await payer(e.id, 20_000));

    expect(recu.lignes).toEqual([{ libelle: "Droits — tranche 1/3", montant: 20_000, acompte: true, resteEcheance: 14_000 }]);
    expect((await statuts(e.id, "2026-10-31"))[0]).toBe("partiel");
    expect((await statuts(e.id, "2026-11-01"))[0]).toBe("retard");
  });

  it("couvre deux années : l'année précédente est soldée d'abord, puis la suivante en acompte", async () => {
    const a2025 = await fabriquerAnnee({ anneeDebut: 2025 });
    const e = await fabriquerEtudiant(m.ifs.id, a2025.id);
    await fabriquerInscription(e.id, a2025.id, { ...tarif, montantMensuel: 70_000 }, a2025.dateDebut);
    await fabriquerInscription(e.id, m.annee.id, { ...tarif, niveau: 2 }, m.annee.dateDebut);
    expect(await resteDu(e.id)).toBe(800_000 + 900_000);

    const recu = reussi(await payer(e.id, 850_000));

    expect(recu.lignes).toHaveLength(12);
    expect(recu.lignes[0]).toMatchObject({ libelle: "Droits d'inscription 2025-2026", montant: 100_000 });
    expect(recu.lignes[1]).toMatchObject({ libelle: "Octobre 2025", montant: 70_000 });
    expect(recu.lignes[10]).toMatchObject({ libelle: "Juillet 2026", montant: 70_000, resteEcheance: 0 });
    expect(recu.lignes[11]).toEqual({ libelle: "Droits d'inscription 2026-2027", montant: 50_000, acompte: true, resteEcheance: 50_000 });
    expect(recu).toMatchObject({ resteApres: 850_000, retardApres: 130_000 });
    expect(recu.etudiant).toMatchObject({ niveau: "2e année", anneeScolaire: "2026-2027" });

    const sur2026 = await db.paiementLigne.findMany({
      where: { paiementId: recu.paiementId!, echeance: { inscription: { anneeScolaireId: m.annee.id } } },
      include: { echeance: true },
    });
    expect(sur2026.map((l) => [l.echeance.type, l.echeance.ordre, l.montant])).toEqual([["DROITS", 1, 50_000]]);
  });

  it("un petit paiement va d'abord à l'année précédente, sans toucher à l'année en cours", async () => {
    const a2025 = await fabriquerAnnee({ anneeDebut: 2025 });
    const e = await fabriquerEtudiant(m.ifs.id, a2025.id);
    await fabriquerInscription(e.id, a2025.id, tarif, a2025.dateDebut);
    await fabriquerInscription(e.id, m.annee.id, { ...tarif, niveau: 2 }, m.annee.dateDebut);

    const recu = reussi(await payer(e.id, 150_000));

    expect(recu.lignes.map((l) => [l.libelle, l.montant])).toEqual([
      ["Droits d'inscription", 100_000],
      ["Octobre 2025", 50_000],
    ]);
    expect(recu.etudiant.anneeScolaire).toBe("2025-2026");
    expect(
      await db.paiementLigne.count({ where: { echeance: { inscription: { anneeScolaireId: m.annee.id } } } }),
    ).toBe(0);
  });

  it("le reçu porte les valeurs figées à l'émission : reste, reste en retard, reste par échéance", async () => {
    const e = await etudiantStandard();

    const r1 = reussi(await payer(e.id, 100_000));
    expect([r1.resteApres, r1.retardApres]).toEqual([800_000, 80_000]);
    const r2 = reussi(await payer(e.id, 50_000));
    expect([r2.resteApres, r2.retardApres]).toEqual([750_000, 30_000]);
    const r3 = reussi(await payer(e.id, 30_000));
    expect([r3.resteApres, r3.retardApres]).toEqual([720_000, 0]);

    const paiement = await db.paiement.findUniqueOrThrow({ where: { numeroRecu: r2.numero }, include: { lignes: true } });
    expect(paiement).toMatchObject({ montant: 50_000, resteApres: 750_000, retardApres: 30_000 });
    expect(paiement.lignes.map((l) => [l.montant, l.resteEcheanceApres])).toEqual([[50_000, 30_000]]);
  });
});

describe("encaisser : refus", () => {
  it("refuse un trop-perçu au-delà du reste dû total, et le paiement exact du reste est accepté", async () => {
    const e = await etudiantStandard();

    const refus = await payer(e.id, 900_001);

    expect(refus).toMatchObject({
      statut: "erreur",
      message: expect.stringMatching(/dépasse ce que l'étudiant doit encore/),
      erreurs: { montant: expect.any(String) },
    });
    expect(await db.paiement.count()).toBe(0);
    expect(await db.compteur.count()).toBe(0);
    expect(revaliderPagesEcolage).not.toHaveBeenCalled();

    const tout = reussi(await payer(e.id, 900_000));
    expect(tout.resteApres).toBe(0);
    expect(await payer(e.id, 1_000)).toMatchObject({ statut: "erreur", message: expect.stringMatching(/rien à payer/) });
  });

  it("refuse un montant nul, négatif, décimal ou illisible", async () => {
    const e = await etudiantStandard();
    for (const montant of [0, -5_000, 1_000.5, "abc", ""]) {
      expect(await payer(e.id, montant), String(montant)).toMatchObject({ statut: "erreur", erreurs: { montant: expect.any(String) } });
    }
    expect(await db.paiement.count()).toBe(0);
  });

  it("lit un montant saisi avec espaces : « 160 000 »", async () => {
    const e = await etudiantStandard();
    expect(reussi(await payer(e.id, "160 000")).total).toBe(160_000);
  });

  it("reste dû affiché faux : SITUATION_CHANGEE, ni paiement ni numéro de reçu consommé", async () => {
    const e = await etudiantStandard();

    for (const affiche of [0, 899_999, 900_001]) {
      const r = await payer(e.id, 80_000, { resteDuAffiche: affiche });
      expect(r, String(affiche)).toMatchObject({ statut: "erreur", code: "SITUATION_CHANGEE" });
    }
    expect(await db.paiement.count()).toBe(0);
    expect(await db.compteur.count()).toBe(0);
    expect(reussi(await payer(e.id, 80_000)).numero).toBe("R-2026-00001");
  });

  it("étudiant inconnu : INTROUVABLE ; validations : opérateur et référence selon le mode", async () => {
    expect(await payer("inconnu", 1_000, { resteDuAffiche: 0 })).toMatchObject({ statut: "erreur", code: "INTROUVABLE" });

    const e = await etudiantStandard();
    expect(await payer(e.id, 1_000, { mode: "MOBILE_MONEY" })).toMatchObject({
      erreurs: { operateur: expect.any(String), reference: expect.any(String) },
    });
    expect(await payer(e.id, 1_000, { operateur: "MVOLA" })).toMatchObject({ erreurs: { operateur: expect.any(String) } });
    expect(await payer(e.id, 1_000, { idClient: "pas-un-identifiant" })).toMatchObject({ erreurs: { idClient: expect.any(String) } });
    expect(await db.paiement.count()).toBe(0);
  });

  it("sans session : redirigé vers la connexion, aucun paiement", async () => {
    const e = await etudiantStandard();
    const entree = { etudiantId: e.id, montant: 1_000, mode: "ESPECES" as const, idClient: randomUUID(), resteDuAffiche: 900_000 };
    getSession.mockResolvedValue(null);
    await expect(actions.encaisser(entree)).rejects.toThrow(/NEXT_REDIRECT/);
    expect(await db.paiement.count()).toBe(0);
  });
});

describe("encaisser : mode, rôle et étudiants sortis", () => {
  it("Mobile Money : opérateur et référence enregistrés et rendus sur le reçu", async () => {
    const e = await etudiantStandard();

    const recu = reussi(await payer(e.id, 100_000, { mode: "MOBILE_MONEY", operateur: "MVOLA", reference: "MP2611.1234" }));

    expect(recu).toMatchObject({ mode: "MOBILE_MONEY", modeLibelle: "Mobile Money", operateur: "MVOLA", operateurLibelle: "MVola", reference: "MP2611.1234" });
    expect(await db.paiement.findUniqueOrThrow({ where: { numeroRecu: recu.numero } })).toMatchObject({
      operateur: "MVOLA",
      reference: "MP2611.1234",
    });
  });

  it("l'utilisateur et l'administrateur peuvent encaisser ; le caissier est celui de la session", async () => {
    const e = await etudiantStandard();
    const parUser = reussi(await payer(e.id, 10_000));
    connecter(getSession, m.admin);
    const parAdmin = reussi(await payer(e.id, 10_000));

    expect([parUser.caissier, parAdmin.caissier]).toEqual(["Caissier Test", "Admin Test"]);
    const saisis = await db.paiement.findMany({ orderBy: { numeroRecu: "asc" }, select: { saisiParId: true } });
    expect(saisis.map((p) => p.saisiParId)).toEqual([m.user.id, m.admin.id]);
  });

  it.each(["DIPLOME", "ABANDON", "EXCLU"] as const)("étudiant %s qui doit encore : encaissable", async (statut) => {
    const e = await etudiantStandard();
    await db.etudiant.update({ where: { id: e.id }, data: { statut, dateSortie: new Date("2026-11-01T00:00:00Z") } });

    const recu = reussi(await payer(e.id, 100_000));

    expect(recu.resteApres).toBe(800_000);
    const trouve = await actions.chercherAuGuichet(e.nom);
    expect(trouve).toMatchObject([{ id: e.id, statut, sorti: true, resteDu: 800_000 }]);
  });

  it("étudiant sorti sans rien devoir : introuvable au guichet et refusé", async () => {
    const e = await etudiantStandard();
    reussi(await payer(e.id, 900_000));
    await db.etudiant.update({ where: { id: e.id }, data: { statut: "DIPLOME" } });

    expect(await actions.chercherAuGuichet(e.nom)).toEqual([]);
    expect(await payer(e.id, 1_000)).toMatchObject({ statut: "erreur", message: expect.stringMatching(/rien à payer/) });
  });
});

describe("encaisser : idempotence et concurrence", () => {
  it("même idClient renvoyé deux fois : un seul paiement, le même reçu, même avec un reste affiché périmé", async () => {
    const e = await etudiantStandard();
    const entree = { etudiantId: e.id, montant: 100_000, mode: "ESPECES" as const, idClient: randomUUID(), resteDuAffiche: 900_000 };

    const premier = reussi(await actions.encaisser(entree));
    const second = await actions.encaisser(entree);

    expect(second).toMatchObject({ statut: "succes", message: expect.stringMatching(/déjà enregistré : reçu R-2026-00001/) });
    expect(reussi(second)).toEqual(premier);
    expect(await db.paiement.count()).toBe(1);
    expect(await compteurs()).toEqual({ "RECU:2026": 1 });
    expect(await resteDu(e.id)).toBe(800_000);
  });

  it("même idClient envoyé 4 fois en parallèle : un seul paiement, tous reçoivent le même reçu", async () => {
    const e = await etudiantStandard();
    const entree = { etudiantId: e.id, montant: 100_000, mode: "ESPECES" as const, idClient: randomUUID(), resteDuAffiche: 900_000 };

    const etats = await Promise.all(Array.from({ length: 4 }, () => actions.encaisser(entree)));

    const numeros = etats.map((r) => reussi(r).numero);
    expect(new Set(numeros)).toEqual(new Set(["R-2026-00001"]));
    expect(await db.paiement.count()).toBe(1);
    expect(await compteurs()).toEqual({ "RECU:2026": 1 });
    expect(await resteDu(e.id)).toBe(800_000);
  });

  it("un idClient déjà utilisé pour un autre étudiant est refusé", async () => {
    const a = await etudiantStandard();
    const b = await etudiantStandard();
    const idClient = randomUUID();
    reussi(await payer(a.id, 10_000, { idClient }));

    expect(await payer(b.id, 10_000, { idClient })).toMatchObject({
      statut: "erreur",
      message: expect.stringMatching(/déjà servi pour un autre étudiant/),
    });
    expect(await db.paiement.count()).toBe(1);
  });

  it("deux encaissements simultanés (idClient différents, même reste affiché) : un seul passe", async () => {
    const e = await etudiantStandard();
    const base = { etudiantId: e.id, montant: 100_000, mode: "ESPECES" as const, resteDuAffiche: 900_000 };

    const etats = await Promise.all([
      actions.encaisser({ ...base, idClient: randomUUID() }),
      actions.encaisser({ ...base, idClient: randomUUID() }),
    ]);

    expect(etats.map((r) => r.statut).sort()).toEqual(["erreur", "succes"]);
    expect(etats.find((r) => r.statut === "erreur")).toMatchObject({ code: "SITUATION_CHANGEE" });
    expect(await db.paiement.count()).toBe(1);
    expect(await resteDu(e.id)).toBe(800_000);
    expect(await compteurs()).toEqual({ "RECU:2026": 1 });
  });

  it("numéros de reçu consécutifs : R-2026-00001, R-2026-00002, R-2026-00003", async () => {
    const e = await etudiantStandard();
    const numeros = [
      reussi(await payer(e.id, 10_000)).numero,
      reussi(await payer(e.id, 10_000)).numero,
      reussi(await payer(e.id, 10_000)).numero,
    ];
    expect(numeros).toEqual(["R-2026-00001", "R-2026-00002", "R-2026-00003"]);
  });

  it("5 encaissements simultanés sur des étudiants différents : numéros de 00001 à 00005, sans doublon", async () => {
    const etudiants = await Promise.all(Array.from({ length: 5 }, () => etudiantStandard()));

    const etats = await Promise.all(etudiants.map((e) => payer(e.id, 10_000)));

    expect(etats.map((r) => reussi(r).numero).sort()).toEqual([
      "R-2026-00001", "R-2026-00002", "R-2026-00003", "R-2026-00004", "R-2026-00005",
    ]);
    expect(await compteurs()).toEqual({ "RECU:2026": 5 });
  });

  it("l'année du numéro est l'année civile à Madagascar : 21 h 30 UTC le 31/12 est déjà en 2027", async () => {
    const e = await etudiantStandard();
    vi.setSystemTime(new Date("2026-12-31T20:00:00Z"));
    expect(reussi(await payer(e.id, 10_000)).numero).toBe("R-2026-00001");
    vi.setSystemTime(new Date("2026-12-31T21:30:00Z"));
    expect(reussi(await payer(e.id, 10_000)).numero).toBe("R-2027-00001");
    expect(await compteurs()).toEqual({ "RECU:2026": 1, "RECU:2027": 1 });
  });
});

describe("annulerPaiement", () => {
  async function paiementFait() {
    const e = await etudiantStandard();
    const recu = reussi(await payer(e.id, 180_000));
    return { e, recu, id: recu.paiementId! };
  }

  it("refuse le rôle user avec le message réel, sans rien modifier", async () => {
    const { id } = await paiementFait();
    revaliderPagesEcolage.mockClear();

    expect(await actions.annulerPaiement({ paiementId: id, motif: "erreur de saisie" })).toEqual(REFUS_ADMIN);

    expect(await db.paiement.findUniqueOrThrow({ where: { id } })).toMatchObject({ annule: false, annuleParId: null, dateAnnulation: null });
    expect(revaliderPagesEcolage).not.toHaveBeenCalled();
  });

  it("refuse l'appel direct avec une entrée invalide : le refus de rôle passe avant la validation", async () => {
    expect(await actions.annulerPaiement({} as never)).toEqual(REFUS_ADMIN);
  });

  it("sans session : redirigé vers la connexion", async () => {
    const { id } = await paiementFait();
    getSession.mockResolvedValue(null);
    await expect(actions.annulerPaiement({ paiementId: id, motif: "erreur de saisie" })).rejects.toThrow(/NEXT_REDIRECT/);
  });

  it("refuse un motif de moins de 5 caractères", async () => {
    const { id } = await paiementFait();
    connecter(getSession, m.admin);
    for (const motif of ["", "abcd", "   ab  "]) {
      expect(await actions.annulerPaiement({ paiementId: id, motif }), motif).toMatchObject({
        statut: "erreur",
        erreurs: { motif: expect.any(String) },
      });
    }
    expect((await db.paiement.findUniqueOrThrow({ where: { id } })).annule).toBe(false);
  });

  it("l'administrateur annule : motif, auteur et date posés, le paiement et ses lignes existent toujours", async () => {
    const { e, id } = await paiementFait();
    const lignesAvant = await db.paiementLigne.findMany({ where: { paiementId: id }, orderBy: { id: "asc" } });
    expect(await resteDu(e.id)).toBe(720_000);
    connecter(getSession, m.admin);
    vi.setSystemTime(new Date("2026-11-16T07:00:00Z"));

    const r = await actions.annulerPaiement({ paiementId: id, motif: "  Montant saisi en double  " });

    expect(r).toMatchObject({ statut: "succes", message: expect.stringMatching(/R-2026-00001 annulé/) });
    const p = await db.paiement.findUnique({ where: { id }, include: { lignes: { orderBy: { id: "asc" } } } });
    expect(p).toMatchObject({
      annule: true,
      annuleParId: m.admin.id,
      motifAnnulation: "Montant saisi en double",
      montant: 180_000,
      numeroRecu: "R-2026-00001",
    });
    expect(p?.dateAnnulation?.toISOString()).toBe("2026-11-16T07:00:00.000Z");
    expect(p?.lignes).toEqual(lignesAvant);
    expect(await db.paiement.count()).toBe(1);
    expect(revaliderPagesEcolage).toHaveBeenCalledTimes(2);
  });

  it("les échéances couvertes redeviennent dues, acomptes compris", async () => {
    const e = await etudiantStandard();
    reussi(await payer(e.id, 100_000));
    const acompte = reussi(await payer(e.id, 100_000));
    expect(await resteDu(e.id)).toBe(700_000);
    connecter(getSession, m.admin);

    reussi(await actions.annulerPaiement({ paiementId: acompte.paiementId!, motif: "paiement refusé" }));

    expect(await resteDu(e.id)).toBe(800_000);
    const echeances = (await lireFicheEtudiant(e.id, "2026-11-15"))!.parcours[0].echeances;
    expect(echeances.slice(0, 3).map((x) => [x.paye, x.statut])).toEqual([[100_000, "paye"], [0, "retard"], [0, "a_venir"]]);
  });

  it("refuse d'annuler deux fois, sans modifier l'auteur ni la date de la première annulation", async () => {
    const { id } = await paiementFait();
    connecter(getSession, m.admin);
    vi.setSystemTime(new Date("2026-11-16T07:00:00Z"));
    reussi(await actions.annulerPaiement({ paiementId: id, motif: "première annulation" }));
    const autreAdmin = await db.user.create({ data: { id: randomUUID(), name: "Autre admin", email: "autre@test.ifspa.mg", role: "admin" } });
    connecter(getSession, autreAdmin);
    vi.setSystemTime(new Date("2026-11-17T07:00:00Z"));

    const r = await actions.annulerPaiement({ paiementId: id, motif: "seconde annulation" });

    expect(r).toMatchObject({ statut: "erreur", message: expect.stringMatching(/R-2026-00001 est déjà annulé/) });
    expect(await db.paiement.findUniqueOrThrow({ where: { id } })).toMatchObject({
      annuleParId: m.admin.id,
      motifAnnulation: "première annulation",
    });
  });

  it("deux annulations simultanées : une seule aboutit", async () => {
    const { id } = await paiementFait();
    connecter(getSession, m.admin);

    const etats = await Promise.all([
      actions.annulerPaiement({ paiementId: id, motif: "annulation A" }),
      actions.annulerPaiement({ paiementId: id, motif: "annulation B" }),
    ]);

    expect(etats.map((r) => r.statut).sort()).toEqual(["erreur", "succes"]);
  });

  it("paiement inconnu : INTROUVABLE", async () => {
    connecter(getSession, m.admin);
    expect(await actions.annulerPaiement({ paiementId: "inconnu", motif: "motif valable" })).toMatchObject({
      statut: "erreur",
      code: "INTROUVABLE",
    });
  });

  it("le reçu annulé garde ses montants et restes d'émission, plus le bloc d'annulation", async () => {
    const { e, recu, id } = await paiementFait();
    reussi(await payer(e.id, 50_000));
    connecter(getSession, m.admin);
    vi.setSystemTime(new Date("2026-11-16T07:00:00Z"));
    reussi(await actions.annulerPaiement({ paiementId: id, motif: "erreur de saisie" }));

    const apres = await lireRecu(id);

    expect(apres?.annulation).toEqual({ date: "16/11/2026", par: "Admin Test", motif: "erreur de saisie" });
    expect({ ...apres, annulation: null }).toEqual(recu);
    expect(await actions.obtenirRecu(id)).toEqual(apres);
  });

  it("un nouveau paiement après annulation prend un nouveau numéro, l'ancien n'est pas réutilisé", async () => {
    const { e, id } = await paiementFait();
    connecter(getSession, m.admin);
    reussi(await actions.annulerPaiement({ paiementId: id, motif: "erreur de saisie" }));

    const recu = reussi(await payer(e.id, 180_000));

    expect(recu.numero).toBe("R-2026-00002");
    expect(await db.paiement.count()).toBe(2);
    expect(await resteDu(e.id)).toBe(720_000);
  });
});

/** Aucune échéance ne doit recevoir plus que son montant dû, paiements non annulés seulement. */
async function surpaiements() {
  const echeances = await db.echeance.findMany({
    select: { id: true, montantDu: true, lignesPaiement: { where: { paiement: { annule: false } }, select: { montant: true } } },
  });
  return echeances.filter((e) => e.lignesPaiement.reduce((s, l) => s + l.montant, 0) > e.montantDu).map((e) => e.id);
}

describe("intégrité sous concurrence et à la limite des compteurs", () => {
  it("un reste affiché avant une annulation est refusé après elle", async () => {
    const e = await etudiantStandard();
    const p1 = reussi(await payer(e.id, 100_000));
    const afficheAvant = await resteDu(e.id);
    connecter(getSession, m.admin);
    reussi(await actions.annulerPaiement({ paiementId: p1.paiementId!, motif: "erreur de saisie" }));

    const r = await payer(e.id, 50_000, { resteDuAffiche: afficheAvant });

    expect(r).toMatchObject({ statut: "erreur", code: "SITUATION_CHANGEE" });
    expect(await db.paiement.count()).toBe(1);
  });

  it("6 encaissements simultanés sur le même étudiant, chacun avec le reste relu : jamais de surpaiement", async () => {
    const e = await etudiantStandard();

    const etats = await Promise.all(Array.from({ length: 6 }, () => payer(e.id, 150_000)));

    const reussis = etats.filter((r) => r.statut === "succes").length;
    expect(reussis).toBeGreaterThanOrEqual(1);
    for (const r of etats) if (r.statut === "erreur") expect(r.code).toBe("SITUATION_CHANGEE");
    expect(await db.paiement.count()).toBe(reussis);
    expect(await resteDu(e.id)).toBe(900_000 - 150_000 * reussis);
    expect(await surpaiements()).toEqual([]);
    expect(await compteurs()).toEqual({ "RECU:2026": reussis });
  });

  it("annulation et encaissement simultanés : état cohérent, pas d'interblocage", async () => {
    const e = await etudiantStandard();
    const p1 = reussi(await payer(e.id, 100_000));
    const base = { etudiantId: e.id, montant: 50_000, mode: "ESPECES" as const, idClient: randomUUID(), resteDuAffiche: 800_000 };
    connecter(getSession, m.admin);

    const [annulation, encaissement] = await Promise.all([
      actions.annulerPaiement({ paiementId: p1.paiementId!, motif: "erreur de saisie" }),
      actions.encaisser(base),
    ]);

    expect(annulation.statut).toBe("succes");
    const attendu = encaissement.statut === "succes" ? 900_000 - 50_000 : 900_000;
    expect(await resteDu(e.id)).toBe(attendu);
    expect(await surpaiements()).toEqual([]);
  });

  it("redécoupage des droits et encaissement simultanés : aucun paiement ne pointe sur une échéance disparue", async () => {
    const e = await etudiantStandard();
    const inscription = await db.inscription.findFirstOrThrow({ where: { etudiantId: e.id } });
    const { modifierTranchesDroits } = await import("@/server/actions/etudiants");
    const base = { etudiantId: e.id, montant: 40_000, mode: "ESPECES" as const, idClient: randomUUID(), resteDuAffiche: 900_000 };

    const [redecoupage, encaissement] = await Promise.all([
      modifierTranchesDroits({ inscriptionId: inscription.id, droitsEnTranches: 3 }),
      actions.encaisser(base),
    ]);

    expect(encaissement.statut).toBe("succes");
    const ins = await db.inscription.findUniqueOrThrow({ where: { id: inscription.id }, include: { echeances: true } });
    const droits = ins.echeances.filter((x) => x.type === "DROITS");
    if (redecoupage.statut === "succes") expect(droits).toHaveLength(3);
    else expect(droits).toHaveLength(1);
    expect(ins.echeances.reduce((s, x) => s + x.montantDu, 0)).toBe(900_000);
    const lignes = await db.paiementLigne.findMany({ include: { echeance: true } });
    expect(lignes.reduce((s, l) => s + l.montant, 0)).toBe(40_000);
    expect(lignes.every((l) => l.echeance.inscriptionId === inscription.id)).toBe(true);
  });

  it("plus de numéro de reçu disponible : refus affichable, rien d'enregistré, compteur inchangé", async () => {
    const e = await etudiantStandard();
    await db.compteur.create({ data: { cle: "RECU:2026", valeur: 99_999 } });

    const r = await payer(e.id, 10_000);

    expect(r).toMatchObject({ statut: "erreur", message: expect.stringMatching(/Plus de numéro de reçu disponible/) });
    expect(await db.paiement.count()).toBe(0);
    expect(await compteurs()).toEqual({ "RECU:2026": 99_999 });
  });
});

describe("chercherAuGuichet", () => {
  it("trouve par nom, prénoms ou matricule, sans accent ni casse, avec les restes à la date du jour", async () => {
    const { etudiant } = await fabriquerEtudiantInscrit(
      m.ifs.id, m.annee, tarif, { nom: "RAKOTOMALALA", prenoms: "Éloïse", matricule: "IF-2026-0001" },
    );

    for (const q of ["rakoto", "ELOISE", "eloise rakoto", "if-2026-0001", "  Éloïse   RAKOTO "]) {
      const r = await actions.chercherAuGuichet(q);
      expect(r.map((x) => x.id), q).toEqual([etudiant.id]);
    }
    const [r] = await actions.chercherAuGuichet("rakoto");
    expect(r).toMatchObject({
      matricule: "IF-2026-0001",
      filiereCode: "IF",
      niveau: "1re année",
      statut: "ACTIF",
      sorti: false,
      resteDu: 900_000,
      resteEnRetard: 180_000,
    });
  });

  it("vide, trop long, introuvable ou joker saisi : aucun résultat", async () => {
    await etudiantStandard();
    for (const q of ["", "   ", "x".repeat(101), "zzzz", "%", "_", "\\"]) {
      expect(await actions.chercherAuGuichet(q), q.slice(0, 10)).toEqual([]);
    }
  });

  it("10 résultats au plus, les actifs d'abord", async () => {
    for (let i = 0; i < 11; i++) await etudiantStandard(1, { nom: `DUPONT${String(i).padStart(2, "0")}` });
    const sorti = await etudiantStandard(1, { nom: "DUPONT00A" });
    await db.etudiant.update({ where: { id: sorti.id }, data: { statut: "ABANDON" } });

    const r = await actions.chercherAuGuichet("dupont");

    expect(r).toHaveLength(10);
    expect(r.every((x) => x.statut === "ACTIF")).toBe(true);
  });

  it("niveau d'un redoublant", async () => {
    const e = await etudiantStandard(1, { nom: "REDOUBLANT" });
    await db.inscription.updateMany({ where: { etudiantId: e.id }, data: { redoublement: true, niveau: 2 } });
    expect((await actions.chercherAuGuichet("redoublant"))[0].niveau).toBe("2e année (redoublant)");
  });

  it("chargerDerniersServis : étudiants distincts du caissier, du plus récent au plus ancien, sans paiement annulé", async () => {
    const a = await etudiantStandard(1, { nom: "PREMIER" });
    const b = await etudiantStandard(1, { nom: "SECOND" });
    const c = await etudiantStandard(1, { nom: "TROISIEME" });
    vi.setSystemTime(new Date("2026-11-15T08:00:00Z"));
    reussi(await payer(a.id, 10_000));
    vi.setSystemTime(new Date("2026-11-15T09:00:00Z"));
    const annule = reussi(await payer(b.id, 10_000));
    vi.setSystemTime(new Date("2026-11-15T10:00:00Z"));
    reussi(await payer(c.id, 10_000));
    vi.setSystemTime(new Date("2026-11-15T11:00:00Z"));
    reussi(await payer(a.id, 10_000));
    connecter(getSession, m.admin);
    reussi(await actions.annulerPaiement({ paiementId: annule.paiementId!, motif: "erreur de saisie" }));
    connecter(getSession, m.user);

    const derniers = await actions.chargerDerniersServis();

    expect(derniers.map((d) => d.id)).toEqual([a.id, c.id]);
    connecter(getSession, m.admin);
    expect(await actions.chargerDerniersServis()).toEqual([]);
  });

  it("sans session : redirigé", async () => {
    getSession.mockResolvedValue(null);
    await expect(actions.chercherAuGuichet("a")).rejects.toThrow(/NEXT_REDIRECT/);
    await expect(actions.chargerSituationGuichet("x")).rejects.toThrow(/NEXT_REDIRECT/);
    await expect(actions.obtenirRecu("x")).rejects.toThrow(/NEXT_REDIRECT/);
    await expect(actions.chargerDerniersServis()).rejects.toThrow(/NEXT_REDIRECT/);
  });
});

describe("chargerSituationGuichet", () => {
  it("échéances non soldées toutes années, en retard présélectionnées, restes à la date du jour", async () => {
    const e = await etudiantStandard();

    const s = (await actions.chargerSituationGuichet(e.id))!;

    expect(s).toMatchObject({ jour: "2026-11-15", refus: null, resteDuTotal: 900_000, resteEnRetard: 180_000 });
    expect(s.echeances).toHaveLength(11);
    expect(s.echeances.slice(0, 3).map((x) => [x.libelle, x.echue, x.statut])).toEqual([
      ["Droits d'inscription", true, "retard"],
      ["Octobre 2026", true, "retard"],
      ["Novembre 2026", false, "a_venir"],
    ]);
    expect(s.preselection).toEqual([s.echeances[0].id, s.echeances[1].id]);
    expect(s.annees).toHaveLength(1);
    expect(s.annees[0]).toMatchObject({ libelle: "2026-2027", niveau: "1re année", reste: 900_000, resteEnRetard: 180_000 });
  });

  it("n'affiche que ce qui reste dû ; tout soldé : message à la place du formulaire", async () => {
    const e = await etudiantStandard();
    reussi(await payer(e.id, 100_000));
    reussi(await payer(e.id, 30_000));

    const s = (await actions.chargerSituationGuichet(e.id))!;
    expect(s.echeances[0]).toMatchObject({ libelle: "Octobre 2026", montantDu: 80_000, paye: 30_000, reste: 50_000, statut: "retard" });
    expect(s.echeances).toHaveLength(10);

    reussi(await payer(e.id, 770_000));
    expect(await actions.chargerSituationGuichet(e.id)).toMatchObject({ refus: expect.stringMatching(/Rien à encaisser/), echeances: [], resteDuTotal: 0 });
  });

  it("deux années : de la plus ancienne à la plus récente, avec le reste de chacune", async () => {
    const a2025 = await fabriquerAnnee({ anneeDebut: 2025 });
    const e = await fabriquerEtudiant(m.ifs.id, a2025.id);
    await fabriquerInscription(e.id, a2025.id, tarif, a2025.dateDebut);
    await fabriquerInscription(e.id, m.annee.id, { ...tarif, niveau: 2 }, m.annee.dateDebut);

    const s = (await actions.chargerSituationGuichet(e.id))!;

    expect(s.annees.map((a) => [a.libelle, a.niveau, a.reste])).toEqual([
      ["2025-2026", "1re année", 900_000],
      ["2026-2027", "2e année", 900_000],
    ]);
    expect(s.annees[0].resteEnRetard).toBe(900_000);
    expect(s.resteEnRetard).toBe(900_000 + 180_000);
  });

  it("étudiant inconnu ou identifiant invalide : null", async () => {
    expect(await actions.chargerSituationGuichet("inconnu")).toBeNull();
    expect(await actions.chargerSituationGuichet("")).toBeNull();
    expect(await actions.chargerSituationGuichet("x".repeat(41))).toBeNull();
  });

  it("obtenirRecu : réimpression identique à l'émission ; identifiant inconnu ou invalide : null", async () => {
    const e = await etudiantStandard();
    const recu = reussi(await payer(e.id, 260_000));

    expect(await actions.obtenirRecu(recu.paiementId!)).toEqual(recu);
    expect(await actions.obtenirRecu("inconnu")).toBeNull();
    expect(await actions.obtenirRecu("")).toBeNull();
  });
});
