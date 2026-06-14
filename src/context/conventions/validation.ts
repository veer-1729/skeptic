import ts from "typescript";

/**
 * How a file validates input. The convention-drift detector compares a changed
 * file's style against its neighbors.
 *  - `schema`:     Zod/Yup/Joi/class-validator `.parse`/`.safeParse`
 *  - `hand-rolled`: manual `if (!field || typeof field !== "string")` guards
 *  - `none`:       no validation signal
 */
export type ValidationStyle = "schema" | "hand-rolled" | "none";

const SCHEMA_MODULES = new Set(["zod", "yup", "joi", "class-validator"]);

function parse(content: string, fileName: string): ts.SourceFile {
  return ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function importsSchemaLibrary(sourceFile: ts.SourceFile): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text;
      if (SCHEMA_MODULES.has(spec) || spec.startsWith("zod/")) found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function isSchemaParseCall(node: ts.CallExpression): boolean {
  if (!ts.isPropertyAccessExpression(node.expression)) return false;
  const method = node.expression.name.text;
  if (method !== "parse" && method !== "safeParse") return false;
  const recv = node.expression.expression;
  return ts.isIdentifier(recv) || ts.isPropertyAccessExpression(recv);
}

function conditionHasTypeofOnProperty(expr: ts.Expression): boolean {
  let found = false;
  function walk(n: ts.Node) {
    if (found) return;
    if (ts.isTypeOfExpression(n)) {
      const inner = n.expression;
      if (ts.isPropertyAccessExpression(inner) || ts.isElementAccessExpression(inner)) {
        found = true;
        return;
      }
    }
    ts.forEachChild(n, walk);
  }
  walk(expr);
  return found;
}

function isHandRolledFieldGuard(node: ts.IfStatement): boolean {
  return conditionHasTypeofOnProperty(node.expression);
}

interface ValidationSignals {
  schema: boolean;
  handRolled: boolean;
}

function collectSignals(sourceFile: ts.SourceFile): ValidationSignals {
  const signals: ValidationSignals = { schema: false, handRolled: false };

  if (importsSchemaLibrary(sourceFile)) signals.schema = true;

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && isSchemaParseCall(node)) {
      signals.schema = true;
    }
    if (ts.isIfStatement(node) && isHandRolledFieldGuard(node)) {
      signals.handRolled = true;
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return signals;
}

/** Classify a single file's validation style. Precedence: `schema > hand-rolled > none`. */
export function fileValidationStyle(content: string, fileName = "file.ts"): ValidationStyle {
  const sourceFile = parse(content, fileName);
  const s = collectSignals(sourceFile);
  if (s.schema) return "schema";
  if (s.handRolled) return "hand-rolled";
  return "none";
}

export interface ValidationDriftSite {
  line: number;
  label: string;
}

/** Hand-rolled field-validation guards — drift when the repo uses schema libraries. */
export function findValidationDriftSites(content: string, fileName: string): ValidationDriftSite[] {
  const sourceFile = parse(content, fileName);
  const sites: ValidationDriftSite[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isIfStatement(node) && isHandRolledFieldGuard(node)) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      sites.push({ line: line + 1, label: "typeof field guard" });
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return sites;
}
