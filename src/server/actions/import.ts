"use server";

import { db } from "@/lib/db";
import { dateDuJour, jourMadagascar } from "@/lib/dates";
import { genererEcheances } from "@/lib/ecolage";
import { echec, succes, type EtatAction } from "@/lib/etat-action";
import { texteRecherche } from "@/lib/etudiants";
import {
  allegerRapport,
  analyserReprise as analyser,
  instantReprise,
  joursNaissanceCites,
  observationReprise,
  signatureReprise,
  type RapportRepriseAllege,
} from "@/lib/import-analyse";
import type { RepriseLue } from "@/lib/import-lecture";
import { cleCompteurMatricule, formaterMatricule } from "@/lib/matricule";
import { formaterAriary } from "@/lib/montant";
import { exigerAdmin } from "@/server/acces";
import { prochainNumero } from "@/server/compteur";
import { OPTIONS_TRANSACTION_REPRISE } from "@/server/ecolage";
import { revaliderPagesEcolage } from "@/server/ecolage-revalidation";
import { codePrisma } from "@/server/erreurs";
import { fichiersDepuisFormData, lireFichiersReprise } from "@/server/import/lire-fichiers";
import { lireContexteReprise } from "@/server/lectures/import";
import { enregistrerPaiement } from "@/server/paiements";

// Reprise des données (Paramètres › Import, admin) : analyse sans écriture, puis import en une transaction.

export type AnalyseReprise = {
  rapport: RapportRepriseAllege;
  /** À renvoyer avec les mêmes fichiers pour importer ; null si le rapport est bloquant. */
  signature: string | null;
};

export type EtudiantImporte = { ligne: number; numero: string; nom: string; prenoms: string; matricule: string; id: string; nouveau: boolean };

export type ResumeImport = {
  /** Nouveaux puis déjà en base, dans l'ordre du plan. */
  etudiants: EtudiantImporte[];
  etudiantsCrees: number;
  paiements: number;
  montant: number;
  /** Dans l'ordre d'émission (dates du fichier) ; null sans paiement importé. */
  premierRecu: string | null;
  dernierRecu: string | null;
};

const SIGNATURE = /^[0-9a-f]{64}$/;

const RELANCER = "Rien n'a été importé : analysez le fichier à nouveau.";
const PLAN_CHANGE = "Le fichier ou la base ont changé depuis le rapport. Rien n'a été importé : analysez le fichier à nouveau.";
const RIEN_A_IMPORTER = "Rien à importer : les étudiants et les paiements du fichier sont déjà en base. Rien n'a été modifié.";
const TROP_LONG = "L'import a pris trop de temps et a été abandonné : rien n'a été importé. Importez le fichier en plusieurs parties.";

/** Refus levé dans la transaction pour tout annuler ; son message est affichable. */
class RefusImport extends Error {}

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

  const rapport = analyser(depot.lu, await lireContexteReprise(db, depot.lu), jourMadagascar(new Date()));
  const t = rapport.totaux;
  const message = rapport.bloquant
    ? `${pluriel(t.erreurs, "erreur", "erreurs")} : rien ne peut être importé. Corrigez le fichier, puis déposez-le à nouveau.`
    : `Prêt à importer ${pluriel(t.etudiants.nouveaux, "nouvel étudiant", "nouveaux étudiants")} et ${pluriel(t.paiements.aImporter, "paiement", "paiements")}.`;
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
      // FOR SHARE : ni clôture de l'année, ni filière ou tarif modifiés pendant l'import.
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
      if (!rapport.etudiants.some((e) => e.statut === "nouveau") && !rapport.paiements.some((p) => p.statut === "a_importer")) {
        return echec(RIEN_A_IMPORTER);
      }

      const codeFiliere = new Map(ctx.filieres.map((f) => [f.id, f.code]));
      const idParNumero = new Map<string, string>();
      const etudiants: EtudiantImporte[] = [];

      for (const e of rapport.etudiants) {
        const d = e.donnees;
        if (!d || !e.numero) continue;
        if (e.statut === "existant" && e.existant) {
          idParNumero.set(e.numero, e.existant.id);
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
            recherche: texteRecherche({ nom: d.nom, prenoms: d.prenoms, matricule }),
            filiereId: e.filiereId,
            anneeEntreeId: e.anneeEntreeId,
            creeParId: session.user.id,
            inscriptions: {
              create: {
                anneeScolaireId: annee.id,
                niveau: d.niveau,
                redoublement: d.redoublant,
                droitsEnTranches: d.droitsEnTranches,
                echeances: { create: genererEcheances(e.tarif, annee, d.droitsEnTranches) },
              },
            },
          },
          select: { id: true },
        });
        idParNumero.set(e.numero, cree.id);
        etudiants.push({ ligne: e.ligne, numero: e.numero, nom: d.nom, prenoms: d.prenoms, matricule, id: cree.id, nouveau: true });
      }

      let paiements = 0;
      let montant = 0;
      let premierRecu: string | null = null;
      let dernierRecu: string | null = null;
      for (const p of rapport.paiements) {
        const d = p.donnees;
        if (p.statut !== "a_importer" || !d || !p.cle || p.resteDuAvant === null) continue;
        const etudiantId = idParNumero.get(d.numeroEtudiant);
        if (!etudiantId) throw new RefusImport(`Paiements, ligne ${p.ligne} : étudiant introuvable. ${RELANCER}`);
        const r = await enregistrerPaiement(
          tx,
          {
            etudiantId,
            montant: d.montant,
            mode: d.mode,
            operateur: d.operateur,
            reference: d.reference,
            observation: observationReprise(d.recuPapier),
            idClient: p.cle,
            resteDuAffiche: p.resteDuAvant,
            saisiParId: session.user.id,
            instant: instantReprise(d.jour),
          },
          "en-ligne",
        );
        if (r.statut === "refus") throw new RefusImport(`Paiements, ligne ${p.ligne} : ${r.erreur.message} ${RELANCER}`);
        if (r.statut === "deja") throw new RefusImport(`Paiements, ligne ${p.ligne} : déjà enregistré sous le reçu ${r.numeroRecu}. ${RELANCER}`);
        paiements++;
        montant += d.montant;
        premierRecu ??= r.numeroRecu;
        dernierRecu = r.numeroRecu;
      }

      const etudiantsCrees = etudiants.filter((e) => e.nouveau).length;
      const recus = !premierRecu ? "" : premierRecu === dernierRecu ? ` (reçu ${premierRecu})` : ` (reçus ${premierRecu} à ${dernierRecu})`;
      return succes(
        `Import terminé : ${pluriel(etudiantsCrees, "étudiant créé", "étudiants créés")}, ` +
          `${pluriel(paiements, "paiement enregistré", "paiements enregistrés")} pour ${formaterAriary(montant)}${recus}.`,
        { etudiants, etudiantsCrees, paiements, montant, premierRecu, dernierRecu },
      );
    }, OPTIONS_TRANSACTION_REPRISE);
    if (etat.statut === "succes") revaliderPagesEcolage();
    return etat;
  } catch (e) {
    if (e instanceof RefusImport) return echec(e.message);
    if (e instanceof RangeError) return echec(`${e.message} ${RELANCER}`);
    if (codePrisma(e) === "P2028") return echec(TROP_LONG);
    throw e;
  }
}
