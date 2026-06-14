import type { NeighborFile } from "../../types.js";

export interface ConventionProfile<S extends string> {
  /** The most common style among neighbors that signal at all; `noneStyle` if no convention. */
  dominant: S;
  /** Fraction of relevant neighbors that follow `dominant` (0..1). */
  adherenceRatio: number;
  /** Number of neighbors that signal at all (the denominator for adherence). */
  relevant: number;
  /** Paths of the neighbors that follow `dominant` — the cited comparison set. */
  sampleFiles: string[];
}

/**
 * Minimum number of neighbors that actually signal before we'll claim a
 * convention exists. Below this the repo simply isn't evidence either way.
 */
export const MIN_RELEVANT_NEIGHBORS = 3;

/**
 * Adherence required to treat the dominant style as *the* convention. Tuned for
 * near-zero false positives (Principle: detector asserts presence, ranking
 * judges severity) — a 0.6-0.8 low-confidence band is a deferred refinement.
 */
export const STRONG_ADHERENCE = 0.8;

/**
 * Build a convention profile from a set of neighbor files. Considers only files
 * that signal at all (`style !== noneStyle`); among those, finds the most
 * common style, its adherence ratio, and the files exhibiting it. Ties on count
 * are broken by `precedence` order so the result is deterministic.
 */
export function buildProfile<S extends string>(
  neighbors: NeighborFile[],
  classify: (content: string, path: string) => S,
  precedence: readonly S[],
  noneStyle: S,
): ConventionProfile<S> {
  const byStyle = new Map<S, string[]>();
  let relevant = 0;

  for (const n of neighbors) {
    const style = classify(n.content, n.path);
    if (style === noneStyle) continue;
    relevant++;
    const list = byStyle.get(style) ?? [];
    list.push(n.path);
    byStyle.set(style, list);
  }

  let dominant: S = noneStyle;
  let dominantCount = 0;
  for (const style of precedence) {
    const count = byStyle.get(style)?.length ?? 0;
    if (count > dominantCount) {
      dominant = style;
      dominantCount = count;
    }
  }

  const sampleFiles = (dominant === noneStyle ? [] : (byStyle.get(dominant) ?? [])).slice().sort();
  const adherenceRatio = relevant === 0 ? 0 : dominantCount / relevant;

  return { dominant, adherenceRatio, relevant, sampleFiles };
}

/**
 * Does this profile constitute a strong-enough convention to flag drift against?
 * Requires enough relevant neighbors and high adherence to the dominant style.
 */
export function isStrongConvention<S extends string>(
  profile: ConventionProfile<S>,
  noneStyle: S,
  minRelevant = MIN_RELEVANT_NEIGHBORS,
  strongAdherence = STRONG_ADHERENCE,
): boolean {
  return (
    profile.relevant >= minRelevant &&
    profile.adherenceRatio >= strongAdherence &&
    profile.dominant !== noneStyle
  );
}
