import type { Detector, DetectorInput, Finding } from "../../types.js";
import ts from "typescript";
import { isAdded } from "../../context/diff.js";
import { findNaiveNameSplits } from "../../context/edge-patterns.js";

/**
 * Flags naive `.split(" ")` on name-like identifiers (`fullName`, `displayName`, …).
 * Prefer `.split(/\\s+/, 2)` or a dedicated name parser for locales and middle names.
 *
 * Base severity "medium"; ranking engine raises to "high" on sensitive domains.
 */
export const naiveNameSplitDetector: Detector = {
  id: "naive-name-split",
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

    for (const site of findNaiveNameSplits(sourceFile)) {
      if (!isAdded(site.line, input)) continue;

      findings.push({
        category: "shallow-edge-handling",
        ruleId: "naive-name-split",
        severity: "medium",
        file,
        lineStart: site.line,
        lineEnd: site.line,
        message:
          "Naive name split: `.split(\" \")` on a name-like value breaks on middle names and non-Latin scripts.",
        confidence: 0.8,
      });
    }

    return findings;
  },
};
