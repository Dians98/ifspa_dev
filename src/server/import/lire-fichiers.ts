import "server-only";
import readXlsxFile from "read-excel-file/node";
import { FEUILLE_ETUDIANTS, FEUILLE_PAIEMENTS_RETIREE } from "@/lib/import-modele";
import {
  lireCsv,
  lireReprise,
  messageImport,
  natureTableau,
  normaliserEntete,
  PAIEMENTS_IGNORES,
  type MessageImport,
  type RepriseLue,
} from "@/lib/import-lecture";

// Fichiers déposés sur l'écran d'import : un .xlsx du modèle, ou etudiants.csv. Un ancien paiements.csv est ignoré.

export const TAILLE_MAX_OCTETS = 1024 * 1024;

export type FichierRecu = { nom: string; octets: Uint8Array };

export type LectureFichiers = { ok: true; lu: RepriseLue } | { ok: false; erreur: string };

const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OLE2 = [0xd0, 0xcf, 0x11, 0xe0];

function commencePar(octets: Uint8Array, signature: number[]): boolean {
  return signature.every((b, i) => octets[i] === b);
}

// En Ko arrondis au-dessus : « 1 Mo » arrondi à côté de « 1 Mo au plus » se contredirait.
function taille(octets: number): string {
  return `${Math.ceil(octets / 1024).toLocaleString("fr-FR")} Ko`;
}

const refus = (erreur: string): LectureFichiers => ({ ok: false, erreur });

/** Fichiers d'un `FormData` (champ répété) ; la taille est contrôlée avant de lire le contenu. */
export async function fichiersDepuisFormData(form: FormData, champ = "fichiers"): Promise<FichierRecu[] | { erreur: string }> {
  const fichiers = form.getAll(champ).filter((f): f is File => typeof f !== "string" && f.size > 0);
  const total = fichiers.reduce((s, f) => s + f.size, 0);
  if (total > TAILLE_MAX_OCTETS) {
    return { erreur: `Fichier trop volumineux (${taille(total)}) : 1 Mo au plus. Retirez les feuilles ou colonnes inutiles, ou importez en plusieurs fois.` };
  }
  return Promise.all(fichiers.map(async (f) => ({ nom: f.name, octets: new Uint8Array(await f.arrayBuffer()) })));
}

function feuilleNommee(sheets: { sheet: string; data: unknown[][] }[], nom: string) {
  return sheets.find((s) => normaliserEntete(s.sheet) === normaliserEntete(nom)) ?? null;
}

async function lireXlsx(f: FichierRecu): Promise<LectureFichiers> {
  let sheets: { sheet: string; data: unknown[][] }[];
  try {
    sheets = await readXlsxFile(Buffer.from(f.octets));
  } catch (e) {
    const code = (e as { code?: unknown } | null)?.code;
    if (code === "XLS_FILE_NOT_SUPPORTED") {
      return refus(`« ${f.nom} » est un classeur Excel ancien format (.xls) : ouvrez-le dans Excel et enregistrez-le au format .xlsx.`);
    }
    return refus(`« ${f.nom} » n'est pas un classeur .xlsx lisible. Ouvrez-le dans Excel, enregistrez-le au format .xlsx, puis déposez-le à nouveau.`);
  }
  const etudiants = feuilleNommee(sheets, FEUILLE_ETUDIANTS);
  if (!etudiants) {
    return refus(
      `Feuille « ${FEUILLE_ETUDIANTS} » introuvable dans « ${f.nom} » (feuilles du classeur : ${sheets.map((s) => s.sheet).join(", ")}). ` +
        "Utilisez le modèle téléchargé depuis cet écran.",
    );
  }
  const messages = feuilleNommee(sheets, FEUILLE_PAIEMENTS_RETIREE) ? [messageImport("avertissement", PAIEMENTS_IGNORES)] : [];
  return { ok: true, lu: lireReprise(etudiants.data, messages) };
}

function lireCsvReprise(fichiers: FichierRecu[]): LectureFichiers {
  let etudiants: { nom: string; lignes: string[][] } | null = null;
  let paiementsIgnores = false;
  const messages: MessageImport[] = [];
  for (const f of fichiers) {
    const lu = lireCsv(f.octets, f.nom);
    if (!lu.ok) return refus(lu.erreur);
    const nature = natureTableau(lu.lignes);
    if (!nature) return refus(`« ${f.nom} » n'a pas les en-têtes de la feuille Étudiants : utilisez le CSV Étudiants du modèle.`);
    if (nature === "paiements") {
      paiementsIgnores = true;
      continue;
    }
    if (etudiants) return refus(`« ${etudiants.nom} » et « ${f.nom} » contiennent tous deux la feuille Étudiants : déposez un seul CSV Étudiants.`);
    if (lu.avertissement) messages.push(messageImport("avertissement", lu.avertissement));
    etudiants = { nom: f.nom, lignes: lu.lignes };
  }
  if (!etudiants) return refus("Ajoutez le CSV des étudiants : les paiements ne sont plus importés, ils s'encaissent au guichet.");
  if (paiementsIgnores) messages.push(messageImport("avertissement", PAIEMENTS_IGNORES));
  return { ok: true, lu: lireReprise(etudiants.lignes, messages) };
}

/** Lit le dépôt ; un refus (fichier manquant, illisible, trop gros) a un message affichable tel quel. */
export async function lireFichiersReprise(fichiers: FichierRecu[]): Promise<LectureFichiers> {
  if (fichiers.length === 0) return refus("Déposez le fichier .xlsx du modèle, ou le CSV Étudiants.");
  const total = fichiers.reduce((s, f) => s + f.octets.byteLength, 0);
  if (total > TAILLE_MAX_OCTETS) return refus(`Fichier trop volumineux (${taille(total)}) : 1 Mo au plus. Importez en plusieurs fois.`);
  const vide = fichiers.find((f) => f.octets.byteLength === 0);
  if (vide) return refus(`« ${vide.nom} » est vide.`);

  const ancien = fichiers.find((f) => commencePar(f.octets, OLE2));
  if (ancien) return refus(`« ${ancien.nom} » est un classeur Excel ancien format (.xls) : ouvrez-le dans Excel et enregistrez-le au format .xlsx.`);
  const classeurs = fichiers.filter((f) => commencePar(f.octets, ZIP));
  if (classeurs.length > 0) {
    if (fichiers.length > 1) return refus("Déposez soit le classeur .xlsx seul, soit le CSV Étudiants, pas les deux.");
    return lireXlsx(classeurs[0]);
  }
  const pasCsv = fichiers.find((f) => /\.xlsx$/i.test(f.nom));
  if (pasCsv) return refus(`« ${pasCsv.nom} » n'est pas un classeur .xlsx lisible. Ouvrez-le dans Excel et enregistrez-le à nouveau au format .xlsx.`);
  if (fichiers.length > 2) return refus("Trois fichiers ou plus : déposez le classeur .xlsx seul, ou le CSV Étudiants.");
  return lireCsvReprise(fichiers);
}
