import "server-only";

// Envoi d'e-mails transactionnels via l'API HTTP de SMTP2GO (offre gratuite).
// Pour changer de fournisseur (Brevo, Resend…), seule cette fonction est à adapter.
// Référence API : https://developers.smtp2go.com/reference/send-standard-email
//
// Variables d'environnement :
//   SMTP2GO_API_KEY        clé API SMTP2GO
//   EMAIL_EXPEDITEUR       expéditeur vérifié chez le fournisseur, ex. "IFSPA <site@ifspa.mg>"
//   CONTACT_DESTINATAIRE   adresse qui reçoit les messages du formulaire de contact

type Email = {
  sujet: string;
  texte: string;
  repondreA?: string;
};

export type ResultatEnvoi = { ok: boolean; simule?: boolean };

export async function envoyerEmail({ sujet, texte, repondreA }: Email): Promise<ResultatEnvoi> {
  const cle = process.env.SMTP2GO_API_KEY;
  const expediteur = process.env.EMAIL_EXPEDITEUR;
  const destinataire = process.env.CONTACT_DESTINATAIRE;

  if (!cle || !expediteur || !destinataire) {
    if (process.env.NODE_ENV !== "production") {
      // En développement sans configuration : on simule l'envoi.
      console.info(`[email simulé] ${sujet}\n${texte}`);
      return { ok: true, simule: true };
    }
    console.error("[email] configuration manquante : SMTP2GO_API_KEY, EMAIL_EXPEDITEUR ou CONTACT_DESTINATAIRE");
    return { ok: false };
  }

  try {
    const reponse = await fetch("https://api.smtp2go.com/v3/email/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Smtp2go-Api-Key": cle,
      },
      body: JSON.stringify({
        sender: expediteur,
        to: [destinataire],
        subject: sujet,
        text_body: texte,
        ...(repondreA ? { custom_headers: [{ header: "Reply-To", value: repondreA }] } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const donnees = (await reponse.json().catch(() => null)) as { data?: { succeeded?: number } } | null;
    const ok = reponse.ok && donnees?.data?.succeeded === 1;
    if (!ok) console.error("[email] échec SMTP2GO", reponse.status, donnees);
    return { ok };
  } catch (erreur) {
    console.error("[email] erreur réseau", erreur);
    return { ok: false };
  }
}
