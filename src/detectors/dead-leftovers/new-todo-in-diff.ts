import ts from "typescript";
import type { Detector, DetectorInput, Finding } from "../../types.js";
import { isAdded } from "../../context/diff.js";
import { getLineComments } from "../../context/comments.js";

/**
 * Flags `// TODO` / `// FIXME` / `// XXX` marker comments added in the diff.
 *
 * The marker must be the leading token of the comment (right after `//` and
 * any whitespace), case-insensitive — so "todo"/"fixme" appearing as ordinary
 * prose mid-comment (e.g. "// Render the todo list") is not a marker. We scan
 * real comment trivia via `getLineComments` rather than raw line text, so a
 * `//` sequence inside a string literal (e.g. a URL) can never be mistaken for
 * a comment.
 */
const MARKER = /^\/\/\s*(todo|fixme|xxx)\b/i;

export const newTodoInDiffDetector: Detector = {
  id: "new-todo-in-diff",
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

    for (const comment of getLineComments(sourceFile)) {
      if (!MARKER.test(comment.text)) continue;
      if (!isAdded(comment.line, input)) continue;

      findings.push({
        category: "dead-leftovers",
        ruleId: "new-todo-in-diff",
        severity: "low",
        file,
        lineStart: comment.line,
        lineEnd: comment.line,
        message: "New TODO/FIXME/XXX marker comment added in the diff.",
        confidence: 0.9,
      });
    }

    return findings;
  },
};
