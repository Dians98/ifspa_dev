import type { ModePaiement, OperateurMobile, Sexe } from "@/generated/prisma/enums";
import { dateDuJour, formaterJour, lireJour, type Jour } from "@/lib/dates";
import { TRANCHES_POSSIBLES, type NombreTranches } from "@/lib/ecolage";
import { controleDateNaissance, normaliserRecherche, normaliserTelephone } from "@/lib/etudiants";
import { messageImport, texteCellule, type Cellule, type FeuilleLue, type LieuMessage, type MessageImport } from "@/lib/import-lecture";
import {
  COLONNES_ETUDIANTS,
  COLONNES_PAIEMENTS,
  FEUILLE_ETUDIANTS,
  FEUILLE_PAIEMENTS,
  IDENTITES_EXEMPLES,
  PAIEMENTS_EXEMPLES,
  type CleEtudiant,
  type ClePaiement,
} from "@/lib/import-modele";
import { lireMontant, verifierMontant } from "@/lib/montant";
import { ANNEE_DEBUT_MAX, ANNEE_DEBUT_MIN, DUREE_MAX } from "@/lib/parametres";

// Validation du fichier de reprise, ligne par ligne : chaque cellule lue devient une valeur typée,
// ou un message (erreur bloquante, avertissement) qui cite la ligne, la colonne et la valeur. Pur.

export type EtudiantImport = {
  ligne: number;
  /** N° normalisé (« 007 » → « 7 ») : clé de rattachement des paiements. */
  numero: string;
  nom: string;
  prenoms: string;
  sexe: Sexe;
  dateNaissance: Jour;
  lieuNaissance: string;
  cin: string | null;
  /** « 0341234567 » */
  telephone: string | null;
  adresse: string | null;
  /** Code en majuscules, existence vérifiée par l'analyse. */
  filiere: string;
  anneeEntree: number;
  niveau: number;
  redoublant: boolean;
  droitsEnTranches: NombreTranches;
};

export type PaiementImport = {
  ligne: number;
  numeroEtudiant: string;
  jour: Jour;
  montant: number;
  mode: ModePaiement;
  operateur: OperateurMobile | null;
  reference: string | null;
  recuPapier: string | null;
};

export type CadreValidation = {
  /** Jour de l'analyse, à Madagascar. */
  jour: Jour;
  /** Rentrée de l'année courante (`dateDebut`), null sans année courante. */
  dateDebutAnnee: Jour | null;
};

/** Ligne refusée à la validation ; son N° sert à refuser en cascade les paiements qui la citent. */
export type LigneRefusee = { ligne: number; numero: string | null };

export type ValidationEtudiants = { valides: EtudiantImport[]; refusees: LigneRefusee[]; messages: MessageImport[] };
export type ValidationPaiements = { valides: PaiementImport[]; refusees: LigneRefusee[]; messages: MessageImport[] };

/** Mois avant la rentrée où un paiement (droits payés d'avance) est accepté avec un avertissement. */
export const MOIS_AVANT_RENTREE = 3;

const NOM_MAX = 80;
const PRENOMS_MAX = 120;
const LIEU_MAX = 80;
const ADRESSE_MAX = 200;
const NUMERO_MAX = 20;
const REFERENCE_MAX = 60;
const RECU_PAPIER_MAX = 40;

type Lecture<T> = { ok: true; valeur: T } | { ok: false; raison: string };
const ok = <T>(valeur: T): Lecture<T> => ({ ok: true, valeur });
const ko = <T>(raison: string): Lecture<T> => ({ ok: false, raison });

/** Minuscules sans accents ni espaces superflus, pour comparer une saisie libre (« Féminin », « Mobile money »). */
function simplifier(texte: string): string {
  return normaliserRecherche(texte);
}

function espacesUniques(texte: string): string {
  return texte.replace(/\s+/g, " ").trim();
}

/** « 007 » → « 7 », « a12 » → « A12 » : le N° d'un étudiant et celui cité par un paiement se comparent ainsi. */
export function normaliserNumero(texte: string): string {
  const t = espacesUniques(texte).toUpperCase();
  return /^\d+$/.test(t) ? String(Number(t)) : t;
}

/** Nombre lu par Excel sans décimale parasite : 412 → « 412 ». */
function texteEntier(c: Cellule): string {
  if (c.type === "nombre" && Number.isInteger(c.nombre)) return String(c.nombre);
  return texteCellule(c);
}

function lireNumero(c: Cellule): Lecture<string> {
  if (c.type === "date") return ko("N° attendu (ex. 12), pas une date.");
  if (c.type === "nombre" && !Number.isInteger(c.nombre)) return ko("N° entier attendu (ex. 12).");
  const t = texteEntier(c);
  if (t.length > NUMERO_MAX) return ko(`N° trop long (${NUMERO_MAX} caractères au plus).`);
  return ok(normaliserNumero(t));
}

function lireTexte(c: Cellule, max: number, quoi: string): Lecture<string> {
  const t = espacesUniques(texteEntier(c));
  if (t.length > max) return ko(`${quoi} trop long (${max} caractères au plus).`);
  return ok(t);
}

// Numéros de série Excel : 1 = 01/01/1900, avec le faux 29/02/1900 d'Excel (série 60).
const EPOQUE_EXCEL_MS = Date.UTC(1899, 11, 30);
const SERIE_MIN = 61;
const SERIE_MAX = 2958465;
const JOUR_MS = 86_400_000;

export function jourDeSerieExcel(serie: number): Jour | null {
  if (!Number.isFinite(serie) || serie < SERIE_MIN || serie > SERIE_MAX) return null;
  return new Date(EPOQUE_EXCEL_MS + Math.floor(serie) * JOUR_MS).toISOString().slice(0, 10);
}

function jourValide(annee: number, mois: number, jour: number): Jour | null {
  const j = `${String(annee).padStart(4, "0")}-${String(mois).padStart(2, "0")}-${String(jour).padStart(2, "0")}`;
  try {
    lireJour(j);
    return j;
  } catch {
    return null;
  }
}

const FORMAT_DATE = "date au format JJ/MM/AAAA attendue (ex. 14/03/2007).";
/** Même consigne en début de phrase, après une première remarque. */
const FORMAT_DATE_PHRASE = "Date au format JJ/MM/AAAA attendue (ex. 14/03/2007).";

/** JJ/MM/AAAA (séparateurs / . -), AAAA-MM-JJ, cellule date d'Excel ou numéro de série. */
export function lireDate(c: Cellule): Lecture<Jour> {
  if (c.type === "date") return ok(c.jour);
  if (c.type === "nombre") {
    const j = jourDeSerieExcel(c.nombre);
    return j ? ok(j) : ko(FORMAT_DATE);
  }
  if (c.type === "vide") return ko(FORMAT_DATE);
  const t = c.texte.replace(/\s+0?0:00(:00)?$/, "").trim();
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (m) {
    const j = jourValide(Number(m[3]), Number(m[2]), Number(m[1]));
    return j ? ok(j) : ko(`cette date n'existe pas. ${FORMAT_DATE_PHRASE}`);
  }
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) {
    const j = jourValide(Number(m[1]), Number(m[2]), Number(m[3]));
    return j ? ok(j) : ko(`cette date n'existe pas. ${FORMAT_DATE_PHRASE}`);
  }
  if (/^\d{1,2}[/.-]\d{1,2}[/.-]\d{2}$/.test(t)) return ko(`année sur 4 chiffres attendue. ${FORMAT_DATE_PHRASE}`);
  return ko(FORMAT_DATE);
}

function lireEntier(c: Cellule, motif: RegExp): number | null {
  if (c.type === "nombre") return Number.isInteger(c.nombre) ? c.nombre : null;
  if (c.type !== "texte") return null;
  const m = motif.exec(simplifier(c.texte));
  return m ? Number(m[1]) : null;
}

export function lireSexe(c: Cellule): Lecture<Sexe> {
  const s = simplifier(texteCellule(c));
  if (["f", "feminin", "femme"].includes(s)) return ok("F");
  if (["m", "masculin", "homme"].includes(s)) return ok("M");
  return ko("indiquez F ou M (« Féminin » ou « Masculin » sont acceptés).");
}

export function lireCin(c: Cellule): Lecture<string | null> {
  if (c.type === "vide") return ok(null);
  const chiffres = texteEntier(c).replace(/[\s.-]/g, "");
  if (!/^\d{12}$/.test(chiffres)) return ko("le numéro de CIN compte 12 chiffres (saisissez-le en texte).");
  return ok(chiffres);
}

/** « 34 12 345 67 » ou 341234567 (0 initial retiré par Excel) → « 0341234567 ». */
export function lireTelephone(c: Cellule): Lecture<string | null> {
  if (c.type === "vide") return ok(null);
  let t = texteEntier(c);
  const chiffres = t.replace(/[\s.\-()]/g, "");
  if (/^3\d{8}$/.test(chiffres)) t = `0${chiffres}`;
  const n = normaliserTelephone(t);
  return n ? ok(n) : ko("numéro malgache attendu : 10 chiffres commençant par 032 à 038 (ex. 034 12 345 67), saisi en texte.");
}

export function lireAnneeEntree(c: Cellule): Lecture<number> {
  let annee: number | null = null;
  if (c.type === "nombre" && Number.isInteger(c.nombre)) annee = c.nombre;
  if (c.type === "texte") {
    const m = /^(\d{4})(?:\s*[-/–]\s*(\d{4}))?$/.exec(c.texte.trim());
    if (m && (!m[2] || Number(m[2]) === Number(m[1]) + 1)) annee = Number(m[1]);
  }
  if (annee === null) return ko("année de la 1re rentrée attendue, ex. 2025 (pour 2025-2026).");
  if (annee < ANNEE_DEBUT_MIN || annee > ANNEE_DEBUT_MAX) return ko(`année entre ${ANNEE_DEBUT_MIN} et ${ANNEE_DEBUT_MAX} attendue.`);
  return ok(annee);
}

export function lireNiveau(c: Cellule): Lecture<number> {
  const n = lireEntier(c, /^(\d)\s*(?:er|re|ere|e|eme)?\s*(?:annee)?$/);
  if (n === null || n < 1 || n > DUREE_MAX) return ko("niveau attendu : 1, 2 ou 3 (la classe suivie cette année).");
  return ok(n);
}

export function lireRedoublant(c: Cellule): Lecture<boolean> {
  if (c.type === "vide") return ok(false);
  const s = simplifier(texteEntier(c));
  if (["oui", "o", "vrai", "1", "x", "redoublant", "redoublante"].includes(s)) return ok(true);
  if (["non", "n", "faux", "0"].includes(s)) return ok(false);
  return ko("indiquez oui ou non.");
}

export function lireTranches(c: Cellule): Lecture<NombreTranches> {
  if (c.type === "vide") return ok(1);
  const n = lireEntier(c, /^(\d)\s*(?:fois|x|tranches?)?$/);
  if (n === null || !TRANCHES_POSSIBLES.includes(n as NombreTranches)) return ko("indiquez 1, 2 ou 3 (droits payés en 1, 2 ou 3 fois).");
  return ok(n as NombreTranches);
}

export function lireMontantCellule(c: Cellule): Lecture<number> {
  if (c.type === "date") return ko("montant attendu, pas une date.");
  const lu = c.type === "nombre" ? verifierMontant(c.nombre) : lireMontant(texteCellule(c));
  return lu.ok ? ok(lu.valeur) : ko(`${lu.erreur.replace(/^Saisissez/, "saisissez").replace(/^Le montant/, "le montant")}`);
}

export function lireMode(c: Cellule): Lecture<ModePaiement> {
  const s = simplifier(texteCellule(c)).replace(/[\s-]/g, "");
  if (["especes", "espece", "cash", "liquide"].includes(s)) return ok("ESPECES");
  if (["mobilemoney", "mobile", "mm"].includes(s)) return ok("MOBILE_MONEY");
  return ko("indiquez Espèces ou Mobile Money.");
}

export function lireOperateur(c: Cellule): Lecture<OperateurMobile | null> {
  if (c.type === "vide") return ok(null);
  const s = simplifier(texteCellule(c)).replace(/[\s-]/g, "");
  if (["mvola", "telma", "telmamvola"].includes(s)) return ok("MVOLA");
  if (["orange", "orangemoney"].includes(s)) return ok("ORANGE_MONEY");
  if (["airtel", "airtelmoney"].includes(s)) return ok("AIRTEL_MONEY");
  return ko("indiquez MVola, Orange Money ou Airtel Money.");
}

function libelleEtudiant(cle: CleEtudiant): string {
  return COLONNES_ETUDIANTS.find((c) => c.cle === cle)!.entete;
}

function libellePaiement(cle: ClePaiement): string {
  return COLONNES_PAIEMENTS.find((c) => c.cle === cle)!.entete;
}

/** Collecte les messages d'une ligne et dit si elle a une erreur bloquante. */
class Ligne<K extends string> {
  erreur = false;
  constructor(
    private readonly messages: MessageImport[],
    private readonly feuille: typeof FEUILLE_ETUDIANTS | typeof FEUILLE_PAIEMENTS,
    readonly ligne: number,
    private readonly cellules: Record<K, Cellule>,
    private readonly libelle: (cle: K) => string,
  ) {}

  private lieu(cle: K | null): LieuMessage {
    return { feuille: this.feuille, ligne: this.ligne, colonne: cle ? this.libelle(cle) : null, valeur: cle ? texteCellule(this.cellules[cle]) : null };
  }

  refuser(cle: K | null, raison: string): void {
    this.erreur = true;
    this.messages.push(messageImport("erreur", raison, this.lieu(cle)));
  }

  avertir(cle: K | null, raison: string): void {
    this.messages.push(messageImport("avertissement", raison, this.lieu(cle)));
  }

  /** Valeur lue, ou undefined après avoir noté l'erreur. */
  lire<T>(cle: K, lecture: (c: Cellule) => Lecture<T>, obligatoire = false): T | undefined {
    const c = this.cellules[cle];
    if (obligatoire && c.type === "vide") {
      this.refuser(cle, "obligatoire, la cellule est vide.");
      return undefined;
    }
    const lu = lecture(c);
    if (!lu.ok) {
      this.refuser(cle, lu.raison);
      return undefined;
    }
    return lu.valeur;
  }
}

function cleIdentite(e: { nom: string; prenoms: string; dateNaissance: string }): string {
  return `${normaliserRecherche(e.nom)}|${normaliserRecherche(e.prenoms)}|${e.dateNaissance}`;
}

const EXEMPLES = new Set(IDENTITES_EXEMPLES.map(cleIdentite));

function lignesCitees(lignes: number[]): string {
  return lignes.length === 1 ? `la ligne ${lignes[0]}` : `les lignes ${lignes.join(", ")}`;
}

export function validerEtudiants(feuille: FeuilleLue<CleEtudiant>, cadre: CadreValidation): ValidationEtudiants {
  const messages: MessageImport[] = [];
  const lus: { etudiant: EtudiantImport | null; numero: string | null; ligne: number }[] = [];

  for (const l of feuille.lignes) {
    const v = new Ligne<CleEtudiant>(messages, FEUILLE_ETUDIANTS, l.ligne, l.cellules, libelleEtudiant);
    const numero = v.lire("numero", lireNumero, true);
    const nom = v.lire("nom", (c) => lireTexte(c, NOM_MAX, "Nom"), true);
    const prenoms = v.lire("prenoms", (c) => lireTexte(c, PRENOMS_MAX, "Prénoms"), true);
    const sexe = v.lire("sexe", lireSexe, true);
    const dateNaissance = v.lire("dateNaissance", lireDate, true);
    const lieuNaissance = v.lire("lieuNaissance", (c) => lireTexte(c, LIEU_MAX, "Lieu"), true);
    const cin = v.lire("cin", lireCin);
    const telephone = v.lire("telephone", lireTelephone);
    const adresse = v.lire("adresse", (c) => lireTexte(c, ADRESSE_MAX, "Adresse"));
    const filiere = v.lire("filiere", (c) => lireTexte(c, 10, "Code"), true);
    const anneeEntree = v.lire("anneeEntree", lireAnneeEntree, true);
    const niveau = v.lire("niveau", lireNiveau, true);
    const redoublant = v.lire("redoublant", lireRedoublant);
    const droitsEnTranches = v.lire("droitsEnTranches", lireTranches);

    if (dateNaissance !== undefined) {
      const refus = controleDateNaissance(dateDuJour(dateNaissance), cadre.jour) ?? (dateNaissance < "1900-01-01" ? "date de naissance invalide." : null);
      if (refus) v.refuser("dateNaissance", refus.charAt(0).toLowerCase() + refus.slice(1));
    }
    if (nom !== undefined && prenoms !== undefined && dateNaissance !== undefined && EXEMPLES.has(cleIdentite({ nom, prenoms, dateNaissance }))) {
      v.refuser("nom", "ligne d'exemple du modèle : remplacez-la par vos données ou supprimez-la.");
    }

    const complet =
      !v.erreur &&
      numero !== undefined && nom !== undefined && prenoms !== undefined && sexe !== undefined && dateNaissance !== undefined &&
      lieuNaissance !== undefined && cin !== undefined && telephone !== undefined && adresse !== undefined && filiere !== undefined &&
      anneeEntree !== undefined && niveau !== undefined && redoublant !== undefined && droitsEnTranches !== undefined;
    lus.push({
      ligne: l.ligne,
      numero: numero ?? null,
      etudiant: complet
        ? {
            ligne: l.ligne,
            numero,
            nom: nom.toLocaleUpperCase("fr"),
            prenoms,
            sexe,
            dateNaissance,
            lieuNaissance,
            cin,
            telephone,
            adresse: adresse === "" ? null : adresse,
            filiere: filiere.toUpperCase(),
            anneeEntree,
            niveau,
            redoublant,
            droitsEnTranches,
          }
        : null,
    });
  }

  // Un N° en double rend le rattachement des paiements ambigu : toutes ses lignes sont refusées.
  const parNumero = new Map<string, number[]>();
  for (const l of lus) if (l.numero !== null) parNumero.set(l.numero, [...(parNumero.get(l.numero) ?? []), l.ligne]);
  const valides: EtudiantImport[] = [];
  const refusees: LigneRefusee[] = [];
  for (const l of lus) {
    const memes = l.numero !== null ? parNumero.get(l.numero)! : [];
    if (memes.length > 1) {
      const autres = memes.filter((n) => n !== l.ligne);
      messages.push(
        messageImport("erreur", `N° déjà utilisé par ${lignesCitees(autres)} : chaque étudiant a un N° différent.`, {
          feuille: FEUILLE_ETUDIANTS,
          ligne: l.ligne,
          colonne: libelleEtudiant("numero"),
          valeur: l.numero,
        }),
      );
    }
    if (l.etudiant && memes.length <= 1) valides.push(l.etudiant);
    else refusees.push({ ligne: l.ligne, numero: l.numero });
  }
  return { valides, refusees, messages };
}

function moisAvant(jour: Jour, n: number): Jour {
  const { annee, mois, jour: j } = lireJour(jour);
  return new Date(Date.UTC(annee, mois - 1 - n, j)).toISOString().slice(0, 10);
}

/** « 0412 » et 412 désignent le même reçu papier. */
export function normaliserRecuPapier(texte: string): string {
  const t = espacesUniques(texte).toUpperCase();
  return /^\d+$/.test(t) ? String(Number(t)) : t;
}

function estPaiementExemple(p: Omit<PaiementImport, "ligne" | "jour">): boolean {
  return PAIEMENTS_EXEMPLES.some(
    (e) =>
      e.numeroEtudiant === p.numeroEtudiant &&
      e.montant === p.montant &&
      e.mode === p.mode &&
      p.recuPapier !== null &&
      normaliserRecuPapier(e.recuPapier) === normaliserRecuPapier(p.recuPapier),
  );
}

/** `numerosEtudiants` : N° normalisés de toutes les lignes de la feuille Étudiants, même refusées. */
export function validerPaiements(
  feuille: FeuilleLue<ClePaiement>,
  numerosEtudiants: ReadonlySet<string>,
  cadre: CadreValidation,
): ValidationPaiements {
  const messages: MessageImport[] = [];
  const valides: PaiementImport[] = [];
  const refusees: LigneRefusee[] = [];
  const limiteAvertissement = cadre.dateDebutAnnee ? moisAvant(cadre.dateDebutAnnee, MOIS_AVANT_RENTREE) : null;

  for (const l of feuille.lignes) {
    const v = new Ligne<ClePaiement>(messages, FEUILLE_PAIEMENTS, l.ligne, l.cellules, libellePaiement);
    const numeroEtudiant = v.lire("numeroEtudiant", lireNumero, true);
    const jour = v.lire("date", lireDate, true);
    const montant = v.lire("montant", lireMontantCellule, true);
    const mode = v.lire("mode", lireMode, true);
    const operateur = v.lire("operateur", lireOperateur);
    const reference = v.lire("reference", (c) => lireTexte(c, REFERENCE_MAX, "Référence"));
    const recuPapier = v.lire("recuPapier", (c) => lireTexte(c, RECU_PAPIER_MAX, "N° de reçu"));

    if (numeroEtudiant !== undefined && !numerosEtudiants.has(numeroEtudiant)) {
      v.refuser("numeroEtudiant", "aucun étudiant ne porte ce N° dans la feuille Étudiants.");
    }
    if (jour !== undefined) {
      if (jour > cadre.jour) {
        v.refuser("date", "date future : la reprise ne concerne que les paiements déjà reçus.");
      } else if (cadre.dateDebutAnnee && limiteAvertissement && jour < limiteAvertissement) {
        v.refuser(
          "date",
          `paiement antérieur au ${formaterJour(limiteAvertissement)} : les paiements des années précédentes ne sont pas repris.`,
        );
      } else if (cadre.dateDebutAnnee && jour < cadre.dateDebutAnnee) {
        v.avertir("date", `paiement reçu avant la rentrée du ${formaterJour(cadre.dateDebutAnnee)} : vérifiez qu'il concerne bien cette année (droits payés d'avance).`);
      }
    }
    if (mode === "MOBILE_MONEY") {
      if (operateur === null) v.refuser("operateur", "opérateur obligatoire pour un paiement Mobile Money (MVola, Orange Money ou Airtel Money).");
      if (reference === "") v.avertir("reference", "paiement Mobile Money sans référence : il sera importé sans référence.");
    } else if (mode === "ESPECES") {
      if (operateur) v.refuser("operateur", "l'opérateur ne concerne que le Mobile Money : videz la cellule ou corrigez le mode.");
      if (reference) v.refuser("reference", "la référence ne concerne que le Mobile Money : videz la cellule (le n° de reçu papier a sa colonne).");
    }

    const complet =
      numeroEtudiant !== undefined && jour !== undefined && montant !== undefined && mode !== undefined &&
      operateur !== undefined && reference !== undefined && recuPapier !== undefined;
    if (complet) {
      const p = { numeroEtudiant, montant, mode, operateur, reference: reference || null, recuPapier: recuPapier || null };
      if (estPaiementExemple(p)) v.refuser("numeroEtudiant", "ligne d'exemple du modèle : remplacez-la par vos paiements ou supprimez-la.");
      if (!v.erreur) {
        valides.push({ ligne: l.ligne, jour, ...p });
        continue;
      }
    }
    refusees.push({ ligne: l.ligne, numero: numeroEtudiant ?? null });
  }
  return { valides, refusees, messages };
}
