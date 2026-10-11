import { afterAll, beforeEach } from "vitest";
import { urlBaseTest } from "./base-test";

// Avant tout import de `@/lib/db`, qui lit DATABASE_URL à sa création.
process.env.DATABASE_URL = urlBaseTest();

const { db } = await import("@/lib/db");

beforeEach(async () => {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const liste = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${liste} RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await db.$disconnect();
});
