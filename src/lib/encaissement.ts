import { z } from "zod";
import { ModePaiement, OperateurMobile, type TypeEcheance } from "@/generated/prisma/enums";
import { dateHeureMadagascar } from "@/lib/dates";
import { libelleEcheance, trierPourSolde } from "@/lib/ecolage";
import { libelleNiveauInscription } from "@/lib/etudiants";
import { montantEnLettres } from "@/lib/montant-en-lettres";
import { champMontant } from "@/lib/parametres";

// Saisie et annulation d'un paiement, données d'un reçu. Isomorphe : sert aussi à Encaisser hors ligne.

const DONNEES_INVALIDES = { error: "Données invalides. Rechargez la page puis réessayez." };

export const LIBELLE_MODE: Record<ModePaiement, string> = {
  ESPECES: "Espèces",
  MOBILE_MONEY: "Mobile Money",
};

export const LIBELLE_OPERATEUR: Record<OperateurMobile, string> = {
  MVOLA: "MVola",
  ORANGE_MONEY: "Orange Money",
  AIRTEL_MONEY: "Airtel Money",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CUID = /^c[a-z0-9]{20,31}$/;

/** Saisie vide → null, pour distinguer « absent » d'une valeur fournie. */
const facultatif = (max: number, tropLong: string) =>
  z
    .string()
    .trim()
    .max(max, tropLong)
    .nullish()
    .transform((v) => (v ? v : null));

export const schemaEncaissement = z
  .object(
    {
      etudiantId: z.string({ error: "Choisissez l'étudiant." }).min(1, "Choisissez l'étudiant."),
      montant: champMontant,
      mode: z.enum(ModePaiement, "Choisissez le mode de paiement."),
      operateur: z.enum(OperateurMobile, "Choisissez l'opérateur Mobile Money.").nullish().transform((v) => v ?? null),
      reference: facultatif(60, "Référence trop longue (60 caractères maximum)."),
      observation: facultatif(200, "Observation trop longue (200 caractères maximum)."),
      /** Généré sur le poste (`crypto.randomUUID()`) : un second envoi du même paiement est sans effet. */
      idClient: z
        .string(DONNEES_INVALIDES)
        .refine((v) => UUID.test(v) || CUID.test(v), "Identifiant de paiement invalide. Rechargez la page."),
      /** Reste dû affiché au caissier : s'il ne correspond plus, la situation a changé entre-temps. */
      resteDuAffiche: z.number(DONNEES_INVALIDES).int(DONNEES_INVALIDES.error).min(0, DONNEES_INVALIDES.error),
    },
    DONNEES_INVALIDES,
  )
  .superRefine((v, ctx) => {
    if (v.mode === "MOBILE_MONEY") {
      if (!v.operateur) ctx.addIssue({ code: "custom", path: ["operateur"], message: "Choisissez l'opérateur Mobile Money." });
      if (!v.reference) {
        ctx.addIssue({ code: "custom", path: ["reference"], message: "Saisissez la référence de la transaction Mobile Money." });
      }
    } else {
      if (v.operateur) {
        ctx.addIssue({ code: "custom", path: ["operateur"], message: "L'opérateur ne concerne que le Mobile Money." });
      }
      if (v.reference) {
        ctx.addIssue({ code: "custom", path: ["reference"], message: "La référence ne concerne que le Mobile Money." });
      }
    }
  });
export type EntreeEncaissement = z.input<typeof schemaEncaissement>;
export type Encaissement = z.output<typeof schemaEncaissement>;

/** Deux postes en ligne sur le même étudiant : le second est refusé plutôt que réparti sur ce qui reste. */
export const MESSAGE_SITUATION_CHANGEE =
  "La situation de l'étudiant a changé (paiement saisi sur un autre poste). Vérifiez avant d'encaisser.";

export const MOTIF_MIN = 5;

export const schemaAnnulationPaiement = z.object(
  {
    paiementId: z.string({ error: "Paiement introuvable. Rechargez la page." }).min(1, "Paiement introuvable. Rechargez la page."),
    motif: z
      .string({ error: "Indiquez le motif de l'annulation." })
      .trim()
      .min(MOTIF_MIN, `Indiquez le motif de l'annulation (${MOTIF_MIN} caractères au moins).`)
      .max(300, "Motif trop long (300 caractères maximum)."),
  },
  DONNEES_INVALIDES,
);
export type EntreeAnnulationPaiement = z.input<typeof schemaAnnulationPaiement>;

export type LigneRecu = {
  /** « Droits d'inscription », « Droits — tranche 2/3 », « Octobre 2026 ». */
  libelle: string;
  montant: number;
  /** Échéance payée en partie par ce paiement : mention « acompte » et `resteEcheance`. */
  acompte: boolean;
  /** Reste dû sur l'échéance après ce paiement (0 si soldée). */
  resteEcheance: number;
};

/** Tout ce qu'il faut pour imprimer un ticket sans relire le serveur (Encaisser hors ligne compris). */
export type DonneesRecu = {
  paiementId: string | null;
  numero: string;
  /** Instant du paiement, ISO 8601. */
  dateISO: string;
  /** « 11/10/2026 » et « 10:24 », heure de Madagascar. */
  date: string;
  heure: string;
  etudiant: {
    matricule: string;
    nom: string;
    prenoms: string;
    filiere: string;
    /** « 1re année », éventuellement « 1re année (redoublant) ». */
    niveau: string;
    /** « 2026-2027 » : année de l'inscription la plus récente. */
    anneeScolaire: string;
  };
  lignes: LigneRecu[];
  total: number;
  /** « cent cinquante mille ariary ». */
  totalEnLettres: string;
  mode: ModePaiement;
  modeLibelle: string;
  operateur: OperateurMobile | null;
  operateurLibelle: string | null;
  reference: string | null;
  /** Figés à l'émission : reste toutes années et reste en retard après ce paiement. */
  resteApres: number;
  retardApres: number;
  caissier: string;
  annulation: { date: string; par: string; motif: string } | null;
};

/** Ligne de paiement telle qu'enregistrée, avec l'échéance qu'elle paie. */
export type LigneRecuSource = {
  montant: number;
  resteEcheanceApres: number;
  echeance: {
    type: TypeEcheance;
    tranche: number | null;
    mois: Date;
    ordre: number;
    droitsEnTranches: number;
    anneeDebut: number;
    /** « 2026-2027 » */
    anneeLibelle: string;
  };
};

/** Ce que la base garde d'un paiement : le reçu en est entièrement déduit, sans recalcul. */
export type SourceRecu = {
  paiementId: string | null;
  numero: string;
  instant: Date;
  etudiant: { matricule: string; nom: string; prenoms: string; filiere: string };
  /** Inscription de l'année la plus récente payée par ce reçu. */
  inscription: { niveau: number; redoublement: boolean; anneeLibelle: string };
  lignes: LigneRecuSource[];
  montant: number;
  mode: ModePaiement;
  operateur: OperateurMobile | null;
  reference: string | null;
  resteApres: number;
  retardApres: number;
  caissier: string;
  annulation: { instant: Date; par: string; motif: string } | null;
};

/** Même fonction à l'émission et à la réimpression : le ticket réimprimé est identique à l'original. */
export function construireRecu(s: SourceRecu): DonneesRecu {
  const { date, heure } = dateHeureMadagascar(s.instant);
  const plusieursAnnees = new Set(s.lignes.map((l) => l.echeance.anneeDebut)).size > 1;
  const triees = trierPourSolde(
    s.lignes.map((l) => ({ ...l, mois: l.echeance.mois, anneeDebut: l.echeance.anneeDebut, ordre: l.echeance.ordre })),
  );
  const lignes: LigneRecu[] = triees.map((l) => {
    const libelle = libelleEcheance(l.echeance, l.echeance.droitsEnTranches);
    // Deux années sur un même reçu : « Droits d'inscription » seul serait ambigu.
    const precise = plusieursAnnees && l.echeance.type === "DROITS" ? `${libelle} ${l.echeance.anneeLibelle}` : libelle;
    return { libelle: precise, montant: l.montant, acompte: l.resteEcheanceApres > 0, resteEcheance: l.resteEcheanceApres };
  });
  const annulation = s.annulation
    ? { date: dateHeureMadagascar(s.annulation.instant).date, par: s.annulation.par, motif: s.annulation.motif }
    : null;
  return {
    paiementId: s.paiementId,
    numero: s.numero,
    dateISO: s.instant.toISOString(),
    date,
    heure,
    etudiant: {
      ...s.etudiant,
      niveau: libelleNiveauInscription(s.inscription.niveau, s.inscription.redoublement),
      anneeScolaire: s.inscription.anneeLibelle,
    },
    lignes,
    total: s.montant,
    totalEnLettres: montantEnLettres(s.montant),
    mode: s.mode,
    modeLibelle: LIBELLE_MODE[s.mode],
    operateur: s.operateur,
    operateurLibelle: s.operateur ? LIBELLE_OPERATEUR[s.operateur] : null,
    reference: s.reference,
    resteApres: s.resteApres,
    retardApres: s.retardApres,
    caissier: s.caissier,
    annulation,
  };
}
