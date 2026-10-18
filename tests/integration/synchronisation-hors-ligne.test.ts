import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { synchroniserPaiement } from "@/server/paiements";
import { fabriquerPaiement, fabriquerUtilisateur } from "../factories";
import {
  designation,
  elementHorsLigne,
  normaliser,
  numero,
  occuper,
  POSTE_A,
  POSTE_B,
  RECU_LE,
  reserver,
  type Surcharge,
} from "../factories/hors-ligne";
import { fabriquerEtudiantInscrit, fabriquerMonde, type Monde } from "../factories/scenarios";

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const TARIF = { niveau: 1, droitsInscription: 100_000, montantMensuel: 80_000, nombreMois: 10 };

let m: Monde;
let e: Awaited<ReturnType<typeof fabriquerEtudiantInscrit>>;

beforeEach(async () => {
  m = await fabriquerMonde();
  e = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF);
});

const compteurRecu = async () => (await db.compteur.findUnique({ where: { cle: "RECU:2026" } }))?.valeur ?? 0;
const paiements = () => db.paiement.findMany({ orderBy: { numeroRecu: "asc" }, include: { lignes: true } });

/** Envoi d'un paiement de `m.user` avec un numéro du bloc réservé par POSTE_A. */
const envoyer = (n: number, surcharge: Parameters<typeof elementHorsLigne>[1] = {}, id = e.etudiant.id) =>
  synchroniserPaiement(elementHorsLigne({ etudiantId: id, saisiParId: m.user.id, numeroRecu: numero(n) }, surcharge));

describe("synchroniserPaiement : enregistrement normal", () => {
  it("enregistre avec le numéro du bloc, l'heure du poste, sans toucher au compteur ni marquer à vérifier", async () => {
    await reserver(m.user.id, POSTE_A);

    const r = await envoyer(3, { montant: 100_000, resteDuAffiche: 900_000 });

    expect(r).toMatchObject({ statut: "enregistre", numeroRecu: "R-2026-00003", numeroRemplace: null, aVerifier: false });
    const [p] = await paiements();
    expect(p).toMatchObject({
      numeroRecu: "R-2026-00003",
      montant: 100_000,
      aVerifier: false,
      noteVerification: null,
      saisiParId: m.user.id,
      resteApres: 800_000,
    });
    expect(p.date.toISOString()).toBe("2026-11-15T09:00:00.000Z");
    expect(p.lignes).toHaveLength(1);
    expect(await compteurRecu()).toBe(20);
  });

  it("deux paiements du même étudiant dans l'ordre : le second part des restes déjà diminués, sans note", async () => {
    await reserver(m.user.id, POSTE_A);

    await envoyer(1, { montant: 100_000, resteDuAffiche: 900_000 });
    const r = await envoyer(2, { montant: 100_000, resteDuAffiche: 800_000 });

    expect(r).toMatchObject({ statut: "enregistre", aVerifier: false });
    const [, second] = await paiements();
    expect(second.lignes.map((l) => l.montant).sort()).toEqual([20_000, 80_000]);
  });
});

describe("synchroniserPaiement : idempotence", () => {
  it("un renvoi du même idClient rend « deja » et ne crée qu'un seul paiement", async () => {
    await reserver(m.user.id, POSTE_A);
    const element = elementHorsLigne({ etudiantId: e.etudiant.id, saisiParId: m.user.id, numeroRecu: numero(1) });

    const premier = await synchroniserPaiement(element);
    const second = await synchroniserPaiement(element);

    expect(premier).toMatchObject({ statut: "enregistre" });
    expect(second).toMatchObject({ statut: "deja", numeroRecu: "R-2026-00001", numeroRemplace: null });
    expect(await db.paiement.count()).toBe(1);
    expect(await db.paiementLigne.count()).toBe(1);
  });

  it("envois simultanés du même paiement : un seul enregistré, les autres « deja »", async () => {
    await reserver(m.user.id, POSTE_A);
    const element = elementHorsLigne({ etudiantId: e.etudiant.id, saisiParId: m.user.id, numeroRecu: numero(1) });

    const resultats = await Promise.all(Array.from({ length: 6 }, () => synchroniserPaiement(element)));

    expect(resultats.filter((r) => r.statut === "enregistre")).toHaveLength(1);
    expect(resultats.filter((r) => r.statut === "deja")).toHaveLength(5);
    expect(new Set(resultats.map((r) => r.statut === "refuse" ? "" : r.paiementId)).size).toBe(1);
    expect(await db.paiement.count()).toBe(1);
  });

  it("renvoi après remplacement du numéro : « deja » avec le numéro du ticket remis en numeroRemplace", async () => {
    await reserver(m.user.id, POSTE_A);
    const element = elementHorsLigne({ etudiantId: e.etudiant.id, saisiParId: m.user.id, numeroRecu: numero(500) });

    const premier = await synchroniserPaiement(element);
    const renvoi = await synchroniserPaiement(element);

    expect(premier).toMatchObject({ statut: "enregistre", numeroRemplace: "R-2026-00500", numeroRecu: "R-2026-00021" });
    expect(renvoi).toMatchObject({ statut: "deja", numeroRecu: "R-2026-00021", numeroRemplace: "R-2026-00500", aVerifier: true });
    expect(await db.paiement.count()).toBe(1);
  });

  it("idClient déjà servi pour un autre étudiant : refusé, rien d'enregistré", async () => {
    await reserver(m.user.id, POSTE_A);
    const autre = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF);
    const element = elementHorsLigne({ etudiantId: e.etudiant.id, saisiParId: m.user.id, numeroRecu: numero(1) });
    await synchroniserPaiement(element);

    const r = await synchroniserPaiement({ ...element, etudiantId: autre.etudiant.id, numeroRecu: numero(2) });

    expect(r).toMatchObject({ statut: "refuse", code: "INVALIDE" });
    const message = r.statut === "refuse" ? normaliser(r.message) : "";
    expect(message.startsWith(`${designation(numero(2), 80_000, autre.etudiant)}Cet identifiant de paiement a déjà servi`)).toBe(true);
    expect(await db.paiement.count()).toBe(1);
  });
});

describe("synchroniserPaiement : même idClient avec une autre saisie", () => {
  const MVOLA: Surcharge = { mode: "MOBILE_MONEY", operateur: "MVOLA", reference: "MV-1" };
  const cas: { nom: string; base: Surcharge; autre: Surcharge; existant: string }[] = [
    { nom: "autre montant", base: {}, autre: { montant: 90_000 }, existant: "80 000 Ar en espèces" },
    { nom: "autre mode", base: {}, autre: MVOLA, existant: "80 000 Ar en espèces" },
    { nom: "autre opérateur", base: MVOLA, autre: { operateur: "ORANGE_MONEY" }, existant: "80 000 Ar en MVola" },
    { nom: "autre référence", base: MVOLA, autre: { reference: "MV-2" }, existant: "80 000 Ar en MVola" },
    { nom: "espèces au lieu de Mobile Money", base: MVOLA, autre: { mode: "ESPECES", operateur: null, reference: null }, existant: "80 000 Ar en MVola" },
  ];

  beforeEach(async () => {
    await reserver(m.user.id, POSTE_A);
  });

  it.each(cas)("$nom : refusé INVALIDE sous le reçu existant, rien n'est créé ni consommé", async ({ base, autre, existant }) => {
    const original = elementHorsLigne({ etudiantId: e.etudiant.id, saisiParId: m.user.id, numeroRecu: numero(1) }, base);
    await synchroniserPaiement(original);
    const avant = { paiements: await paiements(), compteur: await compteurRecu() };

    const r = await synchroniserPaiement({ ...original, ...autre, numeroRecu: numero(2) });

    expect(r).toMatchObject({ statut: "refuse", code: "INVALIDE" });
    const message = r.statut === "refuse" ? normaliser(r.message) : "";
    expect(message.startsWith(designation(numero(2), autre.montant ?? 80_000, e.etudiant))).toBe(true);
    expect(message).toContain(`Ce paiement est déjà enregistré sous le reçu R-2026-00001, pour ${existant}.`);
    expect(await paiements()).toEqual(avant.paiements);
    expect(await compteurRecu()).toBe(avant.compteur);
    expect(await synchroniserPaiement(original)).toMatchObject({ statut: "deja", numeroRecu: "R-2026-00001" });
  });

  it("deux envois simultanés du même idClient avec des montants différents : un seul enregistré, l'autre refusé", async () => {
    const original = elementHorsLigne({ etudiantId: e.etudiant.id, saisiParId: m.user.id, numeroRecu: numero(1) });

    const resultats = await Promise.all([
      synchroniserPaiement(original),
      synchroniserPaiement({ ...original, montant: 90_000, numeroRecu: numero(2) }),
    ]);

    expect(resultats.map((r) => r.statut).sort()).toEqual(["enregistre", "refuse"]);
    expect(await db.paiement.count()).toBe(1);
    expect(await db.paiementLigne.count()).toBe(1);
  });
});

describe("synchroniserPaiement : numéro refusé (décision 40)", () => {
  /** Un numéro refusé est remplacé par le suivant du compteur en ligne : le bloc réservé a épuisé 1 à 20. */
  async function verifierRemplace(r: Awaited<ReturnType<typeof envoyer>>, refuse: string, raison: RegExp, nouveau = numero(21)) {
    expect(r).toMatchObject({ statut: "enregistre", numeroRemplace: refuse, numeroRecu: nouveau, aVerifier: true });
    const p = await db.paiement.findUniqueOrThrow({ where: { numeroRecu: nouveau } });
    expect(p.aVerifier).toBe(true);
    expect(p.noteVerification).toMatch(new RegExp(`^Ticket remis n° ${refuse} refusé : `));
    expect(p.noteVerification).toMatch(raison);
    expect(await db.paiement.count({ where: { idClient: p.idClient, numeroRecu: refuse } })).toBe(0);
  }

  beforeEach(async () => {
    await reserver(m.user.id, POSTE_A);
  });

  it("format invalide", async () => {
    const r = await synchroniserPaiement(
      elementHorsLigne({ etudiantId: e.etudiant.id, saisiParId: m.user.id, numeroRecu: "TICKET-12" }),
    );

    await verifierRemplace(r, "TICKET-12", /format invalide/);
  });

  it("hors de tout bloc réservé", async () => {
    const r = await envoyer(500);
    await verifierRemplace(r, "R-2026-00500", /aucun bloc/);
  });

  it("bloc d'un autre poste", async () => {
    await reserver(m.user.id, POSTE_B);

    const r = await envoyer(25);

    await verifierRemplace(r, "R-2026-00025", /autre poste/, numero(41));
  });

  it("bloc d'un autre utilisateur du même poste", async () => {
    const autre = await fabriquerUtilisateur("user", { name: "Autre caissier" });
    await reserver(autre.id, POSTE_A);

    const r = await envoyer(25);

    await verifierRemplace(r, "R-2026-00025", /autre utilisateur/, numero(41));
  });

  it("déjà pris par un autre paiement", async () => {
    await occuper(e.etudiant.id, m.user.id, [4]);

    const r = await envoyer(4);

    await verifierRemplace(r, "R-2026-00004", /déjà utilisé/);
  });

  it("déjà pris par un paiement annulé : un numéro annulé reste pris", async () => {
    await occuper(e.etudiant.id, m.user.id, [4], { annule: true });

    const r = await envoyer(4);

    await verifierRemplace(r, "R-2026-00004", /déjà utilisé/);
  });

  it("année du numéro incohérente avec l'heure de la saisie : nouveau numéro de l'année de la saisie", async () => {
    const r = await envoyer(5, { instantSaisie: "2026-12-31T22:00:00.000Z", recuLe: new Date("2027-01-02T09:00:00Z") });

    await verifierRemplace(r, "R-2026-00005", /année de la saisie/, numero(1, 2027));
  });

  it("les remplacements suivent le compteur en ligne, sans trou ni doublon", async () => {
    const resultats = [await envoyer(500), await envoyer(501), await envoyer(502, { montant: 10_000 })];

    expect(resultats.map((r) => r.statut === "enregistre" && r.numeroRecu)).toEqual(["R-2026-00021", "R-2026-00022", "R-2026-00023"]);
    expect(await compteurRecu()).toBe(23);
  });

  it("deux paiements simultanés sur le même numéro du bloc : l'un le garde, l'autre est remplacé", async () => {
    const autre = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF);

    const [a, b] = await Promise.all([envoyer(7), envoyer(7, {}, autre.etudiant.id)]);

    expect([a, b].map((r) => r.statut)).toEqual(["enregistre", "enregistre"]);
    const numeros = [a, b].map((r) => (r.statut === "enregistre" ? r.numeroRecu : ""));
    expect(new Set(numeros).size).toBe(2);
    expect(numeros).toContain("R-2026-00007");
    expect([a, b].filter((r) => r.statut === "enregistre" && r.numeroRemplace === "R-2026-00007")).toHaveLength(1);
    expect(await db.paiement.count()).toBe(2);
  });

  it("deux paiements simultanés avec deux numéros différents du bloc : chacun garde le sien", async () => {
    const autre = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF);

    const resultats = await Promise.all([envoyer(8), envoyer(9, {}, autre.etudiant.id)]);

    expect(resultats.map((r) => r.statut === "enregistre" && [r.numeroRecu, r.numeroRemplace, r.aVerifier])).toEqual([
      ["R-2026-00008", null, false],
      ["R-2026-00009", null, false],
    ]);
  });
});

describe("synchroniserPaiement : situation changée et trop-perçu", () => {
  beforeEach(async () => {
    await reserver(m.user.id, POSTE_A);
  });

  /** Solde toutes les échéances sauf `reste` ariary sur la dernière. */
  async function solderSauf(reste: number) {
    const echeances = e.inscription.echeances;
    const derniere = echeances[echeances.length - 1];
    await fabriquerPaiement(
      e.etudiant.id,
      m.user.id,
      echeances.map((x) => ({ echeanceId: x.id, montant: x === derniere ? x.montantDu - reste : x.montantDu })),
    );
  }

  it("reste dû différent de celui affiché au poste : enregistré, à vérifier, avec la note", async () => {
    await fabriquerPaiement(e.etudiant.id, m.admin.id, [{ echeanceId: e.inscription.echeances[0].id, montant: 100_000 }]);

    const r = await envoyer(1, { montant: 80_000, resteDuAffiche: 900_000 });

    expect(r).toMatchObject({ statut: "enregistre", aVerifier: true, numeroRemplace: null });
    const p = await db.paiement.findUniqueOrThrow({ where: { numeroRecu: "R-2026-00001" }, include: { lignes: true } });
    expect(p.noteVerification).toMatch(/Situation changée avant la synchronisation/);
    expect(p.montant).toBe(80_000);
    expect(p.lignes.reduce((s, l) => s + l.montant, 0)).toBe(80_000);
    expect(p.resteApres).toBe(720_000);
  });

  it("trop-perçu : imputé jusqu'au reste, montant au-delà des lignes, reste après 0, surplus noté", async () => {
    await solderSauf(50_000);

    const r = await envoyer(1, { montant: 80_000, resteDuAffiche: 80_000 });

    expect(r).toMatchObject({ statut: "enregistre", aVerifier: true });
    const p = await db.paiement.findUniqueOrThrow({ where: { numeroRecu: "R-2026-00001" }, include: { lignes: true } });
    expect(p.montant).toBe(80_000);
    expect(p.lignes.map((l) => l.montant)).toEqual([50_000]);
    expect(p).toMatchObject({ resteApres: 0, retardApres: 0 });
    expect(p.noteVerification).toMatch(/Surplus non imputé de .*30\s?000/);
  });

  it("reste dû nul : le paiement est conservé, sans aucune ligne", async () => {
    await solderSauf(0);

    const r = await envoyer(1, { montant: 10_000, resteDuAffiche: 0 });

    expect(r).toMatchObject({ statut: "enregistre", aVerifier: true });
    const p = await db.paiement.findUniqueOrThrow({ where: { numeroRecu: "R-2026-00001" }, include: { lignes: true } });
    expect(p).toMatchObject({ montant: 10_000, resteApres: 0, retardApres: 0 });
    expect(p.lignes).toEqual([]);
    expect(p.noteVerification).toMatch(/Surplus non imputé/);
  });

  it("un trop-perçu n'est jamais imputé au-delà du dû : la somme des lignes égale la somme des échéances", async () => {
    await solderSauf(50_000);
    await envoyer(1, { montant: 80_000, resteDuAffiche: 80_000 });

    const lignes = await db.paiementLigne.aggregate({ _sum: { montant: true } });
    const du = await db.echeance.aggregate({ _sum: { montantDu: true } });

    expect(lignes._sum.montant).toBe(du._sum.montantDu);
  });
});

describe("synchroniserPaiement : heure du poste", () => {
  beforeEach(async () => {
    await reserver(m.user.id, POSTE_A);
  });

  it("heure plus de 10 min après la réception : heure de synchronisation retenue, à vérifier, numéro conservé", async () => {
    const r = await envoyer(1, { instantSaisie: "2026-11-15T10:00:00.000Z" });

    expect(r).toMatchObject({ statut: "enregistre", numeroRecu: "R-2026-00001", numeroRemplace: null, aVerifier: true });
    const p = await db.paiement.findUniqueOrThrow({ where: { numeroRecu: "R-2026-00001" } });
    expect(p.date.toISOString()).toBe(RECU_LE.toISOString());
    expect(p.noteVerification).toMatch(/Heure du poste incohérente/);
  });

  it("heure antérieure de plus de 10 min à la réservation du bloc : heure de synchronisation retenue", async () => {
    const r = await envoyer(1, { instantSaisie: "2026-11-15T07:00:00.000Z" });

    expect(r).toMatchObject({ statut: "enregistre", aVerifier: true });
    const p = await db.paiement.findUniqueOrThrow({ where: { numeroRecu: "R-2026-00001" } });
    expect(p.date.toISOString()).toBe(RECU_LE.toISOString());
    expect(p.noteVerification).toMatch(/Heure du poste incohérente/);
  });

  it("tolérance de 10 min : une heure juste dans la marge est gardée", async () => {
    const r = await envoyer(1, { instantSaisie: "2026-11-15T09:40:00.000Z" });

    expect(r).toMatchObject({ statut: "enregistre", aVerifier: false });
    expect((await db.paiement.findUniqueOrThrow({ where: { numeroRecu: "R-2026-00001" } })).date.toISOString()).toBe("2026-11-15T09:40:00.000Z");
  });

  it("les restes sont calculés au jour de l'instant du poste, pas à celui de la synchronisation", async () => {
    await db.blocNumeros.updateMany({ data: { createdAt: new Date("2026-10-30T00:00:00Z") } });

    await envoyer(1, { montant: 100_000, instantSaisie: "2026-10-31T09:00:00.000Z" });
    await envoyer(2, { montant: 100_000, resteDuAffiche: 800_000, instantSaisie: "2026-11-15T09:00:00.000Z" });

    const avantRetard = await db.paiement.findUniqueOrThrow({ where: { numeroRecu: "R-2026-00001" } });
    const apresRetard = await db.paiement.findUniqueOrThrow({ where: { numeroRecu: "R-2026-00002" } });
    expect(avantRetard).toMatchObject({ resteApres: 800_000, retardApres: 0, aVerifier: false });
    expect(apresRetard.retardApres).toBe(0);
    expect(apresRetard.resteApres).toBe(700_000);
  });

  it("à la mi-novembre, l'octobre non soldé est en retard sur le reste figé", async () => {
    await envoyer(1, { montant: 100_000 });

    const p = await db.paiement.findUniqueOrThrow({ where: { numeroRecu: "R-2026-00001" } });
    expect(p).toMatchObject({ resteApres: 800_000, retardApres: 80_000 });
  });
});

describe("synchroniserPaiement : refus", () => {
  beforeEach(async () => {
    await reserver(m.user.id, POSTE_A);
  });

  const messageDe = (r: Awaited<ReturnType<typeof envoyer>>) => (r.statut === "refuse" ? normaliser(r.message) : "");

  it("montant nul refusé, rien d'enregistré, message précédé du ticket et de l'étudiant (sans montant)", async () => {
    const r = await envoyer(1, { montant: 0 });

    expect(r).toMatchObject({ statut: "refuse", code: "INVALIDE" });
    expect(messageDe(r)).toBe(`${designation(numero(1), null, e.etudiant)}Le montant doit être supérieur à 0.`);
    expect(await db.paiement.count()).toBe(0);
  });

  it("étudiant disparu : refusé INTROUVABLE, message précédé du ticket et du montant, sans nom", async () => {
    const r = await envoyer(1, {}, "etudiant-inexistant");

    expect(r).toMatchObject({ statut: "refuse", code: "INTROUVABLE" });
    expect(messageDe(r)).toBe(`${designation(numero(1), 80_000, null)}Cet étudiant n'existe plus. Rechargez la page.`);
    expect(await db.paiement.count()).toBe(0);
  });

  it("un refus n'empêche pas l'élément suivant, et ne consomme aucun numéro", async () => {
    const refus = await envoyer(1, { montant: 0 });
    const ok = await envoyer(1, { montant: 80_000 });

    expect(refus.statut).toBe("refuse");
    expect(ok).toMatchObject({ statut: "enregistre", numeroRecu: "R-2026-00001" });
    expect(await compteurRecu()).toBe(20);
  });

  it("identifiant de paiement différent mais même numéro de bloc deux fois pour le même étudiant : un seul numéro gardé", async () => {
    const a = await synchroniserPaiement(elementHorsLigne({ etudiantId: e.etudiant.id, saisiParId: m.user.id, numeroRecu: numero(3), montant: 10_000, resteDuAffiche: 900_000 }));
    const b = await synchroniserPaiement({
      ...elementHorsLigne({ etudiantId: e.etudiant.id, saisiParId: m.user.id, numeroRecu: numero(3), montant: 10_000, resteDuAffiche: 890_000 }),
      idClient: randomUUID(),
    });

    expect(a).toMatchObject({ numeroRecu: "R-2026-00003", numeroRemplace: null });
    expect(b).toMatchObject({ numeroRemplace: "R-2026-00003", aVerifier: true });
    expect(await db.paiement.count()).toBe(2);
  });
});
