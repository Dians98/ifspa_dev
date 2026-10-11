"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { StatutInscription } from "@/generated/prisma/enums";
import {
  libelleClasse,
  MESSAGE_CLASSE_CHANGEE,
  planifierPassage,
  planifierRestauration,
  resumeDecisions,
  schemaValidationClasse,
  type ComptesDecisions,
  type EntreeValidationClasse,
} from "@/lib/admissions";
import { db } from "@/lib/db";
import { jourMadagascar } from "@/lib/dates";
import type { TarifEcheances } from "@/lib/ecolage";
import { echec, echecCode, echecValidationGlobale, succes, type EtatAction } from "@/lib/etat-action";
import { exigerAdmin, exigerSession } from "@/server/acces";
import { dossiersAnnulation, passageCourant } from "@/server/admissions";
import { OPTIONS_TRANSACTION } from "@/server/ecolage";
import { revaliderPagesEcolage } from "@/server/ecolage-revalidation";
import { codePrisma, indexEnConflit } from "@/server/erreurs";
import {
  lireBlocageAnnulation,
  lireClasse,
  type BlocageAnnulation,
  type ClasseDetail,
} from "@/server/lectures/admissions";

/** Une classe entière en une transaction : on laisse plus de temps qu'à un encaissement. */
const OPTIONS_PASSAGE = { ...OPTIONS_TRANSACTION, timeout: 30_000 } as const;

const OPERATION_INTROUVABLE = "Ce passage n'existe plus. Rechargez la page.";

function apres<D>(etat: EtatAction<D>): EtatAction<D> {
  if (etat.statut === "succes") {
    revaliderPagesEcolage();
    revalidatePath("/app/admissions", "layout");
  }
  return etat;
}

type Tx = Prisma.TransactionClient;

/**
 * Verrous dans l'ordre commun à toutes les écritures d'écolage : étudiants, puis inscriptions, puis échéances,
 * chaque fois par id croissant. Rend les étudiants effectivement verrouillés.
 */
async function verrouillerEtudiants(tx: Tx, etudiantIds: string[], inscriptionIds: string[]): Promise<Set<string>> {
  if (etudiantIds.length === 0) return new Set();
  const etudiants = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM etudiant WHERE id = ANY(${etudiantIds}) ORDER BY id FOR UPDATE`;
  if (inscriptionIds.length) {
    await tx.$queryRaw`SELECT id FROM inscription WHERE id = ANY(${inscriptionIds}) ORDER BY id FOR UPDATE`;
  }
  await tx.$queryRaw`
    SELECT ec.id FROM echeance ec JOIN inscription i ON i.id = ec."inscriptionId"
    WHERE i."etudiantId" = ANY(${etudiantIds}) ORDER BY ec.id FOR UPDATE OF ec`;
  return new Set(etudiants.map((e) => e.id));
}

export type ResultatValidation = { operationId: string; comptes: ComptesDecisions };

/**
 * Valide une classe : inscriptions de l'année cible (échéances copiées du tarif), statuts des inscriptions
 * source, diplômés et abandons sortis. Ouvert au secrétariat ; aucun matricule ni compteur touché.
 */
export async function validerClasse(entree: EntreeValidationClasse): Promise<EtatAction<ResultatValidation>> {
  const session = await exigerSession();

  const lu = schemaValidationClasse.safeParse(entree);
  if (!lu.success) return echecValidationGlobale(lu.error);
  const { anneeSourceId, filiereId, niveau, decisions } = lu.data;
  const jour = jourMadagascar(new Date());

  try {
    const etat = await db.$transaction(async (tx): Promise<EtatAction<ResultatValidation>> => {
      const passage = await passageCourant(tx);
      if (!passage.source || passage.source.id !== anneeSourceId) {
        return echec(
          passage.source
            ? `Le passage porte maintenant sur l'année ${passage.source.libelle} : rechargez la page.`
            : (passage.refus ?? "Aucun passage possible pour le moment. Rechargez la page."),
        );
      }
      // FOR SHARE : ni clôture des années, ni changement de durée de la filière, ni tarif modifié pendant la copie.
      const [source] = await tx.$queryRaw<{ id: string; libelle: string; anneeDebut: number; cloturee: boolean }[]>`
        SELECT id, libelle, "anneeDebut", cloturee FROM annee_scolaire WHERE id = ${anneeSourceId} FOR SHARE`;
      const [cible] = source
        ? await tx.$queryRaw<{ id: string; libelle: string; anneeDebut: number; moisDebutEcolage: number; cloturee: boolean }[]>`
            SELECT id, libelle, "anneeDebut", "moisDebutEcolage", cloturee FROM annee_scolaire
            WHERE "anneeDebut" = ${source.anneeDebut + 1} FOR SHARE`
        : [];
      const [filiere] = await tx.$queryRaw<{ id: string; code: string; nom: string; dureeAnnees: number }[]>`
        SELECT id, code, nom, "dureeAnnees" FROM filiere WHERE id = ${filiereId} FOR SHARE`;
      if (!source || !filiere) return echecCode("INTROUVABLE", "Cette classe n'existe plus. Rechargez la page.");
      const tarifs = cible
        ? await tx.$queryRaw<(TarifEcheances & { niveau: number })[]>`
            SELECT niveau, "droitsInscription", "montantMensuel", "nombreMois" FROM tarif
            WHERE "filiereId" = ${filiere.id} AND "anneeScolaireId" = ${cible.id} AND niveau IN (${niveau}, ${niveau + 1})
            FOR SHARE`
        : [];

      const membres = await tx.$queryRaw<{ etudiantId: string; inscriptionId: string }[]>`
        SELECT i."etudiantId", i.id AS "inscriptionId" FROM inscription i JOIN etudiant e ON e.id = i."etudiantId"
        WHERE i."anneeScolaireId" = ${source.id} AND i.niveau = ${niveau} AND e."filiereId" = ${filiere.id}
          AND i.statut = 'EN_COURS'`;
      const verrouilles = await verrouillerEtudiants(
        tx,
        [...new Set(membres.map((m) => m.etudiantId))],
        membres.map((m) => m.inscriptionId),
      );

      // Relu sous verrou : statut de l'étudiant et de l'inscription à jour.
      const inscriptions = await tx.inscription.findMany({
        where: { anneeScolaireId: source.id, niveau, statut: "EN_COURS", etudiant: { filiereId: filiere.id } },
        select: {
          id: true,
          etudiantId: true,
          droitsEnTranches: true,
          statut: true,
          etudiant: { select: { nom: true, prenoms: true, statut: true, dateSortie: true, motifSortie: true } },
        },
      });
      const nonVerrouille = inscriptions.some((i) => !verrouilles.has(i.etudiantId));

      const resultat = nonVerrouille
        ? ({ ok: false, erreur: MESSAGE_CLASSE_CHANGEE, raison: "classe_changee" } as const)
        : planifierPassage({
            jour,
            anneeSource: source,
            anneeCible: cible ?? null,
            filiere,
            niveau,
            inscriptions: inscriptions.map((i) => ({
              inscriptionId: i.id,
              etudiantId: i.etudiantId,
              nom: i.etudiant.nom,
              prenoms: i.etudiant.prenoms,
              droitsEnTranches: i.droitsEnTranches,
              statutInscription: i.statut,
              statutEtudiant: i.etudiant.statut,
              dateSortie: i.etudiant.dateSortie,
              motifSortie: i.etudiant.motifSortie,
            })),
            decisions,
            tarifs: {
              niveauSuivant: tarifs.find((t) => t.niveau === niveau + 1) ?? null,
              memeNiveau: tarifs.find((t) => t.niveau === niveau) ?? null,
            },
          });

      if (!resultat.ok) {
        if (resultat.raison === "classe_changee") {
          const recente = await tx.operationAdmission.findFirst({
            where: { anneeSourceId: source.id, filiereId: filiere.id, niveauSource: niveau, annulee: false },
            orderBy: { createdAt: "desc" },
            select: { creePar: { select: { name: true } } },
          });
          if (recente) return echec(`La classe vient d'être validée par ${recente.creePar.name}, rechargez la page.`);
        }
        return echec(resultat.erreur);
      }
      const plan = resultat.plan;
      if (!cible) throw new Error("Année cible absente après planification.");

      const operation = await tx.operationAdmission.create({
        data: { anneeSourceId: source.id, anneeCibleId: cible.id, filiereId: filiere.id, niveauSource: niveau, creeParId: session.user.id },
        select: { id: true },
      });

      const creees = plan.inscriptions.length
        ? await tx.inscription.createManyAndReturn({
            data: plan.inscriptions.map((i) => ({
              etudiantId: i.etudiantId,
              anneeScolaireId: cible.id,
              niveau: i.niveau,
              redoublement: i.redoublement,
              droitsEnTranches: i.droitsEnTranches,
              operationAdmissionId: operation.id,
            })),
            select: { id: true, etudiantId: true },
          })
        : [];
      const cibleDe = new Map(creees.map((c) => [c.etudiantId, c.id]));
      const echeances = plan.inscriptions.flatMap((i) =>
        i.echeances.map((e) => ({ ...e, inscriptionId: cibleDe.get(i.etudiantId)! })),
      );
      if (echeances.length) await tx.echeance.createMany({ data: echeances });

      const parStatut = new Map<StatutInscription, string[]>();
      for (const s of plan.inscriptionsSource) parStatut.set(s.statut, [...(parStatut.get(s.statut) ?? []), s.id]);
      for (const [statut, ids] of parStatut) {
        await tx.inscription.updateMany({ where: { id: { in: ids } }, data: { statut } });
      }
      for (const e of plan.etudiants) {
        await tx.etudiant.update({
          where: { id: e.id },
          data: { statut: e.statut, dateSortie: e.dateSortie, motifSortie: e.motifSortie },
        });
      }

      await tx.ligneAdmission.createMany({
        data: plan.lignes.map((l) => ({ ...l, operationId: operation.id, inscriptionCibleId: cibleDe.get(l.etudiantId) ?? null })),
      });

      return succes(
        `${libelleClasse(filiere.nom, niveau)} validée : ${resumeDecisions(plan.comptes, niveau)}.`,
        { operationId: operation.id, comptes: plan.comptes },
      );
    }, OPTIONS_PASSAGE);
    return apres(etat);
  } catch (e) {
    const index = indexEnConflit(e);
    if (index !== null) {
      return echec(
        index.includes("etudiantId")
          ? "Un des étudiants est déjà inscrit sur l'année suivante : rechargez la page et vérifiez sa fiche."
          : "La classe vient d'être modifiée par un autre poste : rechargez la page.",
      );
    }
    if (codePrisma(e) === "P2034") return echec("La classe vient d'être modifiée par un autre poste : réessayez.");
    if (e instanceof RangeError) return echec(e.message);
    throw e;
  }
}

const schemaAnnulationOperation = z.object(
  { operationId: z.string({ error: OPERATION_INTROUVABLE }).min(1, OPERATION_INTROUVABLE).max(40, OPERATION_INTROUVABLE) },
  { error: "Données invalides. Rechargez la page puis réessayez." },
);

/**
 * Admin seulement. Supprime les inscriptions créées et leurs échéances (jamais si une ligne de paiement,
 * même annulée, y est rattachée) et restaure exactement les statuts, dates et motifs de sortie d'avant.
 * L'opération et ses lignes restent, marquées annulées.
 */
export async function annulerOperation(entree: z.input<typeof schemaAnnulationOperation>): Promise<EtatAction> {
  const { session, refus } = await exigerAdmin();
  if (refus) return refus;

  const lu = schemaAnnulationOperation.safeParse(entree);
  if (!lu.success) return echecValidationGlobale(lu.error);
  const { operationId } = lu.data;

  const cible = await db.operationAdmission.findUnique({
    where: { id: operationId },
    select: { lignes: { select: { etudiantId: true, inscriptionSourceId: true, inscriptionCibleId: true } } },
  });
  if (!cible) return echecCode("INTROUVABLE", OPERATION_INTROUVABLE);

  const etat = await db.$transaction(async (tx): Promise<EtatAction> => {
    const [op] = await tx.$queryRaw<{ annulee: boolean; niveauSource: number; filiereNom: string }[]>`
      SELECT o.annulee, o."niveauSource", f.nom AS "filiereNom"
      FROM operation_admission o JOIN filiere f ON f.id = o."filiereId"
      WHERE o.id = ${operationId} FOR UPDATE OF o`;
    if (!op) return echecCode("INTROUVABLE", OPERATION_INTROUVABLE);
    await verrouillerEtudiants(
      tx,
      [...new Set(cible.lignes.map((l) => l.etudiantId))],
      cible.lignes.flatMap((l) => (l.inscriptionCibleId ? [l.inscriptionSourceId, l.inscriptionCibleId] : [l.inscriptionSourceId])),
    );

    const dossier = (await dossiersAnnulation(tx, [operationId])).get(operationId);
    if (!dossier) return echecCode("INTROUVABLE", OPERATION_INTROUVABLE);
    if (dossier.refus) return echec(dossier.refus);

    const plan = planifierRestauration(dossier.lignes);
    if (plan.inscriptionsASupprimer.length) {
      // Les échéances partent avec leur inscription (onDelete: Cascade) ; aucune ligne de paiement ne les référence.
      const { count } = await tx.inscription.deleteMany({
        where: { id: { in: plan.inscriptionsASupprimer }, operationAdmissionId: operationId },
      });
      if (count !== plan.inscriptionsASupprimer.length) {
        throw new Error("Inscriptions créées par le passage introuvables pendant l'annulation.");
      }
    }
    const parStatut = new Map<StatutInscription, string[]>();
    for (const s of plan.inscriptionsSource) parStatut.set(s.statut, [...(parStatut.get(s.statut) ?? []), s.id]);
    for (const [statut, ids] of parStatut) {
      await tx.inscription.updateMany({ where: { id: { in: ids } }, data: { statut } });
    }
    for (const e of plan.etudiants) {
      await tx.etudiant.update({
        where: { id: e.id },
        data: { statut: e.statut, dateSortie: e.dateSortie, motifSortie: e.motifSortie },
      });
    }
    await tx.operationAdmission.update({
      where: { id: operationId },
      data: { annulee: true, annuleeParId: session.user.id, dateAnnulation: new Date() },
    });

    return succes(
      `Passage annulé : ${libelleClasse(op.filiereNom, op.niveauSource)} est revenue à son état d'avant la validation.`,
    );
  }, OPTIONS_PASSAGE);
  return apres(etat);
}

// Lectures appelées depuis l'écran Admissions (composant client) : session vérifiée par la lecture.

const schemaClasse = z.object({ filiereId: z.string().min(1).max(40), niveau: z.number().int().min(1).max(20) });

/** null : classe inconnue dans le passage en cours. */
export async function chargerClasse(filiereId: string, niveau: number): Promise<ClasseDetail | null> {
  await exigerSession();
  const lu = schemaClasse.safeParse({ filiereId, niveau });
  return lu.success ? lireClasse(lu.data.filiereId, lu.data.niveau) : null;
}

/** null : opération inconnue. */
export async function chargerBlocageAnnulation(operationId: string): Promise<BlocageAnnulation | null> {
  await exigerSession();
  const lu = z.string().min(1).max(40).safeParse(operationId);
  return lu.success ? lireBlocageAnnulation(lu.data) : null;
}

