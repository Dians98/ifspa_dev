import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";
import { montantRegex } from "./aides";

// Gestes partagés par les parcours UC08 (Impayés) et UC09 (relevé d'écolage).

export const DOSSIER_UC08 = "UC08-impayes";
export const DOSSIER_UC09 = "UC09-releve";

const RACINE = path.resolve(__dirname, "..");
// Le Python de l'utilisateur garde PyMuPDF dans son site-packages, que `-I` ignore : on l'ajoute à la main.
const SITE_PACKAGES = path.join(process.env.APPDATA ?? "", "Python", "Python313", "site-packages");

export async function ouvrirImpayes(page: Page) {
  await page.goto("/app/impayes");
  await expect(page.getByRole("heading", { level: 1, name: "Étudiants en retard de paiement" })).toBeVisible();
}

/** Les lignes d'étudiants du tableau (hors en-tête). */
export const lignesImpayes = (page: Page): Locator =>
  page.getByRole("region", { name: "Liste des étudiants en retard" }).getByRole("row").filter({ has: page.getByRole("link") });

export const ligneEtudiant = (page: Page, nom: string): Locator =>
  page.getByRole("region", { name: "Liste des étudiants en retard" }).getByRole("row").filter({ hasText: nom });

/** Ligne de synthèse : « 6 étudiants en retard », « 5 090 000 Ar à recouvrer ». */
export const synthese = (page: Page): Locator => page.getByText(/étudiants? en retard$|à recouvrer$/).first();

export async function verifierSynthese(page: Page, etudiants: number, montant: number) {
  const ligne = page.locator("p[aria-live='polite']");
  await expect(ligne).toContainText(`${etudiants} étudiant${etudiants > 1 ? "s" : ""} en retard`);
  await expect(ligne).toContainText(montantRegex(montant));
}

export async function choisirFiltreImpayes(page: Page, nom: string, option: string) {
  await page.getByRole("combobox", { name: nom }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

/** Tout ce que fait Python pour lire un PDF ou un classeur : texte, pages, images PNG. */
function python(script: string, ...args: string[]): string {
  const fichier = path.join(process.env.TEMP ?? RACINE, `recette-uc0809-${process.pid}.py`);
  fs.writeFileSync(fichier, `import sys\nsys.path.append(${JSON.stringify(SITE_PACKAGES)})\n${script}`, "utf8");
  try {
    return execFileSync("python", ["-I", "-X", "utf8", fichier, ...args], { encoding: "utf8" });
  } finally {
    fs.rmSync(fichier, { force: true });
  }
}

/** Texte du PDF page par page (séparées par une ligne `=== PAGE n ===`). */
export function textePdf(fichier: string): string {
  return python(
    `import pymupdf
d = pymupdf.open(sys.argv[1])
for i, p in enumerate(d):
    print(f"=== PAGE {i+1} ===")
    print(p.get_text())
`,
    fichier,
  );
}

export function pagesPdf(fichier: string): number {
  return Number(python("import pymupdf\nprint(len(pymupdf.open(sys.argv[1])))", fichier).trim());
}

/** Rend une page du PDF en PNG (110 dpi). */
export function pdfEnPng(fichier: string, numero: number, png: string) {
  python(
    `import pymupdf
d = pymupdf.open(sys.argv[1])
d[int(sys.argv[2]) - 1].get_pixmap(dpi=110).save(sys.argv[3])
`,
    fichier,
    String(numero),
    png,
  );
}

/** Rend une bande d'une page : de la ligne contenant `debut` (ou du haut) jusqu'à celle contenant `fin` (ou le bas), en PNG. */
export function pdfZonePng(fichier: string, numero: number, debut: string | null, fin: string | null, png: string, dpi = 120) {
  python(
    `import pymupdf
d = pymupdf.open(sys.argv[1])
p = d[int(sys.argv[2]) - 1]
debut, fin = sys.argv[4], sys.argv[5]
y0 = 0
y1 = p.rect.height
if debut:
    y0 = max(0, p.search_for(debut)[0].y0 - 6)
if fin:
    y1 = min(p.rect.height, p.search_for(fin)[0].y0 - 3)
p.get_pixmap(dpi=int(sys.argv[6]), clip=pymupdf.Rect(0, y0, p.rect.width, y1)).save(sys.argv[3])
`,
    fichier,
    String(numero),
    png,
    debut ?? "",
    fin ?? "",
    String(dpi),
  );
}

/** Dimensions de la page 1 en points (A4 = 595 x 842). */
export function formatPdf(fichier: string): string {
  return python("import pymupdf\nr = pymupdf.open(sys.argv[1])[0].rect\nprint(round(r.width), round(r.height))", fichier).trim();
}

/** Le premier classeur xlsx en lignes de texte (feuille 1), sans dépendance : zipfile + XML. */
export function lireClasseur(fichier: string): string {
  return python(
    `import zipfile, re, sys, html
z = zipfile.ZipFile(sys.argv[1])
noms = z.namelist()
partages = []
if "xl/sharedStrings.xml" in noms:
    x = z.read("xl/sharedStrings.xml").decode("utf8")
    partages = [html.unescape(re.sub(r"<[^>]+>", "", s)) for s in re.findall(r"<si>(.*?)</si>", x, re.S)]
print("FEUILLES", re.findall(r'<sheet [^>]*name="([^"]+)"', z.read("xl/workbook.xml").decode("utf8")))
x = z.read("xl/worksheets/sheet1.xml").decode("utf8")
largeur = 0
for r in re.findall(r"<row[^>]*>(.*?)</row>", x, re.S):
    cases = {}
    for attrs, corps in re.findall(r"<c([^>]*?)(?:/>|>(.*?)</c>)", r, re.S):
        ref = re.search(r'r="([A-Z]+)\\d+"', attrs).group(1)
        col = 0
        for lettre in ref:
            col = col * 26 + ord(lettre) - 64
        v = re.search(r"<v>(.*?)</v>", corps or "", re.S)
        i = re.search(r"<is>(.*?)</is>", corps or "", re.S)
        if 't="s"' in attrs and v:
            cases[col] = partages[int(v.group(1))]
        elif i:
            cases[col] = html.unescape(re.sub(r"<[^>]+>", "", i.group(1)))
        elif v:
            cases[col] = v.group(1)
    largeur = max(largeur, max(cases) if cases else 0)
    print(" | ".join(cases.get(c, "") for c in range(1, largeur + 1)))
`,
    fichier,
  );
}

export function dossierTemporaire(nom: string): string {
  const dossier = path.join(process.env.TEMP ?? RACINE, "recette-uc0809", nom);
  fs.mkdirSync(dossier, { recursive: true });
  return dossier;
}

export function dossierCaptures(dossierUC: string): string {
  const dossier = path.join(RACINE, "scenarios", dossierUC, "captures");
  fs.mkdirSync(dossier, { recursive: true });
  return dossier;
}

// Relevé d'écolage (UC09)

/** Ouvre la fiche d'un étudiant depuis la liste Étudiants, par son nom. */
export async function ouvrirFiche(page: Page, nom: string) {
  await page.goto("/app/etudiants");
  await page.getByRole("link", { name: new RegExp(nom) }).first().click();
  await page.waitForURL(/\/app\/etudiants\/[^/?]+(\?.*)?$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(nom.split(" ")[0]);
}

/** Clique « Télécharger » sur la fiche ouverte ; rend le chemin du PDF enregistré et le nom proposé. */
export async function telechargerReleve(page: Page, dossier: string): Promise<{ fichier: string; nom: string }> {
  const [telechargement] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Télécharger le relevé d'écolage en PDF" }).click(),
  ]);
  const nom = telechargement.suggestedFilename();
  const fichier = path.join(dossier, nom);
  await telechargement.saveAs(fichier);
  return { fichier, nom };
}

/** « Imprimer le relevé » : le navigateur charge le PDF en `inline` ; la boîte d'impression elle-même ne s'automatise pas. */
export async function imprimerReleve(page: Page) {
  const [reponse] = await Promise.all([
    page.waitForResponse((r) => /\/api\/pdf\/releve\/[^/?]+$/.test(r.url()) && r.request().method() === "GET"),
    page.getByRole("button", { name: "Imprimer le relevé" }).click(),
  ]);
  expect(reponse.status()).toBe(200);
  expect(reponse.headers()["content-type"]).toBe("application/pdf");
  expect(reponse.headers()["content-disposition"]).toMatch(/^inline; filename="releve-[A-Z]{2}-\d{4}-\d{4}\.pdf"$/);
  await expect(page.getByText("Le document n'a pas pu être chargé")).toHaveCount(0);
  return reponse.headers()["content-disposition"];
}

/** Format, nombre de pages et texte du PDF, espaces insécables ramenées à des espaces simples. */
export function lireReleve(fichier: string): { pages: number; format: string; texte: string } {
  const brut = textePdf(fichier).replace(/[\u00a0\u202f]/g, " ").replace(/\r/g, "");
  return { pages: pagesPdf(fichier), format: formatPdf(fichier), texte: brut };
}

/** Les lignes du texte d'un PDF, une valeur par ligne : pratique pour vérifier « libellé puis montants ». */
export function lignesTexte(texte: string): string[] {
  return texte.split("\n").map((l) => l.trim()).filter(Boolean);
}

/** Vérifie qu'un bloc de lignes consécutives figure dans le texte (ex. « Octobre 2025 », « 80 000 Ar », …). */
export function contientSuite(texte: string, suite: string[]): boolean {
  const lignes = lignesTexte(texte);
  return lignes.some((_, i) => suite.every((v, k) => lignes[i + k] === v));
}

/** Ouvre la fiche, télécharge le relevé et le lit : tout ce qu'il faut pour vérifier le PDF d'un étudiant. */
export async function releveDe(page: Page, nom: string, dossier: string) {
  await ouvrirFiche(page, nom);
  const { fichier, nom: nomFichier } = await telechargerReleve(page, dossier);
  return { fichier, nomFichier, ...lireReleve(fichier) };
}
