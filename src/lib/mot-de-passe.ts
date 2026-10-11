// Mot de passe provisoire lisible à voix haute ou recopiable sans erreur : pas de 0/O/o, 1/l/I/i.
export const ALPHABET_MOT_DE_PASSE = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

const GROUPES = 3;
const TAILLE_GROUPE = 4;

/** « Kq7m-Tq4r-9Wzb » (12 caractères tirés + 2 tirets, environ 69 bits d'entropie). */
export function genererMotDePasse(
  octetsAleatoires: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n)),
): string {
  const taille = ALPHABET_MOT_DE_PASSE.length;
  // Rejet des octets au-delà du dernier multiple de la taille de l'alphabet : tirage uniforme, sans biais de modulo.
  const limite = 256 - (256 % taille);
  const caracteres: string[] = [];
  while (caracteres.length < GROUPES * TAILLE_GROUPE) {
    for (const octet of octetsAleatoires(16)) {
      if (octet < limite && caracteres.length < GROUPES * TAILLE_GROUPE) {
        caracteres.push(ALPHABET_MOT_DE_PASSE[octet % taille]);
      }
    }
  }
  const groupes: string[] = [];
  for (let i = 0; i < GROUPES; i++) groupes.push(caracteres.slice(i * TAILLE_GROUPE, (i + 1) * TAILLE_GROUPE).join(""));
  return groupes.join("-");
}
