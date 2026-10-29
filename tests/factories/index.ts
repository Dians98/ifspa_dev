import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { genererEcheances } from "@/lib/ecolage";
import { texteRecherche } from "@/lib/etudiants";
import { datesAnnee, libelleAnnee } from "@/lib/parametres";

let compteur = 0;
const suivant = () => ++compteur;

/** Code de 3 lettres unique dans le processus (AAA, AAB…). */
function codeUnique(): string {
  let n = suivant();
  let code = "";
  for (let i = 0; i < 3; i++) {
    code = String.fromCharCode(65 + (n % 26)) + code;
    n = Math.floor(n / 26);
  }
  return code;
}

export function fabriquerFiliere(donnees: Partial<Prisma.FiliereCreateInput> = {}) {
  const code = donnees.code ?? codeUnique();
  return db.filiere.create({ data: { code, nom: `Filière ${code}`, dureeAnnees: 3, ...donnees } });
}

export function fabriquerAnnee(
  donnees: Partial<Omit<Prisma.AnneeScolaireCreateInput, "anneeDebut">> & { anneeDebut?: number } = {},
) {
  const anneeDebut = donnees.anneeDebut ?? 2000 + suivant();
  const moisDebutEcolage = donnees.moisDebutEcolage ?? 10;
  return db.anneeScolaire.create({
    data: {
      libelle: libelleAnnee(anneeDebut),
      moisDebutEcolage,
      ...datesAnnee(anneeDebut, moisDebutEcolage),
      ...donnees,
      anneeDebut,
    },
  });
}

export function fabriquerTarif(
  filiereId: string,
  anneeScolaireId: string,
  donnees: Partial<Pick<Prisma.TarifUncheckedCreateInput, "niveau" | "droitsInscription" | "montantMensuel" | "nombreMois">> = {},
) {
  return db.tarif.create({
    data: {
      filiereId,
      anneeScolaireId,
      niveau: 1,
      droitsInscription: 100_000,
      montantMensuel: 80_000,
      nombreMois: 10,
      ...donnees,
    },
  });
}

export function fabriquerUtilisateur(role: "admin" | "user" = "user", donnees: Partial<Prisma.UserCreateInput> = {}) {
  const n = suivant();
  return db.user.create({
    data: { id: randomUUID(), name: `Utilisateur ${n}`, email: `utilisateur${n}@test.ifspa.mg`, role, ...donnees },
  });
}

export function fabriquerEtudiant(filiereId: string, anneeEntreeId: string, donnees: Partial<Prisma.EtudiantUncheckedCreateInput> = {}) {
  const n = suivant();
  const identite = {
    matricule: donnees.matricule ?? `TST-${String(n).padStart(4, "0")}`,
    nom: donnees.nom ?? `NOM${n}`,
    prenoms: donnees.prenoms ?? `Prénom ${n}`,
  };
  return db.etudiant.create({
    data: {
      sexe: "F",
      dateNaissance: new Date(Date.UTC(2005, 0, 1)),
      lieuNaissance: "Toamasina",
      telephone: "0341234567",
      adresse: "Toamasina",
      filiereId,
      anneeEntreeId,
      ...donnees,
      ...identite,
      recherche: donnees.recherche ?? texteRecherche(identite),
    },
  });
}

/**
 * Inscription et ses échéances générées comme en production (`genererEcheances`), à partir du 1er mois `debut`.
 * `echeances` : droits d'abord, puis les mensualités d'octobre à juillet (index 1 = octobre).
 */
export async function fabriquerInscription(
  etudiantId: string,
  anneeScolaireId: string,
  tarif: { niveau: number; montantMensuel: number; nombreMois: number; droitsInscription: number },
  debut: Date,
) {
  const echeances = genererEcheances(tarif, { anneeDebut: debut.getUTCFullYear(), moisDebutEcolage: debut.getUTCMonth() + 1 });
  const inscription = await db.inscription.create({
    data: { etudiantId, anneeScolaireId, niveau: tarif.niveau, echeances: { create: echeances } },
    include: { echeances: true },
  });
  const lecture = (e: { type: string; mois: Date }) => (e.type === "DROITS" ? -Infinity : e.mois.getTime());
  return { ...inscription, echeances: inscription.echeances.sort((x, y) => lecture(x) - lecture(y)) };
}

/**
 * Frais de l'année (classes comprises) et, pour chaque inscription donnée, son échéance FRAIS : comme `creerFrais`,
 * sans passer par l'action. `mois` : 1er du mois d'exigibilité.
 */
export async function fabriquerFrais(
  anneeScolaireId: string,
  donnees: {
    classes: { filiereId: string; niveau: number }[];
    libelle?: string;
    montant?: number;
    mois?: Date;
    creeParId?: string | null;
    inscriptionIds?: string[];
  },
) {
  const frais = await db.frais.create({
    data: {
      libelle: donnees.libelle ?? "Frais d'examen",
      montant: donnees.montant ?? 15_000,
      mois: donnees.mois ?? new Date(Date.UTC(2027, 2, 1)),
      anneeScolaireId,
      creeParId: donnees.creeParId ?? null,
      classes: { create: donnees.classes },
    },
  });
  const echeances = await Promise.all(
    (donnees.inscriptionIds ?? []).map((inscriptionId) =>
      db.echeance.create({ data: { inscriptionId, type: "FRAIS", mois: frais.mois, montantDu: frais.montant, fraisId: frais.id } }),
    ),
  );
  return { frais, echeances };
}

/** Paiement écrit directement (sans la répartition ni le compteur) : pour préparer un état en base. */
export function fabriquerPaiement(
  etudiantId: string,
  saisiParId: string,
  lignes: { echeanceId: string; montant: number; resteEcheanceApres?: number; libelle?: string | null }[],
  donnees: Partial<Omit<Prisma.PaiementUncheckedCreateInput, "lignes">> = {},
) {
  const n = suivant();
  return db.paiement.create({
    data: {
      numeroRecu: `R-1999-${String(n).padStart(5, "0")}`,
      etudiantId,
      saisiParId,
      montant: lignes.reduce((s, l) => s + l.montant, 0),
      mode: "ESPECES",
      resteApres: 0,
      retardApres: 0,
      ...donnees,
      lignes: { create: lignes.map((l) => ({ ...l, resteEcheanceApres: l.resteEcheanceApres ?? 0 })) },
    },
    include: { lignes: true },
  });
}
