import type { Detector, Finding } from "../../types.js";
import { isSensitiveDomain } from "../../context/domains.js";

/**
 * Flags `@ts-ignore` / `@ts-expect-error` directives that carry no
 * explanation — neither trailing text on the directive line itself nor a
 * descriptive comment on the line immediately above. A bare directive
 * silences the type checker without recording why, which is the type-anesthesia
 * smell; a directive with a stated reason is a deliberate, reviewable choice.
 *
 * This is one of the few genuinely textual signals (it lives in comments, which
 * aren't part of the syntax tree), so line scanning is the right tool here
 * rather than the AST.
 */
const DIRECTIVE = /\/\/\s*@ts-(ignore|expect-error)\b(.*)$/;
const COMMENT_LINE = /^\s*(\/\/|\/\*|\*)/;

export const tsIgnoreUnexplainedDetector: Detector = {
  id: "ts-ignore-unexplained",
  category: "type-anesthesia",

  run({ file, content, meta }) {
    const findings: Finding[] = [];
    const lines = content.split("\n");

    lines.forEach((line, index) => {
      const match = DIRECTIVE.exec(line);
      if (!match) return;

      const trailing = stripCommentText(match[2]);
      if (trailing.length > 0) return; // explained on the same line

      const prev = lines[index - 1] ?? "";
      if (precedingLineExplains(prev)) return;

      findings.push({
        category: "type-anesthesia",
        ruleId: "ts-ignore-unexplained",
        severity: isSensitiveDomain(meta?.domain) ? "high" : "medium",
        file,
        lineStart: index + 1,
        lineEnd: index + 1,
        message:
          "`@ts-ignore`/`@ts-expect-error` suppresses a type error with no explanation of why.",
        confidence: 0.9,
      });
    });

    return findings;
  },
};

/** Strip leading separators (`:`, `-`, whitespace) from a directive's tail. */
function stripCommentText(text: string): string {
  return text.replace(/^[\s:–-]+/, "").trim();
}

/** True when the previous line is a non-directive comment with real content. */
function precedingLineExplains(prev: string): boolean {
  if (!COMMENT_LINE.test(prev)) return false;
  if (DIRECTIVE.test(prev)) return false;
  const text = prev
    .replace(/^\s*\/\/+/, "")
    .replace(/^\s*\/\*+/, "")
    .replace(/\*+\/\s*$/, "")
    .replace(/^\s*\*+/, "")
    .trim();
  return text.length > 0;
}
