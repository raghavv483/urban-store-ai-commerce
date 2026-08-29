import { pipeline, type FeatureExtractionPipeline } from "@xenova/transformers";
import { env } from "@/lib/env";

/**
 * Local embeddings via @xenova/transformers.
 *
 * Deliberately local rather than a hosted API: the corpus is a handful of policy
 * docs, the model is ~25MB and runs on CPU in milliseconds, and — the part that
 * matters for a live demo — there is no network call and no rate limit in the
 * retrieval path.
 *
 * The model is loaded once per process and cached. First call in a cold process
 * downloads weights to ./node_modules/@xenova/transformers/.cache, so the first
 * query after a restart is slow and every one after is fast.
 */

let extractor: Promise<FeatureExtractionPipeline> | null = null;

function getExtractor(): Promise<FeatureExtractionPipeline> {
  extractor ??= pipeline("feature-extraction", env.EMBEDDING_MODEL, {
    quantized: true,
  }) as Promise<FeatureExtractionPipeline>;
  return extractor;
}

/**
 * Embed one string into a normalized vector.
 *
 * Mean pooling + L2 normalization is what all-MiniLM-L6-v2 expects; with normalized
 * vectors, cosine distance and inner product agree, so pgvector's `<=>` operator is
 * a valid similarity measure.
 */
export async function embed(text: string): Promise<number[]> {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) throw new Error("Cannot embed empty text.");

  const model = await getExtractor();
  const output = await model(clean, { pooling: "mean", normalize: true });
  const vector = Array.from(output.data as Float32Array);

  if (vector.length !== env.EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding model returned ${vector.length} dimensions but the database column is vector(${env.EMBEDDING_DIMENSIONS}). ` +
        `Change EMBEDDING_MODEL back, or migrate the column — they must agree.`,
    );
  }
  return vector;
}

export async function embedAll(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (const t of texts) out.push(await embed(t));
  return out;
}

/** pgvector's text input format: `[0.1,0.2,...]`. */
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}
