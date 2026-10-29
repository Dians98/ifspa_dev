import type { Sexe } from "@/generated/prisma/enums";
import type { PaiementFiche } from "@/server/lectures/etudiants";
import type { Releve } from "@/server/lectures/paiements";

const TOTAUX_NULS = { du: 0, paye: 0, reste: 0, resteEnRetard: 0, moisEnRetard: 0, duEchu: 0, payeEchu: 0 };

export function paiementFiche(surcharge: Partial<PaiementFiche> = {}): PaiementFiche {
  return {
    id: "p1",
    numeroRecu: "R-2026-00001",
    dateISO: "2026-11-15T09:00:00.000Z",
    date: "15/11/2026",
    heure: "12:00",
    montant: 180_000,
    mode: "ESPECES",
    modeLibelle: "Espèces",
    operateur: null,
    operateurLibelle: null,
    reference: null,
    observation: null,
    caissier: "Caissier Test",
    annule: false,
    annulation: null,
    aVerifier: false,
    noteVerification: null,
    verification: null,
    ...surcharge,
  };
}

/** Relevé sans base de données : une inscription 2026-2027 avec octobre payé, ou aucune inscription. */
export function fabriquerReleve(options: { sexe?: Sexe; paiements?: PaiementFiche[]; sansInscription?: boolean } = {}): Releve {
  const sexe = options.sexe ?? "F";
  const paiements = options.paiements ?? [];
  const payeOctobre = paiements.filter((p) => !p.annule).reduce((t, p) => t + p.montant, 0);
  const totaux = options.sansInscription
    ? TOTAUX_NULS
    : { ...TOTAUX_NULS, du: 180_000, paye: payeOctobre, reste: 180_000 - payeOctobre };
  return {
    dossier: {
      id: "e1",
      matricule: "IF-2026-0001",
      nom: "RAKOTO",
      prenoms: "Soa",
      sexe,
      libelleSexe: sexe === "F" ? "Féminin" : "Masculin",
      dateNaissance: "2005-03-14",
      dateNaissanceAffichee: "14/03/2005",
      lieuNaissance: "Toamasina",
      cin: null,
      telephone: null,
      telephoneAffiche: null,
      email: null,
      adresse: null,
      tuteur: null,
      filiere: { id: "f1", code: "IF", nom: "Infirmier(e)s", dureeAnnees: 3 },
      anneeEntree: "2026-2027",
      statut: "ACTIF",
      libelleStatut: sexe === "F" ? "Active" : "Actif",
      sortie: null,
      creePar: null,
      parcours: options.sansInscription
        ? []
        : [
            {
              id: "i1",
              anneeScolaireId: "a1",
              annee: "2026-2027",
              anneeDebut: 2026,
              anneeCloturee: false,
              niveau: 1,
              libelleNiveau: "1re année",
              redoublement: false,
              statut: "EN_COURS",
              libelleStatut: "En cours",
              totaux,
              echeances: [
                {
                  id: "c1",
                  libelle: "Droits d'inscription",
                  type: "DROITS",
                  fraisId: null,
                  mois: "2026-12-01",
                  montantDu: 100_000,
                  paye: Math.min(payeOctobre, 100_000),
                  reste: Math.max(0, 100_000 - payeOctobre),
                  echue: false,
                  statut: payeOctobre >= 100_000 ? "paye" : payeOctobre > 0 ? "partiel" : "a_venir",
                  libelleStatut: payeOctobre >= 100_000 ? "Payé" : payeOctobre > 0 ? "Partiel" : "À venir",
                  nonDue: false,
                },
                {
                  id: "c2",
                  libelle: "Octobre 2026",
                  type: "MENSUALITE",
                  fraisId: null,
                  mois: "2026-10-01",
                  montantDu: 80_000,
                  paye: Math.max(0, Math.min(payeOctobre - 100_000, 80_000)),
                  reste: 80_000 - Math.max(0, Math.min(payeOctobre - 100_000, 80_000)),
                  echue: true,
                  statut: payeOctobre >= 180_000 ? "paye" : "retard",
                  libelleStatut: payeOctobre >= 180_000 ? "Payé" : "En retard",
                  nonDue: false,
                },
              ],
            },
          ],
      situation: totaux,
      totalEncaisse: payeOctobre,
      paiements,
      echeancesSortie: [],
      jour: "2026-11-15",
    },
    recapitulatif: totaux,
    etablissement: {
      nom: "Institut de Formation Supérieur des Paramédicaux Atsinanana",
      sigle: "IFSPA",
      ville: "Toamasina",
      region: "Atsinanana",
      adresse: null,
      telephone: null,
      email: null,
      arretes: [],
    },
    editeLe: "15/11/2026 à 12:00",
  };
}
