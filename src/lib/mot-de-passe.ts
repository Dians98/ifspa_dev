import { z } from "zod";

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

// Bornes de Better Auth (minPasswordLength de src/lib/auth.ts, maxPasswordLength par défaut).
export const LONGUEUR_MIN_MOT_DE_PASSE = 8;
export const LONGUEUR_MAX_MOT_DE_PASSE = 128;

export const schemaChangementMotDePasse = z
  .object({
    actuel: z.string({ error: "Saisissez votre mot de passe actuel." }).min(1, "Saisissez votre mot de passe actuel."),
    nouveau: z
      .string({ error: "Saisissez le nouveau mot de passe." })
      .min(LONGUEUR_MIN_MOT_DE_PASSE, `Au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères.`)
      .max(LONGUEUR_MAX_MOT_DE_PASSE, `${LONGUEUR_MAX_MOT_DE_PASSE} caractères au maximum.`),
    confirmation: z.string({ error: "Confirmez le nouveau mot de passe." }),
  })
  .refine((v) => v.nouveau === v.confirmation, {
    path: ["confirmation"],
    message: "Les deux saisies ne sont pas identiques.",
  })
  .refine((v) => v.nouveau !== v.actuel, {
    path: ["nouveau"],
    message: "Le nouveau mot de passe doit être différent de l'actuel.",
  });
