import type { AnalysisMeta, Domain } from "../types.js";

/**
 * The single definition of which domains are "sensitive" enough to bump a
 * finding's severity. Kept in one place so the ranking engine and any caller
 * share it instead of redefining the set.
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

/**
 * Config-driven map of path patterns → domain. When a file has no explicit
 * `meta.domain`, its path is matched (case-insensitively) against these
 * substrings to infer a sensitive domain. Ordered most- to least-specific;
 * the first match wins. This replaces the inline domain shortcut detectors
 * used to carry, centralizing "which files are sensitive" in one config.
 */
const PATH_DOMAIN_PATTERNS: ReadonlyArray<readonly [string, Domain]> = [
  ["permission", "permissions"],
  ["migration", "migrations"],
  ["payment", "payments"],
  ["billing", "billing"],
  ["checkout", "payments"],
  ["auth", "auth"],
  ["login", "auth"],
  ["session", "auth"],
  ["pii", "pii"],
];

/**
 * Resolve the sensitive domain for a file. Explicit `meta.domain` always wins
 * (it's how fixtures declare intent); otherwise infer from the file path.
 * Returns `undefined` when the file isn't in any sensitive domain.
 */
export function domainForFile(
  file: string,
  meta?: AnalysisMeta,
): Domain | undefined {
  if (meta?.domain !== undefined) return meta.domain;
  const haystack = file.toLowerCase();
  for (const [pattern, domain] of PATH_DOMAIN_PATTERNS) {
    if (haystack.includes(pattern)) return domain;
  }
  return undefined;
}
