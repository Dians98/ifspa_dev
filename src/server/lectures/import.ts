import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { dateDuJour, jourDeDate } from "@/lib/dates";
import { db } from "@/lib/db";
import {
  anneesPaiementsCitees,
  joursNaissanceCites,
  PREFIXE_CLE_REPRISE,
  type ContexteReprise,
  type EtudiantEnBase,
} from "@/lib/import-analyse";
import type { RepriseLue } from "@/lib/import-lecture";
import { parametresModele, type ParametresModele } from "@/lib/import-modele";
import { cleCompteurRecu } from "@/lib/matricule";
import { echeancesDesEtudiants } from "@/server/ecolage";

type Client = Prisma.TransactionClient;

/** Paramètres du modèle téléchargeable : année courante, mensualités, filières actives, années d'entrée à créer. Null sans année courante. */
export async function lireParametresModele(): Promise<ParametresModele | null> {
  const annee = await db.anneeScolaire.findFirst({
    where: { estCourante: true },
    select: { id: true, anneeDebut: true, moisDebutEcolage: true },
  });
  if (!annee) return null;
  const [tarifs, filieres, annees] = await Promise.all([
    db.tarif.findMany({ where: { anneeScolaireId: annee.id }, select: { nombreMois: true } }),
    db.filiere.findMany({ where: { actif: true }, select: { code: true, dureeAnnees: true } }),
    db.anneeScolaire.findMany({ select: { anneeDebut: true } }),
  ]);
  return parametresModele({
    anneeDebut: annee.anneeDebut,
    moisDebutEcolage: annee.moisDebutEcolage,
    nombresMois: tarifs.map((t) => t.nombreMois),
    filieres,
    anneesExistantes: annees.map((a) => a.anneeDebut),
  });
}

/**
 * Ce que l'analyse doit savoir de la base, limité aux étudiants nés les jours cités par le fichier.
 * Requêtes l'une après l'autre : `client` peut être celui d'une transaction (import), qui n'en exécute qu'une à la fois.
 */
export async function lireContexteReprise(client: Client, lu: RepriseLue): Promise<ContexteReprise> {
  const courante = await client.anneeScolaire.findFirst({
    where: { estCourante: true },
    select: { id: true, anneeDebut: true, libelle: true, cloturee: true, moisDebutEcolage: true, dateDebut: true },
  });
  const filieres = await client.filiere.findMany({ select: { id: true, code: true, nom: true, dureeAnnees: true, actif: true } });
  const annees = await client.anneeScolaire.findMany({ select: { id: true, anneeDebut: true, libelle: true, cloturee: true } });
  const vide: ContexteReprise = {
    anneeCourante: null, filieres, annees, tarifs: [], etudiantsEnBase: [], clesReprise: new Set(), compteursRecu: {},
  };
  if (!courante) return vide;

  const tarifs = await client.tarif.findMany({
    where: { anneeScolaireId: courante.id },
    select: { filiereId: true, niveau: true, droitsInscription: true, montantMensuel: true, nombreMois: true },
  });

  const naissances = joursNaissanceCites(lu).map(dateDuJour);
  const etudiants =
    naissances.length === 0
      ? []
      : await client.etudiant.findMany({
          where: { dateNaissance: { in: naissances } },
          select: {
            id: true,
            matricule: true,
            nom: true,
            prenoms: true,
            dateNaissance: true,
            filiereId: true,
            statut: true,
            anneeEntree: { select: { anneeDebut: true } },
            inscriptions: {
              where: { anneeScolaireId: courante.id },
              select: { niveau: true, redoublement: true, droitsEnTranches: true },
            },
          },
        });
  const ids = etudiants.map((e) => e.id);
  const echeances = ids.length === 0 ? new Map() : await echeancesDesEtudiants(client, { id: { in: ids } });
  const horsReprise =
    ids.length === 0
      ? []
      : await client.paiement.groupBy({
          by: ["etudiantId"],
          where: {
            etudiantId: { in: ids },
            annule: false,
            OR: [{ idClient: null }, { NOT: { idClient: { startsWith: PREFIXE_CLE_REPRISE } } }],
          },
          _count: { _all: true },
        });
  const nbHorsReprise = new Map(horsReprise.map((g) => [g.etudiantId, g._count._all]));

  const cles = await client.paiement.findMany({
    where: { idClient: { startsWith: PREFIXE_CLE_REPRISE } },
    select: { idClient: true },
  });
  const anneesRecus = anneesPaiementsCitees(lu);
  const compteurs =
    anneesRecus.length === 0
      ? []
      : await client.compteur.findMany({ where: { cle: { in: anneesRecus.map(cleCompteurRecu) } }, select: { cle: true, valeur: true } });
  const compteursRecu: Record<number, number> = {};
  for (const a of anneesRecus) compteursRecu[a] = compteurs.find((c) => c.cle === cleCompteurRecu(a))?.valeur ?? 0;

  return {
    anneeCourante: {
      id: courante.id,
      anneeDebut: courante.anneeDebut,
      libelle: courante.libelle,
      cloturee: courante.cloturee,
      moisDebutEcolage: courante.moisDebutEcolage,
      dateDebut: jourDeDate(courante.dateDebut),
    },
    filieres,
    annees,
    tarifs,
    etudiantsEnBase: etudiants.map(
      (e): EtudiantEnBase => ({
        id: e.id,
        matricule: e.matricule,
        nom: e.nom,
        prenoms: e.prenoms,
        dateNaissance: e.dateNaissance,
        filiereId: e.filiereId,
        anneeEntree: e.anneeEntree.anneeDebut,
        statut: e.statut,
        inscriptionCourante: e.inscriptions[0] ?? null,
        echeances: echeances.get(e.id) ?? [],
        paiementsHorsReprise: nbHorsReprise.get(e.id) ?? 0,
      }),
    ),
    clesReprise: new Set(cles.flatMap((c) => (c.idClient ? [c.idClient] : []))),
    compteursRecu,
  };
}
