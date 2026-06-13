import ts from "typescript";
import type { Detector, DetectorInput, Finding } from "../../types.js";
import { isAdded } from "../../context/diff.js";

/**
 * Flags `console.log(...)` / `console.debug(...)` calls added in the diff —
 * debug output left behind from the AI's iterative process. Scoped to `log`
 * and `debug` only: `console.error`/`console.warn` are legitimate logging, a
 * different concern (and convention-drift territory), not dead leftovers.
 */
const DEBUG_METHODS = new Set(["log", "debug"]);

export const debugConsoleLogDetector: Detector = {
  id: "debug-console-log",
  category: "dead-leftovers",

  run(input: DetectorInput) {
    const { file, content } = input;
    const findings: Finding[] = [];
    const sourceFile = ts.createSourceFile(
      file,
      content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );

    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === "console" &&
        DEBUG_METHODS.has(node.expression.name.text)
      ) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        if (isAdded(line + 1, input)) {
          findings.push({
            category: "dead-leftovers",
            ruleId: "debug-console-log",
            severity: "low",
            file,
            lineStart: line + 1,
            lineEnd: line + 1,
            message: "Debug `console.log`/`console.debug` call left in the diff.",
            confidence: 0.95,
          });
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return findings;
  },
};
