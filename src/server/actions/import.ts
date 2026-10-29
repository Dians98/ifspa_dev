"use server";

import { db } from "@/lib/db";
import { dateDuJour, jourMadagascar } from "@/lib/dates";
import { genererEcheances } from "@/lib/ecolage";
import { echec, succes, type EtatAction } from "@/lib/etat-action";
import { texteRecherche } from "@/lib/etudiants";
import {
  allegerRapport,
  analyserReprise as analyser,
  echeancesFraisReprise,
  joursNaissanceCites,
  signatureReprise,
  type RapportRepriseAllege,
} from "@/lib/import-analyse";
import type { RepriseLue } from "@/lib/import-lecture";
import { cleCompteurMatricule, formaterMatricule } from "@/lib/matricule";
import { exigerAdmin } from "@/server/acces";
import { prochainNumero } from "@/server/compteur";
import { OPTIONS_TRANSACTION_REPRISE } from "@/server/ecolage";
import { revaliderPagesEcolage } from "@/server/ecolage-revalidation";
import { codePrisma } from "@/server/erreurs";
import { fichiersDepuisFormData, lireFichiersReprise } from "@/server/import/lire-fichiers";
import { lireContexteReprise } from "@/server/lectures/import";

// Reprise des données (Paramètres › Import, admin) : analyse sans écriture, puis import en une transaction.
// Seuls les étudiants et leur inscription sur l'année courante sont repris ; les paiements s'encaissent au guichet.

export type AnalyseReprise = {
  rapport: RapportRepriseAllege;
  /** À renvoyer avec les mêmes fichiers pour importer ; null si le rapport est bloquant. */
  signature: string | null;
};

export type EtudiantImporte = { ligne: number; numero: string; nom: string; prenoms: string; matricule: string; id: string; nouveau: boolean };

export type ResumeImport = {
  /** Dans l'ordre du plan (celui des matricules), déjà en base compris. */
  etudiants: EtudiantImporte[];
  etudiantsCrees: number;
};

const SIGNATURE = /^[0-9a-f]{64}$/;

const RELANCER = "Rien n'a été importé : analysez le fichier à nouveau.";
const PLAN_CHANGE = "Le fichier ou la base ont changé depuis le rapport. Rien n'a été importé : analysez le fichier à nouveau.";
const RIEN_A_IMPORTER = "Rien à importer : les étudiants du fichier sont déjà en base. Rien n'a été modifié.";
const TROP_LONG = "L'import a pris trop de temps et a été abandonné : rien n'a été importé. Importez le fichier en plusieurs parties.";

async function lireDepot(formData: FormData): Promise<{ lu: RepriseLue } | { erreur: string }> {
  const fichiers = await fichiersDepuisFormData(formData);
  if ("erreur" in fichiers) return fichiers;
  const lecture = await lireFichiersReprise(fichiers);
  return lecture.ok ? { lu: lecture.lu } : { erreur: lecture.erreur };
}

function pluriel(n: number, un: string, plusieurs: string): string {
  return `${n} ${n > 1 ? plusieurs : un}`;
}

/** Champ `fichiers` (le .xlsx, ou les CSV). N'écrit rien. */
export async function analyserReprise(formData: FormData): Promise<EtatAction<AnalyseReprise>> {
  const { refus } = await exigerAdmin();
  if (refus) return refus;

  const depot = await lireDepot(formData);
  if ("erreur" in depot) return echec(depot.erreur);

  const jour = jourMadagascar(new Date());
  const rapport = analyser(depot.lu, await lireContexteReprise(db, depot.lu), jour);
  const t = rapport.totaux;
  const message = rapport.bloquant
    ? `${pluriel(t.erreurs, "erreur", "erreurs")} : rien ne peut être importé. Corrigez le fichier, puis déposez-le à nouveau.`
    : `Prêt à importer ${pluriel(t.etudiants.nouveaux, "nouvel étudiant", "nouveaux étudiants")}.`;
  return succes(message, {
    rapport: allegerRapport(rapport),
    signature: rapport.bloquant ? null : signatureReprise(rapport.canonique),
  });
}

/**
 * Champs `fichiers` (les mêmes qu'à l'analyse) et `signature`. Une seule transaction : le fichier est relu et
 * ré-analysé sous verrou, refusé si le plan n'est plus celui confirmé ; tout refus en cours de route annule tout.
 */
export async function importerReprise(formData: FormData): Promise<EtatAction<ResumeImport>> {
  const { session, refus } = await exigerAdmin();
  if (refus) return refus;

  const signature = formData.get("signature");
  if (typeof signature !== "string" || !SIGNATURE.test(signature)) {
    return echec("Analysez le fichier avant de l'importer.");
  }
  const depot = await lireDepot(formData);
  if ("erreur" in depot) return echec(depot.erreur);
  const { lu } = depot;
  const jour = jourMadagascar(new Date());

  try {
    const etat = await db.$transaction(async (tx): Promise<EtatAction<ResumeImport>> => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('ifspa:reprise'))`;
      // Mêmes verrous que creerEtudiant : une saisie simultanée de la même personne attend la fin de l'import.
      const cles = joursNaissanceCites(lu).map((j) => `ifspa:etudiant:${j}`);
      for (const cle of cles) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${cle}))`;
      // FOR SHARE : ni clôture de l'année, ni filière, tarif ou frais modifiés pendant l'import.
      await tx.$queryRaw`SELECT id FROM annee_scolaire WHERE "estCourante" FOR SHARE`;
      await tx.$queryRaw`SELECT id FROM filiere FOR SHARE`;
      await tx.$queryRaw`
        SELECT t.id FROM tarif t JOIN annee_scolaire a ON a.id = t."anneeScolaireId" WHERE a."estCourante" FOR SHARE OF t`;

      const ctx = await lireContexteReprise(tx, lu);
      const rapport = analyser(lu, ctx, jour);
      const annee = ctx.anneeCourante;
      if (rapport.bloquant || !annee) {
        return echec(`Le fichier contient des erreurs : ${rapport.messages.find((m) => m.gravite === "erreur")?.texte ?? ""} ${RELANCER}`);
      }
      if (signatureReprise(rapport.canonique) !== signature) return echec(PLAN_CHANGE);
      if (!rapport.etudiants.some((e) => e.statut === "nouveau")) return echec(RIEN_A_IMPORTER);

      const codeFiliere = new Map(ctx.filieres.map((f) => [f.id, f.code]));
      const etudiants: EtudiantImporte[] = [];

      for (const e of rapport.etudiants) {
        const d = e.donnees;
        if (!d || !e.numero) continue;
        if (e.statut === "existant" && e.existant) {
          etudiants.push({ ligne: e.ligne, numero: e.numero, nom: d.nom, prenoms: d.prenoms, matricule: e.existant.matricule, id: e.existant.id, nouveau: false });
          continue;
        }
        if (e.statut !== "nouveau" || !e.filiereId || !e.anneeEntreeId || !e.tarif) continue;
        const code = codeFiliere.get(e.filiereId)!;
        const seq = await prochainNumero(tx, cleCompteurMatricule(code, d.anneeEntree));
        const matricule = formaterMatricule(code, d.anneeEntree, seq);
        const cree = await tx.etudiant.create({
          data: {
            matricule,
            nom: d.nom,
            prenoms: d.prenoms,
            sexe: d.sexe,
            dateNaissance: dateDuJour(d.dateNaissance),
            lieuNaissance: d.lieuNaissance,
            cin: d.cin,
            telephone: d.telephone,
            adresse: d.adresse,
            tuteurNom: d.tuteurNom,
            tuteurTelephone: d.tuteurTelephone,
            tuteurProfession: d.tuteurProfession,
            recherche: texteRecherche({ nom: d.nom, prenoms: d.prenoms, matricule }),
            filiereId: e.filiereId,
            anneeEntreeId: e.anneeEntreeId,
            creeParId: session.user.id,
            inscriptions: {
              create: {
                anneeScolaireId: annee.id,
                niveau: d.niveau,
                redoublement: d.redoublant,
                echeances: {
                  create: [
                    ...genererEcheances(e.tarif, annee),
                    ...echeancesFraisReprise(ctx.frais, e.filiereId, d.niveau).map((g) => ({ type: g.type, mois: g.mois, montantDu: g.montantDu, fraisId: g.fraisId })),
                  ],
                },
              },
            },
          },
          select: { id: true },
        });
        etudiants.push({ ligne: e.ligne, numero: e.numero, nom: d.nom, prenoms: d.prenoms, matricule, id: cree.id, nouveau: true });
      }

      const etudiantsCrees = etudiants.filter((e) => e.nouveau).length;
      return succes(`Import terminé : ${pluriel(etudiantsCrees, "étudiant créé", "étudiants créés")}.`, { etudiants, etudiantsCrees });
    }, OPTIONS_TRANSACTION_REPRISE);
    if (etat.statut === "succes") revaliderPagesEcolage();
    return etat;
  } catch (e) {
    if (e instanceof RangeError) return echec(`${e.message} ${RELANCER}`);
    if (codePrisma(e) === "P2028") return echec(TROP_LONG);
    throw e;
  }
}
