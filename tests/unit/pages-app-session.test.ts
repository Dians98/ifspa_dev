import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const RACINE = join(process.cwd(), "src", "app", "app");

// Redirections pures et pages d'erreur : aucune donnée lue, rien à protéger.
const DISPENSES = ["page.tsx", "parametres/page.tsx", "[...introuvable]/page.tsx"];

const GARDE = /\b(?:exigerSessionPage|requireSession)\(/;

function fichiersDePage(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const chemin = join(dossier, e.name);
    if (e.isDirectory()) return fichiersDePage(chemin);
    return e.name === "page.tsx" || e.name === "layout.tsx" ? [chemin] : [];
  });
}

const fichiers = fichiersDePage(RACINE).map((chemin) => ({
  nom: relative(RACINE, chemin).replaceAll("\\", "/"),
  source: readFileSync(chemin, "utf8"),
}));

const sansImports = (source: string) => source.replace(/^import[\s\S]*?;\s*$/gm, "");

/** Noms importés des lectures serveur ou de `db`, appelés dans la page. */
function lecturesImportees(source: string): string[] {
  const noms: string[] = [];
  for (const m of source.matchAll(/^import\s*\{([^}]*)\}\s*from\s*"([^"]+)";/gm)) {
    if (!/^(@\/server\/lectures\/|\.\/lecture$|@\/lib\/db$)/.test(m[2])) continue;
    for (const n of m[1].split(",")) {
      const nom = n.trim().replace(/^type\s+.*/, "").split(/\s+as\s+/).pop()?.trim();
      if (nom) noms.push(nom);
    }
  }
  return noms;
}

describe("pages et layouts de /app : contrôle de session avant toute lecture", () => {
  it("trouve les pages et layouts de l'espace connecté", () => {
    const noms = fichiers.map((f) => f.nom);
    expect(noms).toEqual(expect.arrayContaining(["layout.tsx", "dashboard/page.tsx", "encaisser/page.tsx", "parametres/layout.tsx"]));
    expect(noms.length).toBeGreaterThanOrEqual(20);
  });

  it("repère les lectures importées par une page", () => {
    const dashboard = fichiers.find((f) => f.nom === "dashboard/page.tsx")!;
    expect(lecturesImportees(dashboard.source)).toContain("lireDashboard");
    expect(sansImports(dashboard.source)).not.toMatch(/^import /m);
  });

  it("les pages dispensées ne lisent aucune donnée", () => {
    for (const nom of DISPENSES) {
      const f = fichiers.find((x) => x.nom === nom);
      expect(f, nom).toBeDefined();
      expect(lecturesImportees(f!.source), nom).toEqual([]);
    }
  });

  const gardees = fichiers.filter((f) => !DISPENSES.includes(f.nom));

  it.each(gardees.map((f) => [f.nom, f.source] as const))("%s appelle exigerSessionPage ou requireSession", (_nom, source) => {
    expect(sansImports(source)).toMatch(GARDE);
  });

  it.each(gardees.map((f) => [f.nom, f.source] as const))("%s contrôle la session avant son premier appel de lecture", (_nom, source) => {
    const code = sansImports(source);
    const garde = code.search(GARDE);
    for (const lecture of lecturesImportees(source)) {
      const appel = code.search(new RegExp(`\\b${lecture}\\(|\\b${lecture}\\.`));
      if (appel === -1) continue;
      expect(garde, `${lecture} lue avant le contrôle de session`).toBeGreaterThanOrEqual(0);
      expect(garde, `${lecture} lue avant le contrôle de session`).toBeLessThan(appel);
    }
  });
});
