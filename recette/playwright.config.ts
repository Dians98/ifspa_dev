import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

// Parcours de recette : un seul navigateur à la fois, dans l'ordre, sur la base ifspa_recette (port 3200).
const URL_RECETTE = "http://localhost:3200";

export default defineConfig({
  testDir: "./parcours",
  outputDir: "../test-results/recette",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: URL_RECETTE,
    locale: "fr-FR",
    timezoneId: "Indian/Antananarivo",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "connexion", testMatch: /connexion\.setup\.ts/, use: { ...devices["Desktop Chrome"] } },
    {
      name: "ordinateur",
      testMatch: /\.recette\.ts/,
      dependencies: ["connexion"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    // E2E de non-régression qui exigent le build (service worker) : e2e/build/, écrits par l'agent principal.
    {
      name: "build",
      testDir: "../e2e/build",
      testMatch: /\.spec\.ts/,
      dependencies: ["connexion"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      testMatch: /\.recette\.ts/,
      dependencies: ["connexion"],
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: "pnpm recette:app",
    url: URL_RECETTE,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
