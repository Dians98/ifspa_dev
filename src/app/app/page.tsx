import { redirect } from "next/navigation";
import { CHEMIN_ACCUEIL_APP } from "@/lib/roles";

export default function AccueilApp() {
  redirect(CHEMIN_ACCUEIL_APP);
}
