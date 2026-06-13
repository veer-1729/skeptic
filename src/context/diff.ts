import type { DetectorInput } from "../types.js";

/**
 * Is 1-based `line` part of the added diff for this input?
 *
 * When no `addedRanges` are supplied, the whole file is treated as added —
 * the phase-1 default documented on `DetectorInput`. Diff-scoped detectors
 * (dead leftovers, magic fallback, …) gate on this so they fire on new code
 * only, not on pre-existing lines that happen to match a pattern.
 */
export function isAdded(line: number, input: DetectorInput): boolean {
  const ranges = input.addedRanges;
  if (!ranges) return true;
  return ranges.some((range) => line >= range.start && line <= range.end);
}
