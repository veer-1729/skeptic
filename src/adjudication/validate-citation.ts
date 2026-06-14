import type { Citation, LineRange } from "../types.js";

export interface UnitFiles {
  /** Repo-relative path → 1-based line count (or added ranges when known). */
  files: Map<string, { lineCount: number; addedRanges?: LineRange[] }>;
}

/** Build a unit file map from detector inputs (harness / CLI). */
export function unitFilesFromInputs(
  inputs: { file: string; content: string; addedRanges?: LineRange[] }[],
): UnitFiles {
  const files = new Map<string, { lineCount: number; addedRanges?: LineRange[] }>();
  for (const input of inputs) {
    files.set(input.file, {
      lineCount: input.content.split("\n").length,
      addedRanges: input.addedRanges,
    });
  }
  return { files };
}

function lineInRanges(line: number, ranges: LineRange[] | undefined, lineCount: number): boolean {
  if (!ranges || ranges.length === 0) return line >= 1 && line <= lineCount;
  return ranges.some((r) => line >= r.start && line <= r.end);
}

/**
 * Does `citation` point at a real line in the analysis unit?
 * When added ranges are known, citations must fall on added/changed lines.
 */
export function isValidCitation(citation: Citation, unit: UnitFiles): boolean {
  const entry = unit.files.get(citation.file);
  if (!entry) return false;
  if (citation.lineStart < 1 || citation.lineEnd < citation.lineStart) return false;
  if (citation.lineEnd > entry.lineCount) return false;
  for (let line = citation.lineStart; line <= citation.lineEnd; line++) {
    if (!lineInRanges(line, entry.addedRanges, entry.lineCount)) return false;
  }
  return true;
}

export interface VerdictValidationError {
  message: string;
}

/**
 * Validate an adjudication verdict against the unit. Returns errors (empty ⇒ valid).
 * - `confirmed` / `needs_review` require ≥1 valid citation.
 * - `rejected` may omit citations.
 */
export function validateVerdict(
  verdict: { outcome: string; citations: Citation[] },
  unit: UnitFiles,
): VerdictValidationError[] {
  const errors: VerdictValidationError[] = [];
  const needsCitations = verdict.outcome === "confirmed" || verdict.outcome === "needs_review";

  if (needsCitations && verdict.citations.length === 0) {
    errors.push({ message: `${verdict.outcome} verdict requires at least one citation` });
    return errors;
  }

  for (const c of verdict.citations) {
    if (!isValidCitation(c, unit)) {
      errors.push({
        message: `invalid citation ${c.file}:${c.lineStart}-${c.lineEnd}`,
      });
    }
  }

  return errors;
}
