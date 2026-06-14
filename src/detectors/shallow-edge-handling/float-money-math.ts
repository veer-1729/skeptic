import type { Detector, DetectorInput, Finding } from "../../types.js";
import ts from "typescript";
import { isAdded } from "../../context/diff.js";
import { findHundredScaleOps } from "../../context/edge-patterns.js";

/**
 * Flags float money scaling via `* 100` or `/ 100` on dollar-like identifiers
 * (`amount`, `price`, `dollars`, …) without an integer-cents naming pattern.
 *
 * Safe alternatives (not flagged): dividing a `cents`/`amountCents` integer by 100;
 * `Math.floor(dollars * 100)` is still flagged — rounding does not fix float error.
 *
 * Base severity "medium"; ranking engine raises to "high" on sensitive domains.
 */
export const floatMoneyMathDetector: Detector = {
  id: "float-money-math",
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

    for (const site of findHundredScaleOps(sourceFile)) {
      if (!isAdded(site.line, input)) continue;

      const opPhrase = site.operator === "*" ? "multiply by 100" : "divide by 100";
      findings.push({
        category: "shallow-edge-handling",
        ruleId: "float-money-math",
        severity: "medium",
        file,
        lineStart: site.line,
        lineEnd: site.line,
        message: `Float money math: ${opPhrase} on a dollar-like value instead of integer cents.`,
        confidence: 0.85,
      });
    }

    return findings;
  },
};
