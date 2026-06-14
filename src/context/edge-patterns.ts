import ts from "typescript";

const MONEY_NAME = /(?:amount|price|dollar|cost|total|fee|subtotal|balance|payment)/i;
const CENTS_NAME = /cent/i;
const NAME_LIKE = /(?:^full|^display|^customer|^user|^first|^last|name$|Name$)/i;

/** Bare identifier looks like a person/name field. */
export function isNameLikeExpression(expr: ts.Expression): boolean {
  if (!ts.isIdentifier(expr)) return false;
  return NAME_LIKE.test(expr.text);
}

/** Bare identifier looks like a money float (not integer cents). */
export function isMoneyLikeExpression(expr: ts.Expression): boolean {
  if (!ts.isIdentifier(expr)) return false;
  const name = expr.text;
  if (CENTS_NAME.test(name)) return false;
  return MONEY_NAME.test(name);
}

/** Operand is stored or named as integer cents — safe for `/ 100`. */
export function isIntegerCentsExpression(expr: ts.Expression): boolean {
  const name = expressionName(expr);
  return name !== undefined && CENTS_NAME.test(name);
}

function expressionName(expr: ts.Expression): string | undefined {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  if (ts.isElementAccessExpression(expr) && ts.isStringLiteral(expr.argumentExpression)) {
    return expr.argumentExpression.text;
  }
  return undefined;
}

export interface HundredScaleSite {
  /** 1-based line of the `* 100` or `/ 100` expression. */
  line: number;
  operator: "*" | "/";
  moneyOperand: ts.Expression;
}

/**
 * Finds `moneyExpr * 100`, `moneyExpr / 100`, and wrapped forms like
 * `Math.floor(dollars * 100)`.
 */
export function findHundredScaleOps(sourceFile: ts.SourceFile): HundredScaleSite[] {
  const sites: HundredScaleSite[] = [];

  function visit(node: ts.Node) {
    if (ts.isBinaryExpression(node)) {
      const op = node.operatorToken.kind;
      if (op === ts.SyntaxKind.AsteriskToken) {
        const site = hundredMultiply(node);
        if (site) sites.push(withLine(sourceFile, node, site));
      } else if (op === ts.SyntaxKind.SlashToken) {
        const site = hundredDivide(node);
        if (site) sites.push(withLine(sourceFile, node, site));
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return sites;
}

function withLine(
  sourceFile: ts.SourceFile,
  node: ts.BinaryExpression,
  site: Omit<HundredScaleSite, "line">,
): HundredScaleSite {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { ...site, line: line + 1 };
}

function hundredMultiply(node: ts.BinaryExpression): Omit<HundredScaleSite, "line"> | undefined {
  if (isLiteral100(node.left) && isMoneyLikeExpression(node.right)) {
    return { operator: "*", moneyOperand: node.right };
  }
  if (isLiteral100(node.right) && isMoneyLikeExpression(node.left)) {
    return { operator: "*", moneyOperand: node.left };
  }
  return undefined;
}

function hundredDivide(node: ts.BinaryExpression): Omit<HundredScaleSite, "line"> | undefined {
  if (!isLiteral100(node.right)) return undefined;
  if (isIntegerCentsExpression(node.left)) return undefined;
  if (isMoneyLikeExpression(node.left)) {
    return { operator: "/", moneyOperand: node.left };
  }
  return undefined;
}

function isLiteral100(expr: ts.Expression): boolean {
  return ts.isNumericLiteral(expr) && expr.text === "100";
}

export interface NaiveNameSplitSite {
  line: number;
}

/** Finds `nameLike.split(" ")` — single-space string literal, not `/\\s+/`. */
export function findNaiveNameSplits(sourceFile: ts.SourceFile): NaiveNameSplitSite[] {
  const sites: NaiveNameSplitSite[] = [];

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      if (node.expression.name.text !== "split") {
        ts.forEachChild(node, visit);
        return;
      }
      const [firstArg] = node.arguments;
      if (!firstArg || !isSingleSpaceLiteral(firstArg)) {
        ts.forEachChild(node, visit);
        return;
      }
      if (!isNameLikeExpression(node.expression.expression)) {
        ts.forEachChild(node, visit);
        return;
      }
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      sites.push({ line: line + 1 });
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return sites;
}

function isSingleSpaceLiteral(expr: ts.Expression): boolean {
  return ts.isStringLiteral(expr) && expr.text === " ";
}

const ARRAY_LIKE = /(?:^items$|^arr$|^list$|^results$|^rows$|^lines$|^elements$|^records$|^data$)/i;

export interface UnguardedZeroIndexSite {
  line: number;
  arrayName: string;
}

/** Finds `items[0]`-style access without a `.length` guard in the same function. */
export function findUnguardedZeroIndex(
  sourceFile: ts.SourceFile,
): UnguardedZeroIndexSite[] {
  const sites: UnguardedZeroIndexSite[] = [];

  function visit(node: ts.Node) {
    if (ts.isElementAccessExpression(node)) {
      const site = zeroIndexSite(node, sourceFile);
      if (site) {
        const fn = enclosingFunction(node);
        if (fn && !hasLengthGuard(fn, site.arrayName)) {
          sites.push(site);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return sites;
}

function zeroIndexSite(
  node: ts.ElementAccessExpression,
  sourceFile: ts.SourceFile,
): UnguardedZeroIndexSite | undefined {
  if (ts.isArrayLiteralExpression(node.expression)) return undefined;
  if (!ts.isIdentifier(node.expression) || !ARRAY_LIKE.test(node.expression.text)) {
    return undefined;
  }
  if (!ts.isNumericLiteral(node.argumentExpression) || node.argumentExpression.text !== "0") {
    return undefined;
  }
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { line: line + 1, arrayName: node.expression.text };
}

function enclosingFunction(node: ts.Node): ts.FunctionLikeDeclaration | undefined {
  let current: ts.Node | undefined = node;
  while (current) {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isMethodDeclaration(current) ||
      ts.isArrowFunction(current) ||
      ts.isFunctionExpression(current)
    ) {
      return current;
    }
    current = current.parent;
  }
  return undefined;
}

function hasLengthGuard(fn: ts.FunctionLikeDeclaration, arrayName: string): boolean {
  const body = fn.body;
  if (!body) return false;
  let guarded = false;

  function scan(node: ts.Node) {
    if (guarded) return;
    if (ts.isIfStatement(node) && conditionChecksLength(node.expression, arrayName)) {
      guarded = true;
      return;
    }
    ts.forEachChild(node, scan);
  }

  scan(body);
  return guarded;
}

function conditionChecksLength(expr: ts.Expression, arrayName: string): boolean {
  let found = false;
  function walk(node: ts.Node) {
    if (found) return;
    if (
      ts.isPropertyAccessExpression(node) &&
      node.name.text === "length" &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === arrayName
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, walk);
  }
  walk(expr);
  return found;
}
