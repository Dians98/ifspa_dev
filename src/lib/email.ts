import "server-only";

// Envoi d'e-mails transactionnels via l'API HTTP de Resend.
// Pour changer de fournisseur, seule cette fonction est à adapter.
// Référence API : https://resend.com/docs/api-reference/emails/send-email
//
// Variables d'environnement :
//   RESEND_API_KEY         clé API Resend (re_…)
//   EMAIL_EXPEDITEUR       adresse d'un domaine vérifié chez Resend, ex. "IFSPA <site@ifspa.mg>"

type Email = {
  a: string;
  copie?: readonly string[];
  sujet: string;
  texte: string;
  repondreA?: string;
};

export type ResultatEnvoi = { ok: boolean; simule?: boolean };

export async function envoyerEmail({ a, copie = [], sujet, texte, repondreA }: Email): Promise<ResultatEnvoi> {
  const cle = process.env.RESEND_API_KEY;
  const expediteur = process.env.EMAIL_EXPEDITEUR;

  if (!cle || !expediteur) {
    if (process.env.NODE_ENV !== "production") {
      // En développement sans configuration : on simule l'envoi.
      const copies = copie.length ? `, copie ${copie.join(", ")}` : "";
      console.info(`[email simulé] à ${a}${copies}\n${sujet}\n${texte}`);
      return { ok: true, simule: true };
    }
    console.error("[email] configuration manquante : RESEND_API_KEY ou EMAIL_EXPEDITEUR");
    return { ok: false };
  }

  try {
    const reponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cle}`,
      },
      body: JSON.stringify({
        from: expediteur,
        to: [a],
        ...(copie.length ? { cc: [...copie] } : {}),
        subject: sujet,
        text: texte,
        ...(repondreA ? { reply_to: repondreA } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const donnees = (await reponse.json().catch(() => null)) as { id?: string; message?: string } | null;
    const ok = reponse.ok && Boolean(donnees?.id);
    if (!ok) console.error("[email] échec Resend", reponse.status, donnees?.message ?? donnees);
    return { ok };
  } catch (erreur) {
    console.error("[email] erreur réseau", erreur);
    return { ok: false };
  }
}
