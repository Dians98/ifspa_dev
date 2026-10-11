import "server-only";
import path from "node:path";
import { Font } from "@react-pdf/renderer";

export const POLICE = "Figtree";

let enregistrees = false;

/** À appeler avant chaque rendu ; n'enregistre qu'une fois par processus. */
export function enregistrerPolices(): void {
  if (enregistrees) return;
  // Chemin absolu depuis la racine : les polices sont copiées dans le build standalone (next.config.ts).
  const dossier = path.join(process.cwd(), "src/pdf/polices");
  Font.register({
    family: POLICE,
    fonts: [
      { src: path.join(dossier, "Figtree-Regular.ttf"), fontWeight: 400 },
      { src: path.join(dossier, "Figtree-SemiBold.ttf"), fontWeight: 600 },
      { src: path.join(dossier, "Figtree-Bold.ttf"), fontWeight: 700 },
    ],
  });
  // Sans ce rappel, react-pdf coupe les mots avec des règles de césure anglaises.
  Font.registerHyphenationCallback((mot) => [mot]);
  enregistrees = true;
}
