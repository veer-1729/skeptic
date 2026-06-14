import type { Detector, DetectorInput, Finding, RepoContext } from "../../types.js";
import { collectCandidates, countCallSites } from "../../context/call-sites.js";
import { establishedSuffixes, namingProfile, suffixOf } from "../../context/conventions/naming.js";

/**
 * Fake Generality (taxonomy Category 4): a newly-introduced, module-level
 * function/class/const-fn that has *exactly one* call site across the whole
 * diff — an abstraction built before there's evidence it's needed, where the
 * body could have been inlined at its single caller. Zero call sites is dead
 * code (a different category), two-plus is load-bearing; only the one-call case
 * is the "premature wrapper" smell.
 *
 * Cross-file by design, so it runs as `runProject`: a helper defined in one
 * changed file and called once in another is still single-use. Call sites are
 * resolved, not name-matched (see `countCallSites`): a cross-file call only
 * counts when that file imports the name via a relative specifier resolving to
 * the candidate's module, so a same-named symbol elsewhere in the diff (local,
 * external-package, or a different relative module) never inflates the count.
 *
 * Layer-C carve-out (`runRepo`): when the unit carries
 * `meta.fakeGenerality.namingCarveout`, the same analysis runs against repo
 * neighbors and *suppresses* a finding whose name uses a generic suffix the
 * repo already uses widely (`*Service` in a repo full of `*Service`s is the
 * house style, not slop — taxonomy's "less severe / non-issue if the repo's
 * conventions already use this pattern"). `runProject` defers on those units to
 * avoid double-firing without the neighbor context.
 *
 * Base severity `low`: on its own this is future cost (cognitive load), not
 * immediate risk — the ranking engine bumps it via domain proximity and folds
 * it into a combined finding when it co-occurs with blast-radius/inflation.
 */

interface Candidate {
  name: string;
  finding: Finding;
}

function analyze(inputs: DetectorInput[]): Candidate[] {
  const out: Candidate[] = [];

  for (const input of inputs) {
    for (const candidate of collectCandidates(input)) {
      if (countCallSites(inputs, candidate) !== 1) continue;

      const noun = candidate.kind === "class" ? "Class" : "Function";
      out.push({
        name: candidate.name,
        finding: {
          category: "fake-generality",
          ruleId: "single-use-abstraction",
          severity: "low",
          file: candidate.file,
          lineStart: candidate.line,
          lineEnd: candidate.line,
          message: `${noun} "${candidate.name}" is introduced with exactly one call site — likely premature abstraction (could be inlined at its single caller).`,
          confidence: 0.6,
        },
      });
    }
  }

  return out;
}

export const singleUseAbstractionDetector: Detector = {
  id: "single-use-abstraction",
  category: "fake-generality",

  runProject(inputs: DetectorInput[]): Finding[] {
    // Naming-carveout units are decided by `runRepo`, which has the neighbor
    // context needed to suppress repo-conventional names. Defer here so the two
    // hooks don't both fire on the same candidate.
    if (inputs.some((i) => i.meta?.fakeGenerality?.namingCarveout)) return [];
    return analyze(inputs).map((c) => c.finding);
  },

  runRepo(inputs: DetectorInput[], repo: RepoContext): Finding[] {
    // Only the naming carve-out lives at Layer C; other repo-context fixtures
    // (e.g. convention-drift) must not pull a fake-generality finding.
    if (!inputs.some((i) => i.meta?.fakeGenerality?.namingCarveout)) return [];

    const findings: Finding[] = [];
    for (const { name, finding } of analyze(inputs)) {
      const suffix = suffixOf(name);
      if (suffix) {
        const neighbors = repo.nearestNeighbors(finding.file);
        const profile = namingProfile(neighbors);
        const established = establishedSuffixes(profile);
        // Repo already names things this way → house style, not slop. Suppress.
        if (established.has(suffix)) continue;

        // Fired despite repo context: cite the neighbors establishing the
        // repo's *actual* conventions as the comparison-set evidence.
        const evidence = [
          ...new Set([...established].flatMap((s) => profile.bySuffix.get(s) ?? [])),
        ].sort();
        if (evidence.length > 0) finding.comparisonSet = evidence;
      }
      findings.push(finding);
    }

    return findings;
  },
};
