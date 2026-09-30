"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { OBJETS_CONTACT } from "@/lib/contact";
import { envoyerEmail } from "@/lib/email";
import { verifierTurnstile } from "@/lib/turnstile";

const schema = z.object({
  nom: z.string().trim().min(2, "Indiquez votre nom.").max(120, "Nom trop long."),
  telephone: z
    .string()
    .trim()
    .min(8, "Indiquez un numéro de téléphone.")
    .max(30, "Numéro trop long.")
    .regex(/^[+\d][\d\s.-]+$/, "Numéro de téléphone invalide."),
  email: z.union([z.literal(""), z.email("Adresse e-mail invalide.")]),
  objet: z.enum(OBJETS_CONTACT, "Choisissez un objet."),
  message: z.string().trim().min(10, "Votre message est trop court.").max(3000, "Message trop long (3 000 caractères maximum)."),
});

type Champ = keyof z.infer<typeof schema> | "captcha";

export type EtatContact = {
  statut: "initial" | "succes" | "erreur";
  message?: string;
  erreurs?: Partial<Record<Champ, string>>;
  valeurs?: Partial<Record<keyof z.infer<typeof schema>, string>>;
};

const MERCI = "Merci, votre message a bien été envoyé. Le secrétariat vous répondra dans les meilleurs délais.";

export async function envoyerMessageContact(_precedent: EtatContact, formData: FormData): Promise<EtatContact> {
  const brut = {
    nom: String(formData.get("nom") ?? ""),
    telephone: String(formData.get("telephone") ?? ""),
    email: String(formData.get("email") ?? ""),
    objet: String(formData.get("objet") ?? ""),
    message: String(formData.get("message") ?? ""),
  };

  // Champ piège invisible : un humain ne le remplit jamais. On répond comme si tout allait bien.
  if (String(formData.get("site_web") ?? "").length > 0) return { statut: "succes", message: MERCI };

  // Champs d'abord : le jeton Turnstile ne sert qu'une fois, inutile de le consommer si le formulaire est incomplet.
  const resultat = schema.safeParse(brut);
  if (!resultat.success) {
    const champs = z.flattenError(resultat.error).fieldErrors;
    const erreurs = Object.fromEntries(Object.entries(champs).map(([k, v]) => [k, v?.[0]])) as EtatContact["erreurs"];
    return { statut: "erreur", message: "Vérifiez les champs signalés.", erreurs, valeurs: brut };
  }

  const entetes = await headers();
  const ip = entetes.get("cf-connecting-ip") ?? entetes.get("x-forwarded-for")?.split(",")[0]?.trim();
  const humain = await verifierTurnstile(String(formData.get("cf-turnstile-response") ?? ""), ip);
  if (!humain) {
    return {
      statut: "erreur",
      erreurs: { captcha: "La vérification anti-robot a échoué. Cochez la case puis réessayez." },
      valeurs: brut,
    };
  }

  const d = resultat.data;
  const envoi = await envoyerEmail({
    sujet: `[Site IFSPA] ${d.objet} — ${d.nom}`,
    repondreA: d.email || undefined,
    texte: [
      `Nouveau message depuis le formulaire de contact du site IFSPA.`,
      ``,
      `Nom : ${d.nom}`,
      `Téléphone : ${d.telephone}`,
      `Courriel : ${d.email || "non renseigné"}`,
      `Objet : ${d.objet}`,
      ``,
      d.message,
    ].join("\n"),
  });

  if (!envoi.ok) {
    return {
      statut: "erreur",
      message: "L'envoi a échoué. Réessayez dans un instant, ou appelez directement le secrétariat.",
      valeurs: brut,
    };
  }
  return { statut: "succes", message: MERCI };
}
