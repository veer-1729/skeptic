import type { Domain, Severity } from "../types.js";
import { isSensitiveDomain } from "../context/domains.js";

/** Multiplier applied to a finding's score when it lands in a sensitive domain. */
const SENSITIVE_DOMAIN_MULTIPLIER = 1.5;
const NEUTRAL_MULTIPLIER = 1.0;

/** One-level severity bump table for sensitive domains. "high" is the ceiling. */
const BUMP: Record<Severity, Severity> = {
  low: "medium",
  medium: "high",
  high: "high",
};

/**
 * Apply domain proximity to a base severity. A sensitive domain bumps the
 * severity one level (`low→medium`, `medium→high`, `high` unchanged) and
 * contributes a score multiplier; a non-sensitive (or absent) domain is a
 * no-op. This reproduces the old inline `isSensitiveDomain ? "high" : "medium"`
 * behavior detectors used to carry, now computed once in the ranking engine.
 */
export function applyDomain(
  base: Severity,
  domain: Domain | undefined,
): { severity: Severity; multiplier: number } {
  if (!isSensitiveDomain(domain)) {
    return { severity: base, multiplier: NEUTRAL_MULTIPLIER };
  }
  return { severity: BUMP[base], multiplier: SENSITIVE_DOMAIN_MULTIPLIER };
}
