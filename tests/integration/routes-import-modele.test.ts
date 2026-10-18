import readXlsxFile from "read-excel-file/node";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { lireFichiersReprise } from "@/server/import/lire-fichiers";
import { fabriquerAnnee, fabriquerTarif } from "../factories";
import { connecter, fabriquerMonde, type Monde } from "../factories/scenarios";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const { db } = await import("@/lib/db");
const route = await import("@/app/api/import/modele/route");

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const FORMATS = ["xlsx", "etudiants.csv", "paiements.csv"];

let m: Monde;

beforeEach(async () => {
  getSession.mockReset();
  m = await fabriquerMonde();
  connecter(getSession, m.admin);
});

const demander = (format?: string) =>
  route.GET(new Request(`http://localhost/api/import/modele${format === undefined ? "" : `?format=${encodeURIComponent(format)}`}`));

const octets = async (r: Response) => new Uint8Array(await r.arrayBuffer());
const texteCsv = async (r: Response) => new TextDecoder().decode(await octets(r));

describe("accès", () => {
  it("sans session : 401 JSON { code: SESSION } sans cache, pour chaque format", async () => {
    getSession.mockResolvedValue(null);

    for (const format of [undefined, ...FORMATS, "pdf"]) {
      const r = await demander(format);

      expect(r.status, String(format)).toBe(401);
      expect(r.headers.get("Cache-Control")).toBe("no-store");
      expect(r.headers.get("content-type")).toMatch(/application\/json/);
      expect(await r.json()).toMatchObject({ code: "SESSION", erreur: expect.any(String) });
    }
  });

  it("rôle user : 403 { code: INTERDIT }, y compris pour un format inconnu et sans année courante", async () => {
    connecter(getSession, m.user);
    await db.anneeScolaire.updateMany({ data: { estCourante: false } });

    for (const format of [undefined, ...FORMATS, "pdf"]) {
      const r = await demander(format);

      expect(r.status, String(format)).toBe(403);
      expect(r.headers.get("Cache-Control")).toBe("no-store");
      expect(await r.json()).toMatchObject({ code: "INTERDIT", erreur: "Cette action est réservée à l'administrateur." });
    }
  });

  it("le modèle n'est servi à personne d'autre que l'administrateur : aucun octet de fichier pour le user", async () => {
    connecter(getSession, m.user);

    const r = await demander("etudiants.csv");

    expect(r.headers.get("Content-Disposition")).toBeNull();
    expect(await r.text()).not.toContain("RAKOTOMALALA");
  });
});

describe("refus de l'administrateur", () => {
  it("format inconnu : 400 INVALIDE, avec les formats possibles", async () => {
    for (const format of ["pdf", "csv", "XLSX", ""]) {
      const r = await demander(format);

      expect(r.status, format).toBe(400);
      expect(await r.json()).toEqual({ erreur: "Format inconnu : demandez xlsx, etudiants.csv ou paiements.csv.", code: "INVALIDE" });
    }
  });

  it("sans année courante : 409 INVALIDE qui renvoie à Paramètres › Années", async () => {
    await db.anneeScolaire.updateMany({ data: { estCourante: false } });

    for (const format of FORMATS) {
      const r = await demander(format);

      expect(r.status, format).toBe(409);
      expect(r.headers.get("Cache-Control")).toBe("no-store");
      expect(await r.json()).toMatchObject({ code: "INVALIDE", erreur: expect.stringMatching(/Aucune année scolaire courante.*Paramètres › Années/) });
    }
  });

  it("sans aucune année en base : 409 également", async () => {
    await db.tarif.deleteMany();
    await db.anneeScolaire.deleteMany();

    expect((await demander("xlsx")).status).toBe(409);
  });
});

describe("modèle servi à l'administrateur", () => {
  it("xlsx par défaut : classeur nommé d'après l'année courante, sans cache", async () => {
    for (const format of [undefined, "xlsx"]) {
      const r = await demander(format);

      expect(r.status).toBe(200);
      expect(r.headers.get("Content-Type")).toBe(XLSX);
      expect(r.headers.get("Content-Disposition")).toBe('attachment; filename="modele-import-ifspa-2026-2027.xlsx"');
      expect(r.headers.get("Cache-Control")).toBe("no-store");
      const corps = await octets(r);
      expect([...corps.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    }
  });

  it("le classeur se relit : feuilles Étudiants et Paiements, en-tête « Niveau 2026-2027 », lignes d'exemple en ligne 3", async () => {
    const corps = await octets(await demander("xlsx"));

    const lu = await lireFichiersReprise([{ nom: "modele.xlsx", octets: corps }]);

    expect(lu.ok).toBe(true);
    if (!lu.ok) return;
    expect(lu.lu.anneeNiveau).toBe("2026-2027");
    expect(lu.lu.etudiants.lignes.map((l) => l.ligne)).toEqual([3, 4, 5]);
    expect(lu.lu.paiements.lignes).toHaveLength(3);
    expect(lu.lu.messages).toEqual([]);
  });

  it("le classeur a une feuille « Lisez-moi » qui cite l'année et les années d'entrée à créer", async () => {
    const corps = await octets(await demander("xlsx"));

    const feuilles = await readXlsxFile(Buffer.from(corps));

    expect(feuilles.map((f) => f.sheet)).toEqual(["Lisez-moi", "Étudiants", "Paiements"]);
    const consignes = feuilles[0].data.map((r) => String(r[0] ?? "")).join("\n");
    expect(consignes).toContain("année 2026-2027");
    expect(consignes).toContain("années absentes aujourd'hui de Paramètres › Années : 2024-2025, 2025-2026");
  });

  it("etudiants.csv : BOM UTF-8, point-virgule, nom de fichier d'après l'année", async () => {
    const r = await demander("etudiants.csv");

    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(r.headers.get("Content-Disposition")).toBe('attachment; filename="etudiants-2026-2027.csv"');
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    const corps = await octets(r);
    expect([...corps.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const texte = new TextDecoder().decode(corps);
    expect(texte.split("\r\n")[0]).toBe(
      "N° *;Nom *;Prénoms *;Sexe *;Date de naissance *;Lieu de naissance *;CIN;Téléphone;Adresse;Filière *;Année d'entrée *;Niveau 2026-2027 *;Redoublant;Droits en",
    );
    expect(texte).toContain("RAKOTOMALALA");
  });

  it("paiements.csv : BOM UTF-8, nom de fichier d'après l'année, colonnes du modèle", async () => {
    const r = await demander("paiements.csv");

    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(r.headers.get("Content-Disposition")).toBe('attachment; filename="paiements-2026-2027.csv"');
    const corps = await octets(r);
    expect([...corps.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(corps).split("\r\n")[0]).toBe("N° étudiant *;Date *;Montant (Ar) *;Mode *;Opérateur;Référence;N° reçu papier");
  });

  it("les deux CSV téléchargés se relisent ensemble comme le classeur", async () => {
    const [etudiants, paiements, classeur] = await Promise.all(["etudiants.csv", "paiements.csv", "xlsx"].map(async (f) => octets(await demander(f))));

    const csv = await lireFichiersReprise([{ nom: "etudiants-2026-2027.csv", octets: etudiants }, { nom: "paiements-2026-2027.csv", octets: paiements }]);
    const xlsx = await lireFichiersReprise([{ nom: "modele.xlsx", octets: classeur }]);

    expect(csv.ok && xlsx.ok).toBe(true);
    if (!csv.ok || !xlsx.ok) return;
    expect(csv.lu.etudiants.lignes).toEqual(xlsx.lu.etudiants.lignes);
    expect(csv.lu.paiements.lignes).toEqual(xlsx.lu.paiements.lignes);
  });

  it("le modèle suit la base : l'année courante, les codes de filière actifs, les niveaux", async () => {
    await db.anneeScolaire.update({ where: { id: m.annee.id }, data: { estCourante: false } });
    const suivante = await fabriquerAnnee({ anneeDebut: 2027, estCourante: true });
    await fabriquerTarif(m.ifs.id, suivante.id);
    await db.filiere.update({ where: { id: m.sf.id }, data: { actif: false } });

    const r = await demander("etudiants.csv");

    expect(r.headers.get("Content-Disposition")).toBe('attachment; filename="etudiants-2027-2028.csv"');
    const lignes = (await texteCsv(r)).split("\r\n");
    expect(lignes[0]).toContain("Niveau 2027-2028 *");
    expect(lignes[1]).toContain("Code de la filière : IF.");
    expect(lignes[1]).toContain("1, 2 ou 3 : la classe suivie en 2027-2028.");
  });

  it("des tarifs à nombres de mensualités différents : les consignes renvoient au tarif de chaque classe", async () => {
    await fabriquerTarif(m.ifs.id, m.annee.id, { niveau: 2, nombreMois: 8 });

    const classeur = await readXlsxFile(Buffer.from(await octets(await demander("xlsx"))));

    const consignes = classeur[0].data.map((r) => String(r[0] ?? "")).join("\n");
    expect(consignes).toContain("les mensualités prévues par le tarif de chaque classe");
  });

  it("ne modifie rien en base", async () => {
    const avant = await Promise.all([db.etudiant.count(), db.inscription.count(), db.paiement.count(), db.compteur.count(), db.anneeScolaire.count()]);

    for (const format of FORMATS) await demander(format);

    expect(await Promise.all([db.etudiant.count(), db.inscription.count(), db.paiement.count(), db.compteur.count(), db.anneeScolaire.count()])).toEqual(avant);
  });
});
