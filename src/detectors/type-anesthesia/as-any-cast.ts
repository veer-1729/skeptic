import ts from "typescript";
import type { Detector, Finding } from "../../types.js";

/**
 * Flags `expr as any`. Severity bumps to "high" when the fixture/file
 * carries a sensitive domain tag (payments, auth, ...) — this is the
 * minimal version of the domain-proximity multiplier from the
 * architecture doc, applied at detection time rather than in the
 * ranking engine. As more detectors need this, it should move to a
 * shared helper rather than being duplicated per-detector.
 */
export const asAnyCastDetector: Detector = {
  id: "as-any-cast",
  category: "type-anesthesia",

  run({ file, content, meta }) {
    const findings: Finding[] = [];
    const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const domain = meta?.domain as string | undefined;
    const sensitiveDomains = new Set(["payments", "auth", "billing", "permissions", "migrations"]);

    function visit(node: ts.Node) {
      if (ts.isAsExpression(node) && node.type.kind === ts.SyntaxKind.AnyKeyword) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        findings.push({
          category: "type-anesthesia",
          ruleId: "as-any-cast",
          severity: domain && sensitiveDomains.has(domain) ? "high" : "medium",
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
