import ts from "typescript";

export const PROMISE_KEYWORDS =
  /\b(ensure|guarantee|validate|secure|prevent|must|only)\b/i;

const ACCESS_COMMENT = /\b(user|own|access|tenant|only)\b/i;
const VALIDATE_COMMENT = /\b(validate|secure)\b/i;

export interface PromiseCommentSite {
  line: number;
  text: string;
}

/** Single-line `//` comments whose text matches {@link PROMISE_KEYWORDS}. */
export function findPromiseComments(sourceFile: ts.SourceFile): PromiseCommentSite[] {
  const sites: PromiseCommentSite[] = [];
  const text = sourceFile.getFullText();

  for (const range of ts.getLeadingCommentRanges(text, 0) ?? []) {
    addCommentRange(range, text, sourceFile, sites);
  }

  function visit(node: ts.Node) {
    const ranges = ts.getLeadingCommentRanges(text, node.getFullStart());
    if (ranges) {
      for (const range of ranges) {
        addCommentRange(range, text, sourceFile, sites);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return sites;
}

function addCommentRange(
  range: ts.CommentRange,
  text: string,
  sourceFile: ts.SourceFile,
  sites: PromiseCommentSite[],
) {
  const raw = text.slice(range.pos, range.end);
  const body = raw.replace(/^\/\/\/?\s*/, "").replace(/^\/\*\*?\s*/, "").replace(/\*\/$/, "").trim();
  if (/\b(TODO|FIXME|HACK|XXX)\b/i.test(body)) return;
  if (!PROMISE_KEYWORDS.test(body)) return;

  const { line } = sourceFile.getLineAndCharacterOfPosition(range.pos);
  const site = { line: line + 1, text: body };
  if (!sites.some((s) => s.line === site.line && s.text === site.text)) {
    sites.push(site);
  }
}

export function enclosingFunction(node: ts.Node): ts.FunctionLikeDeclaration | undefined {
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

/** Mechanical guard check — keyword pre-filter, not full semantic compliance. */
export function functionHasStructuralGuard(
  fn: ts.FunctionLikeDeclaration,
  commentText: string,
): boolean {
  const body = fn.body;
  if (!body) return false;

  const accessComment = ACCESS_COMMENT.test(commentText);
  const validateComment = VALIDATE_COMMENT.test(commentText);
  const subjectIds = accessComment
    ? ["userId", "user", "tenantId", "ownerId", "accountId"]
    : [];

  let guarded = false;

  function walk(node: ts.Node) {
    if (guarded) return;

    if (ts.isIfStatement(node) && referencesSubject(node.expression, subjectIds, accessComment)) {
      guarded = true;
      return;
    }

    if (validateComment && ts.isCallExpression(node) && callLooksLikeValidation(node)) {
      guarded = true;
      return;
    }

    if (accessComment && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) {
      if (sqlHasAccessFilter(node.text)) {
        guarded = true;
        return;
      }
    }

    ts.forEachChild(node, walk);
  }

  walk(body);
  return guarded;
}

function referencesSubject(
  expr: ts.Expression,
  subjectIds: string[],
  accessComment: boolean,
): boolean {
  if (!accessComment) return false;
  let found = false;
  function walk(node: ts.Node) {
    if (found) return;
    if (ts.isIdentifier(node) && subjectIds.includes(node.text)) {
      found = true;
      return;
    }
    ts.forEachChild(node, walk);
  }
  walk(expr);
  return found;
}

function callLooksLikeValidation(node: ts.CallExpression): boolean {
  if (!ts.isPropertyAccessExpression(node.expression)) return false;
  const name = node.expression.name.text;
  return name === "parse" || name === "safeParse" || name === "validate";
}

function sqlHasAccessFilter(text: string): boolean {
  return /\buserId\b/i.test(text) || /\btenantId\b/i.test(text) || /\bownerId\b/i.test(text);
}

/** Map a comment line to its enclosing function by scanning the AST. */
export function functionEnclosingLine(
  sourceFile: ts.SourceFile,
  line: number,
): ts.FunctionLikeDeclaration | undefined {
  let found: ts.FunctionLikeDeclaration | undefined;

  function visit(node: ts.Node) {
    if (found) return;
    const { line: nodeLine } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    if (nodeLine + 1 === line && ts.isFunctionDeclaration(node)) {
      found = node;
      return;
    }
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node)
    ) {
      const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
      if (line >= start && line <= end) {
        found = node;
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return found;
}
