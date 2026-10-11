import type { Metadata } from "next";
import { HistoriquePassages } from "@/components/app/admissions/historique-passages";
import { lireHistorique } from "@/server/lectures/admissions";

export const metadata: Metadata = { title: "Historique · Passage en année supérieure" };

export default async function PageHistoriqueAdmissions() {
  const { operations, peutAnnuler } = await lireHistorique();
  return <HistoriquePassages operations={operations} peutAnnuler={peutAnnuler} />;
}
