import type { Detector, Finding } from "../../types.js";

/**
 * Flags a newly-added manifest dependency that functionally overlaps with a
 * dependency the repo already has (a new date lib when one is present, a new
 * HTTP client alongside an existing one, ...). "New" means present in the
 * manifest but absent from `meta.packages.existing`; "overlap" means the new
 * package shares an `OverlapTable` group with one of the existing packages.
 *
 * Diff-only and mechanical: in production the overlap table grows beyond the
 * small hardcoded set the fixtures mock via meta.json (taxonomy category 6).
 */
export const overlappingDependencyDetector: Detector = {
  id: "overlapping-dependency",
  category: "dependency-creep",

  run({ file, content, meta }) {
    if (!file.endsWith("package.json")) return [];

    const existing = meta?.packages?.existing;
    const overlap = meta?.dependencyOverlap;
    if (!existing || !overlap) return [];

    let manifest: unknown;
    try {
      manifest = JSON.parse(content);
    } catch {
      return [];
    }
    if (typeof manifest !== "object" || manifest === null) return [];

    const declared = new Set<string>();
    for (const key of ["dependencies", "devDependencies"] as const) {
      const block = (manifest as Record<string, unknown>)[key];
      if (block && typeof block === "object") {
        for (const name of Object.keys(block)) declared.add(name);
      }
    }

    const existingSet = new Set(existing);
    const lines = content.split("\n");
    const findings: Finding[] = [];

    for (const name of declared) {
      if (existingSet.has(name)) continue; // not new — already in the repo

      const overlapsExisting = overlap.groups.some(
        (group) => group.includes(name) && group.some((g) => existingSet.has(g))
      );
      if (!overlapsExisting) continue;

      const lineIndex = lines.findIndex((l) => l.includes(`"${name}"`));
      const line = lineIndex === -1 ? 1 : lineIndex + 1;

      findings.push({
        category: "dependency-creep",
        ruleId: "overlapping-dependency",
        severity: "medium",
        file,
        lineStart: line,
        lineEnd: line,
        message: `New dependency "${name}" overlaps functionally with an existing dependency the repo already uses.`,
        confidence: 0.85,
      });
    }

    return findings;
  },
};
