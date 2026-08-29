import "server-only";
import { prisma } from "@/lib/db";
import { embed, toVectorLiteral } from "./embed";

export type RetrievedChunk = {
  id: string;
  docType: string;
  title: string;
  content: string;
  /** Cosine distance from pgvector: 0 = identical, 2 = opposite. Lower is better. */
  distance: number;
};

/**
 * Distance above which a chunk is treated as irrelevant.
 *
 * Measured against this corpus rather than guessed. Real questions land at
 * 0.36-0.62 ("how long is the warranty on a monitor?" -> 0.361; the weakest true
 * match observed was 0.616). An off-topic question ("policy on adopting a pet
 * elephant?") still returns its nearest neighbours, but at 0.862 — cosine distance
 * has no absolute zero, so *something* always comes back and a cutoff is the only
 * thing standing between that and a confidently wrong policy answer.
 *
 * 0.75 sits in the gap: above every genuine match, below the nearest false one.
 * Re-measure if the corpus or the embedding model changes.
 */
const RELEVANCE_CUTOFF = 0.75;

/**
 * Query-time retrieval (ARCHITECTURE §6): embed the query, cosine-search pgvector,
 * filtered by merchantId — one merchant can never retrieve another's documents.
 *
 * `merchantId` is the first parameter and always in the WHERE clause, the same
 * structural rule the SQL query layer follows (CLAUDE.md safety rule 6).
 */
export async function searchKnowledge(
  merchantId: string,
  query: string,
  opts: { limit?: number; docType?: string } = {},
): Promise<RetrievedChunk[]> {
  const limit = Math.min(Math.max(opts.limit ?? 4, 1), 10);
  const vector = toVectorLiteral(await embed(query));

  // Raw SQL because Prisma cannot express the `<=>` operator on an Unsupported column.
  // Values are still parameterised — never string-interpolated.
  const rows = opts.docType
    ? await prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT id, doc_type, content, metadata,
               embedding <=> ${vector}::vector AS distance
        FROM knowledge_chunks
        WHERE merchant_id = ${merchantId} AND doc_type = ${opts.docType}
        ORDER BY embedding <=> ${vector}::vector
        LIMIT ${limit}
      `
    : await prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT id, doc_type, content, metadata,
               embedding <=> ${vector}::vector AS distance
        FROM knowledge_chunks
        WHERE merchant_id = ${merchantId}
        ORDER BY embedding <=> ${vector}::vector
        LIMIT ${limit}
      `;

  return rows
    .map((r) => {
      const metadata = (r.metadata ?? {}) as { title?: string };
      return {
        id: String(r.id),
        docType: String(r.doc_type),
        title: metadata.title ?? String(r.doc_type),
        content: String(r.content),
        distance: Number(r.distance),
      };
    })
    .filter((c) => c.distance <= RELEVANCE_CUTOFF);
}

/** Formats chunks for a grounding prompt, with sources the model can cite. */
export function asContext(chunks: RetrievedChunk[]): string {
  return chunks
    .map((c, i) => `[${i + 1}] (${c.title}) ${c.content}`)
    .join("\n\n");
}
