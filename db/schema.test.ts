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
