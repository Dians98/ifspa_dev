import type { ContexteReprise, EtudiantEnBase } from "@/lib/import-analyse";
import { genererEcheances, type EcheancePayee } from "@/lib/ecolage";
import { lireReprise, type Cellule, type FeuilleLue, type RepriseLue } from "@/lib/import-lecture";
import {
  COLONNES_PAIEMENTS,
  colonnesEtudiantsModele,
  PARAMETRES_MODELE_EXEMPLE,
  type CleEtudiant,
  type ClePaiement,
} from "@/lib/import-modele";

// Données de la reprise sans base : tableaux de cellules, contexte d'analyse et étudiants « en base » écrits à la main.

export const JOUR_ANALYSE = "2026-11-15";

type Valeur = string | number | Date | null;

const ETUDIANT_PAR_DEFAUT: Record<CleEtudiant, Valeur> = {
  numero: "1",
  nom: "RAKOTO",
  prenoms: "Jean",
  sexe: "M",
  dateNaissance: "10/05/2004",
  lieuNaissance: "Toamasina",
  cin: null,
  telephone: "034 12 345 67",
  adresse: "Tanambao V",
  filiere: "IF",
  anneeEntree: "2026",
  niveau: "1",
  redoublant: "non",
  droitsEnTranches: "1",
};

const PAIEMENT_PAR_DEFAUT: Record<ClePaiement, Valeur> = {
  numeroEtudiant: "1",
  date: "05/10/2026",
  montant: "100000",
  mode: "Espèces",
  operateur: null,
  reference: null,
  recuPapier: null,
};

const ENTETES_ETUDIANTS = colonnesEtudiantsModele(PARAMETRES_MODELE_EXEMPLE).map((c) => ({ cle: c.cle, entete: c.obligatoire ? `${c.entete} *` : c.entete }));
const ENTETES_PAIEMENTS = COLONNES_PAIEMENTS.map((c) => ({ cle: c.cle, entete: c.obligatoire ? `${c.entete} *` : c.entete }));

/** En-têtes du modèle puis une ligne par élément ; `enteteNiveau` remplace « Niveau 2026-2027 * ». */
export function tableauEtudiants(
  lignes: Partial<Record<CleEtudiant, Valeur>>[],
  options: { enteteNiveau?: string; sans?: CleEtudiant[] } = {},
): Valeur[][] {
  const colonnes = ENTETES_ETUDIANTS.filter((c) => !options.sans?.includes(c.cle));
  return [
    colonnes.map((c) => (c.cle === "niveau" && options.enteteNiveau !== undefined ? options.enteteNiveau : c.entete)),
    ...lignes.map((l) => colonnes.map((c) => (c.cle in l ? l[c.cle]! : ETUDIANT_PAR_DEFAUT[c.cle]))),
  ];
}

export function tableauPaiements(lignes: Partial<Record<ClePaiement, Valeur>>[]): Valeur[][] {
  return [ENTETES_PAIEMENTS.map((c) => c.entete), ...lignes.map((l) => ENTETES_PAIEMENTS.map((c) => (c.cle in l ? l[c.cle]! : PAIEMENT_PAR_DEFAUT[c.cle])))];
}

/** Fichier lu comme le fait `lireReprise` ; `paiements` omis : aucun paiement ; null : pas de fichier de paiements. */
export function reprise(
  etudiants: Partial<Record<CleEtudiant, Valeur>>[],
  paiements: Partial<Record<ClePaiement, Valeur>>[] | null = [],
  options: Parameters<typeof tableauEtudiants>[1] = {},
): RepriseLue {
  return lireReprise({ etudiants: tableauEtudiants(etudiants, options), paiements: paiements ? tableauPaiements(paiements) : null });
}

/** Feuille déjà lue à partir de cellules simples, pour tester la validation sans passer par les en-têtes. */
export function feuilleLue<K extends string>(
  nom: FeuilleLue<K>["nom"],
  colonnes: readonly K[],
  lignes: { ligne: number; cellules: Partial<Record<K, Cellule>> }[],
): FeuilleLue<K> {
  const vide: Cellule = { type: "vide" };
  return {
    nom,
    colonnes: [...colonnes],
    entetes: {},
    ligneEntetes: 1,
    lignes: lignes.map((l) => ({
      ligne: l.ligne,
      cellules: Object.fromEntries(colonnes.map((c) => [c, l.cellules[c] ?? vide])) as Record<K, Cellule>,
    })),
  };
}

export const texte = (t: string): Cellule => ({ type: "texte", texte: t });
export const nombre = (n: number): Cellule => ({ type: "nombre", nombre: n });
export const vide: Cellule = { type: "vide" };

export const TARIF_STANDARD = { droitsInscription: 100_000, montantMensuel: 80_000, nombreMois: 10 };

/** Année 2026-2027 courante ; IF (niveaux 1 à 3) et SF (niveau 1) tarifées ; OLD désactivée ; 2024 et 2025 clôturées. */
export function contexteReprise(surcharge: Partial<ContexteReprise> = {}): ContexteReprise {
  return {
    anneeCourante: { id: "annee-2026", anneeDebut: 2026, libelle: "2026-2027", cloturee: false, moisDebutEcolage: 10, dateDebut: "2026-10-01" },
    filieres: [
      { id: "fil-if", code: "IF", nom: "Infirmier(e)s", dureeAnnees: 3, actif: true },
      { id: "fil-sf", code: "SF", nom: "Sage-femmes", dureeAnnees: 3, actif: true },
      { id: "fil-old", code: "OLD", nom: "Ancienne filière", dureeAnnees: 3, actif: false },
    ],
    annees: [
      { id: "annee-2024", anneeDebut: 2024, libelle: "2024-2025", cloturee: true },
      { id: "annee-2025", anneeDebut: 2025, libelle: "2025-2026", cloturee: true },
      { id: "annee-2026", anneeDebut: 2026, libelle: "2026-2027", cloturee: false },
    ],
    tarifs: [
      { filiereId: "fil-if", niveau: 1, ...TARIF_STANDARD },
      { filiereId: "fil-if", niveau: 2, ...TARIF_STANDARD },
      { filiereId: "fil-if", niveau: 3, ...TARIF_STANDARD },
      { filiereId: "fil-sf", niveau: 1, ...TARIF_STANDARD },
    ],
    etudiantsEnBase: [],
    clesReprise: new Set(),
    compteursRecu: {},
    ...surcharge,
  };
}

/** Échéances d'une année générées comme en production ; `paye` donne ce qui est déjà payé sur chacune (ordre 1 = droits). */
export function echeancesPayees(anneeDebut: number, paye: (ordre: number) => number = () => 0, droitsEnTranches = 1): EcheancePayee[] {
  return genererEcheances(TARIF_STANDARD, { anneeDebut, moisDebutEcolage: 10 }, droitsEnTranches).map((e) => ({
    id: `e${anneeDebut}-${e.ordre}`,
    anneeDebut,
    mois: e.mois,
    ordre: e.ordre,
    montantDu: e.montantDu,
    paye: paye(e.ordre),
  }));
}

/** Même identité que la ligne par défaut du fichier (RAKOTO Jean, né le 10/05/2004), inscrit en 1re année IF. */
export function etudiantEnBase(surcharge: Partial<EtudiantEnBase> = {}): EtudiantEnBase {
  return {
    id: "etu-1",
    matricule: "IF-2026-0001",
    nom: "RAKOTO",
    prenoms: "Jean",
    dateNaissance: new Date(Date.UTC(2004, 4, 10)),
    filiereId: "fil-if",
    anneeEntree: 2026,
    statut: "ACTIF",
    inscriptionCourante: { niveau: 1, redoublement: false, droitsEnTranches: 1 },
    echeances: echeancesPayees(2026),
    paiementsHorsReprise: 0,
    ...surcharge,
  };
}

// Dépôts de fichiers pour les actions : mêmes tableaux que `reprise()`, écrits en CSV ou en classeur.

type Tableau = (string | number | Date | null)[][];

function celluleCsv(v: string | number | Date | null): string {
  const t = v === null ? "" : String(v);
  return /[;"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/** CSV UTF-8 avec BOM, séparateur point-virgule : ce que produit Excel en « CSV UTF-8 ». */
export function versCsv(tableau: Tableau): string {
  return "﻿" + tableau.map((r) => r.map(celluleCsv).join(";")).join("\r\n") + "\r\n";
}

export type Depot = { nom: string; contenu: string | Uint8Array }[];

export function depotCsv(etudiants: Parameters<typeof tableauEtudiants>[0], paiements: Parameters<typeof tableauPaiements>[0] | null = []): Depot {
  return [
    { nom: "etudiants.csv", contenu: versCsv(tableauEtudiants(etudiants)) },
    ...(paiements ? [{ nom: "paiements.csv", contenu: versCsv(tableauPaiements(paiements)) }] : []),
  ];
}

export async function depotXlsx(etudiants: Parameters<typeof tableauEtudiants>[0], paiements: Parameters<typeof tableauPaiements>[0] = []): Promise<Depot> {
  const { default: writeXlsxFile } = await import("write-excel-file/node");
  const feuille = (sheet: string, t: Tableau) => ({
    sheet,
    data: t.map((r) => r.map((v) => (v === null ? null : { value: String(v), type: String }))),
  });
  const classeur = await writeXlsxFile([feuille("Étudiants", tableauEtudiants(etudiants)), feuille("Paiements", tableauPaiements(paiements))]).toBuffer();
  return [{ nom: "reprise.xlsx", contenu: new Uint8Array(classeur) }];
}

/** Champs `fichiers` (et `signature`) tels que l'écran les envoie. */
export function formulaire(depot: Depot, signature?: string | null): FormData {
  const form = new FormData();
  for (const f of depot) form.append("fichiers", new File([f.contenu as BlobPart], f.nom));
  if (signature !== undefined && signature !== null) form.append("signature", signature);
  return form;
}
