import ts from "typescript";
import type { Detector, Finding } from "../../types.js";

/**
 * Flags a non-empty catch block that never references the caught error and
 * collapses it into a generic outcome — a literal `return`, an HTTP 5xx
 * response, or a fresh `throw new Error(...)` that drops the original cause.
 * This is the error-fog pattern where a typed/structured error is replaced by
 * an undifferentiated failure, so the caller (and the incident responder)
 * can't tell what actually went wrong.
 *
 * Empty / comment-only catch blocks are deliberately left to `empty-catch`;
 * this rule only fires when there IS a body and that body discards the error.
 * The "error never referenced" guard is what keeps the negatives clean: a
 * catch that reads `e.message`, re-throws `e`, or chains `{ cause: e }` is
 * preserving evidence and must not be flagged.
 */
export const broadCatchGeneric500Detector: Detector = {
  id: "broad-catch-generic-500",
  category: "error-fog",

  run({ file, content }) {
    const findings: Finding[] = [];
    const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

    function visit(node: ts.Node) {
      if (ts.isCatchClause(node) && node.block.statements.length > 0) {
        const bindingName = getBindingName(node.variableDeclaration);
        if (!referencesIdentifier(node.block, bindingName) && hasGenericOutcome(node.block)) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          findings.push({
            category: "error-fog",
            ruleId: "broad-catch-generic-500",
            severity: "medium",
            file,
            lineStart: line + 1,
            lineEnd: line + 1,
            message:
              "Catch block discards the original error and returns a generic failure, hiding the real cause.",
            confidence: 0.85,
          });
        }
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return findings;
  },
};

/** The bound error identifier, e.g. `e` in `catch (e)`. Undefined for `catch {}`. */
function getBindingName(decl: ts.VariableDeclaration | undefined): string | undefined {
  if (decl && ts.isIdentifier(decl.name)) return decl.name.text;
  return undefined;
}

/** True if any identifier named `name` appears anywhere inside `node`. */
function referencesIdentifier(node: ts.Node, name: string | undefined): boolean {
  if (name === undefined) return false;
  let found = false;
  function walk(n: ts.Node) {
    if (found) return;
    if (ts.isIdentifier(n) && n.text === name) {
      found = true;
      return;
    }
    ts.forEachChild(n, walk);
  }
  walk(node);
  return found;
}

/**
 * A generic outcome is any of:
 *  - a `return` of a literal / object / array (or a bare `return`),
 *  - a `*.status(5xx)` call (an HTTP error response),
 *  - a `throw new Error(...)` (a fresh error; the original cause is already
 *    known to be unreferenced by the caller).
 */
function hasGenericOutcome(block: ts.Block): boolean {
  let generic = false;
  function walk(n: ts.Node) {
    if (generic) return;
    if (ts.isReturnStatement(n) && isGenericReturnExpression(n.expression)) {
      generic = true;
      return;
    }
    if (ts.isCallExpression(n) && isFiveHundredStatusCall(n)) {
      generic = true;
      return;
    }
    if (ts.isThrowStatement(n) && isNewError(n.expression)) {
      generic = true;
      return;
    }
    ts.forEachChild(n, walk);
  }
  walk(block);
  return generic;
}

function isGenericReturnExpression(expr: ts.Expression | undefined): boolean {
  if (expr === undefined) return true; // bare `return;`
  return (
    ts.isObjectLiteralExpression(expr) ||
    ts.isArrayLiteralExpression(expr) ||
    ts.isStringLiteral(expr) ||
    ts.isNumericLiteral(expr) ||
    expr.kind === ts.SyntaxKind.TrueKeyword ||
    expr.kind === ts.SyntaxKind.FalseKeyword ||
    expr.kind === ts.SyntaxKind.NullKeyword ||
    (ts.isIdentifier(expr) && expr.text === "undefined")
  );
}

/** Matches `something.status(NNN)` where NNN is a 5xx literal. */
function isFiveHundredStatusCall(call: ts.CallExpression): boolean {
  if (!ts.isPropertyAccessExpression(call.expression)) return false;
  if (call.expression.name.text !== "status") return false;
  const [arg] = call.arguments;
  if (!arg || !ts.isNumericLiteral(arg)) return false;
  const code = Number(arg.text);
  return code >= 500 && code <= 599;
}

/** Matches `new Error(...)` (any Error-named constructor). */
function isNewError(expr: ts.Expression | undefined): boolean {
  return (
    expr !== undefined &&
    ts.isNewExpression(expr) &&
    ts.isIdentifier(expr.expression) &&
    expr.expression.text.endsWith("Error")
  );
}
