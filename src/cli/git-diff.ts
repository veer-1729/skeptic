import type { LineRange } from "../types.js";

export interface ParsedDiffFile {
  /** Repo-relative path (forward slashes). */
  path: string;
  addedRanges: LineRange[];
}

/** Merge sorted 1-based line numbers into inclusive contiguous ranges. */
function mergeLineRanges(lines: number[]): LineRange[] {
  if (lines.length === 0) return [];
  const sorted = [...lines].sort((a, b) => a - b);
  const ranges: LineRange[] = [];
  let start = sorted[0]!;
  let end = start;
  for (let i = 1; i < sorted.length; i++) {
    const line = sorted[i]!;
    if (line === end + 1) end = line;
    else {
      ranges.push({ start, end });
      start = end = line;
    }
  }
  ranges.push({ start, end });
  return ranges;
}

/**
 * Parse a unified diff into per-file added line ranges in the *new* file.
 * Skips deleted-only files and binary patches.
 */
export function parseUnifiedDiff(diff: string): ParsedDiffFile[] {
  const files: ParsedDiffFile[] = [];
  const chunks = diff.split(/^diff --git /m).filter(Boolean);

  for (const chunk of chunks) {
    if (chunk.includes("Binary files ")) continue;

    const header = chunk.match(/^a\/(.+?) b\/(.+)$/m);
    if (!header) continue;
    const path = header[2]!;
    if (path === "dev/null") continue;

    const addedLines: number[] = [];
    let newLine = 0;
    let inHunk = false;

    for (const line of chunk.split("\n")) {
      const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (hunk) {
        newLine = Number(hunk[1]);
        inHunk = true;
        continue;
      }
      if (!inHunk) continue;
      // `--- a/x` / `+++ b/x` headers only appear *before* the first hunk, where
      // `!inHunk` already skipped them — so no guard for them is needed here, and
      // a guard on `+++`/`---` would wrongly drop a genuine added line whose
      // content begins with `++ ` / `-- ` (it shows up as `+++…` / `---…`).

      if (line.startsWith("\\")) {
        // "\ No newline at end of file" — patch metadata, not a content line. It
        // must NOT advance the new-file counter (doing so shifts every later
        // added line by one when it follows a deletion/addition mid-hunk).
        continue;
      }

      if (line.startsWith("+")) {
        addedLines.push(newLine);
        newLine++;
      } else if (line.startsWith("-")) {
        // removed from old file — does not advance new-file line counter
      } else if (line.startsWith(" ")) {
        // context line — present in both sides, advances the new-file counter
        newLine++;
      }
    }

    if (addedLines.length > 0) {
      files.push({ path, addedRanges: mergeLineRanges(addedLines) });
    }
  }

  return files;
}
