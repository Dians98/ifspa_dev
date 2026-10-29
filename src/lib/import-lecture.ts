import { formaterJour, type Jour } from "@/lib/dates";
import {
  COLONNES_ETUDIANTS,
  COLONNES_RETIREES,
  ENTETES_PAIEMENTS_RETIRES,
  FEUILLE_ETUDIANTS,
  FEUILLE_PAIEMENTS_RETIREE,
  type CleEtudiant,
  type ColonneImport,
  type NomFeuille,
} from "@/lib/import-modele";

// Lecture brute du fichier de reprise : CSV décodé, tableau de cellules ramené aux colonnes du modèle.
// Pur : le serveur fournit les octets (CSV) ou les lignes déjà extraites du .xlsx.

export const ETUDIANTS_MAX = 2000;

/** Avertissement d'un ancien fichier qui contient encore la feuille ou le CSV des paiements. */
export const PAIEMENTS_IGNORES = `La feuille « ${FEUILLE_PAIEMENTS_RETIREE} » n'est plus importée, elle est ignorée : encaissez les paiements au guichet.`;

export type Gravite = "erreur" | "avertissement";

export type MessageImport = {
  gravite: Gravite;
  feuille: NomFeuille | null;
  ligne: number | null;
  colonne: string | null;
  valeur: string | null;
  /** Phrase complète affichable telle quelle : elle cite la feuille, la ligne, la colonne et la valeur. */
  texte: string;
};

export type LieuMessage = { feuille?: NomFeuille | null; ligne?: number | null; colonne?: string | null; valeur?: string | null };

const VALEUR_MAX_AFFICHEE = 60;

export function messageImport(gravite: Gravite, raison: string, lieu: LieuMessage = {}): MessageImport {
  const feuille = lieu.feuille ?? null;
  const ligne = lieu.ligne ?? null;
  const colonne = lieu.colonne ?? null;
  const brute = lieu.valeur ?? null;
  const valeur = brute !== null && brute.length > VALEUR_MAX_AFFICHEE ? `${brute.slice(0, VALEUR_MAX_AFFICHEE - 1)}…` : brute;
  const parties = [feuille, ligne !== null ? `ligne ${ligne}` : null, colonne !== null ? `colonne « ${colonne} »` : null].filter(
    (p): p is string => p !== null,
  );
  const lieuTexte = parties.join(", ") + (valeur !== null && valeur !== "" ? ` (« ${valeur} »)` : "");
  return { gravite, feuille, ligne, colonne, valeur, texte: lieuTexte ? `${lieuTexte} : ${raison}` : raison };
}

/** Cellule ramenée à une valeur neutre : CSV et .xlsx donnent les mêmes formes. */
export type Cellule =
  | { type: "vide" }
  | { type: "texte"; texte: string }
  | { type: "nombre"; nombre: number }
  /** Cellule date d'Excel (minuit UTC) ; un numéro de série dans une cellule « Standard » reste un nombre. */
  | { type: "date"; jour: Jour };

const VIDE: Cellule = { type: "vide" };

export function cellule(v: unknown): Cellule {
  if (v === null || v === undefined) return VIDE;
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? VIDE : { type: "texte", texte: t };
  }
  if (typeof v === "number") return Number.isFinite(v) ? { type: "nombre", nombre: v } : VIDE;
  if (typeof v === "boolean") return { type: "texte", texte: v ? "oui" : "non" };
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? VIDE : { type: "date", jour: v.toISOString().slice(0, 10) };
  return VIDE;
}

/** Valeur telle que l'utilisateur la voit, pour la citer dans un message. */
export function texteCellule(c: Cellule): string {
  switch (c.type) {
    case "vide":
      return "";
    case "texte":
      return c.texte;
    case "nombre":
      return String(c.nombre);
    case "date":
      return formaterJour(c.jour);
  }
}

// CSV

export type LectureCsv = { ok: true; lignes: string[][]; avertissement: string | null } | { ok: false; erreur: string };

function decoder(octets: Uint8Array, nom: string): { texte: string; avertissement: string | null } | { erreur: string } {
  if ((octets[0] === 0xff && octets[1] === 0xfe) || (octets[0] === 0xfe && octets[1] === 0xff)) {
    return { erreur: `« ${nom} » est en Unicode UTF-16 : enregistrez-le depuis Excel en « CSV UTF-8 (délimité par des points-virgules) ».` };
  }
  try {
    // Le BOM UTF-8 éventuel est retiré par TextDecoder.
    return { texte: new TextDecoder("utf-8", { fatal: true }).decode(octets), avertissement: null };
  } catch {
    return {
      texte: new TextDecoder("windows-1252").decode(octets),
      avertissement:
        `« ${nom} » n'est pas en UTF-8 : il a été lu comme un CSV Windows (ANSI). Vérifiez les accents dans le rapport ; ` +
        "au besoin, enregistrez-le depuis Excel en « CSV UTF-8 ».",
    };
  }
}

/** Point-virgule, guillemets doublés, retours à la ligne dans les guillemets, CRLF ou LF. */
export function decouperCsv(texte: string): { ok: true; lignes: string[][] } | { ok: false; ligne: number } {
  const lignes: string[][] = [];
  let ligne: string[] = [];
  let champ = "";
  let entreGuillemets = false;
  let debutGuillemets = 0;
  let i = 0;
  const finirChamp = () => {
    ligne.push(champ);
    champ = "";
  };
  const finirLigne = () => {
    finirChamp();
    lignes.push(ligne);
    ligne = [];
  };
  while (i < texte.length) {
    const c = texte[i];
    if (entreGuillemets) {
      if (c === '"') {
        if (texte[i + 1] === '"') {
          champ += '"';
          i += 2;
          continue;
        }
        entreGuillemets = false;
      } else {
        champ += c;
      }
      i++;
      continue;
    }
    if (c === '"' && champ.trim() === "") {
      champ = "";
      entreGuillemets = true;
      debutGuillemets = lignes.length + 1;
    } else if (c === ";") {
      finirChamp();
    } else if (c === "\r" || c === "\n") {
      finirLigne();
      if (c === "\r" && texte[i + 1] === "\n") i++;
    } else {
      champ += c;
    }
    i++;
  }
  if (entreGuillemets) return { ok: false, ligne: debutGuillemets };
  if (champ !== "" || ligne.length > 0) finirLigne();
  return { ok: true, lignes };
}

export function lireCsv(octets: Uint8Array, nom: string): LectureCsv {
  const decode = decoder(octets, nom);
  if ("erreur" in decode) return { ok: false, erreur: decode.erreur };
  const decoupe = decouperCsv(decode.texte);
  if (!decoupe.ok) {
    return { ok: false, erreur: `« ${nom} », ligne ${decoupe.ligne} : guillemet ouvert jamais refermé. Corrigez la cellule puis réenregistrez le fichier.` };
  }
  const premiere = decoupe.lignes.find((l) => l.some((c) => c.trim() !== ""));
  if (premiere && premiere.length === 1 && /[,\t]/.test(premiere[0])) {
    return {
      ok: false,
      erreur: `« ${nom} » n'utilise pas le point-virgule comme séparateur : enregistrez-le depuis Excel en « CSV UTF-8 (délimité par des points-virgules) ».`,
    };
  }
  return { ok: true, lignes: decoupe.lignes, avertissement: decode.avertissement };
}

// En-têtes et lignes

/** « N° étudiant * » → « n etudiant » : sans accents, casse, astérisque ni ponctuation. */
export function normaliserEntete(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function reconnait<K extends string>(colonne: ColonneImport<K>, normalise: string): boolean {
  const noms = [colonne.entete, ...(colonne.alias ?? [])].map(normaliserEntete);
  if (noms.includes(normalise)) return true;
  return colonne.prefixe === true && noms.some((n) => normalise.startsWith(`${n} `));
}

export function colonneDeEntete<K extends string>(colonnes: readonly ColonneImport<K>[], entete: string): ColonneImport<K> | null {
  const normalise = normaliserEntete(entete);
  if (normalise === "") return null;
  return colonnes.find((c) => reconnait(c, normalise)) ?? null;
}

/** Lettre de colonne Excel : 0 → A, 26 → AA. */
export function lettreColonne(index: number): string {
  let n = index + 1;
  let lettres = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    lettres = String.fromCharCode(65 + r) + lettres;
    n = Math.floor((n - 1) / 26);
  }
  return lettres;
}

export type LigneLue<K extends string> = {
  /** Numéro de la ligne dans Excel (1 = en-têtes du modèle). */
  ligne: number;
  cellules: Record<K, Cellule>;
};

export type FeuilleLue<K extends string> = {
  nom: NomFeuille;
  lignes: LigneLue<K>[];
  /** Colonnes du modèle trouvées dans le fichier. */
  colonnes: K[];
  /** En-tête tel qu'écrit, par colonne trouvée (« Niveau 2026-2027 »). */
  entetes: Partial<Record<K, string>>;
  /** Ligne Excel des en-têtes, null s'ils sont introuvables. */
  ligneEntetes: number | null;
};

type Tableau = readonly (readonly unknown[])[];

/** Les en-têtes sont cherchés dans les premières lignes : un titre ajouté au-dessus ne gêne pas. */
const LIGNES_AVANT_ENTETES_MAX = 10;

function libelleColonne<K extends string>(c: ColonneImport<K>): string {
  return c.entete;
}

function ligneVide(cellules: Cellule[]): boolean {
  return cellules.every((c) => c.type === "vide");
}

/**
 * Ramène un tableau brut aux colonnes du modèle. Erreur globale si une colonne obligatoire manque,
 * avertissement pour une colonne inconnue ; ligne d'aide du modèle et lignes vides sautées.
 */
export function lireFeuille<K extends string>(
  tableau: Tableau,
  nom: NomFeuille,
  colonnes: readonly ColonneImport<K>[],
  max: number,
): { feuille: FeuilleLue<K>; messages: MessageImport[] } {
  const messages: MessageImport[] = [];
  const feuille: FeuilleLue<K> = { nom, lignes: [], colonnes: [], entetes: {}, ligneEntetes: null };
  const erreur = (raison: string, lieu: LieuMessage = {}) => messages.push(messageImport("erreur", raison, { feuille: nom, ...lieu }));

  const indexEntetes = tableau
    .slice(0, LIGNES_AVANT_ENTETES_MAX)
    .findIndex((r) => r.filter((v) => typeof v === "string" && colonneDeEntete(colonnes, v)).length >= 2);
  if (indexEntetes < 0) {
    erreur(
      `en-têtes du modèle introuvables (attendus en ligne 1 : ${colonnes.filter((c) => c.obligatoire).map(libelleColonne).join(", ")}). ` +
        "Téléchargez le modèle et recopiez-y vos données sans changer la ligne d'en-têtes.",
    );
    return { feuille, messages };
  }

  const ligneEntetes = indexEntetes + 1;
  feuille.ligneEntetes = ligneEntetes;
  const position = new Map<K, number>();
  tableau[indexEntetes].forEach((v, i) => {
    const entete = cellule(v);
    const texte = texteCellule(entete);
    if (texte === "") return;
    const c = colonneDeEntete(colonnes, texte);
    if (!c && COLONNES_RETIREES.includes(normaliserEntete(texte))) return;
    if (!c) {
      messages.push(
        messageImport("avertissement", "colonne inconnue du modèle, ignorée.", { feuille: nom, ligne: ligneEntetes, colonne: texte }),
      );
      return;
    }
    if (position.has(c.cle)) {
      erreur(`la colonne « ${c.entete} » apparaît deux fois (colonnes ${lettreColonne(position.get(c.cle)!)} et ${lettreColonne(i)}) : gardez-en une seule.`, {
        ligne: ligneEntetes,
      });
      return;
    }
    position.set(c.cle, i);
    feuille.entetes[c.cle] = texte;
  });
  feuille.colonnes = colonnes.filter((c) => position.has(c.cle)).map((c) => c.cle);
  for (const c of colonnes) {
    if (c.obligatoire && !position.has(c.cle)) {
      erreur(`colonne obligatoire « ${c.entete} » absente. Téléchargez le modèle et gardez ses en-têtes.`, { ligne: ligneEntetes });
    }
  }

  const sansEntete = new Set<number>();
  const colonnesConnues = new Set(position.values());
  const aideDe = new Map(colonnes.filter((c) => c.aide !== "").map((c) => [c.cle, normaliserEntete(c.aide)]));
  let depassement = false;

  for (let r = indexEntetes + 1; r < tableau.length; r++) {
    const brute = tableau[r];
    const cellules = {} as Record<K, Cellule>;
    for (const c of colonnes) cellules[c.cle] = position.has(c.cle) ? cellule(brute[position.get(c.cle)!]) : VIDE;
    const valeurs = Object.values<Cellule>(cellules);
    brute.forEach((v, i) => {
      if (!colonnesConnues.has(i) && cellule(v).type !== "vide" && texteCellule(cellule(tableau[indexEntetes][i])) === "") sansEntete.add(i);
    });
    if (ligneVide(valeurs)) continue;
    if (r === indexEntetes + 1) {
      const estAide = feuille.colonnes.some((cle) => {
        const aide = aideDe.get(cle);
        const v = cellules[cle];
        return aide !== undefined && v.type === "texte" && normaliserEntete(v.texte) === aide;
      });
      if (estAide) continue;
    }
    if (feuille.lignes.length >= max) {
      depassement = true;
      break;
    }
    feuille.lignes.push({ ligne: r + 1, cellules });
  }

  for (const i of [...sansEntete].sort((a, b) => a - b)) {
    messages.push(
      messageImport("avertissement", "colonne sans en-tête, ignorée.", { feuille: nom, ligne: ligneEntetes, colonne: lettreColonne(i) }),
    );
  }
  if (depassement) erreur(`plus de ${max} lignes : découpez le fichier et importez-le en plusieurs fois.`);
  return { feuille, messages };
}

export type NatureTableau = "etudiants" | "paiements";

/** Contenu d'un CSV d'après ses en-têtes : etudiants.csv quel que soit son nom, ou un ancien paiements.csv. */
export function natureTableau(tableau: Tableau): NatureTableau | null {
  let etudiants = 0;
  let paiements = 0;
  for (const r of tableau.slice(0, LIGNES_AVANT_ENTETES_MAX)) {
    const textes = r.filter((v): v is string => typeof v === "string");
    etudiants = Math.max(etudiants, new Set(textes.map((v) => colonneDeEntete(COLONNES_ETUDIANTS, v)?.cle).filter((c) => c !== undefined)).size);
    paiements = Math.max(paiements, new Set(textes.map(normaliserEntete).filter((n) => ENTETES_PAIEMENTS_RETIRES.includes(n))).size);
  }
  if (Math.max(etudiants, paiements) < 2 || etudiants === paiements) return null;
  return etudiants > paiements ? "etudiants" : "paiements";
}

export type RepriseLue = {
  etudiants: FeuilleLue<CleEtudiant>;
  /** « 2026-2027 » lu dans l'en-tête « Niveau 2026-2027 », null s'il ne porte pas d'année. */
  anneeNiveau: string | null;
  /** Problèmes de structure (erreurs) et colonnes ignorées, encodage (avertissements). */
  messages: MessageImport[];
};

/** Année lue dans « Niveau 2026-2027 » (ou « Niveau 2026/2027 »). */
export function anneeDeEnteteNiveau(entete: string | undefined): string | null {
  const m = entete ? /(\d{4})\s*[-/–]\s*(\d{4})/.exec(entete) : null;
  return m ? `${m[1]}-${m[2]}` : null;
}

export function lireReprise(etudiants: Tableau, messagesLecture: MessageImport[] = []): RepriseLue {
  const lu = lireFeuille(etudiants, FEUILLE_ETUDIANTS, COLONNES_ETUDIANTS, ETUDIANTS_MAX);
  return {
    etudiants: lu.feuille,
    anneeNiveau: anneeDeEnteteNiveau(lu.feuille.entetes.niveau),
    messages: [...messagesLecture, ...lu.messages],
  };
}
