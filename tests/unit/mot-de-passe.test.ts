import { describe, expect, it } from "vitest";
import {
  ALPHABET_MOT_DE_PASSE,
  genererMotDePasse,
  LONGUEUR_MIN_MOT_DE_PASSE,
  schemaChangementMotDePasse,
} from "@/lib/mot-de-passe";

describe("genererMotDePasse", () => {
  it("produit trois groupes de quatre caractères séparés par des tirets", () => {
    for (let i = 0; i < 200; i++) {
      expect(genererMotDePasse()).toMatch(/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/);
    }
  });

  it("n'emploie que l'alphabet sans caractères ambigus (0, O, o, 1, l, I, i)", () => {
    for (const ambigu of ["0", "O", "o", "1", "l", "I", "i"]) expect(ALPHABET_MOT_DE_PASSE).not.toContain(ambigu);
    const vus = new Set<string>();
    for (let i = 0; i < 500; i++) for (const c of genererMotDePasse().replace(/-/g, "")) vus.add(c);
    for (const c of vus) expect(ALPHABET_MOT_DE_PASSE).toContain(c);
  });

  it("écarte les octets au-delà du dernier multiple de la taille de l'alphabet (pas de biais de modulo)", () => {
    const taille = ALPHABET_MOT_DE_PASSE.length;
    const limite = 256 - (256 % taille);
    let appel = 0;
    const source = (n: number) => new Uint8Array(n).fill(appel++ === 0 ? limite : 0);
    expect(genererMotDePasse(source)).toBe("AAAA-AAAA-AAAA");
    expect(appel).toBe(2);
  });

  it("tire des mots de passe différents d'un appel à l'autre", () => {
    const tires = new Set(Array.from({ length: 100 }, () => genererMotDePasse()));
    expect(tires.size).toBe(100);
  });
});

describe("schemaChangementMotDePasse", () => {
  const valide = { actuel: "Ancien-2026", nouveau: "Nouveau-2026", confirmation: "Nouveau-2026" };
  const erreurs = (entree: typeof valide) => {
    const r = schemaChangementMotDePasse.safeParse(entree);
    return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message]));
  };

  it("accepte un nouveau mot de passe confirmé et différent de l'actuel", () => {
    expect(schemaChangementMotDePasse.safeParse(valide).success).toBe(true);
  });

  it("exige le mot de passe actuel", () => {
    expect(erreurs({ ...valide, actuel: "" })).toHaveProperty("actuel");
  });

  it(`refuse un nouveau mot de passe de moins de ${LONGUEUR_MIN_MOT_DE_PASSE} caractères`, () => {
    expect(erreurs({ ...valide, nouveau: "Court1", confirmation: "Court1" })).toHaveProperty("nouveau");
  });

  it("refuse une confirmation différente, signalée sur le champ de confirmation", () => {
    expect(erreurs({ ...valide, confirmation: "Nouveau-2027" })).toEqual({
      confirmation: "Les deux saisies ne sont pas identiques.",
    });
  });

  it("refuse un nouveau mot de passe identique à l'actuel", () => {
    expect(erreurs({ actuel: "Meme-2026", nouveau: "Meme-2026", confirmation: "Meme-2026" })).toHaveProperty("nouveau");
  });
});
