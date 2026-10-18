import "server-only";
import readXlsxFile from "read-excel-file/node";
import { FEUILLE_ETUDIANTS, FEUILLE_PAIEMENTS, type NomFeuille } from "@/lib/import-modele";
import { lireCsv, lireReprise, messageImport, natureTableau, normaliserEntete, type MessageImport, type RepriseLue } from "@/lib/import-lecture";

// Fichiers déposés sur l'écran d'import : un .xlsx du modèle, ou etudiants.csv (+ paiements.csv).

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

function feuilleNommee(sheets: { sheet: string; data: unknown[][] }[], nom: NomFeuille) {
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
  const paiements = feuilleNommee(sheets, FEUILLE_PAIEMENTS);
  const manquantes = [!etudiants && FEUILLE_ETUDIANTS, !paiements && FEUILLE_PAIEMENTS].filter(Boolean);
  if (!etudiants || !paiements) {
    return refus(
      `Feuille${manquantes.length > 1 ? "s" : ""} ${manquantes.map((n) => `« ${n} »`).join(" et ")} introuvable${manquantes.length > 1 ? "s" : ""} dans « ${f.nom} » ` +
        `(feuilles du classeur : ${sheets.map((s) => s.sheet).join(", ")}). Utilisez le modèle téléchargé depuis cet écran.`,
    );
  }
  return { ok: true, lu: lireReprise({ etudiants: etudiants.data, paiements: paiements.data }) };
}

function lireDeuxCsv(fichiers: FichierRecu[]): LectureFichiers {
  const tableaux = new Map<NomFeuille, { nom: string; lignes: string[][] }>();
  const messages: MessageImport[] = [];
  for (const f of fichiers) {
    const lu = lireCsv(f.octets, f.nom);
    if (!lu.ok) return refus(lu.erreur);
    if (lu.avertissement) messages.push(messageImport("avertissement", lu.avertissement));
    const nature = natureTableau(lu.lignes);
    if (!nature) {
      return refus(`« ${f.nom} » n'a ni les en-têtes de la feuille Étudiants ni ceux de la feuille Paiements : utilisez les CSV du modèle.`);
    }
    const deja = tableaux.get(nature);
    if (deja) return refus(`« ${deja.nom} » et « ${f.nom} » contiennent tous deux la feuille ${nature} : déposez un CSV Étudiants et un CSV Paiements.`);
    tableaux.set(nature, { nom: f.nom, lignes: lu.lignes });
  }
  const etudiants = tableaux.get(FEUILLE_ETUDIANTS);
  if (!etudiants) return refus("Ajoutez le CSV des étudiants : les paiements leur sont rattachés par leur N°.");
  return { ok: true, lu: lireReprise({ etudiants: etudiants.lignes, paiements: tableaux.get(FEUILLE_PAIEMENTS)?.lignes ?? null }, messages) };
}

/** Lit le dépôt ; un refus (fichier manquant, illisible, trop gros) a un message affichable tel quel. */
export async function lireFichiersReprise(fichiers: FichierRecu[]): Promise<LectureFichiers> {
  if (fichiers.length === 0) return refus("Déposez le fichier .xlsx du modèle, ou les CSV Étudiants et Paiements.");
  const total = fichiers.reduce((s, f) => s + f.octets.byteLength, 0);
  if (total > TAILLE_MAX_OCTETS) return refus(`Fichier trop volumineux (${taille(total)}) : 1 Mo au plus. Importez en plusieurs fois.`);
  const vide = fichiers.find((f) => f.octets.byteLength === 0);
  if (vide) return refus(`« ${vide.nom} » est vide.`);

  const ancien = fichiers.find((f) => commencePar(f.octets, OLE2));
  if (ancien) return refus(`« ${ancien.nom} » est un classeur Excel ancien format (.xls) : ouvrez-le dans Excel et enregistrez-le au format .xlsx.`);
  const classeurs = fichiers.filter((f) => commencePar(f.octets, ZIP));
  if (classeurs.length > 0) {
    if (fichiers.length > 1) return refus("Déposez soit le classeur .xlsx seul, soit les CSV Étudiants et Paiements, pas les deux.");
    return lireXlsx(classeurs[0]);
  }
  const pasCsv = fichiers.find((f) => /\.xlsx$/i.test(f.nom));
  if (pasCsv) return refus(`« ${pasCsv.nom} » n'est pas un classeur .xlsx lisible. Ouvrez-le dans Excel et enregistrez-le à nouveau au format .xlsx.`);
  if (fichiers.length > 2) return refus("Trois fichiers ou plus : déposez le classeur .xlsx seul, ou les deux CSV (Étudiants et Paiements).");
  return lireDeuxCsv(fichiers);
}
