# Day 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Next.js + Prisma + Clerk foundation with the full database schema, seeded Urban Store data, and a working `/shop` catalog — so that a logged-in user sees real products from Postgres.

**Architecture:** A modular monolith on Next.js App Router. Postgres (Supabase) holds every entity from the spec's §7 schema; Prisma owns the schema and migrations. Clerk provides identity, and a thin `/auth` layer converts a Clerk session into a `SessionContext` carrying `merchantId` + `role` — every data-access function takes that `merchantId` as its first argument, so tenant isolation is structural rather than a convention. Day 1 builds no AI, no payments, and no agents: it builds the ground those sit on.

**Tech Stack:** Next.js 15 (App Router) · TypeScript strict · Tailwind + shadcn/ui · PostgreSQL (Supabase) + Prisma · pgvector · Clerk · Vitest + @testing-library/react

**Spec:** `urban-store-build-spec.md` §9 "Day 1 — Foundation", with schema from §7, seed data from `PRD.md` §8, and data model from `ARCHITECTURE.md` §3.

## Global Constraints

These apply to every task. They come from `CLAUDE.md` and the spec docs; values are copied verbatim.

- **Money is stored as integer paise, never a float.** Every monetary column is `Int` and named with a `Paise` suffix (`priceInPaise`, `subtotalInPaise`). Razorpay's API takes paise integers, and floats cannot represent ₹74,999.00 exactly. Display formatting happens only at the UI edge, via `lib/money.ts`.
- **Every DB query is scoped by `merchantId` from the authenticated session** — never from user-provided input (`CLAUDE.md` safety rule 6). Data-access functions take `merchantId` as their first parameter and always include it in the `where` clause.
- **Never expose secrets to the browser.** Only `NEXT_PUBLIC_*` vars may be read from client components. No secret ever gets a `NEXT_PUBLIC_` prefix (`CLAUDE.md` safety rule 7).
- **TypeScript strict mode. No `any`** unless genuinely unavoidable, with a comment explaining why (`CLAUDE.md` coding conventions).
- **Validate all inputs with Zod** (`CLAUDE.md` coding conventions). This applies to `process.env` too.
- **No TODO stubs or half-wired hooks for later days.** Build Day 1 clean and complete as if Days 2–10 do not exist (`CLAUDE.md` process rules).
- **Folder structure is fixed** (`CLAUDE.md`): `/app` `/components` `/lib` `/agents` `/tools` `/rag` `/db` `/payments` `/auth` `/types`. Day 1 touches only `/app` `/components` `/lib` `/db` `/auth` `/types`.
- **Embedding dimensions are 384** (`Xenova/all-MiniLM-L6-v2`, set in `.env.local` as `EMBEDDING_DIMENSIONS=384`). The `knowledge_chunks.embedding` column must be `vector(384)`. Changing this later means dropping and re-seeding the table.
- **Seed merchant slug is `urban-store`.** It is the single tenant for the demo, but all code is written as if multi-tenant.
- **Definition of done** (`CLAUDE.md`): `UI + API + DB + validation + error handling + loading state + real data + the unhappy paths`. "It ran once on the happy path" is not done.

## Verification Commands

Run these after every task. All three must pass before the task is considered complete.

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # next lint
npm test             # vitest run
```

## File Structure

| File | Responsibility |
|---|---|
| `lib/env.ts` | Zod-validated, typed access to `process.env`. Fails loudly at boot on a missing var. |
| `lib/db.ts` | Prisma client singleton (avoids exhausting connections on hot reload). |
| `lib/money.ts` | Paise ↔ display-string conversion. The only place currency is formatted. |
| `lib/merchant.ts` | Resolves the storefront's `merchantId` from its slug, for public pages that have no session. |
| `db/schema.prisma` | Full §7 schema. Single source of truth for the data model. |
| `db/seed-data.ts` | Pure data constants — the 9 products, relations, orders, carts. No DB calls. |
| `db/seed.ts` | Idempotent script that writes `seed-data.ts` into Postgres. |
| `db/queries/products.ts` | Merchant-scoped product reads. The only module that queries `products`. |
| `auth/session.ts` | Clerk session → `SessionContext` (`userId`, `merchantId`, `role`). Role guards. |
| `auth/sync.ts` | Just-in-time upsert of a Clerk user into the local `users` table. |
| `types/product.ts` | Shared product view types + Zod schemas for query params. |
| `middleware.ts` | Clerk middleware; declares which routes are public. |
| `app/layout.tsx` | Root layout, `ClerkProvider`, site header. |
| `app/page.tsx` | Home — redirects to `/shop`. |
| `app/shop/page.tsx` | Catalog grid with category filter + search. |
| `app/shop/[slug]/page.tsx` | Product detail page. |
| `components/site-header.tsx` | Nav with auth state; shows Merchant link only to `merchant_admin`. |
| `components/product-card.tsx` | Single product tile. |
| `components/product-grid.tsx` | Grid + empty state. |
| `components/category-filter.tsx` | Category pills that drive the `?category=` search param. |

---

## Task 1: Project scaffold, tooling, and typed environment

**Files:**
- Create: `.gitignore`
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `app/layout.tsx`, `app/page.tsx` (via scaffolder)
- Create: `vitest.config.ts`
- Create: `lib/env.ts`
- Create: `lib/env.test.ts`
- Create: `.env.example`

**Interfaces:**
- Consumes: nothing (first task).
- Produces, all from `lib/env.ts`: `parseEnv(source)` (pure validator), `getEnv()` (lazy, cached), and `env` (a lazy proxy with typed keys `DATABASE_URL`, `DIRECT_URL`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `GROQ_API_KEY`, `MERCHANT_ADMIN_EMAIL`, `EMBEDDING_DIMENSIONS` as number, `APP_BASE_URL`), plus the type `Env`. Also produces the `npm run typecheck`, `npm run lint`, and `npm test` scripts used by every later task.

- [ ] **Step 1: Protect the secrets already on disk, then init git**

`.env.local` already contains real Supabase and Clerk credentials. Create `.gitignore` **before** `git init` so there is no window in which those can be staged.

```bash
cat > .gitignore <<'EOF'
node_modules/
.next/
out/
build/
.env
.env*.local
*.tsbuildinfo
next-env.d.ts
.DS_Store
coverage/
EOF
git init
git add .gitignore
git commit -m "chore: gitignore before anything else"
```

- [ ] **Step 2: Verify .env.local is actually ignored**

Run: `git check-ignore -v .env.local`

Expected: prints a line naming `.gitignore` and the `.env*.local` rule. If it prints nothing, STOP — the file is trackable and the credentials will leak on the first `git add -A`.

- [ ] **Step 3: Scaffold Next.js into the existing directory**

The directory is non-empty (spec docs + `.env.local`), so scaffold into a temp dir and move the files in.

```bash
npx create-next-app@latest .tmp-scaffold --ts --eslint --tailwind --app --no-src-dir --turbopack --import-alias "@/*" --use-npm
mv .tmp-scaffold/app .tmp-scaffold/public .tmp-scaffold/package.json .tmp-scaffold/tsconfig.json .tmp-scaffold/next.config.ts .tmp-scaffold/postcss.config.mjs .tmp-scaffold/eslint.config.mjs .tmp-scaffold/next-env.d.ts .
rm -rf .tmp-scaffold
npm install
```

- [ ] **Step 4: Confirm the dev server boots**

Run: `npm run dev`

Expected: `Ready in ...` and http://localhost:3000 serves the Next.js starter page. Stop the server with Ctrl+C before continuing.

- [ ] **Step 5: Install test tooling and add scripts**

```bash
npm i -D vitest @vitejs/plugin-react vite-tsconfig-paths jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event dotenv
```

Edit `package.json` and set the `scripts` block to exactly this:

```json
{
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 6: Configure Vitest**

Create `vitest.config.ts`. `dotenv` is loaded at config time so tests see `.env.local`; the 30s timeout exists because integration tests in later tasks hit a remote Supabase instance.

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { config } from "dotenv";

config({ path: ".env.local" });

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    // `node` is the default because most tests here talk to Prisma, which
    // misbehaves under jsdom. Component tests opt in per-file with a
    // `// @vitest-environment jsdom` docblock on line 1.
    environment: "node",
    globals: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules", ".next"],
  },
});
```

- [ ] **Step 7: Write the failing test for the env module**

Create `lib/env.test.ts`. Note it tests the *parser function*, not the module singleton — a singleton that reads `process.env` at import time cannot be tested with different inputs.

```typescript
import { describe, it, expect } from "vitest";
import { parseEnv } from "./env";

const valid = {
  DATABASE_URL: "postgresql://u:p@host:6543/postgres",
  DIRECT_URL: "postgresql://u:p@host:5432/postgres",
  RAZORPAY_KEY_ID: "rzp_test_abc",
  RAZORPAY_KEY_SECRET: "secret",
  RAZORPAY_WEBHOOK_SECRET: "whsec",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_abc",
  CLERK_SECRET_KEY: "sk_test_abc",
  GROQ_API_KEY: "gsk_abc",
  MERCHANT_ADMIN_EMAIL: "owner@urbanstore.test",
  EMBEDDING_DIMENSIONS: "384",
  APP_BASE_URL: "http://localhost:3000",
};

describe("parseEnv", () => {
  it("returns a typed object when every variable is present", () => {
    const env = parseEnv(valid);
    expect(env.DATABASE_URL).toBe(valid.DATABASE_URL);
    expect(env.MERCHANT_ADMIN_EMAIL).toBe("owner@urbanstore.test");
  });

  it("coerces EMBEDDING_DIMENSIONS to a number", () => {
    expect(parseEnv(valid).EMBEDDING_DIMENSIONS).toBe(384);
  });

  it("throws and names the missing variable", () => {
    const { CLERK_SECRET_KEY: _omitted, ...missing } = valid;
    expect(() => parseEnv(missing)).toThrow(/CLERK_SECRET_KEY/);
  });

  it("rejects a merchant admin email that is not an email", () => {
    expect(() => parseEnv({ ...valid, MERCHANT_ADMIN_EMAIL: "nope" })).toThrow(
      /MERCHANT_ADMIN_EMAIL/,
    );
  });

  it("rejects a DATABASE_URL that is not a postgres URL", () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: "mysql://x" })).toThrow(
      /DATABASE_URL/,
    );
  });
});
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `npm test -- lib/env.test.ts`

Expected: FAIL — `Failed to resolve import "./env"` (the module does not exist yet).

- [ ] **Step 9: Implement the env module**

```bash
npm i zod
```

Create `lib/env.ts`:

```typescript
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().startsWith("postgresql://"),
  DIRECT_URL: z.string().startsWith("postgresql://"),
  RAZORPAY_KEY_ID: z.string().min(1),
  RAZORPAY_KEY_SECRET: z.string().min(1),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1),
  GROQ_API_KEY: z.string().min(1),
  MERCHANT_ADMIN_EMAIL: z.string().email(),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive(),
  APP_BASE_URL: z.string().url(),
});

export type Env = z.infer<typeof envSchema>;

/** Pure parser — exported so it can be tested with arbitrary input. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("\n  ");
    throw new Error(`Invalid environment configuration:\n  ${details}`);
  }
  return result.data;
}

let cached: Env | null = null;

/** Validates once, on first access. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/**
 * Server-side env accessor. Lazy on purpose: validating at module-evaluation
 * time would make merely *importing* this file throw, which breaks tests and
 * any tooling that loads the module without a full environment.
 *
 * Importing this from a client component is a bug — it would attempt to inline
 * secrets into the browser bundle.
 */
export const env: Env = new Proxy({} as Env, {
  get: (_target, key: string) => getEnv()[key as keyof Env],
});
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `npm test -- lib/env.test.ts`

Expected: PASS, 5 tests.

- [ ] **Step 11: Add the missing variable to .env.local**

`MERCHANT_ADMIN_EMAIL` is referenced by the schema but is not yet in `.env.local`. Append it, using the email you will actually sign up with as the merchant:

```bash
cat >> .env.local <<'EOF'

# ── Roles ───────────────────────────────────────────────────────────────────
# The Clerk user with this email is promoted to merchant_admin on first sign-in.
MERCHANT_ADMIN_EMAIL=
EOF
```

Fill in the value, then verify the app still boots with `npm run dev`. If `parseEnv` throws, the error names the offending variable.

- [ ] **Step 12: Create .env.example (committed, no values)**

```bash
sed -E 's/^([A-Z_]+)=.*/\1=/' .env.local > .env.example
```

Open `.env.example` and confirm by eye that **no** value survived the substitution. This file is committed; `.env.local` is not.

- [ ] **Step 13: Verify and commit**

```bash
npm run typecheck && npm run lint && npm test
git add -A
git commit -m "chore: scaffold next.js, vitest, and zod-validated env"
```

---

## Task 2: Prisma schema and pgvector migration

**Files:**
- Create: `db/schema.prisma`
- Create: `lib/db.ts`
- Create: `db/schema.test.ts`
- Modify: `package.json` (add the `prisma` config block and db scripts)

**Interfaces:**
- Consumes: `env` from `lib/env.ts` (Task 1).
- Produces: `prisma` — the `PrismaClient` singleton exported from `lib/db.ts`. Also produces every model type used by later tasks: `Merchant`, `User`, `Product`, `ProductRelation`, `Cart`, `CartItem`, `CartEvent`, `Order`, `OrderItem`, `Payment`, `Campaign`, `AgentRun`, `AgentAction`, `KnowledgeChunk`, and the enums `UserRole`, `CartStatus`, `CartEventType`, `OrderStatus`, `OrderSource`, `PaymentStatus`, `CampaignStatus`, `AgentRunStatus`.

- [ ] **Step 1: Install Prisma and point it at /db**

```bash
npm i -D prisma tsx
npm i @prisma/client
```

Add this top-level block to `package.json` (a sibling of `"scripts"`), so Prisma finds the schema in `/db` per the CLAUDE.md folder layout:

```json
{
  "prisma": {
    "schema": "db/schema.prisma",
    "seed": "tsx db/seed.ts"
  }
}
```

Then add these entries to the existing `scripts` block:

```json
{
  "db:migrate": "prisma migrate dev",
  "db:seed": "prisma db seed",
  "db:studio": "prisma studio",
  "db:generate": "prisma generate"
}
```

> If Prisma reports that the `package.json` config key is unsupported (Prisma 7+), delete that block and create `prisma.config.ts` at the repo root instead:
>
> ```typescript
> import path from "node:path";
> import { defineConfig } from "prisma/config";
>
> export default defineConfig({
>   schema: path.join("db", "schema.prisma"),
>   migrations: { seed: "tsx db/seed.ts" },
> });
> ```

- [ ] **Step 2: Write the failing schema test**

Create `db/schema.test.ts`. This is an **integration test** — it connects to the real Supabase database configured in `.env.local`.

```typescript
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("database schema", () => {
  it("has the pgvector extension installed", async () => {
    const rows = await prisma.$queryRaw<Array<{ extname: string }>>`
      SELECT extname FROM pg_extension WHERE extname = 'vector'
    `;
    expect(rows).toHaveLength(1);
  });

  it("creates every table from spec section 7", async () => {
    const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
    `;
    const tables = rows.map((r) => r.table_name);
    for (const expected of [
      "users", "merchants", "products", "product_relations",
      "carts", "cart_items", "cart_events", "orders", "order_items",
      "payments", "campaigns", "agent_runs", "agent_actions",
      "knowledge_chunks",
    ]) {
      expect(tables).toContain(expected);
    }
  });

  it("stores the embedding column as vector(384)", async () => {
    const rows = await prisma.$queryRaw<Array<{ format_type: string }>>`
      SELECT format_type(a.atttypid, a.atttypmod)
      FROM pg_attribute a
      WHERE a.attrelid = 'knowledge_chunks'::regclass AND a.attname = 'embedding'
    `;
    expect(rows[0].format_type).toBe("vector(384)");
  });

  it("stores money columns as integers, never floats", async () => {
    const rows = await prisma.$queryRaw<Array<{ data_type: string }>>`
      SELECT data_type FROM information_schema.columns
      WHERE table_name = 'products' AND column_name = 'price_in_paise'
    `;
    expect(rows[0].data_type).toBe("integer");
  });

  it("enforces a unique constraint on (merchant_id, slug) for products", async () => {
    const rows = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'products' AND indexdef LIKE '%UNIQUE%'
        AND indexdef LIKE '%merchant_id%' AND indexdef LIKE '%slug%'
    `;
    expect(rows.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- db/schema.test.ts`

Expected: FAIL — `Failed to resolve import "@/lib/db"`.

- [ ] **Step 4: Create the Prisma client singleton**

Create `lib/db.ts`. The `globalThis` cache prevents Next.js hot reload from opening a new connection pool on every edit until Supabase refuses connections.

```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 5: Write the schema**

Create `db/schema.prisma`. Every model maps to a snake_case table via `@@map`, and every monetary field is `Int` paise per the Global Constraints.

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  directUrl  = env("DIRECT_URL")
  extensions = [vector]
}

enum UserRole {
  customer
  merchant_admin
}

enum CartStatus {
  active
  checked_out
  abandoned
}

enum CartEventType {
  checkout_started
  payment_failed
  abandoned
  recovered
}

enum OrderStatus {
  created
  pending
  paid
  failed
  cancelled
}

enum OrderSource {
  human
  ai_buyer
}

enum PaymentStatus {
  created
  authorized
  captured
  failed
  refunded
}

enum CampaignStatus {
  proposed
  approved
  active
  rejected
}

enum AgentRunStatus {
  running
  succeeded
  failed
}

model Merchant {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique
  createdAt DateTime @default(now()) @map("created_at")

  users            User[]
  products         Product[]
  productRelations ProductRelation[]
  carts            Cart[]
  orders           Order[]
  campaigns        Campaign[]
  agentRuns        AgentRun[]
  knowledgeChunks  KnowledgeChunk[]

  @@map("merchants")
}

model User {
  id         String   @id @default(cuid())
  clerkId    String   @unique @map("clerk_id")
  email      String   @unique
  role       UserRole @default(customer)
  merchantId String   @map("merchant_id")
  createdAt  DateTime @default(now()) @map("created_at")

  merchant Merchant @relation(fields: [merchantId], references: [id], onDelete: Cascade)
  carts    Cart[]
  orders   Order[]

  @@index([merchantId])
  @@map("users")
}

model Product {
  id             String   @id @default(cuid())
  merchantId     String   @map("merchant_id")
  name           String
  slug           String
  category       String
  priceInPaise   Int      @map("price_in_paise")
  currency       String   @default("INR")
  stock          Int      @default(0)
  sku            String
  specifications Json     @default("{}")
  imageUrl       String?  @map("image_url")
  description    String?
  active         Boolean  @default(true)
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  merchant    Merchant          @relation(fields: [merchantId], references: [id], onDelete: Cascade)
  relatedFrom ProductRelation[] @relation("RelationSource")
  relatedTo   ProductRelation[] @relation("RelationTarget")
  cartItems   CartItem[]
  orderItems  OrderItem[]

  @@unique([merchantId, slug])
  @@unique([merchantId, sku])
  @@index([merchantId, category])
  @@index([merchantId, active])
  @@map("products")
}

model ProductRelation {
  id               String   @id @default(cuid())
  merchantId       String   @map("merchant_id")
  productId        String   @map("product_id")
  relatedProductId String   @map("related_product_id")
  relationType     String   @map("relation_type")
  score            Float    @default(1.0)
  createdAt        DateTime @default(now()) @map("created_at")

  merchant       Merchant @relation(fields: [merchantId], references: [id], onDelete: Cascade)
  product        Product  @relation("RelationSource", fields: [productId], references: [id], onDelete: Cascade)
  relatedProduct Product  @relation("RelationTarget", fields: [relatedProductId], references: [id], onDelete: Cascade)

  @@unique([productId, relatedProductId, relationType])
  @@index([merchantId, productId])
  @@map("product_relations")
}

model Cart {
  id           String     @id @default(cuid())
  merchantId   String     @map("merchant_id")
  customerId   String?    @map("customer_id")
  sessionId    String?    @map("session_id")
  status       CartStatus @default(active)
  totalInPaise Int        @default(0) @map("total_in_paise")
  createdAt    DateTime   @default(now()) @map("created_at")
  updatedAt    DateTime   @updatedAt @map("updated_at")

  merchant Merchant    @relation(fields: [merchantId], references: [id], onDelete: Cascade)
  customer User?       @relation(fields: [customerId], references: [id], onDelete: SetNull)
  items    CartItem[]
  events   CartEvent[]
  orders   Order[]

  @@index([merchantId, status])
  @@index([merchantId, customerId])
  @@map("carts")
}

model CartItem {
  id               String   @id @default(cuid())
  cartId           String   @map("cart_id")
  productId        String   @map("product_id")
  quantity         Int      @default(1)
  priceAtTimePaise Int      @map("price_at_time_paise")
  createdAt        DateTime @default(now()) @map("created_at")

  cart    Cart    @relation(fields: [cartId], references: [id], onDelete: Cascade)
  product Product @relation(fields: [productId], references: [id], onDelete: Restrict)

  @@unique([cartId, productId])
  @@index([cartId])
  @@map("cart_items")
}

model CartEvent {
  id        String        @id @default(cuid())
  cartId    String        @map("cart_id")
  eventType CartEventType @map("event_type")
  metadata  Json          @default("{}")
  createdAt DateTime      @default(now()) @map("created_at")

  cart Cart @relation(fields: [cartId], references: [id], onDelete: Cascade)

  @@index([cartId, eventType])
  @@index([eventType, createdAt])
  @@map("cart_events")
}

model Order {
  id              String      @id @default(cuid())
  merchantId      String      @map("merchant_id")
  customerId      String?     @map("customer_id")
  cartId          String?     @map("cart_id")
  razorpayOrderId String?     @unique @map("razorpay_order_id")
  status          OrderStatus @default(created)
  source          OrderSource @default(human)
  subtotalInPaise Int         @map("subtotal_in_paise")
  totalInPaise    Int         @map("total_in_paise")
  currency        String      @default("INR")
  idempotencyKey  String?     @unique @map("idempotency_key")
  createdAt       DateTime    @default(now()) @map("created_at")
  updatedAt       DateTime    @updatedAt @map("updated_at")

  merchant Merchant    @relation(fields: [merchantId], references: [id], onDelete: Cascade)
  customer User?       @relation(fields: [customerId], references: [id], onDelete: SetNull)
  cart     Cart?       @relation(fields: [cartId], references: [id], onDelete: SetNull)
  items    OrderItem[]
  payments Payment[]

  @@index([merchantId, status])
  @@index([merchantId, source])
  @@index([merchantId, createdAt])
  @@map("orders")
}

model OrderItem {
  id               String @id @default(cuid())
  orderId          String @map("order_id")
  productId        String @map("product_id")
  quantity         Int
  unitPriceInPaise Int    @map("unit_price_in_paise")

  order   Order   @relation(fields: [orderId], references: [id], onDelete: Cascade)
  product Product @relation(fields: [productId], references: [id], onDelete: Restrict)

  @@index([orderId])
  @@map("order_items")
}

model Payment {
  id                String        @id @default(cuid())
  orderId           String        @map("order_id")
  razorpayPaymentId String?       @unique @map("razorpay_payment_id")
  status            PaymentStatus @default(created)
  method            String?
  amountInPaise     Int           @map("amount_in_paise")
  errorCode         String?       @map("error_code")
  errorDescription  String?       @map("error_description")
  capturedAt        DateTime?     @map("captured_at")
  createdAt         DateTime      @default(now()) @map("created_at")

  order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([orderId])
  @@map("payments")
}

model Campaign {
  id               String         @id @default(cuid())
  merchantId       String         @map("merchant_id")
  type             String
  name             String
  status           CampaignStatus @default(proposed)
  targetDefinition Json           @default("{}") @map("target_definition")
  content          String
  createdByAgent   String?        @map("created_by_agent")
  approvedBy       String?        @map("approved_by")
  createdAt        DateTime       @default(now()) @map("created_at")
  updatedAt        DateTime       @updatedAt @map("updated_at")

  merchant Merchant @relation(fields: [merchantId], references: [id], onDelete: Cascade)

  @@index([merchantId, status])
  @@map("campaigns")
}

model AgentRun {
  id            String         @id @default(cuid())
  merchantId    String         @map("merchant_id")
  sessionId     String?        @map("session_id")
  agentName     String         @map("agent_name")
  trigger       String
  inputSummary  String         @map("input_summary")
  outputSummary String?        @map("output_summary")
  status        AgentRunStatus @default(running)
  startedAt     DateTime       @default(now()) @map("started_at")
  completedAt   DateTime?      @map("completed_at")

  merchant Merchant      @relation(fields: [merchantId], references: [id], onDelete: Cascade)
  actions  AgentAction[]

  @@index([merchantId, startedAt])
  @@map("agent_runs")
}

model AgentAction {
  id               String   @id @default(cuid())
  agentRunId       String   @map("agent_run_id")
  actionType       String   @map("action_type")
  parameters       Json     @default("{}")
  policyDecision   String?  @map("policy_decision")
  approvalRequired Boolean  @default(false) @map("approval_required")
  approvalStatus   String?  @map("approval_status")
  result           Json     @default("{}")
  createdAt        DateTime @default(now()) @map("created_at")

  agentRun AgentRun @relation(fields: [agentRunId], references: [id], onDelete: Cascade)

  @@index([agentRunId])
  @@map("agent_actions")
}

model KnowledgeChunk {
  id         String                      @id @default(cuid())
  merchantId String                      @map("merchant_id")
  docType    String                      @map("doc_type")
  content    String
  embedding  Unsupported("vector(384)")?
  metadata   Json                        @default("{}")
  createdAt  DateTime                    @default(now()) @map("created_at")

  merchant Merchant @relation(fields: [merchantId], references: [id], onDelete: Cascade)

  @@index([merchantId, docType])
  @@map("knowledge_chunks")
}
```

- [ ] **Step 6: Run the migration**

```bash
npx prisma migrate dev --name init_foundation
```

Expected: creates `db/migrations/<timestamp>_init_foundation/migration.sql` and applies it. If it fails with `type "vector" does not exist`, enable the extension in the Supabase SQL editor first — `CREATE EXTENSION IF NOT EXISTS vector;` — then re-run.

- [ ] **Step 7: Add the vector similarity index**

Prisma cannot express an ivfflat index, so add it as a hand-written migration. Day 4's RAG retrieval needs it, and it costs nothing to add now.

```bash
npx prisma migrate dev --create-only --name knowledge_chunks_vector_index
```

Open the generated `migration.sql` and replace its contents with:

```sql
CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx
  ON knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 10);
```

Then apply it: `npx prisma migrate dev`

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm test -- db/schema.test.ts`

Expected: PASS, 5 tests.

- [ ] **Step 9: Verify and commit**

```bash
npm run typecheck && npm run lint && npm test
git add -A
git commit -m "feat(db): full schema with pgvector and integer-paise money columns"
```

---

## Task 3: Idempotent seed data

**Files:**
- Create: `db/seed-data.ts`
- Create: `db/seed.ts`
- Create: `db/seed.test.ts`

**Interfaces:**
- Consumes: `prisma` from `lib/db.ts` (Task 2); all Prisma model types.
- Produces: `MERCHANT_SLUG` (`"urban-store"`), `MERCHANT_NAME`, `SEED_PRODUCTS` (array of 9 `SeedProduct`), `SEED_RELATIONS` (array of 9 `SeedRelation`), and the async function `seed(): Promise<void>` exported from `db/seed.ts`. Later tasks rely on the product slugs `thinkpad-x`, `dell-xps-13`, `macbook-air-m3`, `monitor-27-4k`, `mechanical-keyboard`, `wireless-mouse`, `usb-c-hub`, `laptop-sleeve-14`, `noise-cancel-headset`, and on the categories `Laptops`, `Monitors`, `Accessories`, `Audio`.

- [ ] **Step 1: Write the seed data constants**

Create `db/seed-data.ts`. Prices come from `PRD.md` §8, converted to paise (₹74,999 → 7499900).

```typescript
export const MERCHANT_SLUG = "urban-store";
export const MERCHANT_NAME = "Urban Store";

export type SeedProduct = {
  slug: string;
  name: string;
  category: string;
  priceInPaise: number;
  stock: number;
  sku: string;
  description: string;
  specifications: Record<string, string>;
};

export const SEED_PRODUCTS: SeedProduct[] = [
  {
    slug: "thinkpad-x",
    name: "ThinkPad X",
    category: "Laptops",
    priceInPaise: 7_499_900,
    stock: 12,
    sku: "US-LAP-TPX",
    description:
      "A 14-inch business laptop built for long days: spill-resistant keyboard, MIL-STD chassis, all-day battery.",
    specifications: { cpu: "Intel Core i7", ram: "16GB", storage: "512GB SSD", screen: "14 inch" },
  },
  {
    slug: "dell-xps-13",
    name: "Dell XPS 13",
    category: "Laptops",
    priceInPaise: 9_499_900,
    stock: 7,
    sku: "US-LAP-XPS13",
    description:
      "Near-borderless 13.4-inch display in an aluminium chassis under 1.2kg. The travel laptop.",
    specifications: { cpu: "Intel Core i7", ram: "16GB", storage: "1TB SSD", screen: "13.4 inch" },
  },
  {
    slug: "macbook-air-m3",
    name: "MacBook Air M3",
    category: "Laptops",
    priceInPaise: 8_999_900,
    stock: 9,
    sku: "US-LAP-MBA-M3",
    description:
      "Fanless, silent, and 18 hours of battery. The M3 chip handles serious work without heat.",
    specifications: { cpu: "Apple M3", ram: "16GB", storage: "512GB SSD", screen: "13.6 inch" },
  },
  {
    slug: "monitor-27-4k",
    name: '27" 4K Monitor',
    category: "Monitors",
    priceInPaise: 1_899_900,
    stock: 15,
    sku: "US-MON-27-4K",
    description:
      "27-inch 4K IPS panel with 95% DCI-P3 coverage and a single-cable USB-C connection.",
    specifications: { resolution: "3840x2160", panel: "IPS", refresh: "60Hz", ports: "USB-C, HDMI 2.0" },
  },
  {
    slug: "mechanical-keyboard",
    name: "Mechanical Keyboard",
    category: "Accessories",
    priceInPaise: 399_900,
    stock: 30,
    sku: "US-ACC-KB-MECH",
    description:
      "Hot-swappable 75% mechanical keyboard with tactile brown switches and PBT keycaps.",
    specifications: { layout: "75%", switches: "Tactile Brown", connection: "USB-C + Bluetooth" },
  },
  {
    slug: "wireless-mouse",
    name: "Wireless Mouse",
    category: "Accessories",
    priceInPaise: 129_900,
    stock: 40,
    sku: "US-ACC-MOUSE-WL",
    description: "Silent-click wireless mouse with a 70-day battery and a 4000 DPI sensor.",
    specifications: { dpi: "4000", connection: "2.4GHz + Bluetooth", battery: "70 days" },
  },
  {
    slug: "usb-c-hub",
    name: "USB-C Hub",
    category: "Accessories",
    priceInPaise: 249_900,
    stock: 25,
    sku: "US-ACC-HUB-USBC",
    description:
      "7-in-1 USB-C hub: 100W pass-through charging, 4K HDMI, SD card reader, and 3 USB-A ports.",
    specifications: { ports: "7", passthrough: "100W", hdmi: "4K@60Hz" },
  },
  {
    slug: "laptop-sleeve-14",
    name: 'Laptop Sleeve 14"',
    category: "Accessories",
    priceInPaise: 149_900,
    stock: 35,
    sku: "US-ACC-SLEEVE-14",
    description: "Water-resistant felt sleeve with a fleece lining, sized for 14-inch laptops.",
    specifications: { fits: "14 inch", material: "Wool felt", pockets: "1 external" },
  },
  {
    slug: "noise-cancel-headset",
    name: "Noise-cancel Headset",
    category: "Audio",
    priceInPaise: 699_900,
    stock: 18,
    sku: "US-AUD-ANC-HS",
    description: "Over-ear ANC headset with a boom mic, 40-hour battery, and multipoint pairing.",
    specifications: { anc: "Hybrid", battery: "40 hours", mic: "Detachable boom" },
  },
];

export type SeedRelation = {
  productSlug: string;
  relatedProductSlug: string;
  relationType: string;
  score: number;
};

/** Cross-sell map from PRD.md section 8. */
export const SEED_RELATIONS: SeedRelation[] = [
  { productSlug: "thinkpad-x", relatedProductSlug: "usb-c-hub", relationType: "accessory", score: 0.9 },
  { productSlug: "thinkpad-x", relatedProductSlug: "laptop-sleeve-14", relationType: "accessory", score: 0.85 },
  { productSlug: "thinkpad-x", relatedProductSlug: "wireless-mouse", relationType: "accessory", score: 0.8 },
  { productSlug: "macbook-air-m3", relatedProductSlug: "usb-c-hub", relationType: "accessory", score: 0.9 },
  { productSlug: "macbook-air-m3", relatedProductSlug: "laptop-sleeve-14", relationType: "accessory", score: 0.85 },
  { productSlug: "dell-xps-13", relatedProductSlug: "usb-c-hub", relationType: "accessory", score: 0.9 },
  { productSlug: "dell-xps-13", relatedProductSlug: "noise-cancel-headset", relationType: "accessory", score: 0.75 },
  { productSlug: "monitor-27-4k", relatedProductSlug: "mechanical-keyboard", relationType: "accessory", score: 0.85 },
  { productSlug: "monitor-27-4k", relatedProductSlug: "wireless-mouse", relationType: "accessory", score: 0.8 },
];
```

- [ ] **Step 2: Write the failing seed test**

Create `db/seed.test.ts`.

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { seed } from "./seed";
import { MERCHANT_SLUG, SEED_PRODUCTS, SEED_RELATIONS } from "./seed-data";

beforeAll(async () => {
  await seed();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("seed", () => {
  it("creates the Urban Store merchant", async () => {
    const merchant = await prisma.merchant.findUnique({ where: { slug: MERCHANT_SLUG } });
    expect(merchant).not.toBeNull();
    expect(merchant?.name).toBe("Urban Store");
  });

  it("creates all nine products with prices in paise", async () => {
    const merchant = await prisma.merchant.findUniqueOrThrow({ where: { slug: MERCHANT_SLUG } });
    const products = await prisma.product.findMany({ where: { merchantId: merchant.id } });
    expect(products).toHaveLength(SEED_PRODUCTS.length);

    const thinkpad = products.find((p) => p.slug === "thinkpad-x");
    expect(thinkpad?.priceInPaise).toBe(7_499_900);
    expect(Number.isInteger(thinkpad?.priceInPaise)).toBe(true);
  });

  it("creates the cross-sell relations", async () => {
    const merchant = await prisma.merchant.findUniqueOrThrow({ where: { slug: MERCHANT_SLUG } });
    const relations = await prisma.productRelation.findMany({ where: { merchantId: merchant.id } });
    expect(relations).toHaveLength(SEED_RELATIONS.length);
  });

  it("creates prior paid orders so the dashboard is not empty", async () => {
    const merchant = await prisma.merchant.findUniqueOrThrow({ where: { slug: MERCHANT_SLUG } });
    const orders = await prisma.order.findMany({
      where: { merchantId: merchant.id, status: "paid" },
    });
    expect(orders.length).toBeGreaterThanOrEqual(2);
  });

  it("creates abandoned carts, each with items and an abandoned event", async () => {
    const merchant = await prisma.merchant.findUniqueOrThrow({ where: { slug: MERCHANT_SLUG } });
    const carts = await prisma.cart.findMany({
      where: { merchantId: merchant.id, status: "abandoned" },
      include: { events: true, items: true },
    });
    expect(carts.length).toBeGreaterThanOrEqual(3);
    for (const cart of carts) {
      expect(cart.items.length).toBeGreaterThan(0);
      expect(cart.events.some((e) => e.eventType === "abandoned")).toBe(true);
    }
  });

  it("is idempotent — running twice does not duplicate rows", async () => {
    await seed();
    const merchant = await prisma.merchant.findUniqueOrThrow({ where: { slug: MERCHANT_SLUG } });
    const [products, relations, carts] = await Promise.all([
      prisma.product.count({ where: { merchantId: merchant.id } }),
      prisma.productRelation.count({ where: { merchantId: merchant.id } }),
      prisma.cart.count({ where: { merchantId: merchant.id, status: "abandoned" } }),
    ]);
    expect(products).toBe(SEED_PRODUCTS.length);
    expect(relations).toBe(SEED_RELATIONS.length);
    expect(carts).toBe(3);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- db/seed.test.ts`

Expected: FAIL — `Failed to resolve import "./seed"`.

- [ ] **Step 4: Implement the seed script**

Create `db/seed.ts`. Idempotency comes from `upsert` on natural keys and from deterministic `idempotencyKey` / `sessionId` values — never `createMany`, which would duplicate on a second run.

```typescript
import { prisma } from "@/lib/db";
import {
  MERCHANT_NAME,
  MERCHANT_SLUG,
  SEED_PRODUCTS,
  SEED_RELATIONS,
} from "./seed-data";

export async function seed(): Promise<void> {
  const merchant = await prisma.merchant.upsert({
    where: { slug: MERCHANT_SLUG },
    update: { name: MERCHANT_NAME },
    create: { slug: MERCHANT_SLUG, name: MERCHANT_NAME },
  });

  for (const p of SEED_PRODUCTS) {
    await prisma.product.upsert({
      where: { merchantId_slug: { merchantId: merchant.id, slug: p.slug } },
      update: {
        name: p.name,
        category: p.category,
        priceInPaise: p.priceInPaise,
        stock: p.stock,
        sku: p.sku,
        description: p.description,
        specifications: p.specifications,
        active: true,
      },
      create: {
        merchantId: merchant.id,
        slug: p.slug,
        name: p.name,
        category: p.category,
        priceInPaise: p.priceInPaise,
        stock: p.stock,
        sku: p.sku,
        description: p.description,
        specifications: p.specifications,
      },
    });
  }

  const products = await prisma.product.findMany({ where: { merchantId: merchant.id } });
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const need = (slug: string) => {
    const found = bySlug.get(slug);
    if (!found) throw new Error(`Seed error: product "${slug}" was not created`);
    return found;
  };

  for (const r of SEED_RELATIONS) {
    const product = need(r.productSlug);
    const related = need(r.relatedProductSlug);
    await prisma.productRelation.upsert({
      where: {
        productId_relatedProductId_relationType: {
          productId: product.id,
          relatedProductId: related.id,
          relationType: r.relationType,
        },
      },
      update: { score: r.score },
      create: {
        merchantId: merchant.id,
        productId: product.id,
        relatedProductId: related.id,
        relationType: r.relationType,
        score: r.score,
      },
    });
  }

  // A demo customer that prior orders and abandoned carts belong to.
  const demoCustomer = await prisma.user.upsert({
    where: { email: "rahul@urbanstore.demo" },
    update: {},
    create: {
      clerkId: "seed_demo_customer",
      email: "rahul@urbanstore.demo",
      role: "customer",
      merchantId: merchant.id,
    },
  });

  // Two prior paid orders, so the Day 7 dashboard has revenue to show —
  // one human, one ai_buyer, so AI-attributed revenue is non-zero too.
  const priorOrders = [
    {
      key: "seed-order-1",
      source: "human" as const,
      items: [{ slug: "macbook-air-m3", qty: 1 }, { slug: "usb-c-hub", qty: 1 }],
    },
    {
      key: "seed-order-2",
      source: "ai_buyer" as const,
      items: [{ slug: "monitor-27-4k", qty: 1 }, { slug: "mechanical-keyboard", qty: 1 }],
    },
  ];

  for (const o of priorOrders) {
    const existing = await prisma.order.findUnique({ where: { idempotencyKey: o.key } });
    if (existing) continue;

    const subtotal = o.items.reduce(
      (sum, i) => sum + need(i.slug).priceInPaise * i.qty,
      0,
    );

    await prisma.order.create({
      data: {
        merchantId: merchant.id,
        customerId: demoCustomer.id,
        idempotencyKey: o.key,
        razorpayOrderId: `order_seed_${o.key}`,
        status: "paid",
        source: o.source,
        subtotalInPaise: subtotal,
        totalInPaise: subtotal,
        items: {
          create: o.items.map((i) => ({
            productId: need(i.slug).id,
            quantity: i.qty,
            unitPriceInPaise: need(i.slug).priceInPaise,
          })),
        },
        payments: {
          create: {
            razorpayPaymentId: `pay_seed_${o.key}`,
            status: "captured",
            method: "card",
            amountInPaise: subtotal,
            capturedAt: new Date(),
          },
        },
      },
    });
  }

  // Three abandoned carts, so the Day 8 campaign agent has something to act on.
  const abandonedCarts = [
    { session: "seed-abandoned-1", items: [{ slug: "thinkpad-x", qty: 1 }] },
    {
      session: "seed-abandoned-2",
      items: [{ slug: "dell-xps-13", qty: 1 }, { slug: "noise-cancel-headset", qty: 1 }],
    },
    { session: "seed-abandoned-3", items: [{ slug: "monitor-27-4k", qty: 2 }] },
  ];

  for (const c of abandonedCarts) {
    const existing = await prisma.cart.findFirst({
      where: { merchantId: merchant.id, sessionId: c.session },
    });
    if (existing) continue;

    const total = c.items.reduce(
      (sum, i) => sum + need(i.slug).priceInPaise * i.qty,
      0,
    );

    await prisma.cart.create({
      data: {
        merchantId: merchant.id,
        sessionId: c.session,
        status: "abandoned",
        totalInPaise: total,
        items: {
          create: c.items.map((i) => ({
            productId: need(i.slug).id,
            quantity: i.qty,
            priceAtTimePaise: need(i.slug).priceInPaise,
          })),
        },
        events: {
          create: [
            { eventType: "checkout_started", metadata: { seeded: true } },
            { eventType: "abandoned", metadata: { seeded: true, reason: "left_checkout" } },
          ],
        },
      },
    });
  }
}

// Only runs when invoked directly via `npm run db:seed`, not on import from tests.
if (process.argv[1]?.includes("seed")) {
  seed()
    .then(() => console.log("Seed complete."))
    .catch((error) => {
      console.error("Seed failed:", error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- db/seed.test.ts`

Expected: PASS, 6 tests. The idempotency test is the important one — if it fails with counts like 18 instead of 9, an `upsert` is keyed on the wrong field.

- [ ] **Step 6: Run the seed as a script and eyeball the data**

```bash
npm run db:seed
npx prisma studio --schema db/schema.prisma
```

Expected: `Seed complete.` In Studio, confirm `products` has 9 rows and `price_in_paise` shows `7499900` for ThinkPad X — not `74999` and not `74999.00`.

- [ ] **Step 7: Verify and commit**

```bash
npm run typecheck && npm run lint && npm test
git add -A
git commit -m "feat(db): idempotent seed for catalog, relations, prior orders, abandoned carts"
```

---

## Task 4: Clerk auth, roles, and merchant-scoped session context

**Files:**
- Create: `middleware.ts`
- Create: `auth/sync.ts`
- Create: `auth/session.ts`
- Create: `auth/session.test.ts`
- Create: `app/sign-in/[[...sign-in]]/page.tsx`
- Create: `app/sign-up/[[...sign-up]]/page.tsx`
- Modify: `app/layout.tsx` (wrap in `ClerkProvider`)

**Interfaces:**
- Consumes: `prisma` from `lib/db.ts` (Task 2), `env` from `lib/env.ts` (Task 1), `MERCHANT_SLUG` from `db/seed-data.ts` (Task 3).
- Produces:
  - `type SessionContext = { userId: string; clerkId: string; email: string; merchantId: string; role: "customer" | "merchant_admin" }`
  - `resolveSessionContext(clerkId: string | null, getUser: () => Promise<ClerkUserLike | null>): Promise<SessionContext | null>` — the pure, testable core.
  - `getSessionContext(): Promise<SessionContext | null>` — the Next.js-bound wrapper used by pages.
  - `requireSessionContext(): Promise<SessionContext>` — throws/redirects when signed out.
  - `requireMerchantAdmin(): Promise<SessionContext>` — throws when role is not `merchant_admin`.
  - `type ClerkUserLike = { id: string; primaryEmail: string | null }`

- [ ] **Step 1: Install Clerk**

```bash
npm i @clerk/nextjs
```

- [ ] **Step 2: Write the failing session test**

Create `auth/session.test.ts`. This tests `resolveSessionContext`, which takes its Clerk data as arguments — that is what makes it testable without mocking Next.js internals.

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { resolveSessionContext } from "./session";
import { seed } from "@/db/seed";
import { MERCHANT_SLUG } from "@/db/seed-data";
import { env } from "@/lib/env";

const CUSTOMER_CLERK_ID = "test_clerk_customer";
const ADMIN_CLERK_ID = "test_clerk_admin";

beforeAll(async () => {
  await seed();
});

afterAll(async () => {
  await prisma.user.deleteMany({
    where: { clerkId: { in: [CUSTOMER_CLERK_ID, ADMIN_CLERK_ID] } },
  });
  await prisma.$disconnect();
});

describe("resolveSessionContext", () => {
  it("returns null when there is no signed-in user", async () => {
    const ctx = await resolveSessionContext(null, async () => null);
    expect(ctx).toBeNull();
  });

  it("creates a local user row on first sign-in and defaults to customer", async () => {
    const ctx = await resolveSessionContext(CUSTOMER_CLERK_ID, async () => ({
      id: CUSTOMER_CLERK_ID,
      primaryEmail: "shopper@example.com",
    }));

    expect(ctx).not.toBeNull();
    expect(ctx!.role).toBe("customer");
    expect(ctx!.email).toBe("shopper@example.com");

    const merchant = await prisma.merchant.findUniqueOrThrow({ where: { slug: MERCHANT_SLUG } });
    expect(ctx!.merchantId).toBe(merchant.id);
  });

  it("promotes the configured merchant admin email to merchant_admin", async () => {
    const ctx = await resolveSessionContext(ADMIN_CLERK_ID, async () => ({
      id: ADMIN_CLERK_ID,
      primaryEmail: env.MERCHANT_ADMIN_EMAIL,
    }));

    expect(ctx!.role).toBe("merchant_admin");
  });

  it("is idempotent — a second sign-in reuses the same user row", async () => {
    const first = await resolveSessionContext(CUSTOMER_CLERK_ID, async () => ({
      id: CUSTOMER_CLERK_ID,
      primaryEmail: "shopper@example.com",
    }));
    const second = await resolveSessionContext(CUSTOMER_CLERK_ID, async () => ({
      id: CUSTOMER_CLERK_ID,
      primaryEmail: "shopper@example.com",
    }));

    expect(second!.userId).toBe(first!.userId);
    const count = await prisma.user.count({ where: { clerkId: CUSTOMER_CLERK_ID } });
    expect(count).toBe(1);
  });

  it("returns null when Clerk has a session but no email on the user", async () => {
    const ctx = await resolveSessionContext("test_clerk_noemail", async () => ({
      id: "test_clerk_noemail",
      primaryEmail: null,
    }));
    expect(ctx).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- auth/session.test.ts`

Expected: FAIL — `Failed to resolve import "./session"`.

- [ ] **Step 4: Implement the user sync layer**

Create `auth/sync.ts`. The local `users` table is the source of truth for role; the merchant admin is decided by matching `MERCHANT_ADMIN_EMAIL`.

```typescript
import type { User, UserRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { MERCHANT_SLUG } from "@/db/seed-data";

/** The shape this module needs from Clerk — kept minimal so it is easy to fake in tests. */
export type ClerkUserLike = {
  id: string;
  primaryEmail: string | null;
};

function roleForEmail(email: string): UserRole {
  return email.toLowerCase() === env.MERCHANT_ADMIN_EMAIL.toLowerCase()
    ? "merchant_admin"
    : "customer";
}

/**
 * Just-in-time upsert of a Clerk identity into the local users table.
 * Returns null when the Clerk user has no usable email address.
 */
export async function syncUser(clerkUser: ClerkUserLike): Promise<User | null> {
  if (!clerkUser.primaryEmail) return null;

  const merchant = await prisma.merchant.findUnique({ where: { slug: MERCHANT_SLUG } });
  if (!merchant) {
    throw new Error(
      `Merchant "${MERCHANT_SLUG}" not found. Run \`npm run db:seed\` before signing in.`,
    );
  }

  const role = roleForEmail(clerkUser.primaryEmail);

  return prisma.user.upsert({
    where: { clerkId: clerkUser.id },
    update: { email: clerkUser.primaryEmail, role },
    create: {
      clerkId: clerkUser.id,
      email: clerkUser.primaryEmail,
      role,
      merchantId: merchant.id,
    },
  });
}
```

- [ ] **Step 5: Implement the session context**

Create `auth/session.ts`:

```typescript
import { auth, currentUser } from "@clerk/nextjs/server";
import type { UserRole } from "@prisma/client";
import { syncUser, type ClerkUserLike } from "./sync";

export type SessionContext = {
  userId: string;
  clerkId: string;
  email: string;
  merchantId: string;
  role: UserRole;
};

/**
 * Pure core: takes the Clerk id and a loader for the Clerk user, so it can be
 * tested without Next.js request context.
 */
export async function resolveSessionContext(
  clerkId: string | null,
  loadClerkUser: () => Promise<ClerkUserLike | null>,
): Promise<SessionContext | null> {
  if (!clerkId) return null;

  const clerkUser = await loadClerkUser();
  if (!clerkUser) return null;

  const user = await syncUser(clerkUser);
  if (!user) return null;

  return {
    userId: user.id,
    clerkId: user.clerkId,
    email: user.email,
    merchantId: user.merchantId,
    role: user.role,
  };
}

/** Next.js-bound wrapper. Use this from server components and route handlers. */
export async function getSessionContext(): Promise<SessionContext | null> {
  const { userId } = await auth();
  return resolveSessionContext(userId, async () => {
    const user = await currentUser();
    if (!user) return null;
    return {
      id: user.id,
      primaryEmail: user.primaryEmailAddress?.emailAddress ?? null,
    };
  });
}

export class UnauthorizedError extends Error {
  constructor(message = "You must be signed in to do that.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "You do not have access to that.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export async function requireSessionContext(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) throw new UnauthorizedError();
  return ctx;
}

export async function requireMerchantAdmin(): Promise<SessionContext> {
  const ctx = await requireSessionContext();
  if (ctx.role !== "merchant_admin") throw new ForbiddenError();
  return ctx;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- auth/session.test.ts`

Expected: PASS, 5 tests.

- [ ] **Step 7: Add the Clerk middleware**

Create `middleware.ts` at the repo root. `/shop` is public so the catalog is browsable signed-out; `/merchant` is protected now so Day 7 has nothing to retrofit.

```typescript
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher(["/merchant(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next internals and static files, but always run on API routes.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
```

- [ ] **Step 8: Wrap the app in ClerkProvider**

Replace `app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "Urban Store",
  description: "An AI-native electronics store where humans and agents can both shop.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="min-h-screen bg-background text-foreground antialiased">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
```

- [ ] **Step 9: Add the sign-in and sign-up pages**

Create `app/sign-in/[[...sign-in]]/page.tsx`:

```tsx
import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <SignIn />
    </main>
  );
}
```

Create `app/sign-up/[[...sign-up]]/page.tsx`:

```tsx
import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <SignUp />
    </main>
  );
}
```

- [ ] **Step 10: Manually verify sign-up end to end**

Run `npm run dev`, then:
1. Visit http://localhost:3000/sign-up and register with the email in `MERCHANT_ADMIN_EMAIL`.
2. Visit http://localhost:3000/shop (it will 404 until Task 6 — that is expected here).
3. Open Prisma Studio and confirm a `users` row exists with `role = merchant_admin` and a `merchant_id` pointing at Urban Store.

If no row appears, the sync has not been triggered yet — it runs on the first call to `getSessionContext()`, which Task 7's header will make on every page.

- [ ] **Step 11: Verify and commit**

```bash
npm run typecheck && npm run lint && npm test
git add -A
git commit -m "feat(auth): clerk sessions with jit user sync and merchant-scoped context"
```

---

## Task 5: Money formatting and merchant-scoped product queries

**Files:**
- Create: `lib/money.ts`
- Create: `lib/money.test.ts`
- Create: `types/product.ts`
- Create: `db/queries/products.ts`
- Create: `db/queries/products.test.ts`

**Interfaces:**
- Consumes: `prisma` from `lib/db.ts` (Task 2); seed data from Task 3.
- Produces:
  - `formatPaise(paise: number): string` — e.g. `7499900` → `"₹74,999"`.
  - `paiseToRupees(paise: number): number`
  - `type ProductListItem = { id, slug, name, category, priceInPaise, stock, imageUrl }`
  - `type ProductDetail = ProductListItem & { description, specifications, sku }`
  - `productQuerySchema` — Zod schema for `{ category?: string; q?: string }`
  - `listProducts(merchantId: string, filters: ProductQuery): Promise<ProductListItem[]>`
  - `listCategories(merchantId: string): Promise<string[]>`
  - `getProductBySlug(merchantId: string, slug: string): Promise<ProductDetail | null>`

- [ ] **Step 1: Write the failing money test**

Create `lib/money.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { formatPaise, paiseToRupees } from "./money";

describe("formatPaise", () => {
  it("formats whole rupees without decimals", () => {
    expect(formatPaise(7_499_900)).toBe("₹74,999");
  });

  it("uses the Indian digit grouping", () => {
    expect(formatPaise(100_000_000)).toBe("₹1,00,000");
  });

  it("shows paise when the amount is not a whole rupee", () => {
    expect(formatPaise(129_950)).toBe("₹1,299.50");
  });

  it("formats zero", () => {
    expect(formatPaise(0)).toBe("₹0");
  });

  it("throws on a non-integer, since paise are always whole", () => {
    expect(() => formatPaise(1299.5)).toThrow(/integer/i);
  });
});

describe("paiseToRupees", () => {
  it("divides by one hundred", () => {
    expect(paiseToRupees(7_499_900)).toBe(74_999);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/money.test.ts`

Expected: FAIL — `Failed to resolve import "./money"`.

- [ ] **Step 3: Implement money formatting**

Create `lib/money.ts`:

```typescript
/**
 * Money is stored and transported as integer paise. This module is the only
 * place it becomes a display string. Never do arithmetic on formatted output.
 */

export function paiseToRupees(paise: number): number {
  assertIntegerPaise(paise);
  return paise / 100;
}

export function formatPaise(paise: number): string {
  assertIntegerPaise(paise);
  const hasFraction = paise % 100 !== 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  }).format(paise / 100);
}

function assertIntegerPaise(paise: number): void {
  if (!Number.isInteger(paise)) {
    throw new Error(`Expected an integer paise amount, received ${paise}`);
  }
}
```

- [ ] **Step 4: Run the money test to verify it passes**

Run: `npm test -- lib/money.test.ts`

Expected: PASS, 6 tests. If the grouping assertions fail, your Node build may lack full ICU — check `process.versions.icu` and install `full-icu` if it is missing.

- [ ] **Step 5: Write the failing product-query test**

Create `db/queries/products.test.ts`. The isolation test is the important one: it proves a second merchant's products never leak into Urban Store's results.

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { seed } from "@/db/seed";
import { MERCHANT_SLUG } from "@/db/seed-data";
import { listProducts, listCategories, getProductBySlug } from "./products";

const OTHER_SLUG = "test-rival-store";
let merchantId: string;
let otherMerchantId: string;

beforeAll(async () => {
  await seed();
  const merchant = await prisma.merchant.findUniqueOrThrow({ where: { slug: MERCHANT_SLUG } });
  merchantId = merchant.id;

  const other = await prisma.merchant.upsert({
    where: { slug: OTHER_SLUG },
    update: {},
    create: { slug: OTHER_SLUG, name: "Rival Store" },
  });
  otherMerchantId = other.id;

  await prisma.product.upsert({
    where: { merchantId_slug: { merchantId: otherMerchantId, slug: "thinkpad-x" } },
    update: {},
    create: {
      merchantId: otherMerchantId,
      slug: "thinkpad-x",
      name: "Rival ThinkPad X",
      category: "Laptops",
      priceInPaise: 1_000_000,
      stock: 5,
      sku: "RIVAL-TPX",
    },
  });
});

afterAll(async () => {
  await prisma.merchant.delete({ where: { id: otherMerchantId } });
  await prisma.$disconnect();
});

describe("listProducts", () => {
  it("returns only the requested merchant's products", async () => {
    const products = await listProducts(merchantId, {});
    expect(products).toHaveLength(9);
    expect(products.every((p) => p.name !== "Rival ThinkPad X")).toBe(true);
  });

  it("filters by category", async () => {
    const laptops = await listProducts(merchantId, { category: "Laptops" });
    expect(laptops).toHaveLength(3);
    expect(laptops.every((p) => p.category === "Laptops")).toBe(true);
  });

  it("searches by name, case-insensitively", async () => {
    const results = await listProducts(merchantId, { q: "thinkpad" });
    expect(results).toHaveLength(1);
    expect(results[0].slug).toBe("thinkpad-x");
  });

  it("returns an empty array when nothing matches, never throws", async () => {
    const results = await listProducts(merchantId, { q: "zzzznothing" });
    expect(results).toEqual([]);
  });

  it("excludes inactive products", async () => {
    await prisma.product.update({
      where: { merchantId_slug: { merchantId, slug: "wireless-mouse" } },
      data: { active: false },
    });
    const products = await listProducts(merchantId, {});
    expect(products.some((p) => p.slug === "wireless-mouse")).toBe(false);

    await prisma.product.update({
      where: { merchantId_slug: { merchantId, slug: "wireless-mouse" } },
      data: { active: true },
    });
  });
});

describe("listCategories", () => {
  it("returns the merchant's distinct categories, sorted", async () => {
    const categories = await listCategories(merchantId);
    expect(categories).toEqual(["Accessories", "Audio", "Laptops", "Monitors"]);
  });
});

describe("getProductBySlug", () => {
  it("returns the product detail for the correct merchant", async () => {
    const product = await getProductBySlug(merchantId, "thinkpad-x");
    expect(product?.name).toBe("ThinkPad X");
    expect(product?.priceInPaise).toBe(7_499_900);
    expect(product?.specifications).toMatchObject({ ram: "16GB" });
  });

  it("does not return another merchant's product with the same slug", async () => {
    const product = await getProductBySlug(otherMerchantId, "thinkpad-x");
    expect(product?.name).toBe("Rival ThinkPad X");
  });

  it("returns null for an unknown slug rather than throwing", async () => {
    expect(await getProductBySlug(merchantId, "does-not-exist")).toBeNull();
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm test -- db/queries/products.test.ts`

Expected: FAIL — `Failed to resolve import "./products"`.

- [ ] **Step 7: Define the shared product types**

Create `types/product.ts`:

```typescript
import { z } from "zod";

export const productQuerySchema = z.object({
  category: z.string().min(1).max(64).optional(),
  q: z.string().min(1).max(128).optional(),
});

export type ProductQuery = z.infer<typeof productQuerySchema>;

export type ProductListItem = {
  id: string;
  slug: string;
  name: string;
  category: string;
  priceInPaise: number;
  stock: number;
  imageUrl: string | null;
};

export type ProductDetail = ProductListItem & {
  sku: string;
  description: string | null;
  specifications: Record<string, string>;
};
```

- [ ] **Step 8: Implement the product queries**

Create `db/queries/products.ts`. Note that `merchantId` is the first parameter of every function and is always in the `where` clause — that is the structural form of CLAUDE.md safety rule 6.

```typescript
import { prisma } from "@/lib/db";
import type {
  ProductDetail,
  ProductListItem,
  ProductQuery,
} from "@/types/product";

const LIST_FIELDS = {
  id: true,
  slug: true,
  name: true,
  category: true,
  priceInPaise: true,
  stock: true,
  imageUrl: true,
} as const;

export async function listProducts(
  merchantId: string,
  filters: ProductQuery,
): Promise<ProductListItem[]> {
  return prisma.product.findMany({
    where: {
      merchantId,
      active: true,
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.q
        ? {
            OR: [
              { name: { contains: filters.q, mode: "insensitive" as const } },
              { description: { contains: filters.q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    select: LIST_FIELDS,
    orderBy: [{ category: "asc" }, { priceInPaise: "desc" }],
  });
}

export async function listCategories(merchantId: string): Promise<string[]> {
  const rows = await prisma.product.findMany({
    where: { merchantId, active: true },
    select: { category: true },
    distinct: ["category"],
    orderBy: { category: "asc" },
  });
  return rows.map((r) => r.category);
}

export async function getProductBySlug(
  merchantId: string,
  slug: string,
): Promise<ProductDetail | null> {
  const product = await prisma.product.findUnique({
    where: { merchantId_slug: { merchantId, slug } },
    select: { ...LIST_FIELDS, sku: true, description: true, specifications: true },
  });

  if (!product) return null;

  return {
    ...product,
    // `specifications` is Prisma.JsonValue; the seed and admin path both write a
    // flat string map, so this narrowing is safe.
    specifications: (product.specifications ?? {}) as Record<string, string>,
  };
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npm test -- db/queries/products.test.ts`

Expected: PASS, 9 tests. The isolation test failing means a `where` clause is missing `merchantId` — fix that before moving on, because every later day builds on these queries.

- [ ] **Step 10: Verify and commit**

```bash
npm run typecheck && npm run lint && npm test
git add -A
git commit -m "feat(db): merchant-scoped product queries and paise formatting"
```

---

## Task 6: The /shop catalog and product detail pages

**Files:**
- Create: `components/product-card.tsx`
- Create: `components/product-card.test.tsx`
- Create: `components/product-grid.tsx`
- Create: `components/category-filter.tsx`
- Create: `lib/merchant.ts`
- Create: `app/shop/page.tsx`
- Create: `app/shop/loading.tsx`
- Create: `app/shop/[slug]/page.tsx`
- Create: `app/shop/[slug]/not-found.tsx`

**Interfaces:**
- Consumes: `listProducts`, `listCategories`, `getProductBySlug` (Task 5), `formatPaise` (Task 5), `productQuerySchema` + `ProductListItem` + `ProductDetail` (Task 5), `MERCHANT_SLUG` (Task 3), `prisma` (Task 2).
- Produces: `<ProductCard product={ProductListItem} />`, `<ProductGrid products={ProductListItem[]} />`, `<CategoryFilter categories={string[]} active={string | undefined} />`, and `getStorefrontMerchantId(): Promise<string>` exported from `lib/merchant.ts` (created in Step 6).

- [ ] **Step 1: Initialise shadcn/ui and add the components used here**

```bash
npx shadcn@latest init -d
npx shadcn@latest add card badge button input
```

Expected: creates `components/ui/*` and `lib/utils.ts`. Answer any prompt about overwriting `lib/utils.ts` with **yes** — nothing depends on it yet.

- [ ] **Step 2: Write the failing product card test**

Create `components/product-card.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProductCard } from "./product-card";
import type { ProductListItem } from "@/types/product";

const product: ProductListItem = {
  id: "p1",
  slug: "thinkpad-x",
  name: "ThinkPad X",
  category: "Laptops",
  priceInPaise: 7_499_900,
  stock: 12,
  imageUrl: null,
};

describe("ProductCard", () => {
  it("renders the name and the formatted price", () => {
    render(<ProductCard product={product} />);
    expect(screen.getByText("ThinkPad X")).toBeDefined();
    expect(screen.getByText("₹74,999")).toBeDefined();
  });

  it("links to the product detail page", () => {
    render(<ProductCard product={product} />);
    const link = screen.getByRole("link", { name: /thinkpad x/i });
    expect(link.getAttribute("href")).toBe("/shop/thinkpad-x");
  });

  it("shows an in-stock indicator when stock is available", () => {
    render(<ProductCard product={product} />);
    expect(screen.getByText(/12 in stock/i)).toBeDefined();
  });

  it("shows out of stock when stock is zero", () => {
    render(<ProductCard product={{ ...product, stock: 0 }} />);
    expect(screen.getByText(/out of stock/i)).toBeDefined();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- components/product-card.test.tsx`

Expected: FAIL — `Failed to resolve import "./product-card"`.

- [ ] **Step 4: Implement the card, grid, and filter components**

Create `components/product-card.tsx`:

```tsx
import Link from "next/link";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPaise } from "@/lib/money";
import type { ProductListItem } from "@/types/product";

export function ProductCard({ product }: { product: ProductListItem }) {
  const inStock = product.stock > 0;

  return (
    <Card className="flex h-full flex-col transition-shadow hover:shadow-md">
      <CardContent className="flex-1 pt-6">
        <Badge variant="secondary" className="mb-3">
          {product.category}
        </Badge>
        <Link
          href={`/shop/${product.slug}`}
          className="text-lg font-semibold hover:underline"
        >
          {product.name}
        </Link>
      </CardContent>
      <CardFooter className="flex items-center justify-between border-t pt-4">
        <span className="text-xl font-bold tabular-nums">
          {formatPaise(product.priceInPaise)}
        </span>
        <span
          className={
            inStock ? "text-sm text-emerald-600" : "text-sm text-muted-foreground"
          }
        >
          {inStock ? `${product.stock} in stock` : "Out of stock"}
        </span>
      </CardFooter>
    </Card>
  );
}
```

Create `components/product-grid.tsx`:

```tsx
import { ProductCard } from "./product-card";
import type { ProductListItem } from "@/types/product";

export function ProductGrid({ products }: { products: ProductListItem[] }) {
  if (products.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <p className="font-medium">No products match that search.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Try a different category, or clear the filters.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
```

Create `components/category-filter.tsx`:

```tsx
import Link from "next/link";

export function CategoryFilter({
  categories,
  active,
}: {
  categories: string[];
  active?: string;
}) {
  const pill = (isActive: boolean) =>
    `rounded-full border px-4 py-1.5 text-sm transition-colors ${
      isActive
        ? "border-foreground bg-foreground text-background"
        : "border-border hover:bg-muted"
    }`;

  return (
    <nav className="flex flex-wrap gap-2" aria-label="Filter by category">
      <Link href="/shop" className={pill(!active)}>
        All
      </Link>
      {categories.map((category) => (
        <Link
          key={category}
          href={`/shop?category=${encodeURIComponent(category)}`}
          className={pill(active === category)}
        >
          {category}
        </Link>
      ))}
    </nav>
  );
}
```

- [ ] **Step 5: Run the card test to verify it passes**

Run: `npm test -- components/product-card.test.tsx`

Expected: PASS, 4 tests.

- [ ] **Step 6: Add the merchant resolver**

The catalog is public, so `merchantId` cannot come from a session here. It comes from the store's own slug — still never from user input. Create `lib/merchant.ts`:

```typescript
import { cache } from "react";
import { prisma } from "@/lib/db";
import { MERCHANT_SLUG } from "@/db/seed-data";

/**
 * Resolves the storefront's merchant. Public pages have no session, so the
 * merchant comes from the store's own slug — never from a query parameter.
 * `cache` dedupes this within a single render pass.
 */
export const getStorefrontMerchantId = cache(async (): Promise<string> => {
  const merchant = await prisma.merchant.findUnique({
    where: { slug: MERCHANT_SLUG },
    select: { id: true },
  });

  if (!merchant) {
    throw new Error(
      `Storefront merchant "${MERCHANT_SLUG}" is missing. Run \`npm run db:seed\`.`,
    );
  }

  return merchant.id;
});
```

- [ ] **Step 7: Build the catalog page**

Create `app/shop/page.tsx`. In Next.js 15 `searchParams` is a Promise and must be awaited.

```tsx
import { productQuerySchema } from "@/types/product";
import { listCategories, listProducts } from "@/db/queries/products";
import { getStorefrontMerchantId } from "@/lib/merchant";
import { ProductGrid } from "@/components/product-grid";
import { CategoryFilter } from "@/components/category-filter";

export const metadata = { title: "Shop · Urban Store" };

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;

  // Unparseable filters degrade to "no filter" rather than erroring the page.
  const parsed = productQuerySchema.safeParse({
    category: typeof raw.category === "string" ? raw.category : undefined,
    q: typeof raw.q === "string" ? raw.q : undefined,
  });
  const filters = parsed.success ? parsed.data : {};

  const merchantId = await getStorefrontMerchantId();
  const [products, categories] = await Promise.all([
    listProducts(merchantId, filters),
    listCategories(merchantId),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Urban Store</h1>
        <p className="mt-1 text-muted-foreground">
          Laptops, monitors, and the accessories that go with them.
        </p>
      </header>

      <div className="mb-8">
        <CategoryFilter categories={categories} active={filters.category} />
      </div>

      <ProductGrid products={products} />
    </main>
  );
}
```

- [ ] **Step 8: Add the loading state**

Create `app/shop/loading.tsx`:

```tsx
export default function ShopLoading() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 h-9 w-48 animate-pulse rounded bg-muted" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-48 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 9: Build the product detail page**

Create `app/shop/[slug]/page.tsx`. In Next.js 15 `params` is a Promise too.

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { getProductBySlug } from "@/db/queries/products";
import { getStorefrontMerchantId } from "@/lib/merchant";
import { formatPaise } from "@/lib/money";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const merchantId = await getStorefrontMerchantId();
  const product = await getProductBySlug(merchantId, slug);

  if (!product) notFound();

  const specs = Object.entries(product.specifications);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/shop" className="text-sm text-muted-foreground hover:underline">
        ← Back to shop
      </Link>

      <div className="mt-6">
        <Badge variant="secondary">{product.category}</Badge>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">{product.name}</h1>
        <p className="mt-2 text-2xl font-bold tabular-nums">
          {formatPaise(product.priceInPaise)}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {product.stock > 0 ? `${product.stock} in stock` : "Out of stock"} · SKU{" "}
          {product.sku}
        </p>
      </div>

      {product.description ? (
        <p className="mt-6 leading-relaxed">{product.description}</p>
      ) : null}

      {specs.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Specifications</h2>
          <dl className="divide-y rounded-lg border">
            {specs.map(([key, value]) => (
              <div key={key} className="flex justify-between px-4 py-3 text-sm">
                <dt className="capitalize text-muted-foreground">{key}</dt>
                <dd className="font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </main>
  );
}
```

Create `app/shop/[slug]/not-found.tsx`:

```tsx
import Link from "next/link";

export default function ProductNotFound() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-20 text-center">
      <h1 className="text-2xl font-bold">We could not find that product.</h1>
      <p className="mt-2 text-muted-foreground">
        It may have been removed from the catalog.
      </p>
      <Link href="/shop" className="mt-6 inline-block underline">
        Back to shop
      </Link>
    </main>
  );
}
```

- [ ] **Step 10: Manually verify all four paths**

Run `npm run dev`, then check:

| URL | Expected |
|---|---|
| `/shop` | 9 product cards, prices like `₹74,999`, category pills |
| `/shop?category=Laptops` | 3 cards; the Laptops pill is highlighted |
| `/shop?category=Nonsense` | Empty state, no crash |
| `/shop/thinkpad-x` | Detail page with specs table |
| `/shop/not-a-product` | The not-found page, not a 500 |

- [ ] **Step 11: Verify and commit**

```bash
npm run typecheck && npm run lint && npm test
git add -A
git commit -m "feat(shop): catalog grid, category filter, and product detail pages"
```

---

## Task 7: Site header with role-aware navigation, and Day 1 sign-off

**Files:**
- Create: `components/site-header.tsx`
- Create: `app/page.tsx` (replace the scaffolder's version)
- Modify: `app/layout.tsx` (render the header)
- Create: `README.md`

**Interfaces:**
- Consumes: `getSessionContext` (Task 4), Clerk's `<SignedIn>`, `<SignedOut>`, `<UserButton>`, `<SignInButton>`.
- Produces: `<SiteHeader />` — an async server component rendered by the root layout on every page. This is what triggers the JIT user sync from Task 4.

- [ ] **Step 1: Implement the header**

Create `components/site-header.tsx`. The Merchant link appears only for `merchant_admin` — this is the visible proof that the two roles from the spec actually work.

```tsx
import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import { getSessionContext } from "@/auth/session";

export async function SiteHeader() {
  const session = await getSessionContext();

  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/shop" className="text-lg font-bold tracking-tight">
          Urban Store
        </Link>

        <nav className="flex items-center gap-6">
          <Link href="/shop" className="text-sm hover:underline">
            Shop
          </Link>

          {session?.role === "merchant_admin" ? (
            <Link href="/merchant" className="text-sm font-medium hover:underline">
              Merchant
            </Link>
          ) : null}

          <SignedIn>
            <UserButton />
          </SignedIn>
          <SignedOut>
            <SignInButton mode="modal">
              <button className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
                Sign in
              </button>
            </SignInButton>
          </SignedOut>
        </nav>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Render the header from the root layout**

Edit `app/layout.tsx` and change the `<body>` contents to:

```tsx
<body className="min-h-screen bg-background text-foreground antialiased">
  <SiteHeader />
  {children}
</body>
```

Add the import at the top: `import { SiteHeader } from "@/components/site-header";`

- [ ] **Step 3: Point the home page at the shop**

Replace `app/page.tsx` entirely with:

```tsx
import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/shop");
}
```

- [ ] **Step 4: Verify the role-aware navigation by hand**

Run `npm run dev`, then:

1. **Signed out** — visit `/`. It redirects to `/shop`, products render, header shows "Sign in", no "Merchant" link.
2. **Signed in as the merchant admin** (the `MERCHANT_ADMIN_EMAIL` account) — the header shows a "Merchant" link and a `UserButton`.
3. **Signed in as any other email** — sign up with a second address. The header shows the `UserButton` but **no** "Merchant" link.
4. **Direct access check** — while signed in as the non-admin, visit `/merchant`. Clerk's `auth.protect()` allows it (they are authenticated) but there is no page there yet, so a 404 is the correct Day 1 result. Role enforcement on that route lands in Day 7 via `requireMerchantAdmin()`, which is already written and tested.

- [ ] **Step 5: Write the README**

Create `README.md`:

````markdown
# Urban Store AI Commerce OS

An AI-native electronics store where both humans and autonomous agents can shop
and pay, with every money action explainable, bounded, gated, and audited.

Product detail: `PRD.md` · Technical design: `ARCHITECTURE.md` ·
Build plan: `urban-store-build-spec.md`

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in every value
npm run db:migrate
npm run db:seed
npm run dev
```

The Postgres database needs the `vector` extension:
`CREATE EXTENSION IF NOT EXISTS vector;`

Set `MERCHANT_ADMIN_EMAIL` to the address you sign up with — that account
becomes the merchant admin on first sign-in.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest (unit + DB integration) |
| `npm run db:migrate` | Apply Prisma migrations |
| `npm run db:seed` | Seed Urban Store (idempotent) |
| `npm run db:studio` | Browse the database |

Tests hit the real database in `.env.local`. They clean up after themselves,
but do not point them at anything you care about.

## Layout

```
/app       routes (customer + merchant + api)
/components UI components
/lib        shared utils, env, money, LLM provider abstraction
/agents     LangGraph graphs
/tools      strict agent tools
/rag        embedding + retrieval
/db         prisma schema, seed, queries
/payments   razorpay client, webhook verification, idempotency
/auth       session helpers and merchant scoping
/types      shared types + zod schemas
```

## Day 1 status

Done: schema, seed, Clerk auth with two roles, merchant-scoped product
queries, `/shop` catalog and detail pages.

Next: Day 2 — the transaction spine. See `urban-store-build-spec.md` §9.
````

- [ ] **Step 6: Run the full Day 1 acceptance check**

The spec's done-when for Day 1 is *"log in, see real products from DB."* Verify all of it:

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Expected: all four pass, including a clean production build. Then with `npm run dev` running, confirm every row of the table in Task 6 Step 10 and every case in Task 7 Step 4 still holds.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(app): role-aware site header, home redirect, and readme"
```

---

## Day 1 Definition of Done

Check every line before calling Day 1 finished:

- [ ] `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` all pass.
- [ ] `.env.local` is git-ignored and has never been committed (`git log --all --full-history -- .env.local` returns nothing).
- [ ] All 14 tables from spec §7 exist, and `knowledge_chunks.embedding` is `vector(384)`.
- [ ] Every money column is an integer.
- [ ] `npm run db:seed` run twice leaves exactly 9 products, 9 relations, 3 abandoned carts.
- [ ] Signing up with `MERCHANT_ADMIN_EMAIL` yields a `users` row with `role = merchant_admin`.
- [ ] Signing up with any other address yields `role = customer` and no Merchant link.
- [ ] `/shop` renders 9 products with real prices from Postgres.
- [ ] Category filter, unknown category, and unknown product slug all behave — no 500s.
- [ ] No TODO comments and no stubbed routes for Days 2–10 exist anywhere in the tree.
