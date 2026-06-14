import ts from "typescript";

/**
 * How a file shapes error responses. The convention-drift detector compares a
 * changed file's pattern against its neighbors.
 *  - `structured`: `{ error: { code, message } }`, `AppError`, or imports from an errors module
 *  - `bare`:       flat `{ message }`, `res.send("...")`, undifferentiated failures
 *  - `none`:       no error-response signal
 */
export type ErrorResponseStyle = "structured" | "bare" | "none";

function parse(content: string, fileName: string): ts.SourceFile {
  return ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function isErrorsModuleImport(spec: string): boolean {
  return spec === "errors" || /(^|\/)errors$/.test(spec);
}

function isErrorsModulePath(path: string): boolean {
  return /(^|\/)errors(\/index)?\.(ts|js|mts|cts)$/.test(path);
}

function importsErrorsModule(sourceFile: ts.SourceFile): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      if (isErrorsModuleImport(node.moduleSpecifier.text)) found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function isStructuredErrorObject(obj: ts.ObjectLiteralExpression): boolean {
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;
    if (prop.name.text !== "error") continue;
    if (ts.isObjectLiteralExpression(prop.initializer)) {
      const keys = new Set(
        prop.initializer.properties
          .filter((p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name))
          .map((p) => (p as ts.PropertyAssignment).name.getText()),
      );
      if (keys.has("code") || keys.has("message")) return true;
    }
  }
  return false;
}

function isBareMessageObject(obj: ts.ObjectLiteralExpression): boolean {
  let hasMessage = false;
  let hasError = false;
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;
    if (prop.name.text === "message") hasMessage = true;
    if (prop.name.text === "error") hasError = true;
  }
  return hasMessage && !hasError;
}

interface StyleSignals {
  structured: boolean;
  bare: boolean;
}

function collectSignals(sourceFile: ts.SourceFile): StyleSignals {
  const signals: StyleSignals = { structured: false, bare: false };

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      if (isErrorsModuleImport(node.moduleSpecifier.text)) signals.structured = true;
    }

    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
      if (node.expression.text.endsWith("Error") && node.expression.text !== "Error") {
        signals.structured = true;
      }
    }

    if (ts.isCallExpression(node)) {
      const jsonArg = findJsonArgument(node);
      if (jsonArg) {
        if (isStructuredErrorObject(jsonArg)) signals.structured = true;
        else if (isBareMessageObject(jsonArg)) signals.bare = true;
      }

      if (isBareSendCall(node)) signals.bare = true;
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return signals;
}

/** Walk a `.json(...)` / `.send(...)` chain and return the first object-literal arg. */
function findJsonArgument(node: ts.CallExpression): ts.ObjectLiteralExpression | undefined {
  let cur: ts.Node = node;
  while (ts.isCallExpression(cur)) {
    const callee = cur.expression;
    if (ts.isPropertyAccessExpression(callee)) {
      const method = callee.name.text;
      if (method === "json" || method === "send") {
        const [arg] = cur.arguments;
        if (arg && ts.isObjectLiteralExpression(arg)) return arg;
        if (method === "send" && arg && ts.isStringLiteral(arg)) return undefined;
      }
    }
    if (!ts.isPropertyAccessExpression(callee)) break;
    cur = callee.expression;
  }
  return undefined;
}

function isBareSendCall(node: ts.CallExpression): boolean {
  if (!ts.isPropertyAccessExpression(node.expression)) return false;
  if (node.expression.name.text !== "send") return false;
  const [arg] = node.arguments;
  if (arg === undefined) return false;
  if (ts.isObjectLiteralExpression(arg)) {
    return isBareMessageObject(arg) && !isStructuredErrorObject(arg);
  }
  return true;
}

/**
 * Classify a single file's error-response style. Precedence:
 * `structured > bare > none`.
 */
export function fileErrorResponseStyle(content: string, fileName = "file.ts"): ErrorResponseStyle {
  if (isErrorsModulePath(fileName)) return "structured";

  const sourceFile = parse(content, fileName);
  if (importsErrorsModule(sourceFile)) return "structured";

  const s = collectSignals(sourceFile);
  if (s.structured) return "structured";
  if (s.bare) return "bare";
  return "none";
}

export interface ErrorDriftSite {
  line: number;
  label: string;
}

/** Bare error-response sites — drift when the repo uses structured errors. */
export function findErrorDriftSites(content: string, fileName: string): ErrorDriftSite[] {
  const sourceFile = parse(content, fileName);
  const sites: ErrorDriftSite[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const jsonArg = findJsonArgument(node);
      if (jsonArg && isBareMessageObject(jsonArg)) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        sites.push({ line: line + 1, label: "res.status(...).json({ message })" });
      }
      if (isBareSendCall(node)) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        sites.push({ line: line + 1, label: "res.send(...)" });
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return sites;
}
