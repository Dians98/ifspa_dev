"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { anneeCivile, jourMadagascar } from "@/lib/dates";
import { repartirPaiement, resteDuTotal, restesApres } from "@/lib/ecolage";
import {
  MESSAGE_SITUATION_CHANGEE,
  schemaAnnulationPaiement,
  schemaEncaissement,
  type DonneesRecu,
  type EntreeAnnulationPaiement,
  type EntreeEncaissement,
} from "@/lib/encaissement";
import { echec, echecCode, echecValidation, succes, type EtatAction, type EtatErreur, type EtatSucces } from "@/lib/etat-action";
import { cleCompteurRecu, formaterNumeroRecu } from "@/lib/matricule";
import { exigerAdmin, exigerSession } from "@/server/acces";
import { prochainNumero } from "@/server/compteur";
import { echeancesEtudiant, OPTIONS_TRANSACTION, verrouillerEtudiant } from "@/server/ecolage";
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

const ETUDIANT_INTROUVABLE = "Cet étudiant n'existe plus. Rechargez la page.";
const PAIEMENT_INTROUVABLE = "Ce paiement n'existe plus. Rechargez la page.";

const CHAMPS_SAISIS_GUICHET = ["montant", "mode", "operateur", "reference", "observation"];

/** Erreur sur un champ que l'écran ne montre pas (idClient, resteDuAffiche, paiementId) : son message devient le message général. */
function echecValidationSaisie(error: Parameters<typeof echecValidation>[0], champsVisibles: string[]): EtatErreur {
  const etat = echecValidation(error);
  const cache = Object.entries(etat.erreurs ?? {}).find(([champ]) => !champsVisibles.includes(champ));
  return cache ? { ...etat, message: cache[1] } : etat;
}

/** Double clic ou renvoi : le paiement de cet `idClient` existe déjà, on rend son reçu sans rien créer. */
async function recuExistant(idClient: string, etudiantId: string): Promise<EtatSucces<DonneesRecu> | EtatErreur | null> {
  const p = await db.paiement.findUnique({ where: { idClient }, select: { id: true, etudiantId: true, numeroRecu: true } });
  if (!p) return null;
  if (p.etudiantId !== etudiantId) {
    return echec("Cet identifiant de paiement a déjà servi pour un autre étudiant. Rechargez la page puis réessayez.");
  }
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

  const deja = await recuExistant(d.idClient, d.etudiantId);
  if (deja) return deja;

  const instant = new Date();
  const jour = jourMadagascar(instant);

  let etat: EtatAction<{ id: string }> | "deja";
  try {
    etat = await db.$transaction(async (tx): Promise<EtatAction<{ id: string }> | "deja"> => {
      if (!(await verrouillerEtudiant(tx, d.etudiantId))) return echecCode("INTROUVABLE", ETUDIANT_INTROUVABLE);
      // Relu sous verrou : un second envoi simultané attendait le premier.
      if (await tx.paiement.findUnique({ where: { idClient: d.idClient }, select: { id: true } })) return "deja";

      const nonSoldees = (await echeancesEtudiant(tx, d.etudiantId))
        .map((e) => ({ ...e, reste: Math.max(0, e.montantDu - e.paye) }))
        .filter((e) => e.reste > 0);
      if (resteDuTotal(nonSoldees) !== d.resteDuAffiche) return echecCode("SITUATION_CHANGEE", MESSAGE_SITUATION_CHANGEE);

      const repartition = repartirPaiement(nonSoldees, d.montant);
      if (!repartition.ok) return echec(repartition.erreur, { montant: repartition.erreur });
      const { resteApres, retardApres } = restesApres(nonSoldees, repartition.lignes, jour);

      const annee = anneeCivile(jour);
      const numero = formaterNumeroRecu(annee, await prochainNumero(tx, cleCompteurRecu(annee)));
      const paiement = await tx.paiement.create({
        data: {
          numeroRecu: numero,
          etudiantId: d.etudiantId,
          date: instant,
          montant: d.montant,
          mode: d.mode,
          operateur: d.operateur,
          reference: d.reference,
          observation: d.observation,
          saisiParId: session.user.id,
          idClient: d.idClient,
          resteApres,
          retardApres,
          lignes: {
            create: repartition.lignes.map((l) => ({
              echeanceId: l.echeanceId,
              montant: l.montant,
              resteEcheanceApres: l.resteEcheance,
            })),
          },
        },
        select: { id: true },
      });
      return succes(`Paiement enregistré : reçu ${numero}.`, { id: paiement.id });
    }, OPTIONS_TRANSACTION);
  } catch (e) {
    if (indexEnConflit(e)?.includes("idClient")) {
      return (await recuExistant(d.idClient, d.etudiantId)) ?? echec(PAIEMENT_INTROUVABLE);
    }
    if (e instanceof RangeError) return echec(e.message);
    throw e;
  }

  if (etat === "deja") return (await recuExistant(d.idClient, d.etudiantId)) ?? echec(PAIEMENT_INTROUVABLE);
  if (etat.statut === "erreur") return etat;
  revaliderPagesEcolage();
  // Lu après le commit : dans la transaction, Prisma lancerait les relations du reçu en parallèle sur la même connexion.
  // Même lecture qu'à la réimpression, donc ticket identique ; une erreur ici n'est pas un refus, le paiement existe.
  const recu = await lireRecu(etat.donnees.id);
  if (!recu) throw new Error("Reçu introuvable juste après sa création.");
  return succes(etat.message, recu);
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

  if (etat.statut === "succes") revaliderPagesEcolage();
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
