import ts from "typescript";
import type { Detector, DetectorInput, Finding } from "../../types.js";
import { isAdded } from "../../context/diff.js";
import { classifyEnvFallback, findEnvFallbacks } from "../../context/env-access.js";
import { secretNames } from "../../context/secrets.js";

/**
 * Flags env-var fallbacks where the variable name looks like a secret/credential
 * and the fallback is a hardcoded string literal — high severity regardless of
 * domain (taxonomy category 12: "full stop").
 *
 * See env-fallback.ts for the shared shape, literal restriction, and precedence.
 */
export const hardcodedSecretFallbackDetector: Detector = {
  id: "hardcoded-secret-fallback",
  category: "magic-fallback",

  run(input: DetectorInput) {
    const { file, content, meta } = input;
    const findings: Finding[] = [];
    const sourceFile = ts.createSourceFile(
      file,
      content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );
    const names = secretNames(meta);

    for (const site of findEnvFallbacks(sourceFile)) {
      if (classifyEnvFallback(site, names) !== "secret") continue;
      if (!isAdded(site.line, input)) continue;

      findings.push({
        category: "magic-fallback",
        ruleId: "hardcoded-secret-fallback",
        severity: "high",
        file,
        lineStart: site.line,
        lineEnd: site.line,
        message: `Secret env var \`${site.envVar}\` has a hardcoded string fallback — a credential leak risk.`,
        confidence: 0.95,
      });
    }

    return findings;
  },
};
