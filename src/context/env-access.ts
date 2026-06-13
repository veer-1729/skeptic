import ts from "typescript";
import { looksLikeSecret } from "./secrets.js";

export interface EnvFallback {
  envVar: string;
  operator: "||" | "??";
  fallback: ts.Expression;
  /** 1-based line of the `||`/`??` expression. */
  line: number;
}

export type EnvFallbackKind = "secret" | "localhost" | "generic";

/**
 * Finds `process.env.X` (or `process.env["X"]`) on the left of a `||`/`??`
 * with a literal fallback on the right — the shared shape for all three
 * magic-fallback rules.
 */
export function findEnvFallbacks(sourceFile: ts.SourceFile): EnvFallback[] {
  const sites: EnvFallback[] = [];

  function visit(node: ts.Node) {
    if (ts.isBinaryExpression(node)) {
      const op = node.operatorToken.kind;
      if (
        (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) &&
        isLiteralFallback(node.right)
      ) {
        const envVar = findEnvVarInSubtree(node.left);
        if (envVar) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          sites.push({
            envVar,
            operator: op === ts.SyntaxKind.BarBarToken ? "||" : "??",
            fallback: node.right,
            line: line + 1,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return sites;
}

/** Whether `node` is a baked-in default (literal), not another env/config read. */
export function isLiteralFallback(node: ts.Expression): boolean {
  return (
    ts.isStringLiteral(node) ||
    ts.isNumericLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    node.kind === ts.SyntaxKind.NullKeyword ||
    ts.isArrayLiteralExpression(node) ||
    ts.isObjectLiteralExpression(node)
  );
}

/**
 * Classifies an env-fallback site. Mutually exclusive precedence:
 *   secret > localhost > generic
 */
export function classifyEnvFallback(
  site: EnvFallback,
  secretNames: Set<string>
): EnvFallbackKind {
  if (looksLikeSecret(site.envVar, secretNames) && ts.isStringLiteral(site.fallback)) {
    return "secret";
  }
  if (ts.isStringLiteral(site.fallback) && isLocalhostFallback(site.fallback.text)) {
    return "localhost";
  }
  return "generic";
}

function isLocalhostFallback(text: string): boolean {
  return /localhost|127\.0\.0\.1/i.test(text);
}

function findEnvVarInSubtree(node: ts.Node): string | undefined {
  let found: string | undefined;
  function walk(n: ts.Node) {
    const v = extractEnvVarName(n);
    if (v) found = v;
    ts.forEachChild(n, walk);
  }
  walk(node);
  return found;
}

function extractEnvVarName(node: ts.Node): string | undefined {
  if (ts.isPropertyAccessExpression(node)) {
    if (
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "process" &&
      node.expression.name.text === "env"
    ) {
      return node.name.text;
    }
  }
  if (ts.isElementAccessExpression(node)) {
    if (
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "process" &&
      node.expression.name.text === "env" &&
      ts.isStringLiteral(node.argumentExpression)
    ) {
      return node.argumentExpression.text;
    }
  }
  return undefined;
}
