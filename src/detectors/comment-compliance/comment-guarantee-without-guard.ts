import type { Detector, DetectorInput, Finding } from "../../types.js";
import ts from "typescript";
import { isAdded } from "../../context/diff.js";
import {
  findPromiseComments,
  functionEnclosingLine,
  functionHasStructuralGuard,
} from "../../context/comment-guarantees.js";

/**
 * Flags added-line comments with promise keywords (`ensure`, `guarantee`, …)
 * when the enclosing function lacks a structural guard (conditional, throw,
 * user-scoped query filter, or validation call).
 *
 * Mechanical pre-filter only — full semantic compliance is adjudication's job.
 * Base severity "medium"; ranking engine raises to "high" on sensitive domains.
 */
export const commentGuaranteeWithoutGuardDetector: Detector = {
  id: "comment-guarantee-without-guard",
  category: "comment-compliance",

  run(input: DetectorInput) {
    const { file, content } = input;
    const sourceFile = ts.createSourceFile(
      file,
      content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const findings: Finding[] = [];

    for (const site of findPromiseComments(sourceFile)) {
      if (!isAdded(site.line, input)) continue;

      const fn = functionEnclosingLine(sourceFile, site.line);
      if (!fn) continue;
      if (functionHasStructuralGuard(fn, site.text)) continue;

      findings.push({
        category: "comment-compliance",
        ruleId: "comment-guarantee-without-guard",
        severity: "medium",
        file,
        lineStart: site.line,
        lineEnd: site.line,
        message:
          "Comment promises a guarantee but the enclosing function has no matching guard or enforcement.",
        confidence: 0.65,
      });
    }

    return findings;
  },
};
