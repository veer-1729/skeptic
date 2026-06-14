import type { Detector, DetectorInput, Finding, RepoContext } from "../../types.js";
import { isAdded } from "../../context/diff.js";
import {
  buildProfile,
  isStrongConvention,
  type ConventionProfile,
} from "../../context/conventions/profile.js";

export interface DriftSite {
  /** 1-based line of the drift site. */
  line: number;
  /** Human-readable label for the drift (e.g. `console.error`, `process.env.API_URL`). */
  label: string;
}

export interface ConventionDriftSpec<S extends string> {
  id: string;
  /** Classify a single file's convention style. */
  classify: (content: string, path: string) => S;
  /** Precedence order for tie-breaking when building the profile. */
  precedence: readonly S[];
  /** Style value meaning "no signal" — excluded from profile relevance. */
  noneStyle: S;
  /** The repo's established convention style to flag drift against. */
  conventionStyle: S;
  /** Find drift sites in a changed file (only on added lines). */
  findDriftSites: (input: DetectorInput) => DriftSite[];
  /** Build the finding message for a drift site. */
  message: (label: string, comparisonSet: string[]) => string;
}

/**
 * Factory for Layer-C convention-drift detectors. Owns the shared `runRepo`
 * loop: nearest neighbors → profile → strong-convention gate → scan added
 * lines for drift sites → emit findings with `comparisonSet` evidence.
 */
export function makeConventionDriftDetector<S extends string>(
  spec: ConventionDriftSpec<S>,
): Detector {
  return {
    id: spec.id,
    category: "convention-drift",

    runRepo(inputs: DetectorInput[], repo: RepoContext): Finding[] {
      const findings: Finding[] = [];

      for (const input of inputs) {
        const neighbors = repo.nearestNeighbors(input.file);
        const profile = buildProfile(
          neighbors,
          spec.classify,
          spec.precedence,
          spec.noneStyle,
        );
        if (!isStrongConvention(profile, spec.noneStyle)) continue;
        if (profile.dominant !== spec.conventionStyle) continue;

        findings.push(...emitFindings(input, profile, spec));
      }

      return findings;
    },
  };
}

function emitFindings<S extends string>(
  input: DetectorInput,
  profile: ConventionProfile<S>,
  spec: ConventionDriftSpec<S>,
): Finding[] {
  const sites = spec.findDriftSites(input);
  return sites.map((site) => ({
    category: "convention-drift" as const,
    ruleId: spec.id,
    severity: "medium" as const,
    file: input.file,
    lineStart: site.line,
    lineEnd: site.line,
    message: spec.message(site.label, profile.sampleFiles),
    confidence: profile.adherenceRatio,
    comparisonSet: profile.sampleFiles,
  }));
}

/** Helper: filter drift sites to added lines only. */
export function driftSitesOnAdded(
  input: DetectorInput,
  allSites: DriftSite[],
): DriftSite[] {
  return allSites.filter((s) => isAdded(s.line, input));
}
