import ts from "typescript";
import type { Detector, Finding } from "../../types.js";
import { isSensitiveDomain } from "../../context/domains.js";

/**
 * Flags `.catch(handler)` where the handler is an inline function whose body
 * is empty (or comment-only) — `.catch(() => {})`. The rejection is caught
 * and discarded, so a failed promise looks identical to a successful one to
 * everything downstream: the async equivalent of an empty catch block.
 *
 * Scoped to a literal empty function body to stay high-precision. A handler
 * that logs, rethrows, or otherwise does work (`.catch(err => logger.error(err))`)
 * has a non-empty body and is left alone.
 */
export const swallowedPromiseRejectionDetector: Detector = {
  id: "swallowed-promise-rejection",
  category: "error-fog",

  run({ file, content, meta }) {
    const findings: Finding[] = [];
    const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

    function visit(node: ts.Node) {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "catch" &&
        node.arguments.length === 1 &&
        isEmptyHandler(node.arguments[0])
      ) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.expression.name.getStart());
        findings.push({
          category: "error-fog",
          ruleId: "swallowed-promise-rejection",
          severity: isSensitiveDomain(meta?.domain) ? "high" : "medium",
          file,
          lineStart: line + 1,
          lineEnd: line + 1,
          message: "Promise rejection is caught and silently discarded by an empty `.catch` handler.",
          confidence: 0.9,
        });
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return findings;
  },
};

/**
 * True for an arrow/function expression with an empty block body — `() => {}`
 * or a block whose only content is a comment (comments aren't statements).
 * Concise-expression arrows (`() => log(e)`) have an expression body, not a
 * block, and are not considered empty.
 */
function isEmptyHandler(arg: ts.Expression): boolean {
  if (!ts.isArrowFunction(arg) && !ts.isFunctionExpression(arg)) return false;
  const { body } = arg;
  return ts.isBlock(body) && body.statements.length === 0;
}
