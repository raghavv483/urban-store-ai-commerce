import "server-only";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 removed the classic Rust query engine; the generated client no
// longer reads a connection string out of schema.prisma at runtime and
// instead requires an explicit driver adapter (see db/schema.prisma and
// prisma.config.ts, where the schema-level `url`/`directUrl` fields were
// deleted because Prisma 7 rejects them). DATABASE_URL is the Supabase
// transaction pooler (port 6543) — the right connection for short-lived
// request-scoped queries at runtime. Migrations use DIRECT_URL instead,
// configured separately in prisma.config.ts.
//
// `pg.PoolConfig.connectionString` is optional, so an unset DATABASE_URL
// would otherwise typecheck fine and fail at connect time with a confusing
// error (pg falls back to libpq defaults — localhost:5432 as the OS user).
// Guard explicitly so the failure names the actual missing variable. Read
// `process.env` directly rather than importing `lib/env.ts`'s `env`, since
// that Proxy validates the *entire* environment on first access — every
// consumer of the database client would end up validating unrelated vars
// (Razorpay keys, Clerk secrets, etc.) just to get a Prisma client.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}
const adapter = new PrismaPg({ connectionString });

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
