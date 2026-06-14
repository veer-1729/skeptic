import ts from "typescript";
import type { Detector, Finding } from "../../types.js";
import { isNarrowedBefore } from "../../context/narrowing.js";

/**
 * Flags `expr!` where `expr` is a local variable whose declaration earlier in
 * the same function carries a null/undefined-bearing type — unless a narrowing
 * guard between the declaration and the assertion has already ruled out
 * null/undefined (in which case the `!` is redundant, not slop).
 *
 * Without a type checker (detectors are pure, no lib resolution), nullability
 * is inferred syntactically from three bounded signals: an explicit nullish
 * union annotation, a property access whose property is typed nullable in a
 * type/interface declared in the same file, or a call to a standard-library
 * method known to return `T | undefined`.
 */
const NULLABLE_RETURNING = new Set(["find", "get"]);

export const nonNullAssertionNearNullableDetector: Detector = {
  id: "non-null-assertion-near-nullable",
  category: "type-anesthesia",

  run({ file, content }) {
    const findings: Finding[] = [];
    const sourceFile = ts.createSourceFile(
      file,
      content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );

    const visit = (node: ts.Node) => {
      if (ts.isNonNullExpression(node) && ts.isIdentifier(node.expression)) {
        const name = node.expression.text;
        const fn = enclosingFunction(node);
        if (fn) {
          const decl = findDeclarationBefore(fn, name, node.getStart(sourceFile), sourceFile);
          if (
            decl &&
            declaredNullable(decl, sourceFile) &&
            !isNarrowedBefore(name, fn, node, sourceFile)
          ) {
            const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
            findings.push({
              category: "type-anesthesia",
              ruleId: "non-null-assertion-near-nullable",
              severity: "medium",
              file,
              lineStart: line + 1,
              lineEnd: line + 1,
              message:
                "Non-null assertion (`!`) on a value typed as nullable, with no guard narrowing it first.",
              confidence: 0.85,
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return findings;
  },
};

function enclosingFunction(node: ts.Node): ts.Node | undefined {
  let n = node.parent;
  while (n) {
    if (
      ts.isFunctionDeclaration(n) ||
      ts.isFunctionExpression(n) ||
      ts.isArrowFunction(n) ||
      ts.isMethodDeclaration(n) ||
      ts.isGetAccessorDeclaration(n) ||
      ts.isConstructorDeclaration(n)
    ) {
      return n;
    }
    n = n.parent;
  }
  return undefined;
}

/** Nearest `const`/`let` declaration of `name` that starts before `beforePos`. */
function findDeclarationBefore(
  fn: ts.Node,
  name: string,
  beforePos: number,
  sourceFile: ts.SourceFile
): ts.VariableDeclaration | undefined {
  let found: ts.VariableDeclaration | undefined;
  const visit = (n: ts.Node) => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === name &&
      n.getStart(sourceFile) < beforePos
    ) {
      if (!found || n.getStart(sourceFile) > found.getStart(sourceFile)) found = n;
    }
    ts.forEachChild(n, visit);
  };
  visit(fn);
  return found;
}

function declaredNullable(decl: ts.VariableDeclaration, sourceFile: ts.SourceFile): boolean {
  if (decl.type) return typeIncludesNullish(decl.type);

  const init = decl.initializer;
  if (!init) return false;

  if (ts.isPropertyAccessExpression(init)) {
    return propertyTypedNullable(init.name.text, sourceFile);
  }
  if (ts.isCallExpression(init) && ts.isPropertyAccessExpression(init.expression)) {
    return NULLABLE_RETURNING.has(init.expression.name.text);
  }
  return false;
}

function typeIncludesNullish(type: ts.TypeNode): boolean {
  if (type.kind === ts.SyntaxKind.UndefinedKeyword) return true;
  if (ts.isLiteralTypeNode(type) && type.literal.kind === ts.SyntaxKind.NullKeyword) {
    return true;
  }
  if (ts.isUnionTypeNode(type)) return type.types.some(typeIncludesNullish);
  return false;
}

/** Does any property named `propName` in a same-file type/interface declare a
 *  null/undefined-bearing type? */
function propertyTypedNullable(propName: string, sourceFile: ts.SourceFile): boolean {
  let nullable = false;
  const visit = (n: ts.Node) => {
    if (nullable) return;
    if (
      ts.isPropertySignature(n) &&
      n.name &&
      ts.isIdentifier(n.name) &&
      n.name.text === propName &&
      n.type &&
      typeIncludesNullish(n.type)
    ) {
      nullable = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(sourceFile);
  return nullable;
}
