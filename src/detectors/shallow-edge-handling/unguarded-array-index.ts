import type { Detector, DetectorInput, Finding } from "../../types.js";
import ts from "typescript";
import { isAdded } from "../../context/diff.js";
import { findUnguardedZeroIndex } from "../../context/edge-patterns.js";

/**
 * Flags `[0]` access on array-like identifiers (`items`, `arr`, `rows`, …) when
 * the enclosing function has no `.length` guard.
 *
 * Skips non-empty array literals and `.at(0)`. Base severity "medium"; ranking
 * engine raises to "high" on sensitive domains.
 */
export const unguardedArrayIndexDetector: Detector = {
  id: "unguarded-array-index",
  category: "shallow-edge-handling",

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

    for (const site of findUnguardedZeroIndex(sourceFile)) {
      if (!isAdded(site.line, input)) continue;

      findings.push({
        category: "shallow-edge-handling",
        ruleId: "unguarded-array-index",
        severity: "medium",
        file,
        lineStart: site.line,
        lineEnd: site.line,
        message: `Unguarded array index: \`${site.arrayName}[0]\` with no empty-array check in the same function.`,
        confidence: 0.75,
      });
    }

    return findings;
  },
};
