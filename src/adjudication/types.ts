import type { AdjudicationInput, AdjudicationVerdict } from "../types.js";

/** Pluggable adjudicator — live LLM in production, mock in tests. */
export interface Adjudicator {
  judge(input: AdjudicationInput): Promise<AdjudicationVerdict>;
}
