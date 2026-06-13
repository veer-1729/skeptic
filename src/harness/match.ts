import type { ExpectedFinding, Finding } from "../types.js";

export interface MatchResult {
  matched: { expected: ExpectedFinding; actual: Finding }[];
  /** Expected findings nothing actual matched — missed detections. */
  falseNegatives: ExpectedFinding[];
  /** Actual findings nothing expected matched — spurious detections. */
  falsePositives: Finding[];
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart <= bEnd && aEnd >= bStart;
}

/**
 * Greedy bipartite match between expected and actual findings.
 *
 * Two findings match if:
 *  - category is equal, AND
 *  - ruleId is equal (or the fixture didn't specify one), AND
 *  - their line ranges overlap.
 *
 * Severity is NOT part of the match — a severity mismatch on an
 * otherwise-matched finding is reported separately as a warning,
 * so retuning severity thresholds doesn't break the suite outright.
 */
export function matchFindings(actual: Finding[], expected: ExpectedFinding[]): MatchResult {
  const remainingActual = [...actual];
  const matched: MatchResult["matched"] = [];
  const falseNegatives: ExpectedFinding[] = [];

  for (const exp of expected) {
    const idx = remainingActual.findIndex(
      (act) =>
        act.category === exp.category &&
        (exp.ruleId === undefined || act.ruleId === exp.ruleId) &&
        overlaps(act.lineStart, act.lineEnd, exp.lineStart, exp.lineEnd)
    );
    if (idx === -1) {
      falseNegatives.push(exp);
    } else {
      matched.push({ expected: exp, actual: remainingActual[idx] });
      remainingActual.splice(idx, 1);
    }
  }

  return { matched, falseNegatives, falsePositives: remainingActual };
}
