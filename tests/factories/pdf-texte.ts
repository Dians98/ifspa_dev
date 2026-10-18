import { inflateSync } from "node:zlib";

// Extraction minimale du texte d'un PDF produit par react-pdf : flux Flate, polices Type0 avec table ToUnicode.

type Objets = Map<number, string>;

function lireObjets(pdf: Buffer): Objets {
  const objets: Objets = new Map();
  for (const m of pdf.toString("latin1").matchAll(/(\d+) 0 obj([\s\S]*?)endobj/g)) objets.set(Number(m[1]), m[2]);
  return objets;
}

function contenuFlux(objet: string): string {
  const m = /stream\r?\n([\s\S]*)\r?\nendstream/.exec(objet);
  if (!m) return "";
  const brut = Buffer.from(m[1], "latin1");
  return (/FlateDecode/.test(objet) ? inflateSync(brut) : brut).toString("latin1");
}

const reference = (texte: string | undefined, cle: string): number | null => {
  const m = new RegExp(`/${cle}\\s+(\\d+) 0 R`).exec(texte ?? "");
  return m ? Number(m[1]) : null;
};

function utf16(hex: string): string {
  let s = "";
  for (let i = 0; i + 3 < hex.length + 1; i += 4) s += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
  return s;
}

function lireTableUnicode(cmap: string): Map<number, string> {
  const table = new Map<number, string>();
  for (const bloc of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of bloc[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) table.set(parseInt(m[1], 16), utf16(m[2]));
  }
  for (const bloc of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of bloc[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(\[[^\]]*\]|<[0-9a-fA-F]+>)/g)) {
      const debut = parseInt(m[1], 16);
      const fin = parseInt(m[2], 16);
      if (m[3].startsWith("[")) {
        [...m[3].matchAll(/<([0-9a-fA-F]+)>/g)].forEach((u, i) => table.set(debut + i, utf16(u[1])));
      } else {
        const base = parseInt(m[3].slice(1, -1), 16);
        for (let c = debut; c <= fin; c++) table.set(c, String.fromCharCode(base + c - debut));
      }
    }
  }
  return table;
}

function decoder(hex: string, table: Map<number, string>): string {
  let s = "";
  for (let i = 0; i + 3 < hex.length + 1; i += 4) s += table.get(parseInt(hex.slice(i, i + 4), 16)) ?? "�";
  return s;
}

/** Texte de chaque page, une ligne par opération d'affichage (TJ/Tj), décodé par la table ToUnicode de la police. */
export function extraireLignesPdf(pdf: Buffer): string[] {
  const objets = lireObjets(pdf);
  const lignes: string[] = [];
  for (const [, page] of objets) {
    if (!/\/Type \/Page\b(?!s)/.test(page)) continue;
    const contenu = reference(page, "Contents");
    const ressources = objets.get(reference(page, "Resources") ?? -1) ?? page;
    if (contenu === null) continue;

    const polices = new Map<string, Map<number, string>>();
    const blocPolices = /\/Font\s*<<([\s\S]*?)>>/.exec(ressources)?.[1] ?? "";
    for (const m of blocPolices.matchAll(/\/(\w+)\s+(\d+) 0 R/g)) {
      const unicode = reference(objets.get(Number(m[2])), "ToUnicode");
      if (unicode !== null) polices.set(m[1], lireTableUnicode(contenuFlux(objets.get(unicode) ?? "")));
    }

    let table = new Map<number, string>();
    const flux = contenuFlux(objets.get(contenu) ?? "");
    for (const m of flux.matchAll(/\/(\w+)\s+[\d.]+\s+Tf|\[((?:[^\]\\]|\\.)*)\]\s*TJ|<([0-9a-fA-F]+)>\s*Tj/g)) {
      if (m[1]) {
        table = polices.get(m[1]) ?? new Map();
      } else if (m[2] !== undefined) {
        lignes.push([...m[2].matchAll(/<([0-9a-fA-F]+)>/g)].map((h) => decoder(h[1], table)).join(""));
      } else {
        lignes.push(decoder(m[3], table));
      }
    }
  }
  return lignes;
}
