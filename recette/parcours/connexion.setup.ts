import { test as setup } from "@playwright/test";
import { attendreTableauDeBord, COMPTES, seConnecter } from "../../e2e/app/comptes";
import { SESSIONS } from "./outils";

setup("connexion de l'administrateur", async ({ page }) => {
  await seConnecter(page, COMPTES.admin.email, COMPTES.admin.motDePasse);
  await attendreTableauDeBord(page);
  await page.context().storageState({ path: SESSIONS.admin });
});

setup("connexion du secrétariat", async ({ page }) => {
  await seConnecter(page, COMPTES.secretariat.email, COMPTES.secretariat.motDePasse);
  await attendreTableauDeBord(page);
  await page.context().storageState({ path: SESSIONS.secretariat });
});
