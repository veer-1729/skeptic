/**
 * Diff-size multiplier (Principle 2: a smell in a 2000-line diff is riskier
 * than the same smell in a 20-line diff — there's less per-line scrutiny). This
 * scales a finding's numeric *score* only; it never changes the discrete
 * severity level, so it reorders findings without disturbing any fixture's
 * severity expectation (all fixtures are tiny ⇒ multiplier ~1.0).
 */
const SIZE_BANDS: ReadonlyArray<{ maxLines: number; multiplier: number }> = [
  { maxLines: 100, multiplier: 1.0 },
  { maxLines: 400, multiplier: 1.15 },
  { maxLines: 1000, multiplier: 1.3 },
  { maxLines: Infinity, multiplier: 1.5 },
];

/** Resolve the score multiplier for a diff of `totalChangedLines` lines. */
export function diffSizeMultiplier(totalChangedLines: number): number {
  for (const band of SIZE_BANDS) {
    if (totalChangedLines <= band.maxLines) return band.multiplier;
  }
  // Unreachable: the last band's maxLines is Infinity.
  return 1.0;
}
