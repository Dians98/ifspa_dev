import { describe, expect, it } from "vitest";
import { ALPHABET_MOT_DE_PASSE, genererMotDePasse } from "@/lib/mot-de-passe";

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
