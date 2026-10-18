import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { PLAFOND_NUMEROS_LIBRES, SEUIL_RECHARGE, TAILLE_BLOC } from "@/lib/encaissement-hors-ligne";
import { cleCompteurRecu } from "@/lib/matricule";
import { etatBlocsPoste, numeroAppartientAuPoste, rechargerBlocsPoste, reserverBlocRecus } from "@/server/blocs-recus";
import { prochainNumero } from "@/server/compteur";
import { fabriquerUtilisateur } from "../factories";
import { numero, occuper, POSTE_A, POSTE_B } from "../factories/hors-ligne";
import { fabriquerEtudiantInscrit, fabriquerMonde, type Monde } from "../factories/scenarios";

const TARIF = { niveau: 1, droitsInscription: 100_000, montantMensuel: 80_000, nombreMois: 10 };

let m: Monde;
let etudiantId: string;

beforeEach(async () => {
  m = await fabriquerMonde();
  etudiantId = (await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF)).etudiant.id;
});

const reserverBrut = (userId: string, poste: string, annee = 2026) =>
  db.$transaction((tx) => reserverBlocRecus(tx, userId, poste, annee));

const compteur = async (annee = 2026) => (await db.compteur.findUnique({ where: { cle: cleCompteurRecu(annee) } }))?.valeur ?? 0;

describe("reserverBlocRecus", () => {
  it("réserve un bloc de 20 numéros consécutifs, tous libres", async () => {
    const { bloc, libres } = await reserverBrut(m.user.id, POSTE_A);

    expect(bloc).toMatchObject({ annee: 2026, cle: "RECU:2026", premier: 1, dernier: TAILLE_BLOC });
    expect(bloc?.libres).toHaveLength(TAILLE_BLOC);
    expect(libres).toBe(TAILLE_BLOC);
    expect(await db.blocNumeros.count()).toBe(1);
  });

  it("réservations simultanées de postes et d'utilisateurs différents : blocs disjoints, sans trou", async () => {
    const autres = await Promise.all([fabriquerUtilisateur("user"), fabriquerUtilisateur("user")]);
    const demandes = [
      [m.user.id, POSTE_A],
      [m.user.id, POSTE_B],
      [autres[0].id, POSTE_A],
      [autres[1].id, POSTE_B],
      [m.admin.id, POSTE_A],
      [m.admin.id, POSTE_B],
    ] as const;

    const resultats = await Promise.all(demandes.map(([u, p]) => reserverBrut(u, p)));

    const numeros = resultats.flatMap((r) => r.bloc?.libres ?? []).sort((a, b) => a - b);
    expect(numeros).toEqual(Array.from({ length: 6 * TAILLE_BLOC }, (_, i) => i + 1));
    expect(await compteur()).toBe(6 * TAILLE_BLOC);
  });

  it("plafond de 40 numéros libres : un 3e bloc est refusé, sans consommer de numéros", async () => {
    await reserverBrut(m.user.id, POSTE_A);
    await reserverBrut(m.user.id, POSTE_A);

    const troisieme = await reserverBrut(m.user.id, POSTE_A);

    expect(PLAFOND_NUMEROS_LIBRES).toBe(40);
    expect(troisieme).toEqual({ bloc: null, libres: 40 });
    expect(await compteur()).toBe(40);
    expect(await db.blocNumeros.count()).toBe(2);
  });

  it("plafond par poste ET par utilisateur : un autre caissier, un autre poste ou une autre année reste servi", async () => {
    await reserverBrut(m.user.id, POSTE_A);
    await reserverBrut(m.user.id, POSTE_A);

    expect((await reserverBrut(m.admin.id, POSTE_A)).bloc).not.toBeNull();
    expect((await reserverBrut(m.user.id, POSTE_B)).bloc).not.toBeNull();
    expect((await reserverBrut(m.user.id, POSTE_A, 2027)).bloc).not.toBeNull();
  });

  it("plafond tenu en concurrence : 6 demandes simultanées du même poste et utilisateur, 2 blocs au plus", async () => {
    const resultats = await Promise.all(Array.from({ length: 6 }, () => reserverBrut(m.user.id, POSTE_A)));

    expect(resultats.filter((r) => r.bloc)).toHaveLength(2);
    expect(await compteur()).toBe(40);
    expect(await db.blocNumeros.count()).toBe(2);
  });

  it("les numéros utilisés libèrent de la place sous le plafond", async () => {
    const { bloc } = await reserverBrut(m.user.id, POSTE_A);
    await reserverBrut(m.user.id, POSTE_A);
    await occuper(etudiantId, m.user.id, bloc!.libres.slice(0, 19));
    expect((await reserverBrut(m.user.id, POSTE_A)).bloc).toBeNull();

    await occuper(etudiantId, m.user.id, [bloc!.libres[19]]);

    const r = await reserverBrut(m.user.id, POSTE_A);
    expect(r.bloc).toMatchObject({ premier: 41, dernier: 60 });
    expect(r.libres).toBe(40);
  });

  it("un numéro pris en ligne ne tombe jamais dans un bloc, ni avant ni après", async () => {
    const enLigne = (await Promise.all(Array.from({ length: 4 }, () => db.$transaction((tx) => prochainNumero(tx, "RECU:2026")))));
    const bloc = (await reserverBrut(m.user.id, POSTE_A)).bloc!;
    const apres = await db.$transaction((tx) => prochainNumero(tx, "RECU:2026"));

    expect(enLigne.sort()).toEqual([1, 2, 3, 4]);
    expect([bloc.premier, bloc.dernier]).toEqual([5, 24]);
    expect(apres).toBe(25);
  });

  it("prochainNumero en ligne et réservations de blocs en parallèle : aucun numéro commun", async () => {
    const [b1, b2, ...enLigne] = await Promise.all([
      reserverBrut(m.user.id, POSTE_A),
      reserverBrut(m.user.id, POSTE_B),
      ...Array.from({ length: 5 }, () => db.$transaction((tx) => prochainNumero(tx, "RECU:2026"))),
    ]);

    const tous = [...b1.bloc!.libres, ...b2.bloc!.libres, ...enLigne];
    expect(new Set(tous).size).toBe(tous.length);
    expect(tous.length).toBe(2 * TAILLE_BLOC + 5);
    expect(Math.max(...tous)).toBe(tous.length);
  });

  it("rollback : la transaction annulée rend ses numéros et ne laisse aucun bloc", async () => {
    await expect(
      db.$transaction(async (tx) => {
        await reserverBlocRecus(tx, m.user.id, POSTE_A, 2026);
        throw new Error("échec après la réservation");
      }),
    ).rejects.toThrow(/échec/);

    expect(await db.blocNumeros.count()).toBe(0);
    expect(await compteur()).toBe(0);
    expect((await reserverBrut(m.user.id, POSTE_A)).bloc).toMatchObject({ premier: 1, dernier: 20 });
  });

  it("au-delà de 99 999 reçus dans l'année : RangeError, compteur et blocs inchangés", async () => {
    await db.compteur.create({ data: { cle: "RECU:2026", valeur: 99_990 } });

    await expect(reserverBrut(m.user.id, POSTE_A)).rejects.toThrow(RangeError);

    expect(await compteur()).toBe(99_990);
    expect(await db.blocNumeros.count()).toBe(0);
  });
});

describe("etatBlocsPoste", () => {
  it("déduit les numéros déjà pris, annulés compris, et n'affiche que les blocs qui ont encore des libres", async () => {
    const { bloc } = await reserverBrut(m.user.id, POSTE_A);
    await occuper(etudiantId, m.user.id, [3]);
    await occuper(etudiantId, m.user.id, [4], { annule: true });

    const etat = await etatBlocsPoste(POSTE_A, m.user.id);

    expect(etat.annees).toHaveLength(1);
    expect(etat.annees[0]).toMatchObject({ annee: 2026, libres: 18 });
    expect(etat.annees[0].blocs[0].libres).toEqual(bloc!.libres.filter((n) => n !== 3 && n !== 4));
  });

  it("un bloc entièrement consommé disparaît de l'état", async () => {
    const { bloc } = await reserverBrut(m.user.id, POSTE_A);
    await occuper(etudiantId, m.user.id, bloc!.libres);

    const etat = await etatBlocsPoste(POSTE_A, m.user.id, [2026]);

    expect(etat.annees).toEqual([{ annee: 2026, cle: "RECU:2026", libres: 0, blocs: [] }]);
  });

  it("ne montre que les blocs de ce poste et de cet utilisateur", async () => {
    await reserverBrut(m.user.id, POSTE_A);
    await reserverBrut(m.user.id, POSTE_B);
    await reserverBrut(m.admin.id, POSTE_A);

    const etat = await etatBlocsPoste(POSTE_A, m.user.id);

    expect(etat.annees[0].blocs).toHaveLength(1);
    expect(etat.annees[0].blocs[0]).toMatchObject({ premier: 1, dernier: 20 });
  });

  it("sans année demandée, liste les années qui ont un bloc, de la plus ancienne à la plus récente", async () => {
    await reserverBrut(m.user.id, POSTE_A, 2027);
    await reserverBrut(m.user.id, POSTE_A, 2026);

    expect((await etatBlocsPoste(POSTE_A, m.user.id)).annees.map((a) => a.annee)).toEqual([2026, 2027]);
  });
});

describe("rechargerBlocsPoste", () => {
  it("poste vide : un premier bloc est réservé", async () => {
    const etat = await rechargerBlocsPoste(m.user.id, POSTE_A, "2026-11-15");

    expect(etat.annees).toHaveLength(1);
    expect(etat.annees[0]).toMatchObject({ annee: 2026, libres: TAILLE_BLOC });
  });

  it("au seuil de 10 numéros libres : pas de recharge ; en dessous : un bloc de plus", async () => {
    const { bloc } = await reserverBrut(m.user.id, POSTE_A);
    await occuper(etudiantId, m.user.id, bloc!.libres.slice(0, TAILLE_BLOC - SEUIL_RECHARGE));

    const auSeuil = await rechargerBlocsPoste(m.user.id, POSTE_A, "2026-11-15");
    expect(auSeuil.annees[0].libres).toBe(SEUIL_RECHARGE);
    expect(await db.blocNumeros.count()).toBe(1);

    await occuper(etudiantId, m.user.id, [bloc!.libres[TAILLE_BLOC - SEUIL_RECHARGE]]);
    const dessous = await rechargerBlocsPoste(m.user.id, POSTE_A, "2026-11-15");
    expect(dessous.annees[0].libres).toBe(SEUIL_RECHARGE - 1 + TAILLE_BLOC);
    expect(await db.blocNumeros.count()).toBe(2);
  });

  it("deux recharges de suite : la seconde ne réserve rien", async () => {
    await rechargerBlocsPoste(m.user.id, POSTE_A, "2026-11-15");
    await rechargerBlocsPoste(m.user.id, POSTE_A, "2026-11-15");

    expect(await db.blocNumeros.count()).toBe(1);
    expect(await compteur()).toBe(TAILLE_BLOC);
  });

  it("recharges simultanées du même poste : un seul bloc réservé (le seuil est relu sous verrou)", async () => {
    await Promise.all(Array.from({ length: 4 }, () => rechargerBlocsPoste(m.user.id, POSTE_A, "2026-11-15")));

    expect(await db.blocNumeros.count()).toBe(1);
  });

  it("recharges simultanées : le plafond tient et aucun numéro n'est réservé deux fois", async () => {
    await Promise.all(Array.from({ length: 6 }, () => rechargerBlocsPoste(m.user.id, POSTE_A, "2026-11-15")));

    const etat = await etatBlocsPoste(POSTE_A, m.user.id, [2026]);
    const numeros = etat.annees[0].blocs.flatMap((b) => b.libres);
    expect(numeros.length).toBeLessThanOrEqual(PLAFOND_NUMEROS_LIBRES);
    expect(new Set(numeros).size).toBe(numeros.length);
  });

  it("au 30 novembre, seule l'année en cours est servie ; dès le 1er décembre, l'année suivante aussi", async () => {
    const novembre = await rechargerBlocsPoste(m.user.id, POSTE_A, "2026-11-30");
    expect(novembre.annees.map((a) => a.annee)).toEqual([2026]);
    expect(await compteur(2027)).toBe(0);

    const decembre = await rechargerBlocsPoste(m.user.id, POSTE_A, "2026-12-01");
    expect(decembre.annees.map((a) => [a.annee, a.libres])).toEqual([[2026, TAILLE_BLOC], [2027, TAILLE_BLOC]]);
    expect(await compteur(2027)).toBe(TAILLE_BLOC);
  });
});

describe("numeroAppartientAuPoste", () => {
  it("rend le bloc du poste qui contient le numéro, null pour un autre poste, un numéro hors bloc ou un format invalide", async () => {
    await reserverBrut(m.user.id, POSTE_A);
    const chercher = (poste: string, n: string) => db.$transaction((tx) => numeroAppartientAuPoste(tx, poste, n));

    expect(await chercher(POSTE_A, numero(12))).toMatchObject({ reserveParId: m.user.id });
    expect(await chercher(POSTE_B, numero(12))).toBeNull();
    expect(await chercher(POSTE_A, numero(21))).toBeNull();
    expect(await chercher(POSTE_A, "R-2027-00012")).toBeNull();
    expect(await chercher(POSTE_A, "n'importe quoi")).toBeNull();
  });
});
