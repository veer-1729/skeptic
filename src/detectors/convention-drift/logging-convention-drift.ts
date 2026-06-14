import ts from "typescript";
import type { Detector, DetectorInput, Finding, RepoContext } from "../../types.js";
import { isAdded } from "../../context/diff.js";
import { isStrongConvention, loggingProfile } from "../../context/conventions/logging.js";

/**
 * Console methods this rule treats as convention drift when the repo logs via a
 * structured logger. Deliberately excludes `log`/`debug` — those are
 * `debug-console-log`'s territory (dead leftovers), a different concern.
 */
const DRIFT_CONSOLE_METHODS = new Set(["error", "warn", "info"]);

/**
 * Convention drift (Layer C): the changed file logs with `console.error`/
 * `.warn`/`.info` (or a bare `print(...)`) while its nearest neighbors in the
 * repo overwhelmingly use a structured logger. The same line in isolation is
 * fine — what makes it slop is that it's *alien to this repository*. Pure: it
 * only reads the changed file and the `RepoContext` the harness hands it, never
 * touching the index or filesystem itself.
 *
 * Base severity `medium`; the ranking engine layers domain proximity on top
 * (so the same drift in `src/payments/` outranks it in a generic route).
 */
export const loggingConventionDriftDetector: Detector = {
  id: "logging-convention-drift",
  category: "convention-drift",

  runRepo(inputs: DetectorInput[], repo: RepoContext): Finding[] {
    const findings: Finding[] = [];

    for (const input of inputs) {
      const neighbors = repo.nearestNeighbors(input.file);
      const profile = loggingProfile(neighbors);
      // Only flag against a strong *structured-logging* convention. A repo that
      // itself consoles (003) or has no clear convention (005/006) → no fire.
      if (!isStrongConvention(profile) || profile.dominant !== "structured") continue;

      findings.push(...scanFile(input, profile.sampleFiles, profile.adherenceRatio));
    }

    return findings;
  },
};

/** Emit a drift finding for each offending console/print call on an added line. */
function scanFile(input: DetectorInput, comparisonSet: string[], adherence: number): Finding[] {
  const { file, content } = input;
  const findings: Finding[] = [];
  const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  const visit = (node: ts.Node) => {
    const method = driftCallMethod(node);
    if (method) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      if (isAdded(line + 1, input)) {
        findings.push({
          category: "convention-drift",
          ruleId: "logging-convention-drift",
          severity: "medium",
          file,
          lineStart: line + 1,
          lineEnd: line + 1,
          message: `Logs via \`${method}\`, but ${comparisonSet.length} comparable files in this repo use a structured logger — drifts from the local logging convention.`,
          confidence: adherence,
          comparisonSet,
        });
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return findings;
}

/**
 * If `node` is a drift-worthy logging call, return a label for it
 * (`console.error` / `print`); otherwise undefined.
 */
function driftCallMethod(node: ts.Node): string | undefined {
  if (!ts.isCallExpression(node)) return undefined;
  const callee = node.expression;

  if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)) {
    if (callee.expression.text === "console" && DRIFT_CONSOLE_METHODS.has(callee.name.text)) {
      return `console.${callee.name.text}`;
    }
  }
  if (ts.isIdentifier(callee) && callee.text === "print") {
    return "print";
  }
  return undefined;
}
