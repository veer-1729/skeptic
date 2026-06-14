import ts from "typescript";
import type { Detector, Finding } from "../../types.js";

/**
 * Flags `catch` blocks with no executable body — `catch (e) {}` or a block
 * whose only content is a comment. Comments are not statements, so an
 * empty-statement block and a comment-only block are the same shape to the
 * AST, and both swallow the error silently: the error-fog smell of trading
 * observability for "doesn't crash". Emits a base severity of "medium"; the
 * ranking engine raises it to "high" for sensitive-domain files.
 */
export const emptyCatchDetector: Detector = {
  id: "empty-catch",
  category: "error-fog",

  run({ file, content }) {
    const findings: Finding[] = [];
    const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

    function visit(node: ts.Node) {
      if (ts.isCatchClause(node) && node.block.statements.length === 0) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        findings.push({
          category: "error-fog",
          ruleId: "empty-catch",
          severity: "medium",
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
