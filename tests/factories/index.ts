import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
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
  return db.etudiant.create({
    data: {
      matricule: `TST-${String(n).padStart(4, "0")}`,
      nom: `NOM${n}`,
      prenoms: `Prénom ${n}`,
      sexe: "F",
      dateNaissance: new Date(Date.UTC(2005, 0, 1)),
      lieuNaissance: "Toamasina",
      filiereId,
      anneeEntreeId,
      ...donnees,
    },
  });
}

/** Inscription avec ses mensualités, montants copiés du tarif donné (sans passer par l'écolage). */
export function fabriquerInscription(
  etudiantId: string,
  anneeScolaireId: string,
  tarif: { niveau: number; montantMensuel: number; nombreMois: number; droitsInscription: number },
  debut: Date,
) {
  const echeances: Prisma.EcheanceCreateWithoutInscriptionInput[] = [
    { type: "DROITS", tranche: 1, mois: debut, ordre: 0, montantDu: tarif.droitsInscription },
  ];
  for (let i = 0; i < tarif.nombreMois; i++) {
    const mois = new Date(Date.UTC(debut.getUTCFullYear(), debut.getUTCMonth() + i, 1));
    echeances.push({ type: "MENSUALITE", mois, ordre: i + 1, montantDu: tarif.montantMensuel });
  }
  return db.inscription.create({
    data: { etudiantId, anneeScolaireId, niveau: tarif.niveau, echeances: { create: echeances } },
    include: { echeances: true },
  });
}
