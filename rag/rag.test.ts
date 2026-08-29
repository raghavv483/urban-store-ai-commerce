import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { MERCHANT_SLUG } from "@/db/seed-data";
import { searchKnowledge } from "./retrieve";
import { classifyOnly } from "@/agents/router";

let merchantId: string;

beforeAll(async () => {
  const m = await prisma.merchant.findUniqueOrThrow({ where: { slug: MERCHANT_SLUG } });
  merchantId = m.id;

  const count = await prisma.knowledgeChunk.count({ where: { merchantId } });
  if (count === 0) {
    throw new Error("Knowledge base is empty. Run `npm run rag:seed` first.");
  }
}, 60_000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("RAG retrieval", () => {
  it("retrieves the return policy for a returns question, and nothing for an off-topic one", async () => {
    const hits = await searchKnowledge(merchantId, "can I return it after 10 days?", {
      limit: 3,
    });

    expect(hits.length).toBeGreaterThan(0);
    expect(hits.map((h) => h.docType)).toContain("return_policy");

    // The chunk stating the actual window must be among them — retrieving the
    // right document but the wrong paragraph would still produce a wrong answer.
    const joined = hits.map((h) => h.content).join(" ");
    expect(joined).toMatch(/14 days/);

    // Honesty guardrail: cosine distance always returns *something*, so the
    // cutoff is the only thing preventing a confident answer about a topic the
    // store has no policy on.
    const nonsense = await searchKnowledge(
      merchantId,
      "what is your policy on adopting a pet elephant?",
      { limit: 3 },
    );
    expect(nonsense).toHaveLength(0);
  }, 60_000);

  it("keeps retrieval merchant-scoped", async () => {
    const other = await prisma.merchant.upsert({
      where: { slug: "rag-test-rival" },
      update: {},
      create: { slug: "rag-test-rival", name: "Rival" },
    });
    try {
      const hits = await searchKnowledge(other.id, "can I return it after 10 days?", {
        limit: 5,
      });
      // Urban Store's 24 chunks exist, but belong to another merchant.
      expect(hits).toHaveLength(0);
    } finally {
      await prisma.merchant.delete({ where: { id: other.id } });
    }
  }, 60_000);
});

describe("agentic routing", () => {
  it("routes a policy question to RAG, not to product search", async () => {
    const decision = await classifyOnly("can I return it after 10 days?");

    expect(decision).not.toBeNull();
    expect(decision!.intent).toBe("policy_question");
    expect(["getReturnPolicy", "searchKnowledgeBase"]).toContain(decision!.tool);
    expect(decision!.tool).not.toBe("searchProducts");
  }, 60_000);
});
