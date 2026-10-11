"use server";

import { db } from "@/lib/db";
import { jourMadagascar } from "@/lib/dates";
import { genererEcheances, tarifDepuisEcheances, type TarifEcheances } from "@/lib/ecolage";
import { echec, echecCode, echecValidation, succes, type EtatAction } from "@/lib/etat-action";
import {
  controleCreation,
  controleDateNaissance,
  controleTranchesModifiables,
  estDoublon,
  schemaCreationEtudiant,
  schemaModificationEtudiant,
  schemaModifTranches,
  texteRecherche,
  type EntreeCreationEtudiant,
  type EntreeModificationEtudiant,
} from "@/lib/etudiants";
import { cleCompteurMatricule, formaterMatricule } from "@/lib/matricule";
import { jourISO } from "@/lib/parametres";
import type { z } from "zod";
import { exigerSession } from "@/server/acces";
import { prochainNumero } from "@/server/compteur";
import { OPTIONS_TRANSACTION, verrouillerEtudiant } from "@/server/ecolage";
import { revaliderPagesEcolage } from "@/server/ecolage-revalidation";

const ETUDIANT_INTROUVABLE = "Cet étudiant n'existe plus. Rechargez la page.";
const INSCRIPTION_INTROUVABLE = "Cette inscription n'existe plus. Rechargez la page.";

function apres<D>(etat: EtatAction<D>): EtatAction<D> {
  if (etat.statut === "succes") revaliderPagesEcolage();
  return etat;
}

/** Les RangeError de la logique pure (tarif invalide, plus de matricule disponible) portent un message affichable. */
function messageRange(e: unknown): string | null {
  return e instanceof RangeError ? e.message : null;
}

type AnneeCourante = { id: string; libelle: string; anneeDebut: number; moisDebutEcolage: number; cloturee: boolean };
type FiliereInscription = { id: string; code: string; nom: string; dureeAnnees: number; actif: boolean };

/** Matricule, inscription sur l'année courante et échéances de l'année complète (montants copiés du tarif), d'un bloc. */
export async function creerEtudiant(
  entree: EntreeCreationEtudiant,
): Promise<EtatAction<{ id: string; matricule: string }>> {
  const session = await exigerSession();

  const lu = schemaCreationEtudiant.safeParse(entree);
  if (!lu.success) return echecValidation(lu.error);
  const { confirmerDoublon, filiereId, niveau, droitsEnTranches, ...identite } = lu.data;

  const jour = jourMadagascar(new Date());
  const refusDate = controleDateNaissance(identite.dateNaissance, jour);
  if (refusDate) return echec("Vérifiez les champs signalés.", { dateNaissance: refusDate });

  try {
    const etat = await db.$transaction(async (tx): Promise<EtatAction<{ id: string; matricule: string }>> => {
      // FOR SHARE : ni clôture de l'année, ni changement de code ou de durée de la filière, ni tarif modifié pendant la copie.
      const [annee] = await tx.$queryRaw<AnneeCourante[]>`
        SELECT id, libelle, "anneeDebut", "moisDebutEcolage", cloturee
        FROM annee_scolaire WHERE "estCourante" FOR SHARE`;
      const [filiere] = await tx.$queryRaw<FiliereInscription[]>`
        SELECT id, code, nom, "dureeAnnees", actif FROM filiere WHERE id = ${filiereId} FOR SHARE`;
      const [tarif] =
        annee && filiere
          ? await tx.$queryRaw<TarifEcheances[]>`
              SELECT "droitsInscription", "montantMensuel", "nombreMois" FROM tarif
              WHERE "filiereId" = ${filiere.id} AND "anneeScolaireId" = ${annee.id} AND niveau = ${niveau} FOR SHARE`
          : [];

      const refus = controleCreation({
        annee: annee ?? null,
        filiere: filiere ?? null,
        niveau,
        tarif: tarif ?? null,
        droitsEnTranches,
      });
      if (refus || !annee || !filiere || !tarif) return echec(refus ?? "Inscription impossible. Rechargez la page.");

      // Deux saisies simultanées de la même personne : la seconde attend et voit la première.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ifspa:etudiant:${jourISO(identite.dateNaissance)}`}))`;
      if (!confirmerDoublon) {
        const memeNaissance = await tx.etudiant.findMany({
          where: { dateNaissance: identite.dateNaissance },
          select: { matricule: true, nom: true, prenoms: true, dateNaissance: true },
        });
        const doublons = memeNaissance.filter((e) => estDoublon(e, identite));
        if (doublons.length > 0) {
          const qui = doublons.map((e) => `${e.nom} ${e.prenoms} (${e.matricule})`).join(", ");
          return echecCode(
            "DOUBLON_POSSIBLE",
            `Un étudiant porte déjà ce nom, ces prénoms et cette date de naissance : ${qui}. S'il s'agit bien d'une autre personne, confirmez la création.`,
          );
        }
      }

      const echeances = genererEcheances(tarif, annee, droitsEnTranches);
      const seq = await prochainNumero(tx, cleCompteurMatricule(filiere.code, annee.anneeDebut));
      const matricule = formaterMatricule(filiere.code, annee.anneeDebut, seq);

      const etudiant = await tx.etudiant.create({
        data: {
          ...identite,
          matricule,
          recherche: texteRecherche({ nom: identite.nom, prenoms: identite.prenoms, matricule }),
          filiereId: filiere.id,
          anneeEntreeId: annee.id,
          creeParId: session.user.id,
          inscriptions: {
            create: {
              anneeScolaireId: annee.id,
              niveau,
              redoublement: false,
              droitsEnTranches,
              echeances: { create: echeances },
            },
          },
        },
        select: { id: true },
      });
      return succes(`Étudiant inscrit : matricule ${matricule}.`, { id: etudiant.id, matricule });
    }, OPTIONS_TRANSACTION);
    return apres(etat);
  } catch (e) {
    const message = messageRange(e);
    if (message) return echec(message);
    throw e;
  }
}

/** Identité et contact seulement ; filière, année d'entrée et matricule ne changent jamais. */
export async function modifierEtudiant(entree: EntreeModificationEtudiant): Promise<EtatAction> {
  await exigerSession();

  const lu = schemaModificationEtudiant.safeParse(entree);
  if (!lu.success) return echecValidation(lu.error);
  const { id, ...identite } = lu.data;

  const refusDate = controleDateNaissance(identite.dateNaissance, jourMadagascar(new Date()));
  if (refusDate) return echec("Vérifiez les champs signalés.", { dateNaissance: refusDate });

  const actuel = await db.etudiant.findUnique({ where: { id }, select: { matricule: true } });
  if (!actuel) return echecCode("INTROUVABLE", ETUDIANT_INTROUVABLE);

  await db.etudiant.update({
    where: { id },
    data: {
      ...identite,
      recherche: texteRecherche({ nom: identite.nom, prenoms: identite.prenoms, matricule: actuel.matricule }),
    },
  });
  return apres(succes("Fiche enregistrée."));
}

/**
 * Redécoupe les droits d'une inscription tant qu'aucune ligne de paiement (même annulée) ne les touche.
 * Les mensualités sont gardées (leurs lignes de paiement pointent sur leur id) ; seul leur `ordre` change.
 */
export async function modifierTranchesDroits(entree: z.input<typeof schemaModifTranches>): Promise<EtatAction> {
  await exigerSession();

  const lu = schemaModifTranches.safeParse(entree);
  if (!lu.success) return echecValidation(lu.error);
  const { inscriptionId, droitsEnTranches } = lu.data;

  const cible = await db.inscription.findUnique({ where: { id: inscriptionId }, select: { etudiantId: true } });
  if (!cible) return echecCode("INTROUVABLE", INSCRIPTION_INTROUVABLE);

  try {
    const etat = await db.$transaction(async (tx): Promise<EtatAction> => {
      if (!(await verrouillerEtudiant(tx, cible.etudiantId))) return echecCode("INTROUVABLE", ETUDIANT_INTROUVABLE);

      const inscription = await tx.inscription.findUnique({
        where: { id: inscriptionId },
        select: {
          droitsEnTranches: true,
          anneeScolaire: { select: { anneeDebut: true, moisDebutEcolage: true, libelle: true, cloturee: true } },
          echeances: { select: { id: true, type: true, mois: true, montantDu: true } },
        },
      });
      if (!inscription) return echecCode("INTROUVABLE", INSCRIPTION_INTROUVABLE);
      const annee = inscription.anneeScolaire;
      if (inscription.droitsEnTranches === droitsEnTranches) {
        return echec(
          droitsEnTranches === 1
            ? "Les droits sont déjà payables en une fois."
            : `Les droits sont déjà payables en ${droitsEnTranches} fois.`,
        );
      }

      const lignesPaiementDroits = await tx.paiementLigne.count({
        where: { echeance: { inscriptionId, type: "DROITS" } },
      });
      const refus = controleTranchesModifiables({
        lignesPaiementDroits,
        anneeLibelle: annee.libelle,
        anneeCloturee: annee.cloturee,
      });
      if (refus) return echec(refus);

      const generees = genererEcheances(tarifDepuisEcheances(inscription.echeances), annee, droitsEnTranches);
      const mensualites = new Map(
        inscription.echeances.filter((e) => e.type === "MENSUALITE").map((e) => [jourISO(e.mois), e]),
      );
      const nouvellesMensualites = generees.filter((g) => g.type === "MENSUALITE");
      const coherent =
        nouvellesMensualites.length === mensualites.size &&
        nouvellesMensualites.every((g) => mensualites.get(jourISO(g.mois))?.montantDu === g.montantDu);
      if (!coherent) {
        return echec("Échéancier incohérent : redécoupage des droits impossible. Prévenez le responsable technique.");
      }

      // Ordres passés en négatif d'abord : l'unicité (inscriptionId, ordre) tient à chaque instruction.
      await tx.$executeRaw`UPDATE echeance SET ordre = -ordre WHERE "inscriptionId" = ${inscriptionId}`;
      await tx.echeance.deleteMany({ where: { inscriptionId, type: "DROITS" } });
      for (const g of nouvellesMensualites) {
        await tx.echeance.update({ where: { id: mensualites.get(jourISO(g.mois))!.id }, data: { ordre: g.ordre } });
      }
      await tx.echeance.createMany({
        data: generees.filter((g) => g.type === "DROITS").map((g) => ({ ...g, inscriptionId })),
      });
      await tx.inscription.update({ where: { id: inscriptionId }, data: { droitsEnTranches } });

      return succes(
        droitsEnTranches === 1
          ? `Droits ${annee.libelle} payables en une fois.`
          : `Droits ${annee.libelle} payables en ${droitsEnTranches} fois.`,
      );
    }, OPTIONS_TRANSACTION);
    return apres(etat);
  } catch (e) {
    const message = messageRange(e);
    if (message) return echec(message);
    throw e;
  }
}
