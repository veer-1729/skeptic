import ts from "typescript";

/**
 * Has `variableName` been narrowed away from null/undefined by a guard that
 * dominates `usage` within `enclosingFunction`?
 *
 * Deliberately bounded — this covers only the common, mechanically-obvious
 * guard shapes, not full control-flow narrowing. The cases handled:
 *
 *   1. early exit:   `if (x === null) return/throw`  (also `== null`,
 *                    `=== undefined`, `== undefined`, `if (!x) ...`)
 *   2. truthy block: the usage sits inside `if (x) { ... }` (or
 *                    `if (x !== null)` / `if (x != null)`)
 *   3. nullish set:  `x = x ?? fallback` or `x ??= fallback` before the usage
 *
 * Anything more elaborate (ternaries, `&&` short-circuits, switch, helper
 * predicates) is intentionally out of scope; callers should treat a `false`
 * here as "not obviously narrowed", not "definitely still nullable".
 */
export function isNarrowedBefore(
  variableName: string,
  enclosingFunction: ts.Node,
  usage: ts.Node,
  sourceFile: ts.SourceFile
): boolean {
  // Case 2: usage is inside the then-branch of a truthy-narrowing `if`.
  let node: ts.Node | undefined = usage;
  while (node && node !== enclosingFunction) {
    const parent = node.parent;
    if (parent && ts.isIfStatement(parent) && parent.thenStatement === node) {
      if (isTruthyNarrowing(parent.expression, variableName)) return true;
    }
    node = parent;
  }

  // Cases 1 and 3: a guard/reassignment positioned before the usage.
  const usageStart = usage.getStart(sourceFile);
  let narrowed = false;
  const visit = (n: ts.Node) => {
    if (narrowed) return;
    if (n.end <= usageStart) {
      if (
        ts.isIfStatement(n) &&
        isNullishCheck(n.expression, variableName) &&
        branchExits(n.thenStatement)
      ) {
        narrowed = true;
        return;
      }
      if (isNullishReassignment(n, variableName)) {
        narrowed = true;
        return;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(enclosingFunction);
  return narrowed;
}

function isNamed(expr: ts.Expression, name: string): boolean {
  return ts.isIdentifier(expr) && expr.text === name;
}

function isNullOrUndefined(expr: ts.Expression): boolean {
  return (
    expr.kind === ts.SyntaxKind.NullKeyword ||
    (ts.isIdentifier(expr) && expr.text === "undefined")
  );
}

/** `x === null`, `x == null`, `x === undefined`, `x == undefined`, `!x`. */
function isNullishCheck(expr: ts.Expression, name: string): boolean {
  if (
    ts.isPrefixUnaryExpression(expr) &&
    expr.operator === ts.SyntaxKind.ExclamationToken
  ) {
    return isNamed(expr.operand, name);
  }
  if (ts.isBinaryExpression(expr)) {
    const op = expr.operatorToken.kind;
    if (
      op === ts.SyntaxKind.EqualsEqualsToken ||
      op === ts.SyntaxKind.EqualsEqualsEqualsToken
    ) {
      return (
        (isNamed(expr.left, name) && isNullOrUndefined(expr.right)) ||
        (isNamed(expr.right, name) && isNullOrUndefined(expr.left))
      );
    }
  }
  return false;
}

/** `if (x)`, `if (x !== null)`, `if (x != null)`, `if (x !== undefined)`. */
function isTruthyNarrowing(expr: ts.Expression, name: string): boolean {
  if (isNamed(expr, name)) return true;
  if (ts.isBinaryExpression(expr)) {
    const op = expr.operatorToken.kind;
    if (
      op === ts.SyntaxKind.ExclamationEqualsToken ||
      op === ts.SyntaxKind.ExclamationEqualsEqualsToken
    ) {
      return (
        (isNamed(expr.left, name) && isNullOrUndefined(expr.right)) ||
        (isNamed(expr.right, name) && isNullOrUndefined(expr.left))
      );
    }
  }
  return false;
}

/** `return` or `throw`, directly or as the first such statement in a block. */
function branchExits(stmt: ts.Statement): boolean {
  if (ts.isReturnStatement(stmt) || ts.isThrowStatement(stmt)) return true;
  if (ts.isBlock(stmt)) {
    return stmt.statements.some(
      (s) => ts.isReturnStatement(s) || ts.isThrowStatement(s)
    );
  }
  return false;
}

/** `x = x ?? fallback` or `x ??= fallback`. */
function isNullishReassignment(node: ts.Node, name: string): boolean {
  if (!ts.isBinaryExpression(node)) return false;
  if (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionEqualsToken) {
    return isNamed(node.left, name);
  }
  if (node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    return (
      isNamed(node.left, name) &&
      ts.isBinaryExpression(node.right) &&
      node.right.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
    );
  }
  return false;
}
