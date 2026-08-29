import { prisma } from "@/lib/db";
import { MERCHANT_SLUG } from "@/db/seed-data";
import { embed, toVectorLiteral } from "./embed";
import { KNOWLEDGE_DOCS } from "./documents";

/**
 * Seed-time embedding of the knowledge base (ARCHITECTURE §6 — no upload UI).
 *
 * Idempotent by replacement: every chunk for this merchant is deleted and rewritten,
 * so re-running after editing a document does not leave orphaned stale chunks that
 * would keep being retrieved. That is safe because `knowledge_chunks` holds only
 * derived data — the source of truth is `rag/documents.ts` in git.
 *
 * Prisma cannot write an `Unsupported("vector")` column, so inserts go through
 * $executeRaw with an explicit ::vector cast.
 */
export async function seedKnowledge(): Promise<{ merchantId: string; chunks: number }> {
  const merchant = await prisma.merchant.findUnique({ where: { slug: MERCHANT_SLUG } });
  if (!merchant) {
    throw new Error(
      `Merchant "${MERCHANT_SLUG}" not found. Run \`npm run db:seed\` before seeding knowledge.`,
    );
  }

  await prisma.knowledgeChunk.deleteMany({ where: { merchantId: merchant.id } });

  let written = 0;
  for (const doc of KNOWLEDGE_DOCS) {
    for (let i = 0; i < doc.chunks.length; i++) {
      const content = doc.chunks[i];
      const vector = await embed(content);

      await prisma.$executeRaw`
        INSERT INTO knowledge_chunks (id, merchant_id, doc_type, content, embedding, metadata, created_at)
        VALUES (
          gen_random_uuid()::text,
          ${merchant.id},
          ${doc.docType},
          ${content},
          ${toVectorLiteral(vector)}::vector,
          ${JSON.stringify({ title: doc.title, chunkIndex: i, of: doc.chunks.length })}::jsonb,
          now()
        )
      `;
      written++;
    }
  }

  return { merchantId: merchant.id, chunks: written };
}

// Only when invoked directly via `npm run rag:seed`, not on import from tests.
if (process.argv[1]?.includes("seed-knowledge")) {
  seedKnowledge()
    .then((r) => console.log(`Embedded ${r.chunks} chunks for merchant ${r.merchantId}.`))
    .catch((error) => {
      console.error("Knowledge seed failed:", error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
