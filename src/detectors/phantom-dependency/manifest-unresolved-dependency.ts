import type { Detector, DetectorInput, Finding } from "../../types.js";
import { isAdded } from "../../context/diff.js";
import { isManifest, parseManifest } from "../../context/manifest.js";

/**
 * Flags manifest entries (package.json / requirements.txt) added in the diff
 * whose package name does not resolve against meta.packages.known.
 *
 * Phase 1 uses a mock known-set from fixtures; production should back this
 * with live registry lookup (npm/PyPI/etc.).
 */
export const manifestUnresolvedDependencyDetector: Detector = {
  id: "manifest-unresolved-dependency",
  category: "phantom-dependency",

  run(input: DetectorInput) {
    const { file, content, meta } = input;
    if (!isManifest(file)) return [];

    // No known-package set means no registry resolution context — stay silent
    // rather than declaring every dependency unresolved. An explicit empty
    // `known: []` still means "nothing resolves" and will fire.
    if (meta?.packages?.known === undefined) return [];

    const known = new Set(meta.packages.known);
    const findings: Finding[] = [];

    for (const entry of parseManifest(file, content)) {
      if (known.has(entry.name)) continue;
      if (!isAdded(entry.line, input)) continue;

      findings.push({
        category: "phantom-dependency",
        ruleId: "manifest-unresolved-dependency",
        severity: "high",
        file,
        lineStart: entry.line,
        lineEnd: entry.line,
        message: `Manifest dependency "${entry.name}" does not resolve against the known package set.`,
        confidence: 0.9,
      });
    }

    return findings;
  },
};
