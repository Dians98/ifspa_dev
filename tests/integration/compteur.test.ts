import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cleCompteurMatricule, cleCompteurRecu } from "@/lib/matricule";
import { prochainNumero, reserverBloc, TAILLE_BLOC_MAX } from "@/server/compteur";

const trier = (n: number[]) => [...n].sort((a, b) => a - b);

describe("prochainNumero", () => {
  it("clé neuve : 1, puis 2, 3 aux appels suivants", async () => {
    const cle = cleCompteurMatricule("IF", 2026);
    const pris: number[] = [];
    for (let i = 0; i < 3; i++) pris.push(await db.$transaction((tx) => prochainNumero(tx, cle)));
    expect(pris).toEqual([1, 2, 3]);
  });

  it("10 appels concurrents dans des transactions séparées : 1 à 10, sans trou ni doublon", async () => {
    const cle = cleCompteurRecu(2026);
    const pris = await Promise.all(Array.from({ length: 10 }, () => db.$transaction((tx) => prochainNumero(tx, cle))));
    expect(trier(pris)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect((await db.compteur.findUniqueOrThrow({ where: { cle } })).valeur).toBe(10);
  });

  it("plusieurs numéros dans une même transaction sont consécutifs", async () => {
    const cle = cleCompteurRecu(2026);
    const pris = await db.$transaction(async (tx) => [await prochainNumero(tx, cle), await prochainNumero(tx, cle)]);
    expect(pris).toEqual([1, 2]);
  });

  it("rollback : le numéro pris est rendu et réattribué à l'appel suivant", async () => {
    const cle = cleCompteurMatricule("SF", 2026);
    await db.$transaction((tx) => prochainNumero(tx, cle));
    await expect(
      db.$transaction(async (tx) => {
        expect(await prochainNumero(tx, cle)).toBe(2);
        throw new Error("échec après avoir pris le numéro");
      }),
    ).rejects.toThrow(/échec/);

    expect(await db.$transaction((tx) => prochainNumero(tx, cle))).toBe(2);
    expect((await db.compteur.findUniqueOrThrow({ where: { cle } })).valeur).toBe(2);
  });

  it("des rollbacks mêlés à des succès concurrents ne laissent ni trou ni doublon", async () => {
    const cle = cleCompteurRecu(2027);
    const resultats = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        db.$transaction(async (tx) => {
          const n = await prochainNumero(tx, cle);
          if (i % 4 === 3) throw new Error("annulé");
          return n;
        }),
      ),
    );
    const reussis = resultats.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    expect(reussis).toHaveLength(6);
    expect(trier(reussis)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("chaque clé a sa propre séquence : filière, année d'entrée, reçus", async () => {
    const un = (cle: string) => db.$transaction((tx) => prochainNumero(tx, cle));
    expect(await un(cleCompteurMatricule("IF", 2026))).toBe(1);
    expect(await un(cleCompteurMatricule("IF", 2026))).toBe(2);
    expect(await un(cleCompteurMatricule("SF", 2026))).toBe(1);
    expect(await un(cleCompteurMatricule("IF", 2027))).toBe(1);
    expect(await un(cleCompteurRecu(2026))).toBe(1);
  });

  it("refuse un appel hors transaction (client global)", async () => {
    await expect(prochainNumero(db as never, "MATRICULE:IF:2026")).rejects.toThrow(/db\.\$transaction/);
    expect(await db.compteur.count()).toBe(0);
  });
});

describe("reserverBloc", () => {
  it("clé neuve : le bloc commence à 1", async () => {
    const bloc = await db.$transaction((tx) => reserverBloc(tx, "RECU:2026", 50));
    expect(bloc).toEqual({ premier: 1, dernier: 50 });
  });

  it("clé existante : le bloc suit le dernier numéro pris", async () => {
    await db.$transaction(async (tx) => {
      await prochainNumero(tx, "RECU:2026");
      await prochainNumero(tx, "RECU:2026");
    });
    const bloc = await db.$transaction((tx) => reserverBloc(tx, "RECU:2026", 10));
    expect(bloc).toEqual({ premier: 3, dernier: 12 });
    expect(await db.$transaction((tx) => prochainNumero(tx, "RECU:2026"))).toBe(13);
  });

  it("postes en parallèle : aucun chevauchement entre les blocs", async () => {
    const blocs = await Promise.all(Array.from({ length: 6 }, () => db.$transaction((tx) => reserverBloc(tx, "RECU:2026", 50))));
    const tries = [...blocs].sort((a, b) => a.premier - b.premier);
    expect(tries[0].premier).toBe(1);
    tries.forEach((b, i) => {
      expect(b.dernier - b.premier + 1).toBe(50);
      if (i > 0) expect(b.premier).toBe(tries[i - 1].dernier + 1);
    });
    expect(tries.at(-1)?.dernier).toBe(300);
  });

  it("blocs réservés et numéros pris au fil de l'eau en parallèle : aucun numéro attribué deux fois", async () => {
    const [b1, b2, ...seuls] = await Promise.all([
      db.$transaction((tx) => reserverBloc(tx, "RECU:2026", 5)),
      db.$transaction((tx) => reserverBloc(tx, "RECU:2026", 5)),
      ...Array.from({ length: 5 }, () => db.$transaction((tx) => prochainNumero(tx, "RECU:2026"))),
    ]);
    const tous = [
      ...Array.from({ length: 5 }, (_, i) => b1.premier + i),
      ...Array.from({ length: 5 }, (_, i) => b2.premier + i),
      ...seuls,
    ];
    expect(trier(tous)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
  });

  it("rollback : le bloc réservé est rendu", async () => {
    await expect(
      db.$transaction(async (tx) => {
        await reserverBloc(tx, "RECU:2026", 20);
        throw new Error("échec");
      }),
    ).rejects.toThrow(/échec/);
    expect(await db.$transaction((tx) => reserverBloc(tx, "RECU:2026", 20))).toEqual({ premier: 1, dernier: 20 });
  });

  it("refuse une taille de bloc invalide, sans toucher au compteur", async () => {
    for (const taille of [0, -1, 1.5, TAILLE_BLOC_MAX + 1]) {
      await expect(db.$transaction((tx) => reserverBloc(tx, "RECU:2026", taille)), String(taille)).rejects.toThrow(RangeError);
    }
    expect(await db.compteur.count()).toBe(0);
    expect(await db.$transaction((tx) => reserverBloc(tx, "RECU:2026", TAILLE_BLOC_MAX))).toEqual({
      premier: 1,
      dernier: TAILLE_BLOC_MAX,
    });
  });

  it("refuse un appel hors transaction", async () => {
    await expect(reserverBloc(db as never, "RECU:2026", 10)).rejects.toThrow(/db\.\$transaction/);
    expect(await db.compteur.count()).toBe(0);
  });
});
