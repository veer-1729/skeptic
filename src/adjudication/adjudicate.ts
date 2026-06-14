import type { AdjudicationInput, AdjudicationVerdict, FindingRef, RankedFinding } from "../types.js";
import type { Adjudicator } from "./types.js";
import { validateVerdict, type UnitFiles } from "./validate-citation.js";

export function findingRefKey(ref: FindingRef): string {
  return `${ref.category}|${ref.ruleId}|${ref.file}|${ref.lineStart}|${ref.lineEnd}`;
}

export function rankedFindingRef(f: RankedFinding): FindingRef {
  return {
    category: f.category,
    ruleId: f.ruleId,
    file: f.file,
    lineStart: f.lineStart,
    lineEnd: f.lineEnd,
  };
}

export interface AdjudicationResult {
  verdict: AdjudicationVerdict;
  /** Non-empty when the adjudicator returned an invalid verdict (dropped). */
  validationErrors: string[];
}

/**
 * Run the adjudicator over ranked findings. Invalid verdicts (bad citations on
 * confirmed/needs_review) are dropped and recorded as validation errors.
 */
export async function adjudicateFindings(
  inputs: AdjudicationInput[],
  adjudicator: Adjudicator,
  unit: UnitFiles,
): Promise<AdjudicationResult[]> {
  const results: AdjudicationResult[] = [];

  for (const input of inputs) {
    const verdict = await adjudicator.judge(input);
    const errors = validateVerdict(verdict, unit).map((e) => e.message);
    results.push({ verdict, validationErrors: errors });
  }

  return results;
}

/** Keep only verdicts that passed citation validation. */
export function acceptedVerdicts(results: AdjudicationResult[]): AdjudicationVerdict[] {
  return results.filter((r) => r.validationErrors.length === 0).map((r) => r.verdict);
}
