import type { AnalysisMeta } from "../types.js";

/**
 * Default env-var name fragments that mark a value as a secret/credential.
 * Merged with per-repo `meta.secrets.nameHints` — the phase-1 shortcut for
 * magic-fallback's hardcoded-secret-fallback rule. Moves to repo config in
 * phase 2/3 when convention-drift can learn naming patterns.
 */
export const DEFAULT_SECRET_HINTS = [
  "SECRET",
  "TOKEN",
  "KEY",
  "PASSWORD",
  "PASSWD",
  "CREDENTIAL",
  "PRIVATE_KEY",
  "APIKEY",
] as const;

/** Built-in secret hints plus any per-repo extensions from meta. */
export function secretNames(meta: AnalysisMeta | undefined): Set<string> {
  const names = new Set<string>(DEFAULT_SECRET_HINTS);
  for (const hint of meta?.secrets?.nameHints ?? []) names.add(hint);
  return names;
}

/** Case-insensitive substring match against any secret name fragment. */
export function looksLikeSecret(envVar: string, names: Set<string>): boolean {
  const upper = envVar.toUpperCase();
  for (const hint of names) {
    if (upper.includes(hint.toUpperCase())) return true;
  }
  return false;
}
