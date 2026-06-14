/**
 * Deterministic, offline text embedding for the repo-context retrieval index
 * (`src/retrieval/repo-index.ts`). The `Embedder` interface is the seam: the
 * default here is a local lexical embedder (no network, no model), and a
 * model-based embedder can drop in later without touching the index or any
 * detector.
 */
export interface Embedder {
  /** Map a source string to a fixed-dimension, L2-normalized vector. */
  embed(text: string): number[];
}

/** Fixed feature-hashing dimension. Large enough to keep collisions rare. */
const DIM = 2048;

/** Identifier-ish tokens: catches symbols, import names, and words in strings. */
const TOKEN = /[A-Za-z_$][A-Za-z0-9_$]*/g;

/**
 * FNV-1a — a small, fast, deterministic string hash. Used for the feature-
 * hashing trick so we never need a global vocabulary (which would make `embed`
 * stateful and order-dependent).
 */
function hashToken(token: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % DIM;
}

/**
 * Bag-of-tokens with the feature-hashing trick: tokenize the source, hash each
 * token (lowercased) into a fixed-dimension term-frequency vector, then
 * L2-normalize so cosine similarity is just a dot product. Deterministic for a
 * given input and independent of corpus order.
 */
export class LocalLexicalEmbedder implements Embedder {
  embed(text: string): number[] {
    const vec = new Array<number>(DIM).fill(0);
    const matches = text.match(TOKEN);
    if (matches) {
      for (const raw of matches) {
        vec[hashToken(raw.toLowerCase())] += 1;
      }
    }
    let norm = 0;
    for (const v of vec) norm += v * v;
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < DIM; i++) vec[i] /= norm;
    }
    return vec;
  }
}
