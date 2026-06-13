import ts from "typescript";
import type { Detector, Finding } from "../../types.js";
import { isSensitiveDomain } from "../../context/domains.js";

/**
 * Flags `catch` blocks with no executable body — `catch (e) {}` or a block
 * whose only content is a comment. Comments are not statements, so an
 * empty-statement block and a comment-only block are the same shape to the
 * AST, and both swallow the error silently: the error-fog smell of trading
 * observability for "doesn't crash". Severity bumps to "high" in a sensitive
 * domain via the shared `isSensitiveDomain` shortcut.
 */
export const emptyCatchDetector: Detector = {
  id: "empty-catch",
  category: "error-fog",

  run({ file, content, meta }) {
    const findings: Finding[] = [];
    const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

    function visit(node: ts.Node) {
      if (ts.isCatchClause(node) && node.block.statements.length === 0) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        findings.push({
          category: "error-fog",
          ruleId: "empty-catch",
          severity: isSensitiveDomain(meta?.domain) ? "high" : "medium",
          file,
          lineStart: line + 1,
          lineEnd: line + 1,
          message: "Empty catch block swallows the error with no logging, rethrow, or handling.",
          confidence: 0.9,
        });
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return findings;
  },
};
