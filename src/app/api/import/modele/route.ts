import writeXlsxFile from "write-excel-file/node";
import { csvEtudiants, estFormatModele, feuillesModele, nomFichierModele } from "@/lib/import-modele-fichiers";
import { exigerAdminApi } from "@/server/acces";
import { avecErreurJson, erreurApi } from "@/server/api";
import { lireParametresModele } from "@/server/lectures/import";

export const runtime = "nodejs";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Modèle de reprise de l'année courante : `?format=xlsx` (défaut) ou `etudiants.csv`. Admin seulement. */
export function GET(request: Request): Promise<Response> {
  return avecErreurJson(async () => {
    const { refus } = await exigerAdminApi();
    if (refus) return refus;

    const format = new URL(request.url).searchParams.get("format") ?? "xlsx";
    if (!estFormatModele(format)) {
      return erreurApi("Format inconnu : demandez xlsx ou etudiants.csv.", "INVALIDE", 400);
    }
    const p = await lireParametresModele();
    if (!p) {
      return erreurApi(
        "Aucune année scolaire courante : définissez-la dans Paramètres › Années avant de télécharger le modèle.",
        "INVALIDE",
        409,
      );
    }

    const contenu =
      format === "xlsx"
        ? new Uint8Array(await writeXlsxFile(feuillesModele(p)).toBuffer())
        : new TextEncoder().encode(csvEtudiants(p));
    return new Response(contenu, {
      headers: {
        "Content-Type": format === "xlsx" ? XLSX : "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nomFichierModele(format, p)}"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
