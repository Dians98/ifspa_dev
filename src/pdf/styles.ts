import { StyleSheet } from "@react-pdf/renderer";
import { POLICE } from "@/pdf/polices";

// Documents A4 imprimés le plus souvent en noir et blanc : la couleur principale ne sert qu'aux titres et aux bordures.
export const COULEURS = {
  principale: "#1E3A5F",
  texte: "#1B2533",
  texteSecondaire: "#3A4556",
  discret: "#566173",
  filet: "#D6DFE9",
  filetTableau: "#DFE5EC",
} as const;

/** Marges de la page A4, en points. */
export const MARGES = { haut: 36, cotes: 40, bas: 56 } as const;

export const stylesCommuns = StyleSheet.create({
  page: {
    fontFamily: POLICE,
    // Pas de lineHeight ici : hérité, il empêche react-pdf 4.9 de dessiner « Page X/Y » (texte à `render`).
    fontSize: 8.8,
    color: COULEURS.texte,
    paddingTop: MARGES.haut,
    paddingHorizontal: MARGES.cotes,
    paddingBottom: MARGES.bas,
  },
});
