import "server-only";
import path from "node:path";
import { Font } from "@react-pdf/renderer";

export const POLICE = "Figtree";

const GRAISSES = [400, 600, 700] as const;

// ASCII imprimable, Latin-1 et la ponctuation des documents (tirets, points médians, guillemets).
const CARACTERES =
  Array.from({ length: 0x7e - 0x20 + 1 }, (_, i) => String.fromCharCode(0x20 + i)).join("") +
  Array.from({ length: 0xff - 0xa0 + 1 }, (_, i) => String.fromCharCode(0xa0 + i)).join("") +
  "—–’‘“”«»…·";

let preparation: Promise<void> | null = null;

/**
 * fontkit garde chaque glyphe avec les caractères de sa première création. Un glyphe créé d'abord comme
 * composant d'un autre (le point, dans « : ») n'a aucun caractère : le PDF suivant l'extrayait faux (« étudiant5 »).
 */
async function creerGlyphes(): Promise<void> {
  for (const fontWeight of GRAISSES) {
    await Font.load({ fontFamily: POLICE, fontWeight });
    const donnees = Font.getFont({ fontFamily: POLICE, fontWeight })?.data as
      | { glyphsForString?: (texte: string) => unknown }
      | null
      | undefined;
    donnees?.glyphsForString?.(CARACTERES);
  }
}

/** À attendre avant chaque rendu ; n'enregistre et ne prépare les polices qu'une fois par processus. */
export function enregistrerPolices(): Promise<void> {
  if (preparation) return preparation;
  if (!enregistrees) inscrire();
  preparation = creerGlyphes().catch((e) => {
    preparation = null;
    throw e;
  });
  return preparation;
}

let enregistrees = false;

function inscrire(): void {
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
