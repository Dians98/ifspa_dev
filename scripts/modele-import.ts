// Génère le modèle de reprise : docs/modele-import/modele-import-ifspa.xlsx et etudiants.csv.
//   pnpm tsx scripts/modele-import.ts
// Sans base : année 2026-2027 d'exemple. L'écran d'import sert le modèle de l'année courante (/api/import/modele).
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import writeXlsxFile from "write-excel-file/node";
import { PARAMETRES_MODELE_EXEMPLE } from "../src/lib/import-modele";
import { csvEtudiants, feuillesModele } from "../src/lib/import-modele-fichiers";

const DOSSIER = path.resolve(__dirname, "../docs/modele-import");

async function main() {
  await mkdir(DOSSIER, { recursive: true });
  const p = PARAMETRES_MODELE_EXEMPLE;
  await writeXlsxFile(feuillesModele(p)).toFile(path.join(DOSSIER, "modele-import-ifspa.xlsx"));
  await writeFile(path.join(DOSSIER, "etudiants.csv"), csvEtudiants(p));
  console.log(`✓ Modèle écrit dans ${path.relative(process.cwd(), DOSSIER)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
