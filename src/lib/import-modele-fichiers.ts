import type writeXlsxFile from "write-excel-file/node";
import {
  colonnesEtudiantsModele,
  consignesImport,
  exemplesEtudiants,
  FEUILLE_ETUDIANTS,
  FEUILLE_LISEZ_MOI,
  type ColonneImport,
  type LigneModele,
  type ParametresModele,
} from "@/lib/import-modele";

// Contenu des fichiers du modèle de reprise, sans écriture : le script de docs/ et la route /api/import/modele s'en servent.

export type FeuillesModele = Parameters<typeof writeXlsxFile>[0];

export const FORMATS_MODELE = ["xlsx", "etudiants.csv"] as const;
export type FormatModele = (typeof FORMATS_MODELE)[number];

export function estFormatModele(v: string | null): v is FormatModele {
  return FORMATS_MODELE.includes(v as FormatModele);
}

/** « modele-import-ifspa-2026-2027.xlsx », « etudiants-2026-2027.csv ». */
export function nomFichierModele(format: FormatModele, p: ParametresModele): string {
  if (format === "xlsx") return `modele-import-ifspa-${p.libelle}.xlsx`;
  return format.replace(".csv", `-${p.libelle}.csv`);
}

function entete<K extends string>(c: ColonneImport<K>): string {
  return c.obligatoire ? `${c.entete} *` : c.entete;
}

function feuille<K extends string>(colonnes: readonly ColonneImport<K>[], lignes: LigneModele<K>[]) {
  const entetes = colonnes.map((c) => ({ value: entete(c), fontWeight: "bold" as const, backgroundColor: "#E8EEF5" }));
  const aides = colonnes.map((c) => ({ value: c.aide, fontStyle: "italic" as const, color: "#5B6B7C", wrap: true }));
  const donnees = lignes.map((l) =>
    colonnes.map((c) => ({ value: l[c.cle] ?? "", type: String, ...(c.texte ? { format: "@" } : {}) })),
  );
  return { data: [entetes, aides, ...donnees], columns: colonnes.map((c) => ({ width: c.largeur })), stickyRowsCount: 2 };
}

export function feuillesModele(p: ParametresModele): FeuillesModele {
  return [
    {
      sheet: FEUILLE_LISEZ_MOI,
      data: consignesImport(p).map((t, i) => [{ value: t, fontWeight: i === 0 ? ("bold" as const) : undefined }]),
      columns: [{ width: 120 }],
    },
    { sheet: FEUILLE_ETUDIANTS, ...feuille(colonnesEtudiantsModele(p), exemplesEtudiants(p)) },
  ];
}

function echapperCsv(v: string): string {
  return /[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

// BOM UTF-8 et point-virgule : c'est ce qu'Excel en français ouvre sans casser les accents.
function csv<K extends string>(colonnes: readonly ColonneImport<K>[], lignes: LigneModele<K>[]): string {
  const corps = [colonnes.map(entete), colonnes.map((c) => c.aide), ...lignes.map((l) => colonnes.map((c) => l[c.cle] ?? ""))];
  return "﻿" + corps.map((r) => r.map(echapperCsv).join(";")).join("\r\n") + "\r\n";
}

export function csvEtudiants(p: ParametresModele): string {
  return csv(colonnesEtudiantsModele(p), exemplesEtudiants(p));
}
