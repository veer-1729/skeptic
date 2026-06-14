import type { NeighborFile, RepoContext } from "../types.js";
import { LocalLexicalEmbedder, type Embedder } from "./embedder.js";

/**
 * The repo-context retrieval index (architecture §3.3). Built once over a unit's
 * corpus (the non-changed repo files); for a changed file it returns the most
 * similar corpus files to use as the convention comparison set. Pure and
 * deterministic given the corpus + embedder.
 */
export interface RepoIndex {
  /**
   * The `k` corpus files most similar to `query`, ranked most- to least-
   * similar. The query file itself (same path) is excluded. Empty when the
   * corpus has nothing comparable.
   */
  nearest(query: { path: string; content: string }, k?: number): NeighborFile[];
}

/** Same-folder neighbors are the strongest signal; same-extension a weaker one. */
const SAME_DIR_BOOST = 1.25;
const SAME_EXT_BOOST = 1.05;

function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

function extOf(path: string): string {
  const i = path.lastIndexOf(".");
  return i === -1 ? "" : path.slice(i + 1);
}

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

interface IndexedFile {
  file: NeighborFile;
  vector: number[];
}

/**
 * Embed every corpus file up front. `nearest` then embeds the query and ranks
 * by cosine similarity (a dot product, since vectors are L2-normalized) scaled
 * by a folder/extension proximity boost. Ties break on path ascending so the
 * comparison set is reproducible.
 */
export function buildRepoIndex(
  corpus: NeighborFile[],
  embedder: Embedder = new LocalLexicalEmbedder(),
): RepoIndex {
  const indexed: IndexedFile[] = corpus.map((file) => ({
    file,
    vector: embedder.embed(file.content),
  }));

  return {
    nearest(query, k = 5) {
      const qVec = embedder.embed(query.content);
      const qDir = dirOf(query.path);
      const qExt = extOf(query.path);

      const scored = indexed
        .filter((entry) => entry.file.path !== query.path)
        .map((entry) => {
          const boost =
            dirOf(entry.file.path) === qDir
              ? SAME_DIR_BOOST
              : extOf(entry.file.path) === qExt
                ? SAME_EXT_BOOST
                : 1.0;
          return { file: entry.file, score: dot(qVec, entry.vector) * boost };
        });

      scored.sort((a, b) =>
        b.score !== a.score ? b.score - a.score : a.file.path.localeCompare(b.file.path),
      );

      return scored.slice(0, k).map((s) => s.file);
    },
  };
}

/**
 * Wrap an index + the unit's changed files into the `RepoContext` detectors
 * receive. `nearestNeighbors(file)` resolves the changed file's content by path
 * and delegates to the index, so a detector only ever passes a path.
 */
export function createRepoContext(
  changed: { file: string; content: string }[],
  corpus: NeighborFile[],
  embedder: Embedder = new LocalLexicalEmbedder(),
): RepoContext {
  const index = buildRepoIndex(corpus, embedder);
  const byPath = new Map(changed.map((c) => [c.file, c.content]));
  return {
    nearestNeighbors(file, k) {
      const content = byPath.get(file);
      if (content === undefined) return [];
      return index.nearest({ path: file, content }, k);
    },
  };
}
