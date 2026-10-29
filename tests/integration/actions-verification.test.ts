import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EntreeEncaissement } from "@/lib/encaissement";
import { fabriquerPaiement } from "../factories";
import { elementHorsLigne, normaliser, numero, POSTE_A, reserver, type Surcharge } from "../factories/hors-ligne";
import { connecter, fabriquerEtudiantInscrit, fabriquerMonde, MAINTENANT, reussi, type Monde } from "../factories/scenarios";

const { getSession, revaliderPagesEcolage } = vi.hoisted(() => ({ getSession: vi.fn(), revaliderPagesEcolage: vi.fn() }));

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/ecolage-revalidation", () => ({ revaliderPagesEcolage }));

const { db } = await import("@/lib/db");
const actions = await import("@/server/actions/paiements");
const { lirePaiements } = await import("@/server/lectures/paiements");
const { synchroniserPaiement } = await import("@/server/paiements");

const REFUS_ADMIN = { statut: "erreur", message: "Cette action est réservée à l'administrateur." };
const TARIF = { niveau: 1, droitsInscription: 100_000, montantMensuel: 80_000, nombreMois: 10 };

let m: Monde;
let e: Awaited<ReturnType<typeof fabriquerEtudiantInscrit>>;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(MAINTENANT) });
  revaliderPagesEcolage.mockClear();
  getSession.mockReset();
  m = await fabriquerMonde();
  e = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF);
  connecter(getSession, m.admin);
});

afterEach(() => vi.useRealTimers());

/** Paiement « à vérifier » comme en laisse un poste hors ligne. */
const aVerifier = (donnees = {}) =>
  fabriquerPaiement(e.etudiant.id, m.user.id, [{ echeanceId: e.inscription.echeances[0].id, montant: 50_000 }], {
    aVerifier: true,
    noteVerification: "Situation changée avant la synchronisation.",
    date: new Date("2026-11-15T05:00:00Z"),
    ...donnees,
  });

describe("marquerVerifie", () => {
  it("refuse le rôle user côté serveur, sans rien modifier", async () => {
    const p = await aVerifier();
    connecter(getSession, m.user);

    expect(await actions.marquerVerifie({ paiementId: p.id })).toEqual(REFUS_ADMIN);

    const apres = await db.paiement.findUniqueOrThrow({ where: { id: p.id } });
    expect(apres).toMatchObject({ aVerifier: true, verifieParId: null, dateVerification: null });
    expect(revaliderPagesEcolage).not.toHaveBeenCalled();
  });

  it("sans session : renvoie vers la connexion", async () => {
    getSession.mockResolvedValue(null);
    await expect(actions.marquerVerifie({ paiementId: "x" })).rejects.toThrow(/NEXT_REDIRECT/);
  });

  it("admin : renseigne l'auteur et la date, garde la note et les montants, revalide", async () => {
    const p = await aVerifier();

    const r = await actions.marquerVerifie({ paiementId: p.id });

    expect(r).toMatchObject({ statut: "succes", message: expect.stringContaining(p.numeroRecu) });
    const apres = await db.paiement.findUniqueOrThrow({ where: { id: p.id }, include: { lignes: true } });
    expect(apres).toMatchObject({
      aVerifier: false,
      verifieParId: m.admin.id,
      noteVerification: "Situation changée avant la synchronisation.",
      montant: 50_000,
      annule: false,
    });
    expect(apres.dateVerification?.toISOString()).toBe(new Date(MAINTENANT).toISOString());
    expect(apres.lignes).toHaveLength(1);
    expect(revaliderPagesEcolage).toHaveBeenCalledTimes(1);
  });

  it("déjà vérifié : refusé, la première vérification est conservée", async () => {
    const p = await aVerifier();
    await actions.marquerVerifie({ paiementId: p.id });
    connecter(getSession, await db.user.create({ data: { id: randomUUID(), name: "Second admin", email: "second@test.ifspa.mg", role: "admin" } }));

    const r = await actions.marquerVerifie({ paiementId: p.id });

    expect(r).toMatchObject({ statut: "erreur", message: expect.stringMatching(/déjà été vérifié/) });
    expect((await db.paiement.findUniqueOrThrow({ where: { id: p.id } })).verifieParId).toBe(m.admin.id);
  });

  it("paiement qui n'est pas à vérifier : refusé", async () => {
    const p = await aVerifier({ aVerifier: false });

    const r = await actions.marquerVerifie({ paiementId: p.id });

    expect(r).toMatchObject({ statut: "erreur", message: expect.stringMatching(/n'est pas à vérifier/) });
    expect((await db.paiement.findUniqueOrThrow({ where: { id: p.id } })).verifieParId).toBeNull();
  });

  it("paiement annulé : refusé, il n'y a plus rien à vérifier", async () => {
    const p = await aVerifier({ annule: true, annuleParId: m.admin.id, dateAnnulation: new Date(), motifAnnulation: "doublon" });

    const r = await actions.marquerVerifie({ paiementId: p.id });

    expect(r).toMatchObject({ statut: "erreur", message: expect.stringMatching(/annulé/) });
    expect(await db.paiement.count({ where: { verifieParId: { not: null } } })).toBe(0);
  });

  it("paiement inconnu : INTROUVABLE ; identifiant vide : refusé par la validation", async () => {
    expect(await actions.marquerVerifie({ paiementId: "inconnu" })).toMatchObject({ statut: "erreur", code: "INTROUVABLE" });
    expect(await actions.marquerVerifie({ paiementId: "" })).toMatchObject({ statut: "erreur" });
  });

  it("deux clics simultanés : une seule vérification enregistrée", async () => {
    const p = await aVerifier();

    const etats = await Promise.all([actions.marquerVerifie({ paiementId: p.id }), actions.marquerVerifie({ paiementId: p.id })]);

    expect(etats.filter((x) => x.statut === "succes")).toHaveLength(1);
    expect(etats.filter((x) => x.statut === "erreur")).toHaveLength(1);
  });

  it("n'annule rien : un paiement vérifié reste compté dans l'écolage payé", async () => {
    const p = await aVerifier();
    await actions.marquerVerifie({ paiementId: p.id });

    const lignes = await db.paiementLigne.aggregate({ where: { paiement: { annule: false } }, _sum: { montant: true } });
    expect(lignes._sum.montant).toBe(50_000);
  });
});

describe("encaisser en ligne après une synchronisation hors ligne", () => {
  it("SITUATION_CHANGEE reste refusé en ligne : pas d'enregistrement « à vérifier » côté guichet connecté", async () => {
    const bloc = await reserver(m.user.id, POSTE_A);
    await synchroniserPaiement(
      elementHorsLigne({ etudiantId: e.etudiant.id, saisiParId: m.user.id, numeroRecu: numero(bloc.libres[0]), montant: 100_000 }, { instantSaisie: "2026-11-15T08:55:00.000Z" }),
    );
    connecter(getSession, m.user);

    const r = await actions.encaisser({ etudiantId: e.etudiant.id, montant: 80_000, mode: "ESPECES", idClient: randomUUID(), resteDuAffiche: 900_000, jourAffiche: "2026-11-15" });

    expect(r).toMatchObject({ statut: "erreur", code: "SITUATION_CHANGEE" });
    expect(await db.paiement.count()).toBe(1);
  });

  it("le numéro en ligne suit le dernier numéro de bloc réservé, sans le recouper", async () => {
    await reserver(m.user.id, POSTE_A);
    connecter(getSession, m.user);

    const r = await actions.encaisser({ etudiantId: e.etudiant.id, montant: 80_000, mode: "ESPECES", idClient: randomUUID(), resteDuAffiche: 900_000, jourAffiche: "2026-11-15" });

    expect(r).toMatchObject({ statut: "succes", donnees: { numero: "R-2026-00021" } });
    expect(await db.paiement.findFirstOrThrow()).toMatchObject({ aVerifier: false, noteVerification: null });
  });
});

describe("idClient partagé entre l'encaissement en ligne et la synchronisation", () => {
  const MVOLA = { mode: "MOBILE_MONEY", operateur: "MVOLA", reference: "MV-1" } as const;
  const cas: { nom: string; base: Surcharge; autre: Surcharge; existant: string }[] = [
    { nom: "autre montant", base: {}, autre: { montant: 90_000 }, existant: "80 000 Ar en espèces" },
    { nom: "autre mode", base: {}, autre: MVOLA, existant: "80 000 Ar en espèces" },
    { nom: "autre opérateur", base: MVOLA, autre: { operateur: "ORANGE_MONEY" }, existant: "80 000 Ar en MVola" },
    { nom: "autre référence", base: MVOLA, autre: { reference: "MV-2" }, existant: "80 000 Ar en MVola" },
    { nom: "espèces au lieu de Mobile Money", base: MVOLA, autre: { mode: "ESPECES", operateur: null, reference: null }, existant: "80 000 Ar en MVola" },
  ];

  const entree = (surcharge: Surcharge = {}): EntreeEncaissement => ({
    etudiantId: e.etudiant.id,
    montant: 80_000,
    mode: "ESPECES",
    idClient: randomUUID(),
    resteDuAffiche: 900_000,
    jourAffiche: "2026-11-15",
    ...surcharge,
  });

  beforeEach(() => connecter(getSession, m.user));

  it.each(cas)("en ligne, $nom : refusé sous le reçu existant, rien n'est créé", async ({ base, autre, existant }) => {
    const premiere = entree(base);
    expect(await actions.encaisser(premiere)).toMatchObject({ statut: "succes", donnees: { numero: "R-2026-00001" } });
    const compteur = await db.compteur.findUniqueOrThrow({ where: { cle: "RECU:2026" } });

    const r = await actions.encaisser({ ...premiere, ...autre });

    expect(r.statut).toBe("erreur");
    expect(r.statut === "erreur" && normaliser(r.message)).toContain(`Ce paiement est déjà enregistré sous le reçu R-2026-00001, pour ${existant}.`);
    expect(await db.paiement.count()).toBe(1);
    expect(await db.paiementLigne.count()).toBe(1);
    expect((await db.compteur.findUniqueOrThrow({ where: { cle: "RECU:2026" } })).valeur).toBe(compteur.valeur);
  });

  it.each(cas)("$nom : la synchro refuse avec le même message qu'en ligne", async ({ base, autre }) => {
    await reserver(m.user.id, POSTE_A);
    const premiere = entree(base);
    reussi(await actions.encaisser(premiere));
    const enLigne = await actions.encaisser({ ...premiere, ...autre });
    if (enLigne.statut !== "erreur") throw new Error("refus en ligne attendu");

    const surcharge: Surcharge = { ...base, ...autre, idClient: premiere.idClient };
    const r = await synchroniserPaiement(elementHorsLigne({ etudiantId: e.etudiant.id, saisiParId: m.user.id, numeroRecu: numero(3) }, surcharge));

    expect(r).toMatchObject({ statut: "refuse", code: "INVALIDE" });
    expect(r.statut === "refuse" && r.message.endsWith(` : ${enLigne.message}`)).toBe(true);
    expect(await db.paiement.count()).toBe(1);
  });

  it.each(cas)("même saisie ($nom côté base) : la synchro rend « deja » avec le numéro du ticket du poste à remplacer", async ({ base }) => {
    await reserver(m.user.id, POSTE_A);
    const premiere = entree(base);
    reussi(await actions.encaisser(premiere));

    const r = await synchroniserPaiement(
      elementHorsLigne({ etudiantId: e.etudiant.id, saisiParId: m.user.id, numeroRecu: numero(3) }, { ...base, idClient: premiere.idClient }),
    );

    expect(r).toMatchObject({ statut: "deja", numeroRecu: "R-2026-00021", numeroRemplace: "R-2026-00003", aVerifier: false });
    expect(r.statut === "deja" && r.message).toContain("R-2026-00003");
    expect(r.statut === "deja" && r.message).toContain("R-2026-00021");
    expect(await db.paiement.count()).toBe(1);
    expect(await db.paiement.count({ where: { numeroRecu: numero(3) } })).toBe(0);
  });
});

describe("revalidation des pages après un refus d'état", () => {
  const annulation = (paiementId: string) => ({ paiementId, motif: "Saisi en double" });

  it("marquerVerifie : déjà vérifié, pas à vérifier, annulé ou introuvable revalident, la page affichée est périmée", async () => {
    const verifie = await aVerifier();
    reussi(await actions.marquerVerifie({ paiementId: verifie.id }));
    const normal = await aVerifier({ aVerifier: false });
    const annule = await aVerifier({ annule: true, annuleParId: m.admin.id, dateAnnulation: new Date(), motifAnnulation: "doublon" });

    for (const id of [verifie.id, normal.id, annule.id, "inconnu"]) {
      revaliderPagesEcolage.mockClear();

      expect((await actions.marquerVerifie({ paiementId: id })).statut, id).toBe("erreur");

      expect(revaliderPagesEcolage, id).toHaveBeenCalledTimes(1);
    }
  });

  it("annulerPaiement : déjà annulé revalide", async () => {
    const p = await aVerifier();
    reussi(await actions.annulerPaiement(annulation(p.id)));
    revaliderPagesEcolage.mockClear();

    const r = await actions.annulerPaiement(annulation(p.id));

    expect(r).toMatchObject({ statut: "erreur", message: expect.stringMatching(/déjà annulé/) });
    expect(revaliderPagesEcolage).toHaveBeenCalledTimes(1);
  });

  it("refus de rôle : rien n'est revalidé", async () => {
    const p = await aVerifier();
    connecter(getSession, m.user);

    expect((await actions.marquerVerifie({ paiementId: p.id })).statut).toBe("erreur");
    expect((await actions.annulerPaiement(annulation(p.id))).statut).toBe("erreur");

    expect(revaliderPagesEcolage).not.toHaveBeenCalled();
  });

  it("refus de validation (identifiant vide, motif trop court) : rien n'est revalidé", async () => {
    const p = await aVerifier();

    expect(await actions.marquerVerifie({ paiementId: "" })).toMatchObject({ statut: "erreur" });
    expect(await actions.annulerPaiement({ paiementId: p.id, motif: "abc" })).toMatchObject({ statut: "erreur", erreurs: { motif: expect.any(String) } });
    expect(await actions.annulerPaiement({ paiementId: "", motif: "Saisi en double" })).toMatchObject({ statut: "erreur" });

    expect(revaliderPagesEcolage).not.toHaveBeenCalled();
  });

  it("sans session : redirection vers la connexion, rien n'est revalidé", async () => {
    const p = await aVerifier();
    getSession.mockResolvedValue(null);

    await expect(actions.marquerVerifie({ paiementId: p.id })).rejects.toThrow(/NEXT_REDIRECT/);
    await expect(actions.annulerPaiement(annulation(p.id))).rejects.toThrow(/NEXT_REDIRECT/);

    expect(revaliderPagesEcolage).not.toHaveBeenCalled();
  });

  it("un succès revalide une seule fois, pour l'une comme pour l'autre action", async () => {
    const a = await aVerifier();
    const b = await aVerifier();

    reussi(await actions.marquerVerifie({ paiementId: a.id }));
    expect(revaliderPagesEcolage).toHaveBeenCalledTimes(1);
    reussi(await actions.annulerPaiement(annulation(b.id)));
    expect(revaliderPagesEcolage).toHaveBeenCalledTimes(2);
  });
});

describe("Paiements : filtre « À vérifier » (décision 43)", () => {
  const JOUR = "2026-11-15";

  it("un paiement à vérifier puis annulé sort du filtre et du compteur, mais reste à vérifier en base", async () => {
    const garde = await aVerifier({ numeroRecu: "R-2026-00001" });
    const annule = await aVerifier({ numeroRecu: "R-2026-00002" });
    expect((await lirePaiements({ statut: "aVerifier" }, JOUR)).totaux.aVerifier).toBe(2);

    expect(await actions.annulerPaiement({ paiementId: annule.id, motif: "Saisi en double" })).toMatchObject({ statut: "succes" });

    const filtre = await lirePaiements({ statut: "aVerifier" }, JOUR);
    expect(filtre.lignes.map((l) => l.id)).toEqual([garde.id]);
    expect(filtre.totaux.aVerifier).toBe(1);
    expect((await db.paiement.findUniqueOrThrow({ where: { id: annule.id } })).aVerifier).toBe(true);
  });

  it("le compteur ignore aussi les annulés quand aucun filtre de statut n'est posé", async () => {
    const annule = await aVerifier();
    await actions.annulerPaiement({ paiementId: annule.id, motif: "Saisi en double" });

    const tous = await lirePaiements({}, JOUR);

    expect(tous.totaux.aVerifier).toBe(0);
    expect(tous.lignes.map((l) => l.id)).toEqual([annule.id]);
    expect((await lirePaiements({ statut: "annules" }, JOUR)).lignes.map((l) => l.id)).toEqual([annule.id]);
  });

  it("un paiement marqué vérifié sort aussi du filtre et du compteur", async () => {
    const p = await aVerifier();
    await actions.marquerVerifie({ paiementId: p.id });

    const filtre = await lirePaiements({ statut: "aVerifier" }, JOUR);

    expect(filtre.lignes).toEqual([]);
    expect(filtre.totaux.aVerifier).toBe(0);
  });
});
