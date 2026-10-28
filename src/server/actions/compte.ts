"use server";

import { headers } from "next/headers";
import { isAPIError } from "better-auth/api";
import type { z } from "zod";
import { auth } from "@/lib/auth";
import { echec, echecValidation, succes, type EtatAction } from "@/lib/etat-action";
import { schemaChangementMotDePasse } from "@/lib/mot-de-passe";
import { exigerSession } from "@/server/acces";
import { messageErreurAuth } from "@/server/erreurs";

/** Le titulaire de la session change son propre mot de passe ; ses autres sessions sont fermées, la courante reste ouverte. */
export async function changerMonMotDePasse(
  entree: z.input<typeof schemaChangementMotDePasse>,
): Promise<EtatAction> {
  await exigerSession();

  const lu = schemaChangementMotDePasse.safeParse(entree);
  if (!lu.success) return echecValidation(lu.error);
  const { actuel, nouveau } = lu.data;

  try {
    await auth.api.changePassword({
      body: { currentPassword: actuel, newPassword: nouveau, revokeOtherSessions: true },
      headers: await headers(),
    });
  } catch (e) {
    if (isAPIError(e) && e.body?.code === "INVALID_PASSWORD") {
      return echec("Vérifiez les champs signalés.", { actuel: "Mot de passe actuel incorrect." });
    }
    const message = messageErreurAuth(e);
    if (message === null) throw e;
    return echec(message);
  }
  return succes("Mot de passe changé. Vos autres sessions ouvertes ont été fermées.");
}
