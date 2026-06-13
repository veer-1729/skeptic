import ts from "typescript";
import type { Detector, DetectorInput, Finding } from "../../types.js";

/**
 * Flags a newly-added, real dependency that's pulled in for a single use —
 * the "this could have been a one-liner" half of dependency creep (taxonomy
 * category 6). "New" means imported but absent from `meta.packages.existing`;
 * "real" means present in `meta.packages.known` (distinguishing this from a
 * phantom/hallucinated package, which is Category 3's job).
 *
 * This is a whole-diff detector (`runProject`): it needs to see every changed
 * file to tell "imported in exactly one file" (creep) from "imported across
 * several files" (load-bearing). Within that single file it also requires the
 * import to be referenced exactly once, so a dependency that's heavily used in
 * one file isn't flagged.
 */

interface PkgUseInFile {
  file: string;
  line: number;
  refs: number;
}

function bindingNames(node: ts.ImportDeclaration): string[] {
  const names: string[] = [];
  const clause = node.importClause;
  if (!clause) return names;
  if (clause.name) names.push(clause.name.text);
  const bindings = clause.namedBindings;
  if (bindings) {
    if (ts.isNamespaceImport(bindings)) {
      names.push(bindings.name.text);
    } else if (ts.isNamedImports(bindings)) {
      for (const el of bindings.elements) names.push(el.name.text);
    }
  }
  return names;
}

/** Counts references to any of `names` in `sourceFile`, skipping the import sites. */
function countReferences(
  sourceFile: ts.SourceFile,
  names: Set<string>,
  importRanges: [number, number][]
): number {
  let count = 0;
  function walk(node: ts.Node) {
    const inImport = importRanges.some(([s, e]) => node.getStart() >= s && node.getEnd() <= e);
    if (!inImport && ts.isIdentifier(node) && names.has(node.text)) count++;
    ts.forEachChild(node, walk);
  }
  walk(sourceFile);
  return count;
}

/** Per-file map of package → {imported binding names, import ranges, first import line}. */
function importsInFile(sourceFile: ts.SourceFile) {
  const byPkg = new Map<string, { names: Set<string>; ranges: [number, number][]; line: number }>();

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const pkg = node.moduleSpecifier.text;
      const isRelative = pkg.startsWith(".") || pkg.startsWith("/");
      if (!isRelative) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        const entry = byPkg.get(pkg) ?? { names: new Set<string>(), ranges: [], line: line + 1 };
        for (const n of bindingNames(node)) entry.names.add(n);
        entry.ranges.push([node.getStart(), node.getEnd()]);
        entry.line = Math.min(entry.line, line + 1);
        byPkg.set(pkg, entry);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return byPkg;
}

export const singleUseNewDependencyDetector: Detector = {
  id: "single-use-new-dependency",
  category: "dependency-creep",

  runProject(inputs: DetectorInput[]): Finding[] {
    // The dependency-creep context lives in meta; if no file carries an
    // `existing` set, this isn't a dependency-creep analysis unit — stay silent.
    const hasContext = inputs.some((i) => i.meta?.packages?.existing !== undefined);
    if (!hasContext) return [];

    const existing = new Set<string>();
    const known = new Set<string>();
    for (const input of inputs) {
      for (const e of input.meta?.packages?.existing ?? []) existing.add(e);
      for (const k of input.meta?.packages?.known ?? []) known.add(k);
    }

    // package → the files that import it (with per-file usage).
    const byPkg = new Map<string, PkgUseInFile[]>();
    for (const input of inputs) {
      const sourceFile = ts.createSourceFile(
        input.file,
        input.content,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS
      );
      for (const [pkg, entry] of importsInFile(sourceFile)) {
        const refs = entry.names.size === 0 ? 0 : countReferences(sourceFile, entry.names, entry.ranges);
        const uses = byPkg.get(pkg) ?? [];
        uses.push({ file: input.file, line: entry.line, refs });
        byPkg.set(pkg, uses);
      }
    }

    const findings: Finding[] = [];
    for (const [pkg, uses] of byPkg) {
      const isNew = !existing.has(pkg);
      const isReal = known.has(pkg);
      if (!isNew || !isReal) continue;

      // Creep signal: imported in exactly one file, and used once in that file.
      if (uses.length !== 1) continue;
      const [use] = uses;
      if (use.refs !== 1) continue;

      findings.push({
        category: "dependency-creep",
        ruleId: "single-use-new-dependency",
        severity: "medium",
        file: use.file,
        lineStart: use.line,
        lineEnd: use.line,
        message: `New dependency "${pkg}" is imported in a single file for a single use — likely avoidable with existing code.`,
        confidence: 0.7,
      });
    }

    return findings;
  },
};
