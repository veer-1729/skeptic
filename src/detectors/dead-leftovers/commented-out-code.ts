import ts from "typescript";
import type { Detector, DetectorInput, Finding } from "../../types.js";
import { isAdded } from "../../context/diff.js";
import { getLineComments } from "../../context/comments.js";

/**
 * Flags blocks of commented-out code added in the diff — leftover code an AI
 * (or human) commented out instead of deleting.
 *
 * This is a fuzzy heuristic, not an exact AST rule, so the spec lives here
 * rather than being self-evident from the code:
 *
 * A `//` comment line (text after stripping `^//\s*`) is STRONG if it matches
 * any of:
 *   (a) ends with `;`  AND contains `=` or `(`
 *   (b) ends with `{`  AND (contains `(` OR starts with class/`} else`/try/do/finally)
 *   (c) contains `=>`
 *   (d) `^(const|let|var)\s+\w`, `^(async\s+)?function\b`, `^class\s+\w`,
 *       or `^(import|export)\b`
 *   (e) starts with return/throw/break/continue/yield/debugger as the leading
 *       word AND ends with `;`
 * ...UNLESS it first matches a "never strong" guard (these override a–e):
 *   - starts with e.g./eg/i.e./ie (case-insensitive)
 *   - starts with `@word` (`^@\w+`, JSDoc-tag-shaped)
 *   - is purely separator characters (`^[-=*#~_ ]+$`)
 *
 * GROUPING: consecutive `//` comment lines (by line number) form one block.
 * A block emits ONE finding spanning its full line range if at least one line
 * in it is strong, and `isAdded` holds for every line in the block (so a
 * commented function counts as a single leftover, and a block that's only
 * partly within the diff doesn't fire).
 *
 * Confidence is lower than the AST-exact rules (0.7) because it's a textual
 * heuristic with inherent edge cases, not a structural certainty.
 */
export const commentedOutCodeDetector: Detector = {
  id: "commented-out-code",
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

    const comments = getLineComments(sourceFile);

    let i = 0;
    while (i < comments.length) {
      let end = i;
      while (end + 1 < comments.length && comments[end + 1].line === comments[end].line + 1) {
        end++;
      }
      const block = comments.slice(i, end + 1);
      i = end + 1;

      const hasStrongLine = block.some((c) => isStrongLine(c.text));
      const allLinesAdded = block.every((c) => isAdded(c.line, input));
      if (!hasStrongLine || !allLinesAdded) continue;

      findings.push({
        category: "dead-leftovers",
        ruleId: "commented-out-code",
        severity: "low",
        file,
        lineStart: block[0].line,
        lineEnd: block[block.length - 1].line,
        message: "Block of commented-out code added in the diff.",
        confidence: 0.7,
      });
    }

    return findings;
  },
};

const NEVER_STRONG = [
  /^(e\.g\.|i\.e\.|eg\b|ie\b)/i,
  /^@\w+/,
  /^[-=*#~_ ]+$/,
];

function isStrongLine(commentText: string): boolean {
  const s = commentText.replace(/^\/\/\s*/, "").trimEnd();
  if (s.length === 0) return false;

  if (NEVER_STRONG.some((re) => re.test(s))) return false;

  // (a) statement / assignment / call
  if (s.endsWith(";") && /[=(]/.test(s)) return true;
  // (b) block opener
  if (s.endsWith("{") && (s.includes("(") || /^(class|} else|try|do|finally)\b/.test(s))) {
    return true;
  }
  // (c) arrow
  if (s.includes("=>")) return true;
  // (d) declaration / import in code shape
  if (/^(const|let|var)\s+\w/.test(s)) return true;
  if (/^(async\s+)?function\b/.test(s)) return true;
  if (/^class\s+\w/.test(s)) return true;
  if (/^(import|export)\b/.test(s)) return true;
  // (e) bare jump statement
  if (/^(return|throw|break|continue|yield|debugger)\b/.test(s) && s.endsWith(";")) return true;

  return false;
}
