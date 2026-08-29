import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig, env } from "prisma/config";

loadEnv({ path: ".env.local" });

export default defineConfig({
  schema: path.join("db", "schema.prisma"),
  migrations: { seed: "tsx --conditions=react-server db/seed.ts" },
  // Prisma 7 collapses url/directUrl into a single datasource.url. CLI
  // operations (migrate, generate, db push) all read this value, so it is
  // set to DIRECT_URL (the Supabase session pooler, port 5432) rather than
  // the transaction pooler — Prisma Migrate needs a session-capable
  // connection for advisory locks. The runtime PrismaClient in lib/db.ts is
  // unaffected by this file; it connects separately over DATABASE_URL.
  datasource: {
    url: env("DIRECT_URL"),
  },
});
