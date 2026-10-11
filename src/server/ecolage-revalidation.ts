import "server-only";
import { revalidatePath } from "next/cache";

/** Pages qui affichent un étudiant, ses échéances ou ses paiements, après une écriture réussie. */
export function revaliderPagesEcolage(): void {
  revalidatePath("/app/etudiants", "layout");
  revalidatePath("/app/encaisser");
  // « layout » : la page du reçu (/app/paiements/[id]/recu) affiche aussi l'annulation.
  revalidatePath("/app/paiements", "layout");
  revalidatePath("/app/impayes");
  revalidatePath("/app/dashboard");
  // L'annulation d'un passage dépend des paiements saisis sur les inscriptions créées.
  revalidatePath("/app/admissions", "layout");
}
