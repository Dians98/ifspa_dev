import { config } from "dotenv";

config({ quiet: true });

const URL_PAR_DEFAUT = "postgresql://ifspa:ifspa_dev@localhost:5434/ifspa_test?schema=public";

/** URL de la base de test ; refuse tout ce qui n'est pas une base locale dont le nom finit par `_test`. */
export function urlBaseTest(): string {
  const url = process.env.DATABASE_URL_TEST || URL_PAR_DEFAUT;
  const u = new URL(url);
  const nomBase = u.pathname.replace(/^\//, "");
  if (!["localhost", "127.0.0.1"].includes(u.hostname) || !nomBase.endsWith("_test")) {
    throw new Error(`DATABASE_URL_TEST doit viser une base locale *_test (reçu : ${u.hostname}/${nomBase}).`);
  }
  return url;
}
