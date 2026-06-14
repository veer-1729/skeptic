import type { Finding, RepoPolicy, Severity } from "../types.js";

/**
 * Per-repo policy (Principle 8): the feedback loop's learned weights, applied as
 * two ranking inputs. Both are keyed by `ruleId` and are pure lookups — the
 * ranking engine calls them while mapping findings, never the detectors.
 */

/** Whether this repo drops the rule entirely (suppressed ⇒ never ranked). */
export function isSuppressed(ruleId: string, policy: RepoPolicy | undefined): boolean {
  return policy?.suppress?.includes(ruleId) ?? false;
}

/**
 * The base severity to score with, after any repo override. Applied before
 * domain proximity (see RepoPolicy docs), so a repo can re-baseline a rule and
 * still get the sensitive-domain bump on top.
 */
export function policyBaseSeverity(finding: Finding, policy: RepoPolicy | undefined): Severity {
  return policy?.severityOverride?.[finding.ruleId] ?? finding.severity;
}
