import "server-only";
import { z } from "zod";
import { searchKnowledge } from "@/rag/retrieve";
import { ok, type AgentTool } from "./types";

/** Message used verbatim when retrieval finds nothing. Never soften or improvise it. */
export const NO_KNOWLEDGE_MESSAGE =
  "I couldn't find that in Urban Store's knowledge base.";

export const searchKnowledgeBase: AgentTool = {
  name: "searchKnowledgeBase",
  effect: "read",
  description:
    "Search Urban Store's policy and guide documents: returns, refunds, warranty, shipping and delivery, and laptop buying advice. Use for any question answered by store policy rather than by live product data.",
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .max(300)
      .describe("the customer's question, in their own words"),
    docType: z
      .enum(["return_policy", "warranty", "shipping", "buying_guide"])
      .optional()
      .describe("narrow to one document when the topic is unambiguous"),
    // Clamped to a floor of 4, not rejected below it. The model has been observed
    // asking for limit:1, which starves the answer — the paragraph that actually
    // answers the question is often ranked second or third. How much context to
    // retrieve is a retrieval-quality decision, not one the model should make; but
    // a bad value should be corrected, not turned into a failed tool call.
    limit: z
      .number()
      .int()
      .min(1)
      .max(6)
      .default(4)
      .transform((n) => Math.max(n, 4)),
  }),
  async execute(input, ctx) {
    const { query, docType, limit } = input as {
      query: string;
      docType?: string;
      limit: number;
    };

    const chunks = await searchKnowledge(ctx.merchantId, query, { limit, docType });

    if (chunks.length === 0) {
      // Deliberately a successful result carrying "nothing found", not an error:
      // the assistant must say so plainly rather than treating it as a failure to
      // route around or paper over.
      return ok(
        { found: false, chunks: [], message: NO_KNOWLEDGE_MESSAGE },
        NO_KNOWLEDGE_MESSAGE,
      );
    }

    return ok(
      {
        found: true,
        chunks: chunks.map((c) => ({
          docType: c.docType,
          title: c.title,
          content: c.content,
          distance: Number(c.distance.toFixed(4)),
        })),
      },
      `Retrieved ${chunks.length} chunk(s) from ${[...new Set(chunks.map((c) => c.title))].join(", ")}.`,
    );
  },
};

export const getReturnPolicy: AgentTool = {
  name: "getReturnPolicy",
  effect: "read",
  description:
    "Get Urban Store's return and refund policy specifically. Use when the customer asks about returning an item, refund timing, or return eligibility.",
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .max(300)
      .default("return policy, refund window, return conditions"),
  }),
  async execute(input, ctx) {
    const { query } = input as { query: string };
    const chunks = await searchKnowledge(ctx.merchantId, query, {
      limit: 4,
      docType: "return_policy",
    });

    if (chunks.length === 0) {
      return ok(
        { found: false, chunks: [], message: NO_KNOWLEDGE_MESSAGE },
        NO_KNOWLEDGE_MESSAGE,
      );
    }

    return ok(
      {
        found: true,
        chunks: chunks.map((c) => ({
          docType: c.docType,
          title: c.title,
          content: c.content,
          distance: Number(c.distance.toFixed(4)),
        })),
      },
      `Retrieved ${chunks.length} chunk(s) from the return policy.`,
    );
  },
};
