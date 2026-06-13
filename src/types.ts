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

/**
 * Sensitive domains that bump severity. This is the phase-1 domain-proximity
 * shortcut from the architecture doc — it moves to the ranking engine in
 * phase 2. The set of which domains count as "sensitive" lives in one place
 * (`src/context/domains.ts`), not duplicated per detector.
 */
export type Domain =
  | "payments"
  | "auth"
  | "billing"
  | "permissions"
  | "migrations"
  | "pii";

/** Package-resolution context: phantom-dependency + dependency-creep. */
export interface PackageContext {
  /** Names that resolve against the (mock, in fixtures) registry. */
  known?: string[];
  /**
   * Dependencies already present in the repo before this diff — the
   * comparison set for dependency-creep / overlapping-dependency.
   */
  existing?: string[];
  /** Per-package registry trust metadata for low-trust-new-dependency. */
  registry?: Record<string, RegistryInfo>;
}

export interface RegistryInfo {
  resolves: boolean;
  /** Days since the package's latest publish. Small ⇒ suspiciously fresh. */
  publishedDaysAgo?: number;
  /** Approx weekly downloads. Near-zero ⇒ low adoption / possible slopsquat. */
  weeklyDownloads?: number;
  /** Whether the registry lists a source repository. */
  hasSourceRepo?: boolean;
}

/**
 * Functional-overlap groups for dependency-creep's overlapping-dependency
 * rule (start hardcoded: date libs, HTTP clients, …). Each inner array is a
 * set of packages that do "the same job".
 */
export interface OverlapTable {
  groups: string[][];
}

/** Secret/credential signal config for magic-fallback. */
export interface SecretContext {
  /** Env-var name fragments that mark a value as a secret (JWT_SECRET, …). */
  nameHints?: string[];
}

/**
 * Context for one analysis unit, supplied per file. Every field is optional and
 * owned by one concern — a detector reads only its namespace, and a missing
 * namespace means "no context for this" (empty known-set, no domain, etc.).
 */
export interface AnalysisMeta {
  domain?: Domain;
  packages?: PackageContext;
  dependencyOverlap?: OverlapTable;
  secrets?: SecretContext;
}

/** A 1-based, inclusive range of lines. */
export interface LineRange {
  start: number;
  end: number;
}

/** What a detector receives for one changed file. */
export interface DetectorInput {
  file: string;
  content: string;
  /**
   * Added line ranges (1-based, inclusive). Absent ⇒ treat the whole file as
   * added — the phase-1 default, since fixtures are small synthetic snippets
   * of new code. Lets a fixture later supply real diff context without a
   * schema change.
   */
  addedRanges?: LineRange[];
  meta?: AnalysisMeta;
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
