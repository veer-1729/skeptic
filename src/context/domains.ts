import type { Domain } from "../types.js";

/**
 * The single definition of which domains are "sensitive" enough to bump a
 * finding's severity. This is the phase-1 domain-proximity shortcut from the
 * architecture doc, kept in one place so detectors share it instead of each
 * redefining the set. It moves into the ranking engine in phase 2.
 */
const SENSITIVE_DOMAINS = new Set<Domain>([
  "payments",
  "auth",
  "billing",
  "permissions",
  "migrations",
  "pii",
]);

export function isSensitiveDomain(domain: Domain | undefined): boolean {
  return domain !== undefined && SENSITIVE_DOMAINS.has(domain);
}
