import { getSession } from "@/lib/permissions";
import { rendreReleve } from "@/pdf/Releve";
import { lireReleve } from "@/server/lectures/paiements";

export const runtime = "nodejs";

function texte(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** Relevé d'écolage A4 ; affiché dans le navigateur, téléchargé avec `?telecharger=1`. */
export async function GET(request: Request, { params }: { params: Promise<{ etudiantId: string }> }) {
  // /api échappe au proxy : la session est vérifiée ici, sans redirection.
  const session = await getSession();
  if (!session) return texte("Session expirée : reconnectez-vous.", 401);

  const { etudiantId } = await params;
  const releve = await lireReleve(etudiantId);
  if (!releve) return texte("Étudiant introuvable.", 404);

  const pdf = await rendreReleve(releve, session.user.name);
  const telecharger = new URL(request.url).searchParams.get("telecharger") === "1";
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${telecharger ? "attachment" : "inline"}; filename="releve-${releve.dossier.matricule}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
