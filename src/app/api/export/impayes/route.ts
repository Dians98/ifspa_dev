import writeXlsxFile from "write-excel-file/node";
import { jourMadagascar } from "@/lib/dates";
import { getSession } from "@/lib/permissions";
import { lireImpayes, type LigneImpaye } from "@/server/lectures/paiements";

// /api échappe au proxy : la session est vérifiée ici.
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return new Response("Session expirée : reconnectez-vous.", {
      status: 401,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const jour = jourMadagascar(new Date());
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const { lignes } = await lireImpayes(params, jour);

  const entete = { fontWeight: "bold" } as const;
  const contenu = await writeXlsxFile<LigneImpaye>(lignes, {
    sheet: "Impayés",
    stickyRowsCount: 1,
    columns: [
      { header: { value: "Matricule", ...entete }, width: 15, cell: (l) => l.matricule },
      { header: { value: "Nom", ...entete }, width: 22, cell: (l) => l.nom },
      { header: { value: "Prénoms", ...entete }, width: 28, cell: (l) => l.prenoms },
      { header: { value: "Filière", ...entete }, width: 18, cell: (l) => l.filiere.nom },
      { header: { value: "Niveau", ...entete }, width: 22, cell: (l) => l.libelleNiveau ?? "" },
      { header: { value: "Téléphone", ...entete }, width: 16, cell: (l) => l.telephoneAffiche ?? "" },
      { header: { value: "Mois en retard", ...entete }, width: 15, cell: (l) => ({ value: l.moisEnRetard, type: Number }) },
      {
        header: { value: "Reste en retard (Ar)", ...entete },
        width: 20,
        cell: (l) => ({ value: l.resteEnRetard, type: Number, format: "#,##0" }),
      },
      {
        header: { value: "Reste dû total (Ar)", ...entete },
        width: 20,
        cell: (l) => ({ value: l.resteDu, type: Number, format: "#,##0" }),
      },
      { header: { value: "Années concernées", ...entete }, width: 22, cell: (l) => l.anneesEnRetard.join(", ") },
      { header: { value: "Dernier paiement", ...entete }, width: 16, cell: (l) => l.dernierPaiement?.date ?? "" },
      {
        header: { value: "Montant du dernier paiement (Ar)", ...entete },
        width: 20,
        cell: (l) => (l.dernierPaiement ? { value: l.dernierPaiement.montant, type: Number, format: "#,##0" } : null),
      },
    ],
  }).toBuffer();

  return new Response(new Uint8Array(contenu), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="impayes-${jour}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
