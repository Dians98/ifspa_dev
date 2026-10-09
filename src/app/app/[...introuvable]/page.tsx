import { notFound } from "next/navigation";

// Tant que les écrans des phases suivantes n'existent pas, toute adresse /app/* inconnue
// affiche le message « pas encore disponible » dans le cadre de l'application.
// Les pages réelles (segments statiques) prennent le pas sur cette route.
export default function PageInconnue() {
  notFound();
}
