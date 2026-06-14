import type {
  Finding,
  RankedFinding,
  Severity,
  UnitContext,
} from "../types.js";
import { applyDomain } from "./domain-proximity.js";
import { diffSizeMultiplier } from "./diff-size.js";
import { dedupeFindings } from "./dedup.js";
import { isSuppressed, policyBaseSeverity } from "./policy.js";

/** Base points per severity level — the spine of the numeric score. */
const SEVERITY_POINTS: Record<Severity, number> = {
  low: 1,
  medium: 3,
  high: 9,
};

/**
 * Turn the detectors' flat, base-severity findings into a ranked, severity-
 * adjusted list. The pipeline (arch §3.5):
 *
 *   1. Drop repo-suppressed rules (Principle 8).
 *   2. Re-baseline severity via repo override, then bump via domain proximity
 *      (Principle 3), and score as
 *        severityPoints(adjustedSeverity) × domainMultiplier × diffSizeMultiplier
 *      (Principle 2).
 *   3. Dedup co-located findings into one survivor each (§3.5).
 *   4. Sort by score descending and assign a 1-based `rank`.
 *
 * Pure: no I/O, no mutation of the input array (each finding is copied into a
 * new RankedFinding).
 */
export function rankFindings(
  findings: Finding[],
  ctx: UnitContext,
): RankedFinding[] {
  const diffSize = diffSizeMultiplier(ctx.totalChangedLines);

  const scored: RankedFinding[] = findings
    .filter((finding) => !isSuppressed(finding.ruleId, ctx.repoPolicy))
    .map((finding) => {
      const base = policyBaseSeverity(finding, ctx.repoPolicy);
      const domain = ctx.domainForFile(finding.file);
      const { severity: adjustedSeverity, multiplier: domainMult } = applyDomain(base, domain);
      const score = SEVERITY_POINTS[adjustedSeverity] * domainMult * diffSize;
      return {
        ...finding,
        adjustedSeverity,
        score,
        rank: 0,
        appliedMultipliers: { domain: domainMult, diffSize },
      };
    });

  const ranked = dedupeFindings(scored);

  ranked.sort((a, b) => b.score - a.score);
  ranked.forEach((finding, index) => {
    finding.rank = index + 1;
  });

  return ranked;
}
