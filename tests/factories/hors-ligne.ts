import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import type { ElementFile } from "@/lib/encaissement-hors-ligne";
import { formaterNumeroRecu } from "@/lib/matricule";
import { reserverBlocRecus } from "@/server/blocs-recus";
import type { PaiementHorsLigne } from "@/server/paiements";
import { fabriquerPaiement } from "./index";

export const POSTE_A = "3f2b8c1e-5a47-4d0e-9b61-0c8f7e2a1d34";
export const POSTE_B = "9c4d7e21-6b3a-4f58-8e02-5a1b9d3c7f60";

/** Réception par le serveur des paiements synchronisés dans les tests. */
export const RECU_LE = new Date("2026-11-15T09:30:00Z");
/** Heure du poste plausible : après la réservation du bloc, avant la réception. */
export const SAISI_LE = "2026-11-15T09:00:00.000Z";
const BLOC_RESERVE_LE = new Date("2026-11-15T08:00:00Z");

/** Bloc réservé comme le fait la route `blocs`, avec une date de réservation fixe. */
export async function reserver(userId: string, poste: string, annee = 2026, reserveLe: Date = BLOC_RESERVE_LE) {
  const { bloc } = await db.$transaction((tx) => reserverBlocRecus(tx, userId, poste, annee));
  if (!bloc) throw new Error("Plafond de numéros libres atteint : aucun bloc réservé.");
  await db.blocNumeros.update({ where: { id: bloc.id }, data: { createdAt: reserveLe } });
  return bloc;
}

export const numero = (n: number, annee = 2026) => formaterNumeroRecu(annee, n);

/** Paiements sans ligne portant ces numéros : les numéros sont consommés, rien d'autre ne change. */
export async function occuper(etudiantId: string, userId: string, numeros: number[], donnees: { annee?: number; annule?: boolean } = {}) {
  for (const n of numeros) {
    await fabriquerPaiement(etudiantId, userId, [], {
      numeroRecu: numero(n, donnees.annee ?? 2026),
      montant: 1_000,
      annule: donnees.annule ?? false,
    });
  }
}

export type Surcharge = Partial<Omit<PaiementHorsLigne, "etudiantId" | "saisiParId" | "numeroRecu" | "poste">>;

/** Espaces insécables du formatage remplacés par des espaces simples, pour comparer des messages. */
export const normaliser = (texte: string) => texte.replace(/\s/g, " ");

/** Début d'un message de refus de synchro : « Ticket R-… · 80 000 Ar · NOM Prénoms (matricule) : ». */
export function designation(
  numeroRecu: string | null,
  montant: number | null,
  etudiant: { nom: string; prenoms: string; matricule: string } | null,
): string {
  const parties = [numeroRecu ? `Ticket ${numeroRecu}` : "Paiement sans numéro"];
  if (montant) parties.push(`${String(montant).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} Ar`);
  if (etudiant) parties.push(`${etudiant.nom} ${etudiant.prenoms} (${etudiant.matricule})`);
  return `${parties.join(" · ")} : `;
}

/** Paiement saisi hors ligne, prêt pour `synchroniserPaiement`. */
export function elementHorsLigne(
  e: { etudiantId: string; saisiParId: string; numeroRecu: string; poste?: string; resteDuAffiche?: number; montant?: number },
  surcharge: Surcharge = {},
): PaiementHorsLigne {
  const element: ElementFile = {
    etudiantId: e.etudiantId,
    montant: e.montant ?? 80_000,
    mode: "ESPECES",
    operateur: null,
    reference: null,
    observation: null,
    idClient: randomUUID(),
    resteDuAffiche: e.resteDuAffiche ?? 900_000,
    poste: e.poste ?? POSTE_A,
    numeroRecu: e.numeroRecu,
    instantSaisie: SAISI_LE,
    saisiParId: e.saisiParId,
  };
  return { ...element, recuLe: RECU_LE, ...surcharge };
}
