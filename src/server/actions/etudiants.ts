"use server";

import { db } from "@/lib/db";
import { jourMadagascar } from "@/lib/dates";
import { genererEcheances, type TarifEcheances } from "@/lib/ecolage";
import { echec, echecCode, echecValidation, succes, type EtatAction } from "@/lib/etat-action";
import {
  controleCreation,
  controleDateNaissance,
  estDoublon,
  schemaCreationEtudiant,
  schemaModificationEtudiant,
  texteRecherche,
  type EntreeCreationEtudiant,
  type EntreeModificationEtudiant,
} from "@/lib/etudiants";
import { cleCompteurMatricule, formaterMatricule } from "@/lib/matricule";
import { jourISO } from "@/lib/parametres";
import { exigerSession } from "@/server/acces";
import { prochainNumero } from "@/server/compteur";
import { OPTIONS_TRANSACTION } from "@/server/ecolage";
import { revaliderPagesEcolage } from "@/server/ecolage-revalidation";
import { echeancesFraisPour } from "@/server/frais";

const ETUDIANT_INTROUVABLE = "Cet étudiant n'existe plus. Rechargez la page.";

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

/**
 * Matricule, inscription sur l'année courante et échéances de l'année complète, d'un bloc :
 * droits et mensualités copiés du tarif, plus les frais déjà prévus pour la classe.
 */
export async function creerEtudiant(
  entree: EntreeCreationEtudiant,
): Promise<EtatAction<{ id: string; matricule: string }>> {
  const session = await exigerSession();

  const lu = schemaCreationEtudiant.safeParse(entree);
  if (!lu.success) return echecValidation(lu.error);
  const { confirmerDoublon, filiereId, niveau, ...identite } = lu.data;

  const jour = jourMadagascar(new Date());
  const refusDate = controleDateNaissance(identite.dateNaissance, jour);
  if (refusDate) return echec("Vérifiez les champs signalés.", { dateNaissance: refusDate });

  try {
    const etat = await db.$transaction(async (tx): Promise<EtatAction<{ id: string; matricule: string }>> => {
      // FOR SHARE : ni clôture de l'année, ni changement de filière, ni tarif ou frais modifiés pendant la copie.
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

      const echeances = [
        ...genererEcheances(tarif, annee),
        ...(await echeancesFraisPour(tx, annee.id, filiere.id, niveau)),
      ];
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
