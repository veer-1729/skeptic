import ts from "typescript";
import type { Detector, Finding } from "../../types.js";

/**
 * Flags imports of packages that don't resolve against a known-package
 * set. In fixtures, that set comes from meta.knownPackages (a mock
 * registry). In production this should be backed by a live registry
 * lookup (npm/PyPI/etc.) plus the curated hallucination-pattern list
 * described in the taxonomy doc — this is the minimal version that
 * proves the detection shape.
 */
export const unresolvedImportDetector: Detector = {
  id: "unresolved-import",
  category: "phantom-dependency",

  run({ file, content, meta }) {
    const findings: Finding[] = [];
    const known = new Set(meta?.packages?.known ?? []);
    const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

    function visit(node: ts.Node) {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const pkg = node.moduleSpecifier.text;
        const isRelative = pkg.startsWith(".") || pkg.startsWith("/");
        if (!isRelative && !known.has(pkg)) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          findings.push({
            category: "phantom-dependency",
            ruleId: "unresolved-import",
            severity: "high",
            file,
            lineStart: line + 1,
            lineEnd: line + 1,
            message: `Package "${pkg}" does not resolve against the known package set.`,
            confidence: 0.9,
          });
        }
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return findings;
  },
};
