import { DUREE_MAX, libelleAnnee, NOMBRE_MOIS_ECOLAGE, NOMS_MOIS } from "@/lib/parametres";

// Format du fichier de reprise (phase 7) : colonnes, exemples et consignes. Partagé par le modèle
// téléchargeable (`import-modele-fichiers.ts`) et la lecture de l'import (`import-lecture.ts`). Pur.

export const FEUILLE_LISEZ_MOI = "Lisez-moi";
export const FEUILLE_ETUDIANTS = "Étudiants";
export const FEUILLE_PAIEMENTS = "Paiements";
export type NomFeuille = typeof FEUILLE_ETUDIANTS | typeof FEUILLE_PAIEMENTS;

export type CleEtudiant =
  | "numero"
  | "nom"
  | "prenoms"
  | "sexe"
  | "dateNaissance"
  | "lieuNaissance"
  | "cin"
  | "telephone"
  | "adresse"
  | "tuteurNom"
  | "tuteurTelephone"
  | "tuteurProfession"
  | "filiere"
  | "anneeEntree"
  | "niveau"
  | "redoublant"
  | "droitsEnTranches";

export type ClePaiement = "numeroEtudiant" | "date" | "montant" | "mode" | "operateur" | "reference" | "recuPapier";

export type ColonneImport<K extends string = string> = {
  cle: K;
  /** En-tête du modèle, sans l'astérisque des colonnes obligatoires. */
  entete: string;
  obligatoire: boolean;
  aide: string;
  largeur: number;
  /** Autres en-têtes reconnus à la lecture (comparés sans accents, casse ni ponctuation). */
  alias?: readonly string[];
  /** En-tête reconnu à son début : « Niveau 2026-2027 » porte l'année. */
  prefixe?: boolean;
  /** Écrit en texte dans le modèle : Excel retire le 0 initial d'un nombre. */
  texte?: boolean;
};

// Aides sans année ni code de filière : elles servent aussi à reconnaître la ligne d'aide d'un ancien modèle.
export const COLONNES_ETUDIANTS: readonly ColonneImport<CleEtudiant>[] = [
  { cle: "numero", entete: "N°", obligatoire: true, aide: "Numéro de ligne, unique. Sert à rattacher les paiements.", largeur: 6, alias: ["no", "num", "numero"] },
  { cle: "nom", entete: "Nom", obligatoire: true, aide: "En majuscules ou non, il sera mis en majuscules.", largeur: 18 },
  { cle: "prenoms", entete: "Prénoms", obligatoire: true, aide: "", largeur: 22, alias: ["prenom"] },
  { cle: "sexe", entete: "Sexe", obligatoire: true, aide: "F ou M.", largeur: 6 },
  { cle: "dateNaissance", entete: "Date de naissance", obligatoire: true, aide: "JJ/MM/AAAA.", largeur: 16, alias: ["ne le", "nee le", "date naissance"] },
  { cle: "lieuNaissance", entete: "Lieu de naissance", obligatoire: true, aide: "", largeur: 18, alias: ["lieu naissance", "ne a", "nee a"] },
  { cle: "cin", entete: "CIN", obligatoire: false, aide: "12 chiffres, en texte.", largeur: 16, alias: ["n cin", "no cin"], texte: true },
  { cle: "telephone", entete: "Téléphone", obligatoire: false, aide: "En texte, ex. 034 12 345 67.", largeur: 15, alias: ["tel", "telephone"], texte: true },
  { cle: "adresse", entete: "Adresse", obligatoire: false, aide: "", largeur: 24 },
  { cle: "tuteurNom", entete: "Tuteur", obligatoire: false, aide: "Nom du tuteur, facultatif. Obligatoire si son téléphone ou sa profession est rempli.", largeur: 22, alias: ["nom tuteur", "nom du tuteur"] },
  { cle: "tuteurTelephone", entete: "Téléphone tuteur", obligatoire: false, aide: "En texte, ex. 033 12 345 67.", largeur: 16, alias: ["tel tuteur", "telephone du tuteur"], texte: true },
  { cle: "tuteurProfession", entete: "Profession tuteur", obligatoire: false, aide: "", largeur: 18, alias: ["profession", "profession du tuteur"] },
  { cle: "filiere", entete: "Filière", obligatoire: true, aide: "Code de la filière.", largeur: 8, alias: ["code filiere"] },
  { cle: "anneeEntree", entete: "Année d'entrée", obligatoire: true, aide: "Année de la 1re rentrée à l'IFSPA, ex. 2024 pour 2024-2025. Elle figure dans le matricule.", largeur: 14, alias: ["annee entree"] },
  { cle: "niveau", entete: "Niveau", obligatoire: true, aide: "1, 2 ou 3 : la classe suivie cette année.", largeur: 16, prefixe: true },
  { cle: "redoublant", entete: "Redoublant", obligatoire: false, aide: "oui ou non (non par défaut).", largeur: 11 },
  { cle: "droitsEnTranches", entete: "Droits en", obligatoire: false, aide: "Droits d'inscription payés en 1, 2 ou 3 fois (1 par défaut).", largeur: 10, alias: ["droits", "tranches"] },
];

export const COLONNES_PAIEMENTS: readonly ColonneImport<ClePaiement>[] = [
  { cle: "numeroEtudiant", entete: "N° étudiant", obligatoire: true, aide: "Le N° de l'étudiant dans la feuille Étudiants.", largeur: 11, alias: ["no etudiant", "numero etudiant"] },
  { cle: "date", entete: "Date", obligatoire: true, aide: "JJ/MM/AAAA.", largeur: 12, alias: ["date du paiement", "date paiement"] },
  { cle: "montant", entete: "Montant (Ar)", obligatoire: true, aide: "Nombre entier, sans espaces ni « Ar ».", largeur: 13, alias: ["montant", "montant ariary"] },
  { cle: "mode", entete: "Mode", obligatoire: true, aide: "Espèces ou Mobile Money.", largeur: 14, alias: ["mode de paiement"] },
  { cle: "operateur", entete: "Opérateur", obligatoire: false, aide: "Mobile Money seulement : MVola, Orange Money ou Airtel Money.", largeur: 14 },
  { cle: "reference", entete: "Référence", obligatoire: false, aide: "Mobile Money seulement : référence de la transaction.", largeur: 18 },
  { cle: "recuPapier", entete: "N° reçu papier", obligatoire: false, aide: "En texte : numéro du reçu remis à l'époque, gardé pour mémoire.", largeur: 14, alias: ["no recu papier", "numero recu papier", "recu papier", "n recu"], texte: true },
];

/** Ce que le modèle dit de l'année courante ; calculé par `parametresModele`. */
export type ParametresModele = {
  anneeDebut: number;
  /** « 2026-2027 » */
  libelle: string;
  moisDebutEcolage: number;
  /** Nombre de mensualités commun à tous les tarifs de l'année, null s'il varie selon la classe. */
  nombreMois: number | null;
  /** Codes des filières actives, ex. ["IF", "SF"]. */
  codesFilieres: string[];
  /** Durée de la plus longue filière active : niveaux 1 à `niveauMax`. */
  niveauMax: number;
  /** Années d'entrée possibles d'un 2e ou 3e année, absentes de Paramètres › Années (« 2025-2026 »). */
  anneesACreer: string[];
};

export type DonneesParametresModele = {
  anneeDebut: number;
  moisDebutEcolage: number;
  /** `nombreMois` de chaque tarif de l'année courante. */
  nombresMois: number[];
  filieres: { code: string; dureeAnnees: number }[];
  /** `anneeDebut` de toutes les années présentes en base. */
  anneesExistantes: number[];
};

export function parametresModele(d: DonneesParametresModele): ParametresModele {
  const nombres = [...new Set(d.nombresMois)];
  const niveauMax = Math.min(DUREE_MAX, Math.max(1, ...d.filieres.map((f) => f.dureeAnnees)));
  const existantes = new Set(d.anneesExistantes);
  const anneesACreer: string[] = [];
  for (let debut = d.anneeDebut - (niveauMax - 1); debut < d.anneeDebut; debut++) {
    if (!existantes.has(debut)) anneesACreer.push(libelleAnnee(debut));
  }
  return {
    anneeDebut: d.anneeDebut,
    libelle: libelleAnnee(d.anneeDebut),
    moisDebutEcolage: d.moisDebutEcolage,
    nombreMois: nombres.length === 0 ? NOMBRE_MOIS_ECOLAGE : nombres.length === 1 ? nombres[0] : null,
    codesFilieres: [...new Set(d.filieres.map((f) => f.code))].sort(),
    niveauMax,
    anneesACreer,
  };
}

/** Modèle de `docs/modele-import/`, généré sans base. */
export const PARAMETRES_MODELE_EXEMPLE: ParametresModele = parametresModele({
  anneeDebut: 2026,
  moisDebutEcolage: 10,
  nombresMois: [NOMBRE_MOIS_ECOLAGE],
  filieres: [
    { code: "IF", dureeAnnees: 3 },
    { code: "SF", dureeAnnees: 3 },
  ],
  anneesExistantes: [2024, 2025, 2026],
});

function enumeration(valeurs: readonly string[]): string {
  if (valeurs.length <= 1) return valeurs.join("");
  return `${valeurs.slice(0, -1).join(", ")} ou ${valeurs[valeurs.length - 1]}`;
}

/** Colonnes telles qu'écrites dans le modèle de l'année : « Niveau 2026-2027 », codes et niveaux réels. */
export function colonnesEtudiantsModele(p: ParametresModele): ColonneImport<CleEtudiant>[] {
  const niveaux = enumeration(Array.from({ length: p.niveauMax }, (_, i) => String(i + 1)));
  return COLONNES_ETUDIANTS.map((c) => {
    if (c.cle === "niveau") return { ...c, entete: `Niveau ${p.libelle}`, aide: `${niveaux} : la classe suivie en ${p.libelle}.` };
    if (c.cle === "filiere" && p.codesFilieres.length > 0) return { ...c, aide: `Code de la filière : ${enumeration(p.codesFilieres)}.` };
    return c;
  });
}

export type LigneModele<K extends string> = Record<K, string>;

/** Identités des lignes d'exemple, fixes d'une année à l'autre : une ligne restée dans le fichier est refusée. */
export const IDENTITES_EXEMPLES = [
  { nom: "RAKOTOMALALA", prenoms: "Hanitra Mialy", dateNaissance: "2007-03-14" },
  { nom: "RASOANAIVO", prenoms: "Fanja", dateNaissance: "2005-11-02" },
  { nom: "ANDRIAMAHEFA", prenoms: "Tojo Niaina", dateNaissance: "2004-06-27" },
] as const;

/** Paiements d'exemple reconnus sans leur date (elle suit l'année du modèle). */
export const PAIEMENTS_EXEMPLES = [
  { numeroEtudiant: "1", montant: 34000, mode: "ESPECES", recuPapier: "0412" },
  { numeroEtudiant: "1", montant: 80000, mode: "MOBILE_MONEY", recuPapier: "0413" },
  { numeroEtudiant: "2", montant: 180000, mode: "ESPECES", recuPapier: "0420" },
] as const;

function jourModele(jour: number, mois: number, annee: number): string {
  return `${String(jour).padStart(2, "0")}/${String(mois).padStart(2, "0")}/${annee}`;
}

export function exemplesEtudiants(p: ParametresModele): LigneModele<CleEtudiant>[] {
  const [a, b, c] = IDENTITES_EXEMPLES;
  const naissance = (jour: string) => jour.split("-").reverse().join("/");
  const deux = Math.min(2, p.niveauMax);
  return [
    {
      numero: "1", nom: a.nom, prenoms: a.prenoms, sexe: "F", dateNaissance: naissance(a.dateNaissance),
      lieuNaissance: "Toamasina", cin: "", telephone: "034 12 345 67", adresse: "Lot II A 12 Tanambao V",
      tuteurNom: "RAKOTO Jean", tuteurTelephone: "033 12 345 67", tuteurProfession: "Commerçant",
      filiere: p.codesFilieres[0] ?? "IF", anneeEntree: String(p.anneeDebut), niveau: "1", redoublant: "non", droitsEnTranches: "3",
    },
    {
      numero: "2", nom: b.nom, prenoms: b.prenoms, sexe: "F", dateNaissance: naissance(b.dateNaissance),
      lieuNaissance: "Fénérive-Est", cin: "501 011 012 345", telephone: "032 98 765 43", adresse: "Ankirihiry",
      tuteurNom: "", tuteurTelephone: "", tuteurProfession: "",
      filiere: p.codesFilieres[1] ?? p.codesFilieres[0] ?? "SF", anneeEntree: String(p.anneeDebut - 1), niveau: String(deux), redoublant: "non", droitsEnTranches: "1",
    },
    {
      numero: "3", nom: c.nom, prenoms: c.prenoms, sexe: "M", dateNaissance: naissance(c.dateNaissance),
      lieuNaissance: "Brickaville", cin: "", telephone: "033 45 678 90", adresse: "Morarano",
      tuteurNom: "RASOA Marie", tuteurTelephone: "034 98 765 43", tuteurProfession: "Institutrice",
      filiere: p.codesFilieres[0] ?? "IF", anneeEntree: String(p.anneeDebut - 2), niveau: String(deux), redoublant: "oui", droitsEnTranches: "1",
    },
  ];
}

export function exemplesPaiements(p: ParametresModele): LigneModele<ClePaiement>[] {
  const mois = p.moisDebutEcolage;
  return [
    { numeroEtudiant: "1", date: jourModele(5, mois, p.anneeDebut), montant: "34000", mode: "Espèces", operateur: "", reference: "", recuPapier: "0412" },
    { numeroEtudiant: "1", date: jourModele(5, mois, p.anneeDebut), montant: "80000", mode: "Mobile Money", operateur: "MVola", reference: "MP261005.1432.A12345", recuPapier: "0413" },
    { numeroEtudiant: "2", date: jourModele(8, mois, p.anneeDebut), montant: "180000", mode: "Espèces", operateur: "", reference: "", recuPapier: "0420" },
  ];
}

function periodeMensualites(p: ParametresModele): string {
  if (p.nombreMois === null) return "les mensualités prévues par le tarif de chaque classe";
  const debut = NOMS_MOIS[p.moisDebutEcolage - 1];
  const fin = NOMS_MOIS[(p.moisDebutEcolage - 1 + p.nombreMois - 1) % 12];
  return p.nombreMois === 1 ? `1 mensualité (${debut})` : `${p.nombreMois} mensualités (${debut} à ${fin})`;
}

export function consignesImport(p: ParametresModele): string[] {
  const exempleEntree = p.anneeDebut - 1;
  const anneesAbsentes =
    p.anneesACreer.length > 0
      ? [`• années absentes aujourd'hui de Paramètres › Années : ${p.anneesACreer.join(", ")}.`]
      : [];
  return [
    `Modèle de reprise des données de l'IFSPA — année ${p.libelle}`,
    "",
    `Feuille « ${FEUILLE_ETUDIANTS} » : une ligne par étudiant inscrit en ${p.libelle}.`,
    `Feuille « ${FEUILLE_PAIEMENTS} » : une ligne par paiement déjà reçu pour ${p.libelle} (droits et mensualités). Les impayés des années précédentes ne sont pas repris.`,
    "Les colonnes marquées * sont obligatoires. Ne renommez pas les colonnes ; la ligne d'aide (ligne 2) peut rester ou être supprimée.",
    "Les lignes d'exemple sont à remplacer par les vôtres : l'import refuse un fichier qui les contient encore.",
    "",
    "Avant l'import, dans Paramètres :",
    `• ${p.libelle} est l'année courante et ses tarifs sont saisis pour chaque filière et chaque niveau du fichier ;`,
    `• un étudiant entré une année précédente (ex. ${exempleEntree} pour un 2e année) demande que cette année existe : créez l'année ${libelleAnnee(exempleEntree)} dans Paramètres › Années, puis clôturez-la ;`,
    ...anneesAbsentes,
    "",
    "Saisie dans Excel :",
    "• téléphone et n° de reçu papier en texte (cellule au format Texte, ou valeur précédée d'une apostrophe : '0412) : sinon Excel retire le 0 initial ;",
    "• dates au format JJ/MM/AAAA ; montants en ariary, nombres entiers sans « Ar » ;",
    "• Mobile Money : l'opérateur est obligatoire ; sans référence, le paiement est accepté avec un avertissement.",
    "",
    "Ce que fait l'import :",
    "• le matricule est attribué automatiquement, par filière et année d'entrée puis dans l'ordre des N° ; il porte l'année d'entrée (ex. SF-2025-0001) ;",
    `• chaque étudiant est inscrit sur ${p.libelle} seulement, au niveau indiqué : droits d'inscription + ${periodeMensualites(p)}, d'après les tarifs de Paramètres ;`,
    "• chaque paiement est réparti comme au guichet, de l'échéance la plus ancienne à la plus récente ; un montant au-delà du reste dû est refusé ;",
    "• chaque paiement reçoit un reçu R-…, daté du jour indiqué ; le n° du reçu papier est gardé en observation ;",
    "• rien n'est enregistré avant votre validation : un rapport liste d'abord les lignes acceptées et refusées, avec la raison ;",
    "• un fichier qui contient une erreur n'importe rien : corrigez-le et déposez-le à nouveau ;",
    "• un étudiant déjà présent (mêmes nom, prénoms et date de naissance) n'est pas recréé ; un paiement déjà importé ne l'est pas deux fois ;",
    "• un import ne s'annule pas : un paiement importé à tort s'annule comme les autres, dans Paiements.",
    "",
    `Version CSV : enregistrez chaque feuille séparément (« CSV UTF-8 », séparateur point-virgule), soit etudiants.csv et paiements.csv.`,
  ];
}
