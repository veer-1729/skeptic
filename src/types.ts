export type SlopCategory =
  | "type-anesthesia"
  | "dead-leftovers"
  | "phantom-dependency"
  | "dependency-creep"
  | "shallow-edge-handling"
  | "fake-generality"
  | "convention-drift"
  | "test-theater"
  | "blast-radius"
  | "reward-hacking"
  | "magic-fallback"
  | "error-fog"
  | "comment-compliance"
  | "security-shaped-slop"
  | "llm-integration-smell"
  | "architectural-inflation";

export type Severity = "low" | "medium" | "high";

/** A finding produced by a detector. This is the contract every
 * detector writes to and the harness reads from. */
export interface Finding {
  category: SlopCategory;
  ruleId: string;
  severity: Severity;
  file: string;
  lineStart: number;
  lineEnd: number;
  message: string;
  /** 0..1 — how confident the detector is in this specific instance. */
  confidence: number;
}

/** What a detector receives for one changed file. */
export interface DetectorInput {
  file: string;
  content: string;
  /** Optional context: domain tags, mock registry data for fixtures, etc. */
  meta?: Record<string, unknown>;
}

export interface Detector {
  /** Stable identifier, referenced by fixtures and reports. */
  id: string;
  category: SlopCategory;
  run(input: DetectorInput): Finding[];
}

/**
 * What a fixture expects to see. Deliberately looser than Finding:
 * - `ruleId` is optional (omit to match "any rule in this category").
 * - `severity` is checked but does NOT affect pass/fail on its own —
 *   a severity mismatch is reported as a warning, not a false negative,
 *   so renaming/retuning severity doesn't silently break the suite.
 */
export interface ExpectedFinding {
  category: SlopCategory;
  ruleId?: string;
  lineStart: number;
  lineEnd: number;
  severity?: Severity;
}
