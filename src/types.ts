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
  /**
   * The detector's *base/intrinsic* severity for this pattern — what the smell
   * is worth before any diff-level context is applied. Domain proximity and
   * diff size are NOT folded in here; the ranking engine (`src/ranking/`)
   * computes the final `adjustedSeverity` from this base. A detector whose
   * severity is genuinely domain-independent (e.g. an unresolved import is
   * always "high") just emits that constant as its base.
   */
  severity: Severity;
  file: string;
  lineStart: number;
  lineEnd: number;
  message: string;
  /** 0..1 — how confident the detector is in this specific instance. */
  confidence: number;
  /**
   * For convention-drift (Layer C) findings: the repo-relative paths of the
   * nearest-neighbor files used as the comparison set when deciding "weird for
   * this repo" (Principle 7 — every convention finding ships its evidence).
   * Absent for diff-only findings that need no comparison set.
   */
  comparisonSet?: string[];
}

/**
 * A `Finding` after the ranking engine has applied diff-level context. The
 * detector output is preserved verbatim (including the base `severity`); the
 * ranking fields are additive so matching/printing keep working unchanged.
 */
export interface RankedFinding extends Finding {
  /** Final severity after the domain-proximity multiplier (Principle 3). */
  adjustedSeverity: Severity;
  /** Numeric rank key: severity points x domain x diff-size multipliers. */
  score: number;
  /** 1-based position after sorting by score (1 = most important). */
  rank: number;
  /** The multipliers applied, kept for auditability (Principle 6). */
  appliedMultipliers: { domain: number; diffSize: number };
  /**
   * Rule IDs of co-located findings folded into this one by dedup (Principle:
   * arch §3.5 "merged into a single combined finding"). Present only on a
   * survivor that absorbed others; the absorbed findings are dropped from the
   * ranked list. Sorted for deterministic comparison.
   */
  correlatedWith?: string[];
}

/** A file/line reference cited as evidence in an adjudication verdict. */
export interface Citation {
  file: string;
  lineStart: number;
  lineEnd: number;
  excerpt?: string;
}

export type VerdictOutcome = "confirmed" | "rejected" | "needs_review";

/** Identity of the finding an adjudicator judged. */
export interface FindingRef {
  category: SlopCategory;
  ruleId: string;
  file: string;
  lineStart: number;
  lineEnd: number;
}

/**
 * Citation-constrained verdict from the adjudication step (architecture §3.6).
 * A `confirmed` or `needs_review` verdict must carry at least one valid citation
 * inside the analysis unit — unsupported claims are rejected by validation.
 */
export interface AdjudicationVerdict {
  findingRef: FindingRef;
  outcome: VerdictOutcome;
  citations: Citation[];
  rationale: string;
  proposedFix?: string;
}

/** What the adjudicator receives for one ranked finding candidate. */
export interface AdjudicationInput {
  finding: RankedFinding;
  taskDescription?: string;
  /** Source snippet around the finding — lines from the analysis unit. */
  snippet: string;
}

/** Expected verdict shape for adjudication-eval rubric cases. */
export interface ExpectedAdjudicationVerdict {
  outcome: VerdictOutcome;
  citationCount?: number;
  citations?: Citation[];
  rationaleContains?: string[];
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

/** Fake-generality detector context (naming carve-out, etc.). */
export interface FakeGeneralityContext {
  /** When true, mechanical analysis runs via `runRepo` with naming suppress. */
  namingCarveout?: boolean;
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
  fakeGenerality?: FakeGeneralityContext;
}

/**
 * Per-repo overrides from the feedback loop (Principle 8): a repo's accumulated
 * "this rule is noise / this one's the headline" labels, expressed as ranking
 * inputs. Unit-level (one policy per diff), not per-file detector context, so it
 * rides on UnitContext rather than AnalysisMeta.
 */
export interface RepoPolicy {
  /** Rule IDs whose findings this repo drops entirely (never ranked/reported). */
  suppress?: string[];
  /**
   * Per-rule base-severity overrides, applied *before* domain proximity so the
   * proximity bump and diff-size multiplier still compose on top.
   */
  severityOverride?: Record<string, Severity>;
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

/**
 * A repo-context (non-diff) file made available to Layer-C detectors as part of
 * the comparison set. Carries the repo-relative `path` (so detectors can cite
 * it in `Finding.comparisonSet`) and its `content`. Never itself produces
 * findings — it's evidence about "how this repo does things", not changed code.
 */
export interface NeighborFile {
  path: string;
  content: string;
  meta?: AnalysisMeta;
}

/**
 * The repo-context view handed to Layer-C detectors (`runRepo`). Backed by the
 * retrieval index (`src/retrieval/`); the detector asks for the nearest
 * neighbors of a changed file and never touches the index/embeddings directly,
 * keeping the detector pure and deterministic.
 */
export interface RepoContext {
  /**
   * The `k` corpus files most similar to `file` (same folder/type/domain),
   * ranked most- to least-similar with a stable tiebreak. Empty when the repo
   * has no comparable neighbors — detectors must degrade gracefully (no fire).
   */
  nearestNeighbors(file: string, k?: number): NeighborFile[];
}

export interface Detector {
  /** Stable identifier, referenced by fixtures and reports. */
  id: string;
  category: SlopCategory;
  /**
   * Per-file detection: called once for each changed file. This is the fast
   * path most detectors use — it sees one file and never its siblings.
   */
  run?(input: DetectorInput): Finding[];
  /**
   * Whole-diff detection: called once with every file in the analysis unit.
   * For findings that require a cross-file view (e.g. "this new dependency is
   * imported in exactly one file across the diff"). A detector implements
   * `run`, `runProject`, or both. The harness runs each independently.
   */
  runProject?(inputs: DetectorInput[]): Finding[];
  /**
   * Repo-context detection (Tier C): called with the changed files plus a
   * `RepoContext` for nearest-neighbor retrieval over the rest of the repo.
   * For convention-drift findings that are statements about "weird for this
   * repo", not "bad in isolation". Only runs for fixtures/units that carry a
   * repo corpus; absent it, the detector simply isn't invoked.
   */
  runRepo?(inputs: DetectorInput[], repo: RepoContext): Finding[];
}

/**
 * Per-diff context the ranking engine needs to turn base-severity findings into
 * ranked, severity-adjusted ones. Built once per analysis unit (one fixture /
 * one diff) from the files under analysis — independent of any single detector.
 */
export interface UnitContext {
  /**
   * Resolve the sensitive domain (if any) for a file. Prefers explicit
   * `meta.domain`, falling back to path-pattern inference. `undefined` ⇒ the
   * file isn't in a sensitive domain, so no proximity bump applies.
   */
  domainForFile: (file: string) => Domain | undefined;
  /** Total added/changed lines across the unit — the diff-size signal. */
  totalChangedLines: number;
  /** Optional per-repo overrides (suppression, severity reweighting). */
  repoPolicy?: RepoPolicy;
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
  /**
   * Ranking-engine assertions (checked only when present). Unlike `severity`,
   * a mismatch on any of these IS a hard failure — they're the spec for the
   * ranking behaviors that have no "did it fire" signal of their own.
   */
  /** Expected 1-based position in the ranked list. */
  rank?: number;
  /** Expected diff-size score multiplier (`appliedMultipliers.diffSize`). */
  diffSizeMultiplier?: number;
  /** Expected rule IDs folded into this survivor by dedup (order-insensitive). */
  correlatedWith?: string[];
  /**
   * Expected convention comparison-set members. Asserted as a *subset*: every
   * listed path must appear in the finding's `comparisonSet` (robust to `k`
   * and neighbor tie-order). A mismatch is a hard failure.
   */
  comparisonSet?: string[];
}
