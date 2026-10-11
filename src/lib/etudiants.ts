import { z } from "zod";
import { Sexe, type StatutEtudiant, type StatutInscription } from "@/generated/prisma/enums";
import { dateDuJour, lireJour, type Jour } from "@/lib/dates";
import { controleTranches, TRANCHES_POSSIBLES, type TarifEcheances } from "@/lib/ecolage";
import { DUREE_MAX, libelleNiveau } from "@/lib/parametres";

// Règles de la fiche étudiant. Pur : ni base, ni date implicite.

const DONNEES_INVALIDES = { error: "Données invalides. Rechargez la page puis réessayez." };

export const LIBELLE_STATUT_ETUDIANT: Record<StatutEtudiant, string> = {
  ACTIF: "Actif",
  DIPLOME: "Diplômé",
  ABANDON: "Abandon",
  EXCLU: "Exclu",
};

export const LIBELLE_STATUT_INSCRIPTION: Record<StatutInscription, string> = {
  EN_COURS: "En cours",
  ADMIS: "Admis",
  REDOUBLE: "Redouble",
  DIPLOME: "Diplômé",
  ABANDON: "Abandon",
  EXCLU: "Exclu",
};

export const LIBELLE_SEXE: Record<Sexe, string> = { M: "Masculin", F: "Féminin" };

/** « 2e année », ou « 2e année (redoublant) ». */
export function libelleNiveauInscription(niveau: number, redoublement: boolean): string {
  return redoublement ? `${libelleNiveau(niveau)} (redoublant)` : libelleNiveau(niveau);
}

const texte =(requis: string, min: number, max: number, tropLong: string) =>
  z.string({ error: requis }).trim().min(min, requis).max(max, tropLong);

/** Téléphone malgache : 03[2-8] + 7 chiffres ; espaces, points, tirets et indicatif +261 tolérés. */
export function normaliserTelephone(saisie: string): string | null {
  let chiffres = saisie.replace(/[\s.\-()]/g, "");
  if (chiffres.startsWith("+261")) chiffres = `0${chiffres.slice(4)}`;
  else if (chiffres.startsWith("00261")) chiffres = `0${chiffres.slice(5)}`;
  else if (/^261\d{9}$/.test(chiffres)) chiffres = `0${chiffres.slice(3)}`;
  return /^03[2-8]\d{7}$/.test(chiffres) ? chiffres : null;
}

/** « 0341234567 » → « 034 12 345 67 ». */
export function formaterTelephone(telephone: string): string {
  const t = normaliserTelephone(telephone);
  if (!t) return telephone;
  return `${t.slice(0, 3)} ${t.slice(3, 5)} ${t.slice(5, 8)} ${t.slice(8)}`;
}

const champTelephone = z
  .string({ error: "Indiquez le numéro de téléphone." })
  .trim()
  .min(1, "Indiquez le numéro de téléphone.")
  .transform((v, ctx) => {
    const t = normaliserTelephone(v);
    if (!t) {
      ctx.addIssue({ code: "custom", message: "Numéro malgache attendu : 10 chiffres commençant par 032 à 038 (ex. 034 12 345 67)." });
      return z.NEVER;
    }
    return t;
  });

/** Date saisie « AAAA-MM-JJ » → minuit UTC (colonne `@db.Date`). */
const champDate = z
  .string({ error: "Indiquez la date de naissance." })
  .trim()
  .min(1, "Indiquez la date de naissance.")
  .transform((v, ctx) => {
    try {
      const d = dateDuJour(v);
      if (d.getUTCFullYear() < 1900) throw new RangeError();
      return d;
    } catch {
      ctx.addIssue({ code: "custom", message: "Date de naissance invalide." });
      return z.NEVER;
    }
  });

const champCin = z
  .string()
  .nullish()
  .transform((v, ctx) => {
    const chiffres = (v ?? "").replace(/\s/g, "");
    if (chiffres === "") return null;
    if (!/^\d{12}$/.test(chiffres)) {
      ctx.addIssue({ code: "custom", message: "Le numéro de CIN compte 12 chiffres." });
      return z.NEVER;
    }
    return chiffres;
  });

const champEmail = z
  .string()
  .trim()
  .toLowerCase()
  .nullish()
  .transform((v) => (v ? v : null))
  .pipe(z.email("Adresse e-mail invalide.").nullable());

const identite = {
  nom: texte("Indiquez le nom.", 1, 80, "Nom trop long (80 caractères maximum).").transform((v) =>
    v.replace(/\s+/g, " ").toLocaleUpperCase("fr"),
  ),
  prenoms: texte("Indiquez les prénoms.", 1, 120, "Prénoms trop longs (120 caractères maximum).").transform((v) =>
    v.replace(/\s+/g, " "),
  ),
  sexe: z.enum(Sexe, "Indiquez le sexe."),
  dateNaissance: champDate,
  lieuNaissance: texte("Indiquez le lieu de naissance.", 2, 80, "Lieu trop long (80 caractères maximum)."),
  cin: champCin,
  telephone: champTelephone,
  email: champEmail,
  adresse: texte("Indiquez l'adresse.", 3, 200, "Adresse trop longue (200 caractères maximum)."),
};

export const schemaCreationEtudiant = z.object(
  {
    ...identite,
    filiereId: z.string({ error: "Choisissez la filière." }).min(1, "Choisissez la filière."),
    niveau: z
      .number({ error: "Choisissez le niveau." })
      .int("Choisissez le niveau.")
      .min(1, "Choisissez le niveau.")
      .max(DUREE_MAX, "Niveau invalide."),
    droitsEnTranches: z.literal(TRANCHES_POSSIBLES, "Choisissez un paiement des droits en 1, 2 ou 3 fois.").default(1),
    /** Coché après l'avertissement « un étudiant porte déjà ce nom et cette date de naissance ». */
    confirmerDoublon: z.boolean().default(false),
  },
  DONNEES_INVALIDES,
);
export type EntreeCreationEtudiant = z.input<typeof schemaCreationEtudiant>;
export type CreationEtudiant = z.output<typeof schemaCreationEtudiant>;

/** Identité et contact seulement : filière, matricule, niveau et écolage ne se modifient pas ici. */
export const schemaModificationEtudiant = z.object(
  { id: z.string({ error: "Étudiant introuvable. Rechargez la page." }).min(1, "Étudiant introuvable. Rechargez la page."), ...identite },
  DONNEES_INVALIDES,
);
export type EntreeModificationEtudiant = z.input<typeof schemaModificationEtudiant>;
export type ModificationEtudiant = z.output<typeof schemaModificationEtudiant>;

export const schemaModifTranches = z.object(
  {
    inscriptionId: z.string({ error: "Inscription introuvable. Rechargez la page." }).min(1, "Inscription introuvable. Rechargez la page."),
    droitsEnTranches: z.literal(TRANCHES_POSSIBLES, "Choisissez un paiement des droits en 1, 2 ou 3 fois."),
  },
  DONNEES_INVALIDES,
);

/** Minuscules sans accents ni espaces superflus : base de la colonne `Etudiant.recherche` et des saisies de recherche. */
export function normaliserRecherche(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/\s+/g, " ")
    .trim();
}

/** Valeur de `Etudiant.recherche`, à recalculer à chaque création ou modification du nom. */
export function texteRecherche(e: { nom: string; prenoms: string; matricule: string }): string {
  return normaliserRecherche(`${e.nom} ${e.prenoms} ${e.matricule}`);
}

/** Mots d'une recherche : chacun doit être contenu dans `recherche` (« hanta rakoto » trouve « RAKOTOMALALA Hanta »). */
export function motsRecherche(saisie: string): string[] {
  return normaliserRecherche(saisie).split(" ").filter(Boolean).slice(0, 6);
}

type IdentiteDoublon = { nom: string; prenoms: string; dateNaissance: Date };

/** Même personne probable : nom, prénoms (sans accents ni casse) et jour de naissance identiques. */
export function estDoublon(a: IdentiteDoublon, b: IdentiteDoublon): boolean {
  return (
    normaliserRecherche(a.nom) === normaliserRecherche(b.nom) &&
    normaliserRecherche(a.prenoms) === normaliserRecherche(b.prenoms) &&
    a.dateNaissance.toISOString().slice(0, 10) === b.dateNaissance.toISOString().slice(0, 10)
  );
}

export function controleDateNaissance(dateNaissance: Date, jour: Jour): string | null {
  lireJour(jour);
  return dateNaissance.getTime() >= dateDuJour(jour).getTime() ? "La date de naissance doit être passée." : null;
}

export type ContexteCreation = {
  /** Année courante, null s'il n'y en a pas. */
  annee: { libelle: string; cloturee: boolean } | null;
  filiere: { code: string; nom: string; dureeAnnees: number; actif: boolean } | null;
  niveau: number;
  /** Tarif de (filière, année courante, niveau), null s'il manque. */
  tarif: TarifEcheances | null;
  droitsEnTranches: number;
};

export function controleCreation(c: ContexteCreation): string | null {
  if (!c.annee) {
    return "Aucune année scolaire courante : demandez à l'administrateur de la définir dans Paramètres › Années scolaires.";
  }
  if (c.annee.cloturee) {
    return `L'année ${c.annee.libelle} est clôturée : aucune inscription n'est possible. Demandez à l'administrateur de définir l'année courante.`;
  }
  if (!c.filiere) return "Cette filière n'existe plus. Rechargez la page.";
  if (!c.filiere.actif) return `La filière ${c.filiere.code} est désactivée : elle n'accepte plus d'inscription.`;
  if (c.niveau > c.filiere.dureeAnnees) {
    return `La filière ${c.filiere.code} dure ${c.filiere.dureeAnnees} ans : pas de ${libelleNiveau(c.niveau)}.`;
  }
  if (!c.tarif) {
    return `Tarif manquant pour ${c.filiere.nom} ${libelleNiveau(c.niveau)} en ${c.annee.libelle} : demandez à l'administrateur de le saisir dans Paramètres › Tarifs.`;
  }
  return controleTranches(c.tarif.droitsInscription, c.droitsEnTranches);
}

/** Refus d'un redécoupage des droits, affiché sur la fiche et revérifié par l'action. */
export function controleTranchesModifiables(c: {
  lignesPaiementDroits: number;
  anneeLibelle: string;
  anneeCloturee: boolean;
}): string | null {
  if (c.anneeCloturee) return `L'année ${c.anneeLibelle} est clôturée : son échéancier ne se modifie plus.`;
  return controleModifTranches(c.lignesPaiementDroits);
}

/** Une ligne annulée compte aussi : elle référence les échéances qu'un redécoupage supprimerait. */
export function controleModifTranches(nbLignesPaiement: number): string | null {
  if (nbLignesPaiement > 0) {
    return "Le paiement des droits ne peut plus être redécoupé : des paiements ont déjà été enregistrés sur cette année, même annulés.";
  }
  return null;
}
