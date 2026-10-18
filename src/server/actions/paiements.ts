"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { dateHeureMadagascar } from "@/lib/dates";
import {
  schemaVerificationPaiement,
  type EntreeVerificationPaiement,
  schemaAnnulationPaiement,
  schemaEncaissement,
  type DonneesRecu,
  type Encaissement,
  type EntreeAnnulationPaiement,
  type EntreeEncaissement,
} from "@/lib/encaissement";
import { echec, echecCode, echecValidation, echecValidationGlobale, succes, type EtatAction, type EtatErreur, type EtatSucces } from "@/lib/etat-action";
import { exigerAdmin, exigerSession } from "@/server/acces";
import { OPTIONS_TRANSACTION, verrouillerEtudiant } from "@/server/ecolage";
import { revaliderPagesEcolage } from "@/server/ecolage-revalidation";
import { indexEnConflit } from "@/server/erreurs";
import {
  derniersServis,
  lireRecu,
  rechercherAuGuichet,
  situationGuichet,
  type ResultatGuichet,
  type SituationGuichet,
} from "@/server/lectures/paiements";
import { controleDeja, enregistrerPaiement, SELECT_PAIEMENT_EXISTANT, type ResultatEnregistrement } from "@/server/paiements";

const PAIEMENT_INTROUVABLE = "Ce paiement n'existe plus. Rechargez la page.";

const CHAMPS_SAISIS_GUICHET = ["montant", "mode", "operateur", "reference", "observation"];

/** Erreur sur un champ que l'écran ne montre pas (idClient, resteDuAffiche, paiementId) : son message devient le message général. */
function echecValidationSaisie(error: Parameters<typeof echecValidation>[0], champsVisibles: string[]): EtatErreur {
  const etat = echecValidation(error);
  const cache = Object.entries(etat.erreurs ?? {}).find(([champ]) => !champsVisibles.includes(champ));
  return cache ? { ...etat, message: cache[1] } : etat;
}

/** Double clic ou renvoi : le paiement de cet `idClient` existe déjà, on rend son reçu sans rien créer. */
async function recuExistant(d: Encaissement): Promise<EtatSucces<DonneesRecu> | EtatErreur | null> {
  const p = await db.paiement.findUnique({ where: { idClient: d.idClient }, select: SELECT_PAIEMENT_EXISTANT });
  if (!p) return null;
  const controle = controleDeja(p, d);
  if (controle.statut === "refus") return controle.erreur;
  const recu = await lireRecu(p.id);
  if (!recu) return echec(PAIEMENT_INTROUVABLE);
  return succes(`Paiement déjà enregistré : reçu ${p.numeroRecu}.`, recu);
}

/**
 * Enregistre un paiement : réparti de l'échéance la plus ancienne à la plus récente, toutes années ;
 * refusé si la situation a changé depuis l'affichage (`resteDuAffiche`). Renvoie de quoi imprimer le ticket.
 */
export async function encaisser(entree: EntreeEncaissement): Promise<EtatAction<DonneesRecu>> {
  const session = await exigerSession();

  const lu = schemaEncaissement.safeParse(entree);
  if (!lu.success) return echecValidationSaisie(lu.error, CHAMPS_SAISIS_GUICHET);
  const d = lu.data;

  const deja = await recuExistant(d);
  if (deja) return deja;

  let r: ResultatEnregistrement;
  try {
    r = await db.$transaction(
      (tx) => enregistrerPaiement(tx, { ...d, saisiParId: session.user.id, instant: new Date() }, "en-ligne"),
      OPTIONS_TRANSACTION,
    );
  } catch (e) {
    if (indexEnConflit(e)?.includes("idClient")) {
      return (await recuExistant(d)) ?? echec(PAIEMENT_INTROUVABLE);
    }
    if (e instanceof RangeError) return echec(e.message);
    throw e;
  }

  if (r.statut === "deja") return (await recuExistant(d)) ?? echec(PAIEMENT_INTROUVABLE);
  if (r.statut === "refus") return r.erreur;
  revaliderPagesEcolage();
  // Lu après le commit : dans la transaction, Prisma lancerait les relations du reçu en parallèle sur la même connexion.
  // Même lecture qu'à la réimpression, donc ticket identique ; une erreur ici n'est pas un refus, le paiement existe.
  const recu = await lireRecu(r.paiementId);
  if (!recu) throw new Error("Reçu introuvable juste après sa création.");
  return succes(`Paiement enregistré : reçu ${r.numeroRecu}.`, recu);
}

/** Admin seulement. Jamais de suppression : le paiement reste dans l'historique, marqué annulé. */
export async function annulerPaiement(entree: EntreeAnnulationPaiement): Promise<EtatAction> {
  const { session, refus } = await exigerAdmin();
  if (refus) return refus;

  const lu = schemaAnnulationPaiement.safeParse(entree);
  if (!lu.success) return echecValidationSaisie(lu.error, ["motif"]);
  const { paiementId, motif } = lu.data;

  const cible = await db.paiement.findUnique({ where: { id: paiementId }, select: { etudiantId: true } });
  if (!cible) return echecCode("INTROUVABLE", PAIEMENT_INTROUVABLE);

  const etat = await db.$transaction(async (tx): Promise<EtatAction> => {
    await verrouillerEtudiant(tx, cible.etudiantId);
    const [p] = await tx.$queryRaw<{ numeroRecu: string; annule: boolean }[]>`
      SELECT "numeroRecu", annule FROM paiement WHERE id = ${paiementId} FOR UPDATE`;
    if (!p) return echecCode("INTROUVABLE", PAIEMENT_INTROUVABLE);
    if (p.annule) return echec(`Le reçu ${p.numeroRecu} est déjà annulé.`);

    await tx.paiement.update({
      where: { id: paiementId },
      data: { annule: true, annuleParId: session.user.id, dateAnnulation: new Date(), motifAnnulation: motif },
    });
    return succes(`Reçu ${p.numeroRecu} annulé : les échéances qu'il payait sont de nouveau dues.`);
  }, OPTIONS_TRANSACTION);

  // Refus compris : « déjà annulé » veut dire que la page affichée est périmée.
  revaliderPagesEcolage();
  return etat;
}

/**
 * Admin seulement. Clôt un paiement « à vérifier » (hors ligne) sans rien changer à ses montants ;
 * la note reste lisible. Un trop-perçu se règle hors application, ou en annulant le reçu.
 */
export async function marquerVerifie(entree: EntreeVerificationPaiement): Promise<EtatAction> {
  const { session, refus } = await exigerAdmin();
  if (refus) return refus;

  const lu = schemaVerificationPaiement.safeParse(entree);
  if (!lu.success) return echecValidationGlobale(lu.error);
  const { paiementId } = lu.data;

  const etat = await db.$transaction(async (tx): Promise<EtatAction> => {
    const [p] = await tx.$queryRaw<{ numeroRecu: string; annule: boolean; aVerifier: boolean; dateVerification: Date | null }[]>`
      SELECT "numeroRecu", annule, "aVerifier", "dateVerification" FROM paiement WHERE id = ${paiementId} FOR UPDATE`;
    if (!p) return echecCode("INTROUVABLE", PAIEMENT_INTROUVABLE);
    if (p.annule) return echec(`Le reçu ${p.numeroRecu} est annulé : il n'y a plus rien à vérifier.`);
    if (!p.aVerifier) {
      return echec(
        p.dateVerification
          ? `Le reçu ${p.numeroRecu} a déjà été vérifié le ${dateHeureMadagascar(p.dateVerification).date}.`
          : `Le reçu ${p.numeroRecu} n'est pas à vérifier.`,
      );
    }
    await tx.paiement.update({
      where: { id: paiementId },
      data: { aVerifier: false, verifieParId: session.user.id, dateVerification: new Date() },
    });
    return succes(`Reçu ${p.numeroRecu} marqué vérifié.`);
  }, OPTIONS_TRANSACTION);

  // Refus compris : « déjà annulé », « déjà vérifié » ou introuvable veulent dire que la page affichée est périmée.
  revaliderPagesEcolage();
  return etat;
}

// Lectures appelées depuis l'écran Encaisser (composant client) : session vérifiée ici.

const schemaTexte = z.string().max(100).catch("");
const schemaId = z.string().min(1).max(40);

export async function chercherAuGuichet(q: string): Promise<ResultatGuichet[]> {
  await exigerSession();
  return rechercherAuGuichet(schemaTexte.parse(q));
}

export async function chargerDerniersServis(): Promise<Awaited<ReturnType<typeof derniersServis>>> {
  const session = await exigerSession();
  return derniersServis(session.user.id);
}

/** null : étudiant inconnu. */
export async function chargerSituationGuichet(etudiantId: string): Promise<SituationGuichet | null> {
  await exigerSession();
  const id = schemaId.safeParse(etudiantId);
  return id.success ? situationGuichet(id.data) : null;
}

/** Réimpression d'un reçu (fiche, Paiements) ; null : paiement inconnu. */
export async function obtenirRecu(paiementId: string): Promise<DonneesRecu | null> {
  await exigerSession();
  const id = schemaId.safeParse(paiementId);
  return id.success ? lireRecu(id.data) : null;
}
