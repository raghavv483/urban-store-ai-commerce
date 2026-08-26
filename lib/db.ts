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
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

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
