import type { Prisma } from "@/generated/prisma/client";
import type { EtatAction } from "@/lib/etat-action";
import type { EntreeCreationEtudiant } from "@/lib/etudiants";
import {
  fabriquerAnnee,
  fabriquerEtudiant,
  fabriquerFiliere,
  fabriquerInscription,
  fabriquerTarif,
  fabriquerUtilisateur,
} from "./index";

/** Jour fixé pour les actions qui lisent l'horloge : octobre est échu, novembre ne l'est pas. */
export const MAINTENANT = "2026-11-15T09:00:00Z";

type Tarif = { niveau: number; montantMensuel: number; nombreMois: number; droitsInscription: number };

/** Année 2026-2027 courante, filières IF et SF (tarif de 1re année), un administrateur et un utilisateur. */
export async function fabriquerMonde(montants: { droitsInscription?: number; montantMensuel?: number } = {}) {
  const annee = await fabriquerAnnee({ anneeDebut: 2026, estCourante: true });
  const ifs = await fabriquerFiliere({ code: "IF", nom: "Infirmier(e)s" });
  const sf = await fabriquerFiliere({ code: "SF", nom: "Sage-femmes" });
  const tarifIF = await fabriquerTarif(ifs.id, annee.id, montants);
  const tarifSF = await fabriquerTarif(sf.id, annee.id, montants);
  const admin = await fabriquerUtilisateur("admin", { name: "Admin Test" });
  const user = await fabriquerUtilisateur("user", { name: "Caissier Test" });
  return { annee, ifs, sf, tarifIF, tarifSF, admin, user };
}

export type Monde = Awaited<ReturnType<typeof fabriquerMonde>>;

/** Étudiant avec son inscription et ses échéances générées comme en production. */
export async function fabriquerEtudiantInscrit(
  filiereId: string,
  annee: { id: string; dateDebut: Date },
  tarif: Tarif,
  donnees: Partial<Prisma.EtudiantUncheckedCreateInput> = {},
  droitsEnTranches = 1,
) {
  const etudiant = await fabriquerEtudiant(filiereId, annee.id, donnees);
  const inscription = await fabriquerInscription(etudiant.id, annee.id, tarif, annee.dateDebut, droitsEnTranches);
  return { etudiant, inscription };
}

/** Tarif de l'année cible d'un passage : différent du tarif source (100 000 / 80 000) à chaque niveau. */
export function tarifCible(niveau: number): Tarif {
  return { niveau, droitsInscription: 110_000 + 15_000 * (niveau - 1), montantMensuel: 85_000 + 5_000 * (niveau - 1), nombreMois: 10 };
}

/** Année suivante (2027-2028 par défaut) avec un tarif par niveau pour la filière : cible d'un passage. */
export async function fabriquerAnneeCible(
  filiereId: string,
  options: { anneeDebut?: number; niveaux?: number[]; donnees?: Parameters<typeof fabriquerAnnee>[0] } = {},
) {
  const annee = await fabriquerAnnee({ anneeDebut: options.anneeDebut ?? 2027, ...options.donnees });
  for (const niveau of options.niveaux ?? [1, 2, 3]) {
    const { droitsInscription, montantMensuel } = tarifCible(niveau);
    await fabriquerTarif(filiereId, annee.id, { niveau, droitsInscription, montantMensuel });
  }
  return annee;
}

type Connexion ={ mockResolvedValue: (valeur: unknown) => unknown };

/** Fait renvoyer cette session à Better Auth : les vraies règles de rôle de `@/server/acces` s'appliquent. */
export function connecter(getSession: Connexion, u: { id: string; name: string; role: string | null }) {
  getSession.mockResolvedValue({ user: { id: u.id, name: u.name, role: u.role }, session: { id: `session-${u.id}` } });
}

/** Données d'un état de succès ; échoue en affichant l'état reçu sinon. */
export function reussi<D>(etat: EtatAction<D>): D {
  if (etat.statut !== "succes") throw new Error(`Succès attendu, reçu : ${JSON.stringify(etat)}`);
  return etat.donnees;
}

let numeroSaisie = 0;

/** Saisie complète d'un nouvel étudiant, nom et prénoms distincts à chaque appel. */
export function saisieEtudiant(filiereId: string, surcharge: Partial<EntreeCreationEtudiant> = {}): EntreeCreationEtudiant {
  numeroSaisie++;
  return {
    nom: `Nom${numeroSaisie}`,
    prenoms: `Prenom${numeroSaisie}`,
    sexe: "F",
    dateNaissance: "2005-03-14",
    lieuNaissance: "Toamasina",
    cin: "",
    telephone: "0341234567",
    email: "",
    adresse: "Lot 12 Ambodiatafana",
    filiereId,
    niveau: 1,
    ...surcharge,
  };
}
