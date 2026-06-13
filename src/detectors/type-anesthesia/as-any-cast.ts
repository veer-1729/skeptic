import ts from "typescript";
import type { Detector, Finding } from "../../types.js";
import { isSensitiveDomain } from "../../context/domains.js";

/**
 * Flags `expr as any`. Severity bumps to "high" when the file carries a
 * sensitive domain tag (payments, auth, ...) — the minimal version of the
 * domain-proximity multiplier from the architecture doc, applied at
 * detection time rather than in the ranking engine. The sensitive-domain
 * set is shared via `context/domains.ts`, not duplicated here.
 */
export const asAnyCastDetector: Detector = {
  id: "as-any-cast",
  category: "type-anesthesia",

  run({ file, content, meta }) {
    const findings: Finding[] = [];
    const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

    function visit(node: ts.Node) {
      if (ts.isAsExpression(node) && node.type.kind === ts.SyntaxKind.AnyKeyword) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        findings.push({
          category: "type-anesthesia",
          ruleId: "as-any-cast",
          severity: isSensitiveDomain(meta?.domain) ? "high" : "medium",
          file,
          lineStart: line + 1,
          lineEnd: line + 1,
          message: "Value cast to `any` instead of resolving the underlying type mismatch.",
          confidence: 0.95,
        });
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return findings;
  },
};
