"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { dateDuJour, jourMadagascar } from "@/lib/dates";
import { echeanceFrais } from "@/lib/ecolage";
import { echec, echecCode, echecValidation, succes, type EtatAction } from "@/lib/etat-action";
import {
  controleAnneeFrais,
  controleModificationFrais,
  controleMoisFrais,
  controleSuppressionFrais,
  phraseRecapitulatifFrais,
  schemaApercuFrais,
  schemaCreationFrais,
  schemaModificationFrais,
  schemaSuppressionFrais,
  type ClasseFrais,
  type EntreeApercuFrais,
  type EntreeCreationFrais,
  type EntreeModificationFrais,
  type EntreeSuppressionFrais,
} from "@/lib/frais";
import { formaterAriary } from "@/lib/montant";
import { libelleNiveau } from "@/lib/parametres";
import { exigerAdmin } from "@/server/acces";
import { OPTIONS_TRANSACTION } from "@/server/ecolage";
import { revaliderPagesEcolage } from "@/server/ecolage-revalidation";
import { inscriptionsConcernees, verrouillerEtudiants } from "@/server/frais";

type Tx = Prisma.TransactionClient;
type AnneeFrais = { id: string; libelle: string; anneeDebut: number; moisDebutEcolage: number; cloturee: boolean };

const ANNEE_INTROUVABLE = "Cette année scolaire n'existe plus. Rechargez la page.";
const FRAIS_INTROUVABLE = "Ce frais n'existe plus. Rechargez la page.";

function apres<D>(etat: EtatAction<D>): EtatAction<D> {
  if (etat.statut === "succes") {
    revaliderPagesEcolage();
    revalidatePath("/app/parametres", "layout");
  }
  return etat;
}

/**
 * FOR UPDATE : une inscription, un passage ou un import sur cette année (FOR SHARE) attend la fin de l'écriture,
 * puis voit le frais et le copie ; l'inverse aussi.
 */
async function verrouillerAnnee(tx: Tx, id: string): Promise<AnneeFrais | null> {
  const [a] = await tx.$queryRaw<AnneeFrais[]>`
    SELECT id, libelle, "anneeDebut", "moisDebutEcolage", cloturee FROM annee_scolaire WHERE id = ${id} FOR UPDATE`;
  return a ?? null;
}

/** Classes existantes et dans la durée de leur filière ; message sinon. */
async function controleClasses(tx: Tx, classes: readonly ClasseFrais[]): Promise<string | null> {
  const filieres = await tx.filiere.findMany({
    where: { id: { in: [...new Set(classes.map((c) => c.filiereId))] } },
    select: { id: true, code: true, dureeAnnees: true },
  });
  const parId = new Map(filieres.map((f) => [f.id, f]));
  for (const c of classes) {
    const f = parId.get(c.filiereId);
    if (!f) return "Une des filières choisies n'existe plus. Rechargez la page.";
    if (c.niveau > f.dureeAnnees) return `La filière ${f.code} dure ${f.dureeAnnees} ans : pas de ${libelleNiveau(c.niveau)}.`;
  }
  return null;
}

/** Lignes de paiement sur les échéances du frais, paiements annulés compris. */
function lignesPaiementDuFrais(tx: Tx, fraisId: string): Promise<number> {
  return tx.paiementLigne.count({ where: { echeance: { fraisId } } });
}

/** Récapitulatif avant création : « 42 étudiants recevront 15 000 Ar, exigibles en mars 2027. » Admin seulement. */
export async function apercuFrais(entree: EntreeApercuFrais): Promise<EtatAction<{ nombre: number; phrase: string }>> {
  const { refus } = await exigerAdmin();
  if (refus) return refus;
  const lu = schemaApercuFrais.safeParse(entree);
  if (!lu.success) return echecValidation(lu.error);
  const d = lu.data;

  const annee = await db.anneeScolaire.findUnique({
    where: { id: d.anneeScolaireId },
    select: { libelle: true, anneeDebut: true, moisDebutEcolage: true, cloturee: true },
  });
  if (!annee) return echecCode("INTROUVABLE", ANNEE_INTROUVABLE);
  const refusAnnee = controleAnneeFrais(annee);
  if (refusAnnee) return echec(refusAnnee);
  const refusMois = controleMoisFrais(d.mois, annee, jourMadagascar(new Date()));
  if (refusMois) return echec(refusMois, { mois: refusMois });

  const nombre = (await inscriptionsConcernees(db, d.anneeScolaireId, d.classes)).length;
  const phrase = phraseRecapitulatifFrais({ nombre, montant: d.montant, mois: d.mois });
  return succes(phrase, { nombre, phrase });
}

/** Crée le frais et une échéance FRAIS pour chaque inscription concernée, d'un bloc. Admin seulement. */
export async function creerFrais(entree: EntreeCreationFrais): Promise<EtatAction<{ id: string; nombre: number }>> {
  const { session, refus } = await exigerAdmin();
  if (refus) return refus;
  const lu = schemaCreationFrais.safeParse(entree);
  if (!lu.success) return echecValidation(lu.error);
  const d = lu.data;
  const jour = jourMadagascar(new Date());

  const etat = await db.$transaction(async (tx): Promise<EtatAction<{ id: string; nombre: number }>> => {
    const annee = await verrouillerAnnee(tx, d.anneeScolaireId);
    if (!annee) return echecCode("INTROUVABLE", ANNEE_INTROUVABLE);
    const refusAnnee = controleAnneeFrais(annee);
    if (refusAnnee) return echec(refusAnnee);
    const refusMois = controleMoisFrais(d.mois, annee, jour);
    if (refusMois) return echec("Vérifiez les champs signalés.", { mois: refusMois });
    const refusClasses = await controleClasses(tx, d.classes);
    if (refusClasses) return echec(refusClasses);

    // Relu sous verrou des étudiants : une sortie enregistrée entre-temps les exclut.
    await verrouillerEtudiants(tx, (await inscriptionsConcernees(tx, annee.id, d.classes)).map((i) => i.etudiantId));
    const concernees = await inscriptionsConcernees(tx, annee.id, d.classes);

    const frais = await tx.frais.create({
      data: {
        libelle: d.libelle,
        montant: d.montant,
        mois: dateDuJour(d.mois),
        anneeScolaireId: annee.id,
        creeParId: session.user.id,
        classes: { create: d.classes.map((c) => ({ filiereId: c.filiereId, niveau: c.niveau })) },
      },
      select: { id: true, montant: true, mois: true },
    });
    if (concernees.length) {
      const echeance = echeanceFrais(frais);
      await tx.echeance.createMany({ data: concernees.map((i) => ({ ...echeance, inscriptionId: i.id })) });
    }
    return succes(
      `Frais « ${d.libelle} » créé. ${phraseRecapitulatifFrais({ nombre: concernees.length, montant: d.montant, mois: d.mois })}`,
      { id: frais.id, nombre: concernees.length },
    );
  }, OPTIONS_TRANSACTION);
  return apres(etat);
}

function indexMois(d: Date): number {
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

/**
 * Libellé, montant et mois, recopiés sur les échéances du frais. Une fois payé (même en partie ou par un
 * paiement annulé), seul le libellé change ; le reçu garde le libellé figé à l'encaissement. Admin seulement.
 */
export async function modifierFrais(entree: EntreeModificationFrais): Promise<EtatAction> {
  const { refus } = await exigerAdmin();
  if (refus) return refus;
  const lu = schemaModificationFrais.safeParse(entree);
  if (!lu.success) return echecValidation(lu.error);
  const d = lu.data;
  const jour = jourMadagascar(new Date());

  const cible = await db.frais.findUnique({ where: { id: d.id }, select: { anneeScolaireId: true } });
  if (!cible) return echecCode("INTROUVABLE", FRAIS_INTROUVABLE);

  const etat = await db.$transaction(async (tx): Promise<EtatAction> => {
    const annee = await verrouillerAnnee(tx, cible.anneeScolaireId);
    if (!annee) return echecCode("INTROUVABLE", ANNEE_INTROUVABLE);
    const refusAnnee = controleAnneeFrais(annee);
    if (refusAnnee) return echec(refusAnnee);

    const echeances = await tx.echeance.findMany({
      where: { fraisId: d.id },
      select: { inscription: { select: { etudiantId: true } } },
    });
    await verrouillerEtudiants(tx, echeances.map((e) => e.inscription.etudiantId));

    const actuel = await tx.frais.findUnique({ where: { id: d.id }, select: { libelle: true, montant: true, mois: true } });
    if (!actuel) return echecCode("INTROUVABLE", FRAIS_INTROUVABLE);
    const mois = dateDuJour(d.mois);
    const moisChange = mois.getTime() !== actuel.mois.getTime();
    const montantOuMoisChange = moisChange || d.montant !== actuel.montant;
    const refusModif = controleModificationFrais({ lignesPaiement: await lignesPaiementDuFrais(tx, d.id), montantOuMoisChange });
    if (refusModif) return echec(refusModif);
    if (moisChange) {
      const refusMois = controleMoisFrais(d.mois, annee, jour);
      if (refusMois) return echec("Vérifiez les champs signalés.", { mois: refusMois });
    }

    await tx.frais.update({ where: { id: d.id }, data: { libelle: d.libelle, montant: d.montant, mois } });
    if (montantOuMoisChange) {
      await tx.echeance.updateMany({ where: { fraisId: d.id }, data: { montantDu: d.montant, mois } });
    }
    if (moisChange) {
      // Même règle qu'à la sortie : un frais exigible après le mois de sortie n'est plus dû (aucun paiement dessus ici).
      const sortis = await tx.echeance.findMany({
        where: { fraisId: d.id, inscription: { etudiant: { statut: { in: ["ABANDON", "EXCLU"] }, dateSortie: { not: null } } } },
        select: { id: true, inscription: { select: { etudiant: { select: { dateSortie: true } } } } },
      });
      const nonDues = sortis.filter((e) => indexMois(mois) > indexMois(e.inscription.etudiant.dateSortie!)).map((e) => e.id);
      const dues = sortis.filter((e) => !nonDues.includes(e.id)).map((e) => e.id);
      if (nonDues.length) await tx.echeance.updateMany({ where: { id: { in: nonDues } }, data: { nonDueSortie: true } });
      if (dues.length) await tx.echeance.updateMany({ where: { id: { in: dues } }, data: { nonDueSortie: false } });
    }
    return succes(
      montantOuMoisChange
        ? `Frais « ${d.libelle} » modifié : ${formaterAriary(d.montant)} pour ${echeances.length} étudiant${echeances.length > 1 ? "s" : ""}.`
        : `Frais « ${d.libelle} » renommé.`,
    );
  }, OPTIONS_TRANSACTION);
  return apres(etat);
}

/** Supprime le frais et ses échéances tant qu'aucune ligne de paiement (même annulée) ne les touche. Admin seulement. */
export async function supprimerFrais(entree: EntreeSuppressionFrais): Promise<EtatAction> {
  const { refus } = await exigerAdmin();
  if (refus) return refus;
  const lu = schemaSuppressionFrais.safeParse(entree);
  if (!lu.success) return echecValidation(lu.error);
  const { id } = lu.data;

  const cible = await db.frais.findUnique({ where: { id }, select: { anneeScolaireId: true } });
  if (!cible) return echecCode("INTROUVABLE", FRAIS_INTROUVABLE);

  const etat = await db.$transaction(async (tx): Promise<EtatAction> => {
    const annee = await verrouillerAnnee(tx, cible.anneeScolaireId);
    if (!annee) return echecCode("INTROUVABLE", ANNEE_INTROUVABLE);
    const refusAnnee = controleAnneeFrais(annee);
    if (refusAnnee) return echec(refusAnnee);

    const echeances = await tx.echeance.findMany({
      where: { fraisId: id },
      select: { inscription: { select: { etudiantId: true } } },
    });
    await verrouillerEtudiants(tx, echeances.map((e) => e.inscription.etudiantId));

    const frais = await tx.frais.findUnique({ where: { id }, select: { libelle: true } });
    if (!frais) return echecCode("INTROUVABLE", FRAIS_INTROUVABLE);
    const refusSuppr = controleSuppressionFrais(await lignesPaiementDuFrais(tx, id));
    if (refusSuppr) return echec(refusSuppr);

    // Aucune ligne de paiement ne référence ces échéances (contrôle ci-dessus, sous verrou).
    await tx.echeance.deleteMany({ where: { fraisId: id } });
    await tx.frais.delete({ where: { id } });
    return succes(`Frais « ${frais.libelle} » supprimé.`);
  }, OPTIONS_TRANSACTION);
  return apres(etat);
}
