import { defineConfig, devices } from "@playwright/test";

const URL_APP = "http://localhost:3100";

// E2E_SANS_APP=1 : ne teste que les maquettes statiques, sans démarrer Next.
const sansApp = process.env.E2E_SANS_APP === "1";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    locale: "fr-FR",
    timezoneId: "Indian/Antananarivo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    // Maquettes validées par le client (prototype/*.html, ouvertes en file://)
    {
      name: "prototype",
      testDir: "./e2e/prototype",
      use: { ...devices["Desktop Chrome"] },
    },
    ...(sansApp
      ? []
      : [
          {
            name: "app",
            testDir: "./e2e/app",
            use: { ...devices["Desktop Chrome"], baseURL: URL_APP },
          },
          {
            name: "app-mobile",
            testDir: "./e2e/app",
            use: { ...devices["Pixel 7"], baseURL: URL_APP },
          },
        ]),
  ],
  webServer: sansApp
    ? undefined
    : {
        command: "npm run dev",
        url: URL_APP,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
