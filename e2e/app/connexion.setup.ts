import { test as setup } from "@playwright/test";
import { attendreTableauDeBord, COMPTES, seConnecter } from "./comptes";

setup("connexion de l'administrateur", async ({ page }) => {
  await seConnecter(page, COMPTES.admin.email, COMPTES.admin.motDePasse);
  await attendreTableauDeBord(page);
  await page.context().storageState({ path: COMPTES.admin.session });
});

setup("connexion du secrétariat", async ({ page }) => {
  await seConnecter(page, COMPTES.secretariat.email, COMPTES.secretariat.motDePasse);
  await attendreTableauDeBord(page);
  await page.context().storageState({ path: COMPTES.secretariat.session });
});
