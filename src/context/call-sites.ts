import { posix } from "path";
import ts from "typescript";
import type { DetectorInput } from "../types.js";
import { isAdded } from "./diff.js";

export type AbstractionKind = "function" | "class" | "const-fn";

/**
 * A newly-introduced, module-level declaration that *could* be a premature
 * abstraction — the unit the fake-generality detector counts call sites for.
 */
export interface AbstractionCandidate {
  name: string;
  kind: AbstractionKind;
  file: string;
  /** 1-based line of the declaration's first token. */
  line: number;
}

/** An arrow function or `function` expression assigned to a const — a "const-fn". */
function isFunctionLikeInitializer(node: ts.Expression): boolean {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

function parse(file: string, content: string): ts.SourceFile {
  return ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

/**
 * Module-level function / class / const-arrow declarations whose first line is
 * part of the added diff. Only *top-level* statements count: a helper nested
 * inside another function is local scaffolding the caller already owns, not an
 * abstraction handed to the rest of the codebase. `isAdded` gating keeps the
 * rule scoped to new code — a pre-existing single-use helper that the diff
 * merely calls is not this diff's slop.
 */
export function collectCandidates(input: DetectorInput): AbstractionCandidate[] {
  const sourceFile = parse(input.file, input.content);
  const candidates: AbstractionCandidate[] = [];
  const lineOf = (node: ts.Node) =>
    sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;

  for (const stmt of sourceFile.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      const line = lineOf(stmt);
      if (isAdded(line, input)) {
        candidates.push({ name: stmt.name.text, kind: "function", file: input.file, line });
      }
    } else if (ts.isClassDeclaration(stmt) && stmt.name) {
      const line = lineOf(stmt);
      if (isAdded(line, input)) {
        candidates.push({ name: stmt.name.text, kind: "class", file: input.file, line });
      }
    } else if (ts.isVariableStatement(stmt)) {
      const line = lineOf(stmt);
      for (const decl of stmt.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          decl.initializer &&
          isFunctionLikeInitializer(decl.initializer) &&
          isAdded(line, input)
        ) {
          candidates.push({ name: decl.name.text, kind: "const-fn", file: input.file, line });
        }
      }
    }
  }

  return candidates;
}

/**
 * A module identifier: a file path stripped of its extension, with the
 * fixture-only `input.` prefix removed so a flat fixture's `input.helper.ts`
 * matches an `import … from "./helper"` in `input.main.ts`. Real repo paths
 * (`src/services/orderService.ts`) round-trip unchanged. Used to resolve a
 * relative import specifier to the file it points at.
 */
function fileModuleId(filePath: string): string {
  const dir = posix.dirname(filePath);
  let base = posix.basename(filePath);
  const dot = base.lastIndexOf(".");
  if (dot > 0) base = base.slice(0, dot);
  if (base.startsWith("input.")) base = base.slice("input.".length);
  return posix.normalize(posix.join(dir, base));
}

/** Resolve a relative import specifier (from `importerPath`) to a module id. */
function importModuleId(importerPath: string, specifier: string): string {
  const joined = posix.join(posix.dirname(importerPath), specifier);
  let base = posix.basename(joined);
  const dot = base.lastIndexOf(".");
  if (dot > 0) base = base.slice(0, dot);
  return posix.normalize(posix.join(posix.dirname(joined), base));
}

function isRelativeSpecifier(spec: string): boolean {
  return spec.startsWith(".") || spec.startsWith("/");
}

/** Imported binding names introduced by an import declaration. */
function importBindingNames(node: ts.ImportDeclaration): string[] {
  const names: string[] = [];
  const clause = node.importClause;
  if (!clause) return names;
  if (clause.name) names.push(clause.name.text);
  const bindings = clause.namedBindings;
  if (bindings) {
    if (ts.isNamespaceImport(bindings)) names.push(bindings.name.text);
    else if (ts.isNamedImports(bindings)) for (const el of bindings.elements) names.push(el.name.text);
  }
  return names;
}

interface FileBindings {
  /** Binding name → resolved module id, for *relative* imports only. */
  relativeImports: Map<string, string>;
  /** Names declared at module level in this file. */
  moduleDeclared: Set<string>;
}

function fileBindings(sourceFile: ts.SourceFile, filePath: string): FileBindings {
  const relativeImports = new Map<string, string>();
  const moduleDeclared = new Set<string>();

  for (const stmt of sourceFile.statements) {
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const spec = stmt.moduleSpecifier.text;
      if (isRelativeSpecifier(spec)) {
        const id = importModuleId(filePath, spec);
        for (const name of importBindingNames(stmt)) relativeImports.set(name, id);
      }
    } else if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      moduleDeclared.add(stmt.name.text);
    } else if (ts.isClassDeclaration(stmt) && stmt.name) {
      moduleDeclared.add(stmt.name.text);
    } else if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) moduleDeclared.add(decl.name.text);
      }
    }
  }

  return { relativeImports, moduleDeclared };
}

/** Count `name(...)` / `new name(...)` whose callee is the bare identifier `name`. */
function countCalleeRefs(sourceFile: ts.SourceFile, name: string): number {
  let count = 0;
  const visit = (node: ts.Node) => {
    if (
      (ts.isCallExpression(node) || ts.isNewExpression(node)) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === name
    ) {
      count++;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return count;
}

/**
 * Call sites across the unit that actually resolve to `candidate`, not merely
 * share its name. Within the candidate's own file every callee reference counts.
 * In another file a call counts only when that file imports the name through a
 * *relative* specifier that resolves to the candidate's module — so a same-named
 * symbol that's locally declared, imported from an external package, or imported
 * from a different relative module is correctly attributed elsewhere and never
 * inflates the candidate's count. References that aren't calls (callbacks,
 * re-exports, type positions) are ignored throughout.
 */
export function countCallSites(inputs: DetectorInput[], candidate: AbstractionCandidate): number {
  const declarerId = fileModuleId(candidate.file);
  let count = 0;

  for (const input of inputs) {
    const sourceFile = parse(input.file, input.content);
    if (input.file === candidate.file) {
      count += countCalleeRefs(sourceFile, candidate.name);
      continue;
    }
    const { relativeImports, moduleDeclared } = fileBindings(sourceFile, input.file);
    // A local declaration of the same name shadows the import — those calls are
    // this file's own symbol, not the candidate.
    if (moduleDeclared.has(candidate.name)) continue;
    if (relativeImports.get(candidate.name) === declarerId) {
      count += countCalleeRefs(sourceFile, candidate.name);
    }
  }

  return count;
}
