import { z } from "zod";
import { lireMontant, verifierMontant } from "@/lib/montant";
import type { Role } from "@/lib/roles";

// Règles des Paramètres (filières, années, tarifs, utilisateurs). Pur : ni base, ni date implicite.

export const NOMBRE_MOIS_ECOLAGE = 10;
export const DUREE_MIN = 1;
export const DUREE_MAX = 6;
export const MOIS_DEBUT_POSSIBLES = [9, 10, 11] as const;
// L'année scolaire couvre 10 mois (dateFin) : au-delà, des mensualités tomberaient après sa fin.
export const NOMBRE_MOIS_MAX = NOMBRE_MOIS_ECOLAGE;
export const ANNEE_DEBUT_MIN = 2000;
export const ANNEE_DEBUT_MAX = 2100;

export const NOMS_MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
] as const;

export function libelleAnnee(anneeDebut: number): string {
  return `${anneeDebut}-${anneeDebut + 1}`;
}

export function libelleNiveau(niveau: number): string {
  return niveau === 1 ? "1re année" : `${niveau}e année`;
}

/** Date à minuit UTC, comme les colonnes `@db.Date` lues par Prisma. */
function dateUTC(annee: number, moisIndex0: number, jour: number): Date {
  return new Date(Date.UTC(annee, moisIndex0, jour));
}

/** Début au 1er du mois de début des mensualités, fin au dernier jour du 10e mois (2026, 10 → 2026-10-01 / 2027-07-31). */
export function datesAnnee(anneeDebut: number, moisDebutEcolage: number): { dateDebut: Date; dateFin: Date } {
  const dateDebut = dateUTC(anneeDebut, moisDebutEcolage - 1, 1);
  // Jour 0 du mois suivant le 10e mois = dernier jour du 10e mois ; Date.UTC gère le passage d'année.
  const dateFin = dateUTC(anneeDebut, moisDebutEcolage - 1 + NOMBRE_MOIS_ECOLAGE, 0);
  return { dateDebut, dateFin };
}

/** « octobre 2026 → juillet 2027 ». */
export function periodeAnnee(anneeDebut: number, moisDebutEcolage: number): string {
  const { dateDebut, dateFin } = datesAnnee(anneeDebut, moisDebutEcolage);
  const mois = (d: Date) => `${NOMS_MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return `${mois(dateDebut)} → ${mois(dateFin)}`;
}

/** « 2026-10-01 » : jour calendaire d'une colonne `@db.Date`. */
export function jourISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type EtatAnnee = "courante" | "cloturee" | "preparation" | "ouverte";

export const LIBELLE_ETAT_ANNEE: Record<EtatAnnee, string> = {
  courante: "En cours",
  cloturee: "Clôturée",
  preparation: "En préparation",
  ouverte: "Ouverte · à clôturer",
};

type AnneeEtat = { estCourante: boolean; cloturee: boolean; dateDebut: Date };

/** Courante, clôturée, en préparation (pas encore commencée) ou ouverte (commencée ou passée, non clôturée). */
export function etatAnnee(annee: AnneeEtat, aujourdhui: Date): EtatAnnee {
  if (annee.estCourante) return "courante";
  if (annee.cloturee) return "cloturee";
  if (aujourdhui.getTime() < annee.dateDebut.getTime()) return "preparation";
  return "ouverte";
}

type MontantsTarif = { droitsInscription: number; montantMensuel: number; nombreMois: number };

export function totalAnnuel(tarif: MontantsTarif): number {
  return tarif.droitsInscription + tarif.montantMensuel * tarif.nombreMois;
}

export type FiliereGrille = { id: string; code: string; nom: string; dureeAnnees: number; actif: boolean };
export type TarifGrille = MontantsTarif & { filiereId: string; niveau: number };

export type CaseGrille = {
  filiereId: string;
  codeFiliere: string;
  nomFiliere: string;
  niveau: number;
  /** null : tarif manquant, inscription et admission bloquées pour cette classe. */
  tarif: (MontantsTarif & { total: number }) | null;
};

/** Une case par filière active et par niveau (1..durée), triée par code puis niveau ; les tarifs hors grille sont ignorés. */
export function grilleTarifs(
  filieres: FiliereGrille[],
  tarifs: TarifGrille[],
): { cases: CaseGrille[]; manquants: number } {
  const parCle = new Map(tarifs.map((t) => [`${t.filiereId}:${t.niveau}`, t]));
  const cases: CaseGrille[] = [];
  const actives = filieres.filter((f) => f.actif).sort((a, b) => a.code.localeCompare(b.code));
  for (const f of actives) {
    for (let niveau = 1; niveau <= f.dureeAnnees; niveau++) {
      const t = parCle.get(`${f.id}:${niveau}`);
      cases.push({
        filiereId: f.id,
        codeFiliere: f.code,
        nomFiliere: f.nom,
        niveau,
        tarif: t
          ? {
              droitsInscription: t.droitsInscription,
              montantMensuel: t.montantMensuel,
              nombreMois: t.nombreMois,
              total: totalAnnuel(t),
            }
          : null,
      });
    }
  }
  return { cases, manquants: cases.filter((c) => c.tarif === null).length };
}

// Chaque type de base porte son message : sans cela, zod renvoie un message par défaut en anglais.
const entier = (libelle: string) =>
  z.number({ error: `Indiquez ${libelle}.` }).int(`Indiquez ${libelle} sans décimales.`);
const identifiant = (message: string) => z.string({ error: message }).min(1, message);
const DONNEES_INVALIDES = { error: "Données invalides. Rechargez la page puis réessayez." };

export const schemaFiliere = z.object({
  code: z
    .string({ error: "Indiquez le code de la filière." })
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2,3}$/, "Le code compte 2 ou 3 lettres sans accent (ex. IF)."),
  nom: z
    .string({ error: "Indiquez le nom de la filière." })
    .trim()
    .min(2, "Indiquez le nom de la filière.")
    .max(80, "Nom trop long (80 caractères maximum)."),
  dureeAnnees: entier("la durée des études")
    .min(DUREE_MIN, `La durée est comprise entre ${DUREE_MIN} et ${DUREE_MAX} ans.`)
    .max(DUREE_MAX, `La durée est comprise entre ${DUREE_MIN} et ${DUREE_MAX} ans.`),
  actif: z.boolean({ error: "Indiquez si la filière est active." }).default(true),
}, DONNEES_INVALIDES);

export const schemaModificationFiliere = schemaFiliere.omit({ actif: true }).extend({
  id: identifiant("Filière introuvable. Rechargez la page."),
});

export const schemaAnnee = z.object({
  anneeDebut: entier("l'année de début")
    .min(ANNEE_DEBUT_MIN, `L'année de début est comprise entre ${ANNEE_DEBUT_MIN} et ${ANNEE_DEBUT_MAX}.`)
    .max(ANNEE_DEBUT_MAX, `L'année de début est comprise entre ${ANNEE_DEBUT_MIN} et ${ANNEE_DEBUT_MAX}.`),
  moisDebutEcolage: z.literal(MOIS_DEBUT_POSSIBLES, "Choisissez le premier mois des mensualités.").default(10),
}, DONNEES_INVALIDES);

/** Accepte un nombre ou un texte saisi (« 80 000 ») et rend un entier en ariary, strictement positif. */
export const champMontant = z
  .union([z.number(), z.string()], { error: "Saisissez un montant." })
  .transform((v, ctx) => {
    const lu = typeof v === "number" ? verifierMontant(v) : lireMontant(v);
    if (!lu.ok) {
      ctx.addIssue({ code: "custom", message: lu.erreur });
      return z.NEVER;
    }
    return lu.valeur;
  });

export const schemaLigneTarif = z.object({
  filiereId: identifiant("Filière introuvable. Rechargez la page."),
  niveau: entier("le niveau").min(1, "Niveau invalide.").max(DUREE_MAX, "Niveau invalide."),
  droitsInscription: champMontant,
  montantMensuel: champMontant,
  nombreMois: entier("le nombre de mois")
    .min(1, `Le nombre de mois est compris entre 1 et ${NOMBRE_MOIS_MAX}.`)
    .max(NOMBRE_MOIS_MAX, `Le nombre de mois est compris entre 1 et ${NOMBRE_MOIS_MAX}.`),
}, DONNEES_INVALIDES);

export const schemaTarifs = z.object({
  anneeId: identifiant("Choisissez une année scolaire."),
  lignes: z
    .array(schemaLigneTarif, { error: "Aucun tarif à enregistrer." })
    .min(1, "Aucun tarif à enregistrer.")
    .max(200, "Trop de lignes en une fois."),
}, DONNEES_INVALIDES);

export const schemaIdentifiant = z.object({ id: identifiant("Élément introuvable. Rechargez la page.") }, DONNEES_INVALIDES);

export const schemaActivationFiliere = schemaIdentifiant.extend({
  actif: z.boolean({ error: "Indiquez s'il faut activer ou désactiver la filière." }),
});

export const ROLES = ["user", "admin"] as const satisfies readonly Role[];

export const schemaNouvelUtilisateur = z.object({
  nom: z
    .string({ error: "Indiquez le nom complet." })
    .trim()
    .min(2, "Indiquez le nom complet.")
    .max(80, "Nom trop long (80 caractères maximum)."),
  email: z.string({ error: "Indiquez le courriel." }).trim().toLowerCase().pipe(z.email("Adresse e-mail invalide.")),
  role: z.enum(ROLES, "Choisissez un rôle."),
}, DONNEES_INVALIDES);

export const schemaUtilisateurCible = z.object(
  { userId: identifiant("Utilisateur introuvable. Rechargez la page.") },
  DONNEES_INVALIDES,
);

export const schemaChangementRole = schemaUtilisateurCible.extend({ role: z.enum(ROLES, "Choisissez un rôle.") });

function pluriel(n: number, singulier: string, plurielForme: string): string {
  return `${n} ${n > 1 ? plurielForme : singulier}`;
}

export type UsageFiliere = { etudiants: number; admissions: number };

export function controleSuppressionFiliere(usage: UsageFiliere): string | null {
  if (usage.etudiants > 0) {
    return `Cette filière ne peut pas être supprimée : ${pluriel(usage.etudiants, "étudiant y est rattaché", "étudiants y sont rattachés")}. Désactivez-la plutôt : elle ne sera plus proposée à l'inscription.`;
  }
  if (usage.admissions > 0) {
    return "Cette filière ne peut pas être supprimée : des admissions y ont été enregistrées. Désactivez-la plutôt.";
  }
  return null;
}

export type UsageAnnee = { inscriptions: number; etudiantsEntres: number; admissions: number };

export function controleSuppressionAnnee(annee: { estCourante: boolean }, usage: UsageAnnee): string | null {
  if (annee.estCourante) {
    return "L'année courante ne peut pas être supprimée. Définissez d'abord une autre année comme courante.";
  }
  if (usage.inscriptions > 0 || usage.etudiantsEntres > 0) {
    const n = Math.max(usage.inscriptions, usage.etudiantsEntres);
    return `Cette année ne peut pas être supprimée : ${pluriel(n, "étudiant y est inscrit", "étudiants y sont inscrits")}. Clôturez-la plutôt.`;
  }
  if (usage.admissions > 0) {
    return "Cette année ne peut pas être supprimée : des admissions la concernent. Clôturez-la plutôt.";
  }
  return null;
}

type DefinitionFiliere = { code: string; dureeAnnees: number };

/** `niveauMaxInscrit` : plus haut niveau d'une inscription d'un étudiant de la filière, toutes années confondues. */
export function controleModificationFiliere(
  actuelle: DefinitionFiliere,
  nouvelle: DefinitionFiliere,
  usage: { etudiants: number; niveauMaxInscrit: number | null },
): string | null {
  if (nouvelle.code !== actuelle.code && usage.etudiants > 0) {
    return `Le code ne peut plus changer : des étudiants ont déjà un matricule en ${actuelle.code}.`;
  }
  if (usage.niveauMaxInscrit !== null && nouvelle.dureeAnnees < usage.niveauMaxInscrit) {
    return `La durée ne peut pas descendre sous ${usage.niveauMaxInscrit} ans : des étudiants sont inscrits en ${libelleNiveau(usage.niveauMaxInscrit)}.`;
  }
  return null;
}

type AnneeStatut = { estCourante: boolean; cloturee: boolean };

export function controleDefinirCourante(annee: AnneeStatut): string | null {
  if (annee.estCourante) return "Cette année est déjà l'année courante.";
  if (annee.cloturee) return "Une année clôturée ne peut pas devenir l'année courante. Rouvrez-la d'abord.";
  return null;
}

export function controleCloture(annee: AnneeStatut): string | null {
  if (annee.estCourante) {
    return "L'année courante ne peut pas être clôturée. Définissez d'abord une autre année comme courante.";
  }
  if (annee.cloturee) return "Cette année est déjà clôturée.";
  return null;
}

export function controleReouverture(annee: AnneeStatut): string | null {
  return annee.cloturee ? null : "Cette année n'est pas clôturée.";
}

type LigneTarifCle = { filiereId: string; niveau: number };

/** Contrôle d'un enregistrement de tarifs : année ouverte, filières actives, niveaux dans la durée, pas de doublon. */
export function controleLignesTarifs(
  annee: { cloturee: boolean; libelle: string },
  filieres: Pick<FiliereGrille, "id" | "code" | "dureeAnnees" | "actif">[],
  lignes: LigneTarifCle[],
): { message: string; erreurs: Record<string, string> } | null {
  if (annee.cloturee) {
    return {
      message: `L'année ${annee.libelle} est clôturée : ses tarifs ne peuvent plus être modifiés. Rouvrez-la d'abord.`,
      erreurs: {},
    };
  }
  const parId = new Map(filieres.map((f) => [f.id, f]));
  const vues = new Set<string>();
  const erreurs: Record<string, string> = {};
  lignes.forEach((ligne, i) => {
    const f = parId.get(ligne.filiereId);
    const cle = `${ligne.filiereId}:${ligne.niveau}`;
    if (!f) erreurs[`lignes.${i}.filiereId`] = "Cette filière n'existe plus. Rechargez la page.";
    else if (!f.actif) erreurs[`lignes.${i}.filiereId`] = `La filière ${f.code} est désactivée : réactivez-la avant de saisir ses tarifs.`;
    else if (ligne.niveau > f.dureeAnnees) {
      erreurs[`lignes.${i}.niveau`] = `La filière ${f.code} dure ${f.dureeAnnees} ans : pas de ${libelleNiveau(ligne.niveau)}.`;
    } else if (vues.has(cle)) erreurs[`lignes.${i}.niveau`] = "Ce tarif apparaît deux fois.";
    vues.add(cle);
  });
  if (Object.keys(erreurs).length === 0) return null;
  return { message: "Certains tarifs ne peuvent pas être enregistrés : rien n'a été modifié.", erreurs };
}

export type ActionUtilisateur = "changerRole" | "desactiver" | "reactiver" | "reinitialiserMotDePasse";

export type ContexteActionUtilisateur = {
  acteurId: string;
  cibleId: string;
  action: ActionUtilisateur;
  cibleEstAdmin: boolean;
  /** Non désactivé (non banni). */
  cibleActive: boolean;
  /** Administrateurs non désactivés, acteur compris. */
  adminsActifs: number;
  /** Pour `changerRole` seulement. */
  nouveauRole?: Role;
};

const DERNIER_ADMIN =
  "C'est le dernier administrateur actif : nommez d'abord un autre administrateur, sinon plus personne n'aurait accès aux Paramètres.";

export function controleActionUtilisateur(c: ContexteActionUtilisateur): string | null {
  const soiMeme = c.acteurId === c.cibleId;
  const dernierAdmin = c.cibleEstAdmin && c.cibleActive && c.adminsActifs <= 1;
  switch (c.action) {
    case "changerRole": {
      if (soiMeme) return "Vous ne pouvez pas changer votre propre rôle.";
      const nouveauEstAdmin = c.nouveauRole === "admin";
      if (nouveauEstAdmin === c.cibleEstAdmin) return "Ce compte a déjà ce rôle.";
      if (!nouveauEstAdmin && dernierAdmin) return DERNIER_ADMIN;
      return null;
    }
    case "desactiver":
      if (soiMeme) return "Vous ne pouvez pas désactiver votre propre compte.";
      if (!c.cibleActive) return "Ce compte est déjà désactivé.";
      if (dernierAdmin) return DERNIER_ADMIN;
      return null;
    case "reactiver":
      if (c.cibleActive) return "Ce compte est déjà actif.";
      return null;
    case "reinitialiserMotDePasse":
      // Réinitialiser son propre compte fermerait sa session avant d'avoir pu lire le nouveau mot de passe.
      if (soiMeme) return "Vous ne pouvez pas réinitialiser votre propre mot de passe ici : demandez-le à un autre administrateur.";
      return null;
  }
}
