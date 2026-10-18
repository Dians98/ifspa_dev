import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { Jour } from "@/lib/dates";
import {
  anneesABloquer,
  PLAFOND_NUMEROS_LIBRES,
  SEUIL_RECHARGE,
  TAILLE_BLOC,
  type BlocRecus,
  type EtatBlocsPoste,
} from "@/lib/encaissement-hors-ligne";
import { cleCompteurRecu, formaterNumeroRecu, lireNumeroRecu } from "@/lib/matricule";
import { reserverBloc } from "@/server/compteur";
import { OPTIONS_TRANSACTION } from "@/server/ecolage";

// Blocs de numéros de reçu des postes hors ligne. Ils sont tirés du même Compteur « RECU:{année} »
// que `prochainNumero` en ligne : un numéro de bloc n'est donc jamais réattribué en ligne.

type Client = Prisma.TransactionClient | typeof db;

export type BlocLu = { id: string; cle: string; premier: number; dernier: number };

const SELECT_BLOC = { id: true, cle: true, premier: true, dernier: true } as const;

/** Numéros de ces blocs déjà portés par un paiement (annulés compris : un numéro annulé reste pris). */
async function numerosPris(client: Client, annee: number, blocs: readonly BlocLu[]): Promise<Set<number>> {
  if (blocs.length === 0) return new Set();
  const lignes = await client.paiement.findMany({
    where: {
      OR: blocs.map((b) => ({
        numeroRecu: { gte: formaterNumeroRecu(annee, b.premier), lte: formaterNumeroRecu(annee, b.dernier) },
      })),
    },
    select: { numeroRecu: true },
  });
  const pris = new Set<number>();
  for (const l of lignes) {
    const lu = lireNumeroRecu(l.numeroRecu);
    if (lu && lu.annee === annee) pris.add(lu.numero);
  }
  return pris;
}

export async function blocsAvecLibres(client: Client, annee: number, blocs: readonly BlocLu[]): Promise<BlocRecus[]> {
  const pris = await numerosPris(client, annee, blocs);
  return blocs.map((b) => {
    const libres: number[] = [];
    for (let n = b.premier; n <= b.dernier; n++) if (!pris.has(n)) libres.push(n);
    return { id: b.id, annee, cle: b.cle, premier: b.premier, dernier: b.dernier, libres };
  });
}

async function blocsDe(client: Client, poste: string, userId: string, annee: number): Promise<BlocRecus[]> {
  const blocs = await client.blocNumeros.findMany({
    where: { poste, reserveParId: userId, cle: cleCompteurRecu(annee) },
    orderBy: { premier: "asc" },
    select: SELECT_BLOC,
  });
  return blocsAvecLibres(client, annee, blocs);
}

/**
 * Réserve un bloc de `TAILLE_BLOC` numéros pour ce poste et cet utilisateur, dans la transaction appelante.
 * `bloc` null : le plafond de numéros libres (`PLAFOND_NUMEROS_LIBRES`) serait dépassé, rien n'est réservé.
 */
// Deux demandes simultanées du même poste liraient le même nombre de libres et dépasseraient plafond ou seuil.
// Verrou de transaction, réentrant : `rechargerBlocsPoste` le prend avant de lire, `reserverBlocRecus` le reprend.
async function verrouillerBlocsPoste(tx: Prisma.TransactionClient, poste: string, userId: string, annee: number) {
  await tx.$queryRaw`SELECT 1 AS ok FROM pg_advisory_xact_lock(hashtextextended(${`BLOC:${poste}:${userId}:${cleCompteurRecu(annee)}`}, 0))`;
}

export async function reserverBlocRecus(
  tx: Prisma.TransactionClient,
  userId: string,
  poste: string,
  annee: number,
): Promise<{ bloc: BlocRecus | null; libres: number }> {
  const cle = cleCompteurRecu(annee);
  await verrouillerBlocsPoste(tx, poste, userId, annee);
  const libres = (await blocsDe(tx, poste, userId, annee)).reduce((s, b) => s + b.libres.length, 0);
  if (libres + TAILLE_BLOC > PLAFOND_NUMEROS_LIBRES) return { bloc: null, libres };

  const { premier, dernier } = await reserverBloc(tx, cle, TAILLE_BLOC);
  // Lève une RangeError (message affichable) au-delà de 99 999 ; la transaction annulée rend les numéros au compteur.
  formaterNumeroRecu(annee, dernier);
  const cree = await tx.blocNumeros.create({
    data: { poste, cle, premier, dernier, reserveParId: userId },
    select: SELECT_BLOC,
  });
  const numeros = Array.from({ length: dernier - premier + 1 }, (_, k) => premier + k);
  return { bloc: { ...cree, annee, libres: numeros }, libres: libres + numeros.length };
}

/** Numéros encore libres du poste pour cet utilisateur, par année ; ceux encore en file sur le poste y figurent. */
export async function etatBlocsPoste(
  poste: string,
  userId: string,
  annees?: readonly number[],
  client: Client = db,
): Promise<EtatBlocsPoste> {
  const liste =
    annees ??
    [
      ...new Set(
        (
          await client.blocNumeros.findMany({
            where: { poste, reserveParId: userId, cle: { startsWith: "RECU:" } },
            select: { cle: true },
            distinct: ["cle"],
          })
        ).map((b) => Number(b.cle.slice("RECU:".length))),
      ),
    ]
      .filter(Number.isInteger)
      .sort((a, b) => a - b);

  const parAnnee: EtatBlocsPoste["annees"] = [];
  for (const annee of liste) {
    const blocs = (await blocsDe(client, poste, userId, annee)).filter((b) => b.libres.length > 0);
    parAnnee.push({ annee, cle: cleCompteurRecu(annee), libres: blocs.reduce((s, b) => s + b.libres.length, 0), blocs });
  }
  return { poste, annees: parAnnee };
}

/**
 * Recharge du poste, à appeler après l'envoi de sa file : pour chaque année de `anneesABloquer(jour)`,
 * un bloc est réservé si les numéros libres passent sous `SEUIL_RECHARGE` (plafond respecté).
 */
export async function rechargerBlocsPoste(userId: string, poste: string, jour: Jour): Promise<EtatBlocsPoste> {
  const annees = anneesABloquer(jour);
  return db.$transaction(async (tx) => {
    for (const annee of annees) {
      await verrouillerBlocsPoste(tx, poste, userId, annee);
      const libres = (await blocsDe(tx, poste, userId, annee)).reduce((s, b) => s + b.libres.length, 0);
      if (libres < SEUIL_RECHARGE) await reserverBlocRecus(tx, userId, poste, annee);
    }
    return etatBlocsPoste(poste, userId, annees, tx);
  }, OPTIONS_TRANSACTION);
}

/**
 * Bloc de ce poste qui contient ce numéro, verrouillé jusqu'à la fin de la transaction :
 * deux paiements du même bloc ne peuvent pas vérifier puis prendre le même numéro en parallèle.
 */
export async function numeroAppartientAuPoste(
  tx: Prisma.TransactionClient,
  poste: string,
  numeroRecu: string,
): Promise<{ id: string; reserveParId: string; createdAt: Date } | null> {
  const lu = lireNumeroRecu(numeroRecu);
  if (!lu) return null;
  const [bloc] = await tx.$queryRaw<{ id: string; reserveParId: string; createdAt: Date }[]>`
    SELECT id, "reserveParId", "createdAt" FROM bloc_numeros
    WHERE poste = ${poste} AND cle = ${cleCompteurRecu(lu.annee)} AND premier <= ${lu.numero} AND dernier >= ${lu.numero}
    FOR UPDATE`;
  return bloc ?? null;
}
