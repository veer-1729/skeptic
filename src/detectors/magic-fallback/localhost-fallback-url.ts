import ts from "typescript";
import type { Detector, DetectorInput, Finding } from "../../types.js";
import { isAdded } from "../../context/diff.js";
import { classifyEnvFallback, findEnvFallbacks } from "../../context/env-access.js";
import { secretNames } from "../../context/secrets.js";

/**
 * Flags env-var fallbacks whose string literal points at localhost or 127.0.0.1
 * — a URL that could silently run in non-local environments.
 *
 * See env-fallback.ts for the shared shape, literal restriction, and precedence.
 */
export const localhostFallbackUrlDetector: Detector = {
  id: "localhost-fallback-url",
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
      if (classifyEnvFallback(site, names) !== "localhost") continue;
      if (!isAdded(site.line, input)) continue;

      findings.push({
        category: "magic-fallback",
        ruleId: "localhost-fallback-url",
        severity: "high",
        file,
        lineStart: site.line,
        lineEnd: site.line,
        message: `Environment variable \`${site.envVar}\` falls back to a localhost URL.`,
        confidence: 0.9,
      });
    }

    return findings;
  },
};
