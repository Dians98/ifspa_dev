// Environnement de test complet dans Docker (docker/test/) : base neuve, app buildée sous Linux, Vitest et Playwright.
//   pnpm test:docker                         toutes les étapes par défaut
//   pnpm test:docker vitest e2e              seulement ces étapes (lint, vitest, build, typecheck, e2e, e2e-build, recette)
//   pnpm test:docker --node 20 --postgres 15 versions alignées sur l'hébergement
// Bilan, journaux et rapports : test-results/docker/
import { spawnSync } from "node:child_process";

const ETAPES = ["lint", "vitest", "build", "typecheck", "e2e", "e2e-build", "recette"];
const PAR_DEFAUT = ["lint", "vitest", "build", "typecheck", "e2e", "e2e-build"];
// Sans build, les E2E n'ont rien à tester : on l'ajoute d'office.
const EXIGENT_BUILD = ["e2e-build", "recette"];
const COMPOSE = ["compose", "-f", "docker/test/compose.yml"];

const args = process.argv.slice(2);
const versions: Record<string, string> = {};
const choisies: string[] = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--node" || a === "--postgres") versions[a.slice(2)] = args[++i] ?? "";
  else if (ETAPES.includes(a)) choisies.push(a);
  else {
    console.error(`Option inconnue : ${a}. Étapes possibles : ${ETAPES.join(", ")}.`);
    process.exit(2);
  }
}

const etapes = choisies.length ? choisies : PAR_DEFAUT;
if (etapes.some((e) => EXIGENT_BUILD.includes(e)) && !etapes.includes("build")) etapes.unshift("build");

const env = {
  ...process.env,
  ETAPES: etapes.join(","),
  ...(versions.node ? { NODE_VERSION: versions.node } : {}),
  ...(versions.postgres ? { POSTGRES_VERSION: versions.postgres } : {}),
};

function docker(...arguments_: string[]) {
  return spawnSync("docker", [...COMPOSE, ...arguments_], { stdio: "inherit", env }).status ?? 1;
}

console.log(`Étapes : ${etapes.join(", ")}`);
const code = docker("run", "--rm", "--build", "tests");
docker("down", "--remove-orphans");
console.log(code === 0 ? "\n✓ Tout est vert. Détails : test-results/docker/" : "\n✗ Des étapes ont échoué : test-results/docker/bilan.txt");
process.exit(code);
