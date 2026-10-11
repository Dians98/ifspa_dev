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

/** Inscription et ses échéances générées comme en production (`genererEcheances`), à partir du 1er mois `debut`. */
export function fabriquerInscription(
  etudiantId: string,
  anneeScolaireId: string,
  tarif: { niveau: number; montantMensuel: number; nombreMois: number; droitsInscription: number },
  debut: Date,
  droitsEnTranches = 1,
) {
  const echeances = genererEcheances(
    tarif,
    { anneeDebut: debut.getUTCFullYear(), moisDebutEcolage: debut.getUTCMonth() + 1 },
    droitsEnTranches,
  );
  return db.inscription.create({
    data: { etudiantId, anneeScolaireId, niveau: tarif.niveau, droitsEnTranches, echeances: { create: echeances } },
    include: { echeances: { orderBy: { ordre: "asc" } } },
  });
}

/** Paiement écrit directement (sans la répartition ni le compteur) : pour préparer un état en base. */
export function fabriquerPaiement(
  etudiantId: string,
  saisiParId: string,
  lignes: { echeanceId: string; montant: number; resteEcheanceApres?: number }[],
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
