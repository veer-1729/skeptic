import type { Detector, DetectorInput, Finding, RegistryInfo } from "../../types.js";
import { isAdded } from "../../context/diff.js";
import { isManifest, parseManifest } from "../../context/manifest.js";

/**
 * Flags manifest entries added in the diff that resolve but have poor registry
 * trust signals — a risk-score sibling to manifest-unresolved-dependency,
 * not a hard block.
 *
 * Low-trust thresholds (any one triggers a finding):
 *   - publishedDaysAgo < 30   (suspiciously fresh publish)
 *   - weeklyDownloads < 100    (near-zero adoption / possible slopsquat)
 *   - hasSourceRepo === false  (no listed source repository)
 *
 * Only entries in meta.packages.known (i.e. resolving) are eligible.
 * Unresolved entries are manifest-unresolved-dependency's job. Requires
 * trust metadata in meta.packages.registry[name] — absent metadata means
 * "can't assess," not low-trust.
 */
export const lowTrustNewDependencyDetector: Detector = {
  id: "low-trust-new-dependency",
  category: "phantom-dependency",

  run(input: DetectorInput) {
    const { file, content, meta } = input;
    if (!isManifest(file)) return [];

    const known = new Set(meta?.packages?.known ?? []);
    const registry = meta?.packages?.registry ?? {};
    const findings: Finding[] = [];

    for (const entry of parseManifest(file, content)) {
      if (!known.has(entry.name)) continue;
      if (!isAdded(entry.line, input)) continue;

      const info = registry[entry.name];
      if (!info?.resolves) continue;
      if (!isLowTrust(info)) continue;

      findings.push({
        category: "phantom-dependency",
        ruleId: "low-trust-new-dependency",
        severity: "medium",
        file,
        lineStart: entry.line,
        lineEnd: entry.line,
        message: `Manifest dependency "${entry.name}" resolves but has low registry trust.`,
        confidence: 0.6,
      });
    }

    return findings;
  },
};

function isLowTrust(info: RegistryInfo): boolean {
  if (info.publishedDaysAgo !== undefined && info.publishedDaysAgo < 30) return true;
  if (info.weeklyDownloads !== undefined && info.weeklyDownloads < 100) return true;
  if (info.hasSourceRepo === false) return true;
  return false;
}
