"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { echec, echecValidation, succes, type EtatAction } from "@/lib/etat-action";
import {
  controleChevauchement,
  controleCloture,
  controleDefinirCourante,
  controleLignesTarifs,
  controleModificationFiliere,
  controleReouverture,
  controleSuppressionAnnee,
  controleSuppressionFiliere,
  datesAnnee,
  libelleAnnee,
  schemaActivationFiliere,
  schemaAnnee,
  schemaFiliere,
  schemaIdentifiant,
  schemaModificationFiliere,
  schemaTarifs,
} from "@/lib/parametres";
import { exigerAdmin } from "@/server/acces";
import { codePrisma, indexEnConflit } from "@/server/erreurs";

const FILIERE_INTROUVABLE = "Cette filière n'existe plus. Rechargez la page.";
const ANNEE_INTROUVABLE = "Cette année scolaire n'existe plus. Rechargez la page.";

/** Revalide les onglets de Paramètres après une écriture réussie (validée en base). */
function apres<D>(etat: EtatAction<D>): EtatAction<D> {
  if (etat.statut === "succes") revalidatePath("/app/parametres", "layout");
  return etat;
}

function codeDejaPris(code: string) {
  return echec("Vérifiez les champs signalés.", { code: `Le code ${code} est déjà utilisé par une autre filière.` });
}

type LigneAnnee = { libelle: string; estCourante: boolean; cloturee: boolean };

function verrouillerAnnee(tx: Prisma.TransactionClient, id: string) {
  return tx.$queryRaw<LigneAnnee[]>`
    SELECT libelle, "estCourante", cloturee FROM annee_scolaire WHERE id = ${id} FOR UPDATE`;
}

export async function creerFiliere(entree: z.input<typeof schemaFiliere>): Promise<EtatAction<{ id: string }>> {
  const { refus } = await exigerAdmin();
  if (refus) return refus;

  const lu = schemaFiliere.safeParse(entree);
  if (!lu.success) return echecValidation(lu.error);
  const d = lu.data;

  if (await db.filiere.findUnique({ where: { code: d.code }, select: { id: true } })) return codeDejaPris(d.code);
  try {
    const f = await db.filiere.create({ data: d, select: { id: true } });
    return apres(succes(`Filière ${d.code} créée. Saisissez maintenant ses tarifs.`, { id: f.id }));
  } catch (e) {
    if (indexEnConflit(e) !== null) return codeDejaPris(d.code);
    throw e;
  }
}

export async function modifierFiliere(entree: z.input<typeof schemaModificationFiliere>): Promise<EtatAction> {
  const { refus } = await exigerAdmin();
  if (refus) return refus;

  const lu = schemaModificationFiliere.safeParse(entree);
  if (!lu.success) return echecValidation(lu.error);
  const { id, ...nouvelle } = lu.data;

  try {
    const etat = await db.$transaction(async (tx): Promise<EtatAction> => {
      // Verrou : aucun étudiant ne peut être rattaché à la filière pendant qu'on contrôle code et durée.
      const [actuelle] = await tx.$queryRaw<{ code: string; dureeAnnees: number }[]>`
        SELECT code, "dureeAnnees" FROM filiere WHERE id = ${id} FOR UPDATE`;
      if (!actuelle) return echec(FILIERE_INTROUVABLE);

      const etudiants = await tx.etudiant.count({ where: { filiereId: id } });
      const max = await tx.inscription.aggregate({ where: { etudiant: { filiereId: id } }, _max: { niveau: true } });
      const raison = controleModificationFiliere(actuelle, nouvelle, { etudiants, niveauMaxInscrit: max._max.niveau });
      if (raison) return echec(raison);

      if (nouvelle.code !== actuelle.code) {
        const pris = await tx.filiere.findUnique({ where: { code: nouvelle.code }, select: { id: true } });
        if (pris) return codeDejaPris(nouvelle.code);
      }
      await tx.filiere.update({ where: { id }, data: nouvelle });
      return succes(`Filière ${nouvelle.code} enregistrée.`);
    });
    return apres(etat);
  } catch (e) {
    if (indexEnConflit(e) !== null) return codeDejaPris(nouvelle.code);
    throw e;
  }
}

/** Une filière désactivée n'est plus proposée à l'inscription ; ses étudiants restent suivis. */
export async function activerFiliere(entree: z.input<typeof schemaActivationFiliere>): Promise<EtatAction> {
  const { refus } = await exigerAdmin();
  if (refus) return refus;

  const lu = schemaActivationFiliere.safeParse(entree);
  if (!lu.success) return echecValidation(lu.error);

  const maj = await db.filiere.updateMany({ where: { id: lu.data.id }, data: { actif: lu.data.actif } });
  if (maj.count === 0) return echec(FILIERE_INTROUVABLE);
  return apres(
    succes(lu.data.actif ? "Filière activée." : "Filière désactivée : elle n'est plus proposée à l'inscription."),
  );
}

export async function supprimerFiliere(entree: z.input<typeof schemaIdentifiant>): Promise<EtatAction> {
  const { refus } = await exigerAdmin();
  if (refus) return refus;

  const lu = schemaIdentifiant.safeParse(entree);
  if (!lu.success) return echecValidation(lu.error);
  const { id } = lu.data;

  try {
    const etat = await db.$transaction(async (tx): Promise<EtatAction> => {
      const [f] = await tx.$queryRaw<{ code: string }[]>`SELECT code FROM filiere WHERE id = ${id} FOR UPDATE`;
      if (!f) return echec(FILIERE_INTROUVABLE);

      const etudiants = await tx.etudiant.count({ where: { filiereId: id } });
      const admissions = await tx.operationAdmission.count({ where: { filiereId: id } });
      const raison = controleSuppressionFiliere({ etudiants, admissions });
      if (raison) return echec(raison);

      await tx.tarif.deleteMany({ where: { filiereId: id } });
      await tx.filiere.delete({ where: { id } });
      return succes(`Filière ${f.code} supprimée, avec ses tarifs.`);
    });
    return apres(etat);
  } catch (e) {
    // Clé étrangère : une référence est apparue entre le contrôle et la suppression.
    if (codePrisma(e) === "P2003") {
      return echec("Cette filière est désormais utilisée et ne peut plus être supprimée. Désactivez-la plutôt.");
    }
    throw e;
  }
}

export async function creerAnnee(entree: z.input<typeof schemaAnnee>): Promise<EtatAction<{ id: string }>> {
  const { refus } = await exigerAdmin();
  if (refus) return refus;

  const lu = schemaAnnee.safeParse(entree);
  if (!lu.success) return echecValidation(lu.error);
  const { anneeDebut, moisDebutEcolage } = lu.data;
  const libelle = libelleAnnee(anneeDebut);
  const existe = echec("Vérifiez les champs signalés.", { anneeDebut: `L'année ${libelle} existe déjà.` });

  try {
    const etat = await db.$transaction(async (tx): Promise<EtatAction<{ id: string }>> => {
      // Deux créations simultanées (2026 et 2027) passeraient chacune le contrôle sans voir l'autre.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('ifspa:annees'))`;
      const voisines = await tx.anneeScolaire.findMany({
        where: { anneeDebut: { in: [anneeDebut - 1, anneeDebut, anneeDebut + 1] } },
        select: { anneeDebut: true, moisDebutEcolage: true },
      });
      if (voisines.some((v) => v.anneeDebut === anneeDebut)) return existe;
      const chevauchement = controleChevauchement({ anneeDebut, moisDebutEcolage }, voisines);
      if (chevauchement) return echec(chevauchement, { moisDebutEcolage: chevauchement });
      const a = await tx.anneeScolaire.create({
        data: { libelle, anneeDebut, moisDebutEcolage, ...datesAnnee(anneeDebut, moisDebutEcolage) },
        select: { id: true },
      });
      return succes(`Année ${libelle} créée, en préparation. Saisissez maintenant ses tarifs.`, { id: a.id });
    });
    return apres(etat);
  } catch (e) {
    if (indexEnConflit(e) !== null) return existe;
    throw e;
  }
}

export async function definirAnneeCourante(entree: z.input<typeof schemaIdentifiant>): Promise<EtatAction> {
  const { refus } = await exigerAdmin();
  if (refus) return refus;

  const lu = schemaIdentifiant.safeParse(entree);
  if (!lu.success) return echecValidation(lu.error);
  const { id } = lu.data;

  try {
    const etat = await db.$transaction(async (tx): Promise<EtatAction> => {
      const [a] = await verrouillerAnnee(tx, id);
      if (!a) return echec(ANNEE_INTROUVABLE);
      const raison = controleDefinirCourante(a);
      if (raison) return echec(raison);

      // Dans cet ordre : l'index unique partiel refuse deux années courantes, même un instant.
      await tx.anneeScolaire.updateMany({ where: { estCourante: true }, data: { estCourante: false } });
      await tx.anneeScolaire.update({ where: { id }, data: { estCourante: true } });
      return succes(`${a.libelle} est désormais l'année courante.`);
    });
    return apres(etat);
  } catch (e) {
    if (indexEnConflit(e) === "annee_scolaire_une_seule_courante") {
      return echec("L'année courante vient d'être changée par ailleurs. Rechargez la page puis réessayez.");
    }
    throw e;
  }
}

/** Verrouille les tarifs (puis inscriptions et admissions) de l'année ; ses impayés restent encaissables. */
export async function cloturerAnnee(entree: z.input<typeof schemaIdentifiant>): Promise<EtatAction> {
  const { refus } = await exigerAdmin();
  if (refus) return refus;

  const lu = schemaIdentifiant.safeParse(entree);
  if (!lu.success) return echecValidation(lu.error);
  const { id } = lu.data;

  const etat = await db.$transaction(async (tx): Promise<EtatAction> => {
    const [a] = await verrouillerAnnee(tx, id);
    if (!a) return echec(ANNEE_INTROUVABLE);
    const raison = controleCloture(a);
    if (raison) return echec(raison);

    await tx.anneeScolaire.update({ where: { id }, data: { cloturee: true } });
    return succes(`Année ${a.libelle} clôturée. Ses impayés restent encaissables.`);
  });
  return apres(etat);
}

export async function rouvrirAnnee(entree: z.input<typeof schemaIdentifiant>): Promise<EtatAction> {
  const { refus } = await exigerAdmin();
  if (refus) return refus;

  const lu = schemaIdentifiant.safeParse(entree);
  if (!lu.success) return echecValidation(lu.error);
  const { id } = lu.data;

  const etat = await db.$transaction(async (tx): Promise<EtatAction> => {
    const [a] = await verrouillerAnnee(tx, id);
    if (!a) return echec(ANNEE_INTROUVABLE);
    const raison = controleReouverture(a);
    if (raison) return echec(raison);

    await tx.anneeScolaire.update({ where: { id }, data: { cloturee: false } });
    return succes(`Année ${a.libelle} rouverte : ses tarifs sont de nouveau modifiables.`);
  });
  return apres(etat);
}

export async function supprimerAnnee(entree: z.input<typeof schemaIdentifiant>): Promise<EtatAction> {
  const { refus } = await exigerAdmin();
  if (refus) return refus;

  const lu = schemaIdentifiant.safeParse(entree);
  if (!lu.success) return echecValidation(lu.error);
  const { id } = lu.data;

  try {
    const etat = await db.$transaction(async (tx): Promise<EtatAction> => {
      const [a] = await verrouillerAnnee(tx, id);
      if (!a) return echec(ANNEE_INTROUVABLE);

      const inscriptions = await tx.inscription.count({ where: { anneeScolaireId: id } });
      const etudiantsEntres = await tx.etudiant.count({ where: { anneeEntreeId: id } });
      const admissions = await tx.operationAdmission.count({
        where: { OR: [{ anneeSourceId: id }, { anneeCibleId: id }] },
      });
      const raison = controleSuppressionAnnee(a, { inscriptions, etudiantsEntres, admissions });
      if (raison) return echec(raison);

      await tx.tarif.deleteMany({ where: { anneeScolaireId: id } });
      // Sans inscription, ses frais n'ont aucune échéance : ils partent avec l'année (classes en cascade).
      await tx.frais.deleteMany({ where: { anneeScolaireId: id } });
      await tx.anneeScolaire.delete({ where: { id } });
      return succes(`Année ${a.libelle} supprimée, avec ses tarifs et ses frais.`);
    });
    return apres(etat);
  } catch (e) {
    if (codePrisma(e) === "P2003") {
      return echec("Cette année est désormais utilisée et ne peut plus être supprimée. Clôturez-la plutôt.");
    }
    throw e;
  }
}

/** Tout ou rien. N'écrit jamais dans `Echeance` : les étudiants déjà inscrits gardent le montant copié. */
export async function enregistrerTarifs(entree: z.input<typeof schemaTarifs>): Promise<EtatAction> {
  const { refus } = await exigerAdmin();
  if (refus) return refus;

  const lu = schemaTarifs.safeParse(entree);
  if (!lu.success) return echecValidation(lu.error);
  const { anneeId, lignes } = lu.data;

  const etat = await db.$transaction(async (tx): Promise<EtatAction> => {
    // FOR SHARE : une clôture de l'année ou une modification de filière attend la fin de l'enregistrement.
    const [annee] = await tx.$queryRaw<{ libelle: string; cloturee: boolean }[]>`
      SELECT libelle, cloturee FROM annee_scolaire WHERE id = ${anneeId} FOR SHARE`;
    if (!annee) return echec(ANNEE_INTROUVABLE);
    const filieres = await tx.$queryRaw<{ id: string; code: string; dureeAnnees: number; actif: boolean; avecActifs: boolean }[]>`
      SELECT f.id, f.code, f."dureeAnnees", f.actif,
        EXISTS (SELECT 1 FROM etudiant e WHERE e."filiereId" = f.id AND e.statut = 'ACTIF') AS "avecActifs"
      FROM filiere f FOR SHARE OF f`;

    const probleme = controleLignesTarifs(annee, filieres, lignes);
    if (probleme) return echec(probleme.message, probleme.erreurs);

    for (const l of lignes) {
      const montants = {
        droitsInscription: l.droitsInscription,
        montantMensuel: l.montantMensuel,
        nombreMois: l.nombreMois,
      };
      await tx.tarif.upsert({
        where: {
          filiereId_anneeScolaireId_niveau: { filiereId: l.filiereId, anneeScolaireId: anneeId, niveau: l.niveau },
        },
        create: { filiereId: l.filiereId, anneeScolaireId: anneeId, niveau: l.niveau, ...montants },
        update: montants,
      });
    }
    return succes(`Tarifs ${annee.libelle} enregistrés.`);
  });
  return apres(etat);
}
