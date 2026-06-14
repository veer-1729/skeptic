import ts from "typescript";
import { findEnvReads } from "../env-access.js";

/**
 * How a file accesses environment configuration. The convention-drift detector
 * compares a changed file's pattern against its neighbors.
 *  - `centralized`: imports from a central config/env module, or *is* that module
 *  - `direct`:    reads `process.env` directly in application code
 *  - `none`:      no env-access signal — not evidence about env convention
 */
export type EnvAccessStyle = "centralized" | "direct" | "none";

/** Whether `path` is the repo's central config module (allowed to read process.env). */
export function isConfigModulePath(path: string): boolean {
  return /(^|\/)config(\/index)?\.(ts|js|mts|cts)$/.test(path) ||
    /(^|\/)env(\/index)?\.(ts|js|mts|cts)$/.test(path);
}

/** Whether an import specifier points at a central config/env module. */
function isConfigModuleImport(spec: string): boolean {
  if (spec === "config" || spec === "env") return true;
  return /(^|\/)config$/.test(spec) || /(^|\/)env$/.test(spec);
}

function parse(content: string, fileName: string): ts.SourceFile {
  return ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function importsConfigModule(sourceFile: ts.SourceFile): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      if (isConfigModuleImport(node.moduleSpecifier.text)) found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

/**
 * Classify a single file's env-access style. Precedence for profile building:
 * `centralized > direct > none`. Config modules classify as centralized even
 * when they read `process.env` internally — that's the whole point of them.
 */
export function fileEnvAccessStyle(content: string, fileName = "file.ts"): EnvAccessStyle {
  if (isConfigModulePath(fileName)) return "centralized";

  const sourceFile = parse(content, fileName);
  const reads = findEnvReads(sourceFile);
  if (reads.length > 0) return "direct";
  if (importsConfigModule(sourceFile)) return "centralized";
  return "none";
}

/** Direct `process.env` reads in application code — drift sites when the repo centralizes config. */
export function findEnvDriftSites(content: string, fileName: string): { line: number; label: string }[] {
  if (isConfigModulePath(fileName)) return [];

  const sourceFile = parse(content, fileName);
  return findEnvReads(sourceFile).map((r) => ({
    line: r.line,
    label: `process.env.${r.envVar}`,
  }));
}
