import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { anneeCivile, dateHeureMadagascar, jourMadagascar } from "@/lib/dates";
import { db } from "@/lib/db";
import { repartirPaiement, resteDuTotal, restesApres, type LigneRepartie } from "@/lib/ecolage";
import { LIBELLE_MODE, LIBELLE_OPERATEUR, MESSAGE_SITUATION_CHANGEE, type Encaissement } from "@/lib/encaissement";
import {
  anneeDuRecu,
  imputerJusquAuReste,
  type CodeRefusSynchro,
  type ElementFile,
  type ResultatElementSynchro,
} from "@/lib/encaissement-hors-ligne";
import { echec, echecCode, type EtatErreur } from "@/lib/etat-action";
import { cleCompteurRecu, formaterNumeroRecu, lireNumeroRecu } from "@/lib/matricule";
import { formaterAriary } from "@/lib/montant";
import { numeroAppartientAuPoste } from "@/server/blocs-recus";
import { prochainNumero } from "@/server/compteur";
import { echeancesEtudiant, OPTIONS_TRANSACTION, verrouillerEtudiant } from "@/server/ecolage";
import { indexEnConflit, MESSAGE_ECHEC_GENERIQUE } from "@/server/erreurs";

// Enregistrement d'un paiement, en ligne (action `encaisser`) ou hors ligne (synchronisation d'un poste).

type Tx = Prisma.TransactionClient;

export const ETUDIANT_INTROUVABLE = "Cet étudiant n'existe plus. Rechargez la page.";
export const ID_CLIENT_AUTRE_ETUDIANT =
  "Cet identifiant de paiement a déjà servi pour un autre étudiant. Rechargez la page puis réessayez.";

/** Marge sur l'heure du poste, déjà corrigée du décalage mesuré à sa dernière synchronisation. */
const TOLERANCE_HORLOGE_MS = 10 * 60_000;

export type PaiementEnLigne = Encaissement & { saisiParId: string; instant: Date };
/** `recuLe` : instant de réception par le serveur, lu une fois par l'appelant. */
export type PaiementHorsLigne = ElementFile & { recuLe: Date };

export type ResultatEnregistrement =
  | {
      statut: "cree";
      paiementId: string;
      numeroRecu: string;
      /** Hors ligne : numéro du ticket remis, refusé et remplacé par `numeroRecu`. */
      numeroRemplace: string | null;
      aVerifier: boolean;
      noteVerification: string | null;
    }
  /** Cet `idClient` est déjà enregistré pour cet étudiant : rien n'est créé. */
  | { statut: "deja"; paiementId: string; numeroRecu: string; aVerifier: boolean }
  | { statut: "refus"; erreur: EtatErreur };

const refus = (erreur: EtatErreur): ResultatEnregistrement => ({ statut: "refus", erreur });

export const SELECT_PAIEMENT_EXISTANT = {
  id: true,
  etudiantId: true,
  numeroRecu: true,
  aVerifier: true,
  montant: true,
  mode: true,
  operateur: true,
  reference: true,
} as const satisfies Prisma.PaiementSelect;

export type PaiementExistant = Prisma.PaiementGetPayload<{ select: typeof SELECT_PAIEMENT_EXISTANT }>;

/**
 * Cet `idClient` est déjà enregistré : « deja » seulement pour la même saisie. Un autre montant ou mode
 * (coupure pendant l'envoi, saisie corrigée puis renvoyée) est refusé, jamais confondu avec le reçu existant.
 */
export function controleDeja(
  existant: PaiementExistant,
  entree: Pick<Encaissement, "etudiantId" | "montant" | "mode" | "operateur" | "reference">,
): ResultatEnregistrement {
  if (existant.etudiantId !== entree.etudiantId) return refus(echec(ID_CLIENT_AUTRE_ETUDIANT));
  const memeSaisie =
    existant.montant === entree.montant &&
    existant.mode === entree.mode &&
    existant.operateur === entree.operateur &&
    existant.reference === entree.reference;
  if (!memeSaisie) {
    const mode = existant.operateur ? LIBELLE_OPERATEUR[existant.operateur] : LIBELLE_MODE[existant.mode].toLowerCase();
    return refus(
      echec(
        `Ce paiement est déjà enregistré sous le reçu ${existant.numeroRecu}, pour ${formaterAriary(existant.montant)} en ${mode}. ` +
          "Vérifiez ce reçu dans Paiements ; pour encaisser un autre montant, rouvrez l'étudiant.",
      ),
    );
  }
  return { statut: "deja", paiementId: existant.id, numeroRecu: existant.numeroRecu, aVerifier: existant.aVerifier };
}

function heurePoste(instant: Date): string {
  const { date, heure } = dateHeureMadagascar(instant);
  return `${date} à ${heure}`;
}

type NumeroHorsLigne = {
  /** null : numéro du poste refusé, un numéro est tiré en ligne. */
  numeroRecu: string | null;
  raisonRefus: string | null;
  date: Date;
  noteHeure: string | null;
};

/** Raison du refus du numéro fourni par le poste, ou null s'il est valable (bloc alors verrouillé). */
async function controleNumero(
  tx: Tx,
  e: PaiementHorsLigne,
  instantPoste: Date | null,
): Promise<{ raison: string; bloc: null } | { raison: null; bloc: { createdAt: Date } }> {
  const lu = lireNumeroRecu(e.numeroRecu);
  if (!lu) return { raison: "format invalide", bloc: null };
  if (instantPoste && anneeDuRecu(instantPoste) !== lu.annee) {
    return { raison: `il ne correspond pas à l'année de la saisie (${heurePoste(instantPoste)})`, bloc: null };
  }
  const bloc = await numeroAppartientAuPoste(tx, e.poste, e.numeroRecu);
  if (!bloc) {
    const ailleurs = await tx.blocNumeros.findFirst({
      where: { cle: cleCompteurRecu(lu.annee), premier: { lte: lu.numero }, dernier: { gte: lu.numero } },
      select: { id: true },
    });
    return { raison: ailleurs ? "il appartient au bloc d'un autre poste" : "il n'appartient à aucun bloc réservé", bloc: null };
  }
  if (bloc.reserveParId !== e.saisiParId) return { raison: "il appartient au bloc d'un autre utilisateur", bloc: null };
  if (await tx.paiement.findUnique({ where: { numeroRecu: e.numeroRecu }, select: { id: true } })) {
    return { raison: "il est déjà utilisé par un autre paiement", bloc: null };
  }
  return { raison: null, bloc };
}

/** Numéro du poste s'il est valable ; date = heure du poste si elle est plausible, sinon heure de synchronisation. */
async function numeroHorsLigne(tx: Tx, e: PaiementHorsLigne): Promise<NumeroHorsLigne> {
  const brut = new Date(e.instantSaisie);
  const instantPoste = Number.isNaN(brut.getTime()) ? null : brut;
  const { raison, bloc } = await controleNumero(tx, e, instantPoste);

  const plausible =
    instantPoste !== null &&
    instantPoste.getTime() <= e.recuLe.getTime() + TOLERANCE_HORLOGE_MS &&
    (!bloc || instantPoste.getTime() >= bloc.createdAt.getTime() - TOLERANCE_HORLOGE_MS);
  return {
    numeroRecu: raison ? null : e.numeroRecu,
    raisonRefus: raison,
    date: plausible ? instantPoste : e.recuLe,
    noteHeure: plausible
      ? null
      : `Heure du poste incohérente (${instantPoste ? heurePoste(instantPoste) : e.instantSaisie}) : l'heure de synchronisation a été retenue.`,
  };
}

/**
 * Enregistre un paiement sous verrou de l'étudiant et de ses échéances, réparti de la plus ancienne à la plus récente.
 * En ligne : numéro tiré du compteur ; refus `SITUATION_CHANGEE` si le reste dû n'est plus celui affiché.
 * Hors ligne, jamais refusé pour sa situation ni son numéro : `aVerifier` avec une note si la situation a changé,
 * si le montant dépasse le reste dû (imputé jusqu'au reste, décision 34) ou si le numéro est refusé (remplacé, décision 40).
 */
export async function enregistrerPaiement(tx: Tx, entree: PaiementEnLigne, origine: "en-ligne"): Promise<ResultatEnregistrement>;
export async function enregistrerPaiement(tx: Tx, entree: PaiementHorsLigne, origine: "hors-ligne"): Promise<ResultatEnregistrement>;
export async function enregistrerPaiement(
  tx: Tx,
  entree: PaiementEnLigne | PaiementHorsLigne,
  origine: "en-ligne" | "hors-ligne",
): Promise<ResultatEnregistrement> {
  if (!(await verrouillerEtudiant(tx, entree.etudiantId))) return refus(echecCode("INTROUVABLE", ETUDIANT_INTROUVABLE));
  // Relu sous verrou : un second envoi simultané attendait le premier.
  const deja = await tx.paiement.findUnique({ where: { idClient: entree.idClient }, select: SELECT_PAIEMENT_EXISTANT });
  if (deja) return controleDeja(deja, entree);
  if (!Number.isInteger(entree.montant) || entree.montant <= 0) {
    return refus(echec("Le montant doit être supérieur à 0.", { montant: "Le montant doit être supérieur à 0." }));
  }

  const horsLigne = origine === "hors-ligne" ? await numeroHorsLigne(tx, entree as PaiementHorsLigne) : null;
  const date = horsLigne ? horsLigne.date : (entree as PaiementEnLigne).instant;
  const jour = jourMadagascar(date);
  const notes: string[] = horsLigne?.noteHeure ? [horsLigne.noteHeure] : [];

  const nonSoldees = (await echeancesEtudiant(tx, entree.etudiantId))
    .map((e) => ({ ...e, reste: Math.max(0, e.montantDu - e.paye) }))
    .filter((e) => e.reste > 0);
  const total = resteDuTotal(nonSoldees);

  let lignes: LigneRepartie[];
  if (!horsLigne) {
    if (total !== entree.resteDuAffiche) return refus(echecCode("SITUATION_CHANGEE", MESSAGE_SITUATION_CHANGEE));
    const repartition = repartirPaiement(nonSoldees, entree.montant);
    if (!repartition.ok) return refus(echec(repartition.erreur, { montant: repartition.erreur }));
    lignes = repartition.lignes;
  } else {
    if (total !== entree.resteDuAffiche) {
      notes.push(
        `Situation changée avant la synchronisation : le poste affichait ${formaterAriary(entree.resteDuAffiche)} de reste dû, le serveur ${formaterAriary(total)}.`,
      );
    }
    const imputation = imputerJusquAuReste(nonSoldees, entree.montant);
    if (imputation.surplus > 0) {
      notes.push(
        `Surplus non imputé de ${formaterAriary(imputation.surplus)} : ${formaterAriary(entree.montant)} reçus pour ${formaterAriary(total)} encore dus. À rembourser ou à régulariser.`,
      );
    }
    lignes = imputation.lignes;
  }
  const { resteApres, retardApres } = restesApres(nonSoldees, lignes, jour);

  let numeroRecu = horsLigne?.numeroRecu ?? null;
  if (!numeroRecu) {
    const annee = anneeCivile(jour);
    numeroRecu = formaterNumeroRecu(annee, await prochainNumero(tx, cleCompteurRecu(annee)));
  }
  const numeroRemplace = horsLigne?.raisonRefus ? (entree as PaiementHorsLigne).numeroRecu : null;
  if (horsLigne?.raisonRefus) {
    notes.unshift(`Ticket remis n° ${numeroRemplace} refusé : ${horsLigne.raisonRefus}. Nouveau numéro attribué : ${numeroRecu}.`);
  }
  const noteVerification = notes.length > 0 ? notes.join(" ") : null;

  const paiement = await tx.paiement.create({
    data: {
      numeroRecu,
      etudiantId: entree.etudiantId,
      date,
      // Peut dépasser la somme des lignes : seulement pour un paiement hors ligne à vérifier (surplus).
      montant: entree.montant,
      mode: entree.mode,
      operateur: entree.operateur,
      reference: entree.reference,
      observation: entree.observation,
      saisiParId: entree.saisiParId,
      idClient: entree.idClient,
      aVerifier: noteVerification !== null,
      noteVerification,
      resteApres,
      retardApres,
      lignes: {
        create: lignes.map((l) => ({ echeanceId: l.echeanceId, montant: l.montant, resteEcheanceApres: l.resteEcheance })),
      },
    },
    select: { id: true },
  });
  return {
    statut: "cree",
    paiementId: paiement.id,
    numeroRecu,
    numeroRemplace,
    aVerifier: noteVerification !== null,
    noteVerification,
  };
}

function versResultatSynchro(e: PaiementHorsLigne, r: ResultatEnregistrement): ResultatElementSynchro {
  const idClient = e.idClient;
  switch (r.statut) {
    case "cree": {
      const message = r.numeroRemplace
        ? `Ticket ${r.numeroRemplace} à remplacer par le reçu ${r.numeroRecu}, à vérifier par l'administrateur.`
        : r.aVerifier
          ? `Reçu ${r.numeroRecu} enregistré, à vérifier par l'administrateur : ${r.noteVerification}`
          : `Reçu ${r.numeroRecu} enregistré.`;
      return { idClient, statut: "enregistre", paiementId: r.paiementId, numeroRecu: r.numeroRecu, numeroRemplace: r.numeroRemplace, aVerifier: r.aVerifier, message };
    }
    case "deja": {
      // Réponse précédente perdue : le poste apprend ici que son ticket a été remplacé.
      const numeroRemplace = r.numeroRecu !== e.numeroRecu ? e.numeroRecu : null;
      return {
        idClient,
        statut: "deja",
        paiementId: r.paiementId,
        numeroRecu: r.numeroRecu,
        numeroRemplace,
        aVerifier: r.aVerifier,
        message: numeroRemplace
          ? `Déjà enregistré : ticket ${numeroRemplace} à remplacer par le reçu ${r.numeroRecu}.`
          : `Reçu ${r.numeroRecu} déjà enregistré.`,
      };
    }
    case "refus": {
      const code: CodeRefusSynchro = r.erreur.code === "INTROUVABLE" ? "INTROUVABLE" : "INVALIDE";
      return { idClient, statut: "refuse", message: r.erreur.message, code };
    }
  }
}

async function enregistrerHorsLigne(entree: PaiementHorsLigne): Promise<ResultatElementSynchro> {
  // Second essai sur conflit de numéro : il relit le numéro comme pris et en tire un nouveau.
  for (let essai = 1; ; essai++) {
    try {
      const r = await db.$transaction((tx) => enregistrerPaiement(tx, entree, "hors-ligne"), OPTIONS_TRANSACTION);
      return versResultatSynchro(entree, r);
    } catch (e) {
      const index = indexEnConflit(e);
      if (index?.includes("idClient")) {
        const p = await db.paiement.findUnique({ where: { idClient: entree.idClient }, select: SELECT_PAIEMENT_EXISTANT });
        if (p) return versResultatSynchro(entree, controleDeja(p, entree));
      }
      if (index?.includes("numeroRecu") && essai < 2) continue;
      if (e instanceof RangeError) return { idClient: entree.idClient, statut: "refuse", message: e.message, code: "ERREUR" };
      console.error("Synchronisation d'un paiement hors ligne", e);
      return { idClient: entree.idClient, statut: "refuse", message: MESSAGE_ECHEC_GENERIQUE, code: "ERREUR" };
    }
  }
}

/**
 * « Ticket R-2026-00021 · 50 000 Ar · RAKOTO Jean (IF-2026-0001) », lu sur l'élément brut (valide ou non) :
 * le poste affiche le refus tel quel, il doit dire de quel paiement il s'agit.
 */
export async function designationPaiement(brut: unknown): Promise<string> {
  const v = (typeof brut === "object" && brut !== null ? brut : {}) as { numeroRecu?: unknown; montant?: unknown; etudiantId?: unknown };
  const numero = typeof v.numeroRecu === "string" ? v.numeroRecu.trim().slice(0, 30) : "";
  const parties = [numero ? `Ticket ${numero}` : "Paiement sans numéro"];
  if (typeof v.montant === "number" && Number.isSafeInteger(v.montant) && v.montant > 0) parties.push(formaterAriary(v.montant));
  if (typeof v.etudiantId === "string" && v.etudiantId.length > 0 && v.etudiantId.length <= 40) {
    try {
      const e = await db.etudiant.findUnique({ where: { id: v.etudiantId }, select: { nom: true, prenoms: true, matricule: true } });
      if (e) parties.push(`${e.nom} ${e.prenoms} (${e.matricule})`);
    } catch {
      // Le nom n'est qu'un repère : son absence ne doit pas faire échouer la synchronisation.
    }
  }
  return parties.join(" · ");
}

/**
 * Un élément de file, dans sa propre transaction : un refus n'empêche pas les suivants.
 * L'appelant a vérifié que la session est celle de `saisiParId` (décision 36) et revalide les pages ensuite.
 */
export async function synchroniserPaiement(entree: PaiementHorsLigne): Promise<ResultatElementSynchro> {
  const r = await enregistrerHorsLigne(entree);
  if (r.statut !== "refuse") return r;
  return { ...r, message: `${await designationPaiement(entree)} : ${r.message}` };
}
