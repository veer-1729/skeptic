import type { AdjudicationInput, AdjudicationVerdict, FindingRef } from "../types.js";
import { findingRefKey } from "./adjudicate.js";
import type { Adjudicator } from "./types.js";

/**
 * Deterministic adjudicator for tests — returns pre-baked verdicts keyed by
 * finding identity (`category|ruleId|file|lineStart|lineEnd`).
 */
export class MockAdjudicator implements Adjudicator {
  private readonly byKey: Map<string, AdjudicationVerdict>;

  constructor(verdicts: AdjudicationVerdict[]) {
    this.byKey = new Map(
      verdicts.map((v) => [findingRefKey(v.findingRef), v]),
    );
  }

  async judge(input: AdjudicationInput): Promise<AdjudicationVerdict> {
    const ref: FindingRef = {
      category: input.finding.category,
      ruleId: input.finding.ruleId,
      file: input.finding.file,
      lineStart: input.finding.lineStart,
      lineEnd: input.finding.lineEnd,
    };
    const key = findingRefKey(ref);
    const baked = this.byKey.get(key);
    if (baked) return { ...baked, findingRef: ref };

    return {
      findingRef: ref,
      outcome: "rejected",
      citations: [],
      rationale: "No mock verdict configured for this finding.",
    };
  }
}
