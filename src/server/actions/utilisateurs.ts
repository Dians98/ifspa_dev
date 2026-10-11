"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { echec, echecValidation, succes, type EtatAction, type EtatErreur } from "@/lib/etat-action";
import { genererMotDePasse } from "@/lib/mot-de-passe";
import {
  controleActionUtilisateur,
  schemaChangementRole,
  schemaNouvelUtilisateur,
  schemaUtilisateurCible,
  type ActionUtilisateur,
} from "@/lib/parametres";
import { LIBELLE_ROLE, type Role } from "@/lib/roles";
import { exigerAdmin } from "@/server/acces";
import { indexEnConflit, messageErreurAuth } from "@/server/erreurs";

const COMPTE_INTROUVABLE = "Ce compte n'existe plus. Rechargez la page.";

function apres<D>(etat: EtatAction<D>): EtatAction<D> {
  if (etat.statut === "succes") revalidatePath("/app/parametres", "layout");
  return etat;
}

/** Erreur Better Auth traduite en état ; toute autre erreur remonte. */
function traduire(e: unknown): EtatErreur {
  const message = messageErreurAuth(e);
  if (message === null) throw e;
  return echec(message);
}

type Cible = { nom: string; estAdmin: boolean; active: boolean };

/**
 * Sérialise les actions sur les comptes (verrou consultatif PostgreSQL), relit l'acteur et la cible,
 * puis applique `controleActionUtilisateur` : deux admins ne peuvent pas se rétrograder l'un l'autre en même temps.
 */
async function sousControle<D>(
  acteurId: string,
  cibleId: string,
  action: ActionUtilisateur,
  nouveauRole: Role | undefined,
  executer: (cible: Cible) => Promise<EtatAction<D>>,
): Promise<EtatAction<D>> {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('ifspa:utilisateurs'))`;
      // Lectures hors transaction : `auth.api` écrit sur ses propres connexions, déjà validées par le détenteur précédent.
      const comptes = await db.user.findMany({
        where: { OR: [{ id: acteurId }, { id: cibleId }, { role: "admin" }] },
        select: { id: true, name: true, role: true, banned: true },
      });
      const acteur = comptes.find((u) => u.id === acteurId);
      if (!acteur || acteur.role !== "admin" || acteur.banned === true) {
        return echec("Cette action est réservée à l'administrateur.");
      }
      const c = comptes.find((u) => u.id === cibleId);
      if (!c) return echec(COMPTE_INTROUVABLE);

      const cible: Cible = { nom: c.name, estAdmin: c.role === "admin", active: c.banned !== true };
      const raison = controleActionUtilisateur({
        acteurId,
        cibleId,
        action,
        nouveauRole,
        cibleEstAdmin: cible.estAdmin,
        cibleActive: cible.active,
        adminsActifs: comptes.filter((u) => u.role === "admin" && u.banned !== true).length,
      });
      if (raison) return echec(raison);
      return executer(cible);
    },
    { maxWait: 10_000, timeout: 20_000 },
  );
}

export async function creerUtilisateur(
  entree: z.input<typeof schemaNouvelUtilisateur>,
): Promise<EtatAction<{ id: string; motDePasse: string }>> {
  const { refus } = await exigerAdmin();
  if (refus) return refus;

  const lu = schemaNouvelUtilisateur.safeParse(entree);
  if (!lu.success) return echecValidation(lu.error);
  const { nom, email, role } = lu.data;

  if (await db.user.findUnique({ where: { email }, select: { id: true } })) {
    return echec("Vérifiez les champs signalés.", { email: "Un compte existe déjà avec ce courriel." });
  }
  const motDePasse = genererMotDePasse();
  try {
    const { user } = await auth.api.createUser({
      body: { name: nom, email, password: motDePasse, role },
      headers: await headers(),
    });
    return apres(
      succes(`Compte ${LIBELLE_ROLE[role]} créé pour ${nom}. Transmettez-lui ce mot de passe provisoire.`, {
        id: user.id,
        motDePasse,
      }),
    );
  } catch (e) {
    if (indexEnConflit(e) !== null) {
      return echec("Vérifiez les champs signalés.", { email: "Un compte existe déjà avec ce courriel." });
    }
    return traduire(e);
  }
}

/** Change le rôle puis ferme les sessions ouvertes du compte. */
export async function changerRole(entree: z.input<typeof schemaChangementRole>): Promise<EtatAction> {
  const { session, refus } = await exigerAdmin();
  if (refus) return refus;

  const lu = schemaChangementRole.safeParse(entree);
  if (!lu.success) return echecValidation(lu.error);
  const { userId, role } = lu.data;
  const h = await headers();

  try {
    const etat = await sousControle(session.user.id, userId, "changerRole", role, async (cible) => {
      await auth.api.setRole({ body: { userId, role }, headers: h });
      try {
        await auth.api.revokeUserSessions({ body: { userId }, headers: h });
      } catch {
        return succes(
          `${cible.nom} est désormais ${LIBELLE_ROLE[role]}, mais ses sessions ouvertes n'ont pas pu être fermées.`,
        );
      }
      return succes(`${cible.nom} est désormais ${LIBELLE_ROLE[role]}. Ses sessions ouvertes ont été fermées.`);
    });
    return apres(etat);
  } catch (e) {
    return traduire(e);
  }
}

/** Le compte n'est jamais supprimé : ses paiements saisis restent attribués à son nom. */
export async function desactiverUtilisateur(entree: z.input<typeof schemaUtilisateurCible>): Promise<EtatAction> {
  const { session, refus } = await exigerAdmin();
  if (refus) return refus;

  const lu = schemaUtilisateurCible.safeParse(entree);
  if (!lu.success) return echecValidation(lu.error);
  const { userId } = lu.data;
  const h = await headers();

  try {
    const etat = await sousControle(session.user.id, userId, "desactiver", undefined, async (cible) => {
      // banUser ferme aussi toutes les sessions du compte.
      await auth.api.banUser({ body: { userId, banReason: "Compte désactivé par l'administrateur" }, headers: h });
      return succes(`Compte de ${cible.nom} désactivé : il ne peut plus se connecter.`);
    });
    return apres(etat);
  } catch (e) {
    return traduire(e);
  }
}

export async function reactiverUtilisateur(entree: z.input<typeof schemaUtilisateurCible>): Promise<EtatAction> {
  const { session, refus } = await exigerAdmin();
  if (refus) return refus;

  const lu = schemaUtilisateurCible.safeParse(entree);
  if (!lu.success) return echecValidation(lu.error);
  const { userId } = lu.data;
  const h = await headers();

  try {
    const etat = await sousControle(session.user.id, userId, "reactiver", undefined, async (cible) => {
      await auth.api.unbanUser({ body: { userId }, headers: h });
      return succes(`Compte de ${cible.nom} réactivé.`);
    });
    return apres(etat);
  } catch (e) {
    return traduire(e);
  }
}

/** Nouveau mot de passe provisoire, renvoyé une seule fois ; les sessions ouvertes du compte sont fermées. */
export async function reinitialiserMotDePasse(
  entree: z.input<typeof schemaUtilisateurCible>,
): Promise<EtatAction<{ motDePasse: string }>> {
  const { session, refus } = await exigerAdmin();
  if (refus) return refus;

  const lu = schemaUtilisateurCible.safeParse(entree);
  if (!lu.success) return echecValidation(lu.error);
  const { userId } = lu.data;
  const h = await headers();
  const motDePasse = genererMotDePasse();

  try {
    const etat = await sousControle(session.user.id, userId, "reinitialiserMotDePasse", undefined, async (cible) => {
      await auth.api.setUserPassword({ body: { userId, newPassword: motDePasse }, headers: h });
      // Le mot de passe est déjà changé : il doit être affiché même si la fermeture des sessions échoue.
      try {
        await auth.api.revokeUserSessions({ body: { userId }, headers: h });
      } catch {
        return succes(
          `Mot de passe de ${cible.nom} réinitialisé, mais ses sessions ouvertes n'ont pas pu être fermées.`,
          { motDePasse },
        );
      }
      return succes(`Mot de passe de ${cible.nom} réinitialisé. Ses sessions ouvertes ont été fermées.`, {
        motDePasse,
      });
    });
    return apres(etat);
  } catch (e) {
    return traduire(e);
  }
}
