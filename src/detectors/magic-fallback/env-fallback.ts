import ts from "typescript";
import type { Detector, DetectorInput, Finding } from "../../types.js";
import { isAdded } from "../../context/diff.js";
import { classifyEnvFallback, findEnvFallbacks } from "../../context/env-access.js";
import { secretNames } from "../../context/secrets.js";

/**
 * Flags generic env-var fallbacks added in the diff — `process.env.X || default`
 * or `process.env.X ?? default` where the fallback is a literal baked-in default.
 *
 * Shared shape (all three magic-fallback rules):
 *   - Left operand subtree contains `process.env.NAME` (property or element access).
 *   - Operator is `||` or `??`.
 *   - Right operand is a literal (string/number/boolean/null/array/object) — NOT
 *     another env read (`process.env.A || process.env.B` is a config chain, not slop).
 *
 * Classification precedence (mutually exclusive — one finding per site):
 *   1. hardcoded-secret-fallback — env name looks like a secret AND fallback is a string literal
 *   2. localhost-fallback-url — fallback string literal contains localhost / 127.0.0.1
 *   3. env-fallback (this rule) — everything else
 *
 * Known gaps (phase 1): Python `os.environ`, destructuring defaults
 * (`const { PORT = 3000 } = process.env`).
 *
 * Severity: emits a base "medium"; the ranking engine bumps it to "high" on
 * sensitive domains (payments, auth, …) via the domain-proximity multiplier.
 */
export const envFallbackDetector: Detector = {
  id: "env-fallback",
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
      if (classifyEnvFallback(site, names) !== "generic") continue;
      if (!isAdded(site.line, input)) continue;

      findings.push({
        category: "magic-fallback",
        ruleId: "env-fallback",
        severity: "medium",
        file,
        lineStart: site.line,
        lineEnd: site.line,
        message: `Environment variable \`${site.envVar}\` has a hardcoded fallback via \`${site.operator}\`.`,
        confidence: 0.9,
      });
    }

    return findings;
  },
};
