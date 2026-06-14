import type { DetectorInput } from "../../types.js";
import {
  driftSitesOnAdded,
  makeConventionDriftDetector,
} from "./factory.js";
import {
  fileEnvAccessStyle,
  findEnvDriftSites,
} from "../../context/conventions/env-access.js";

/**
 * Convention drift (Layer C): the changed file reads `process.env` directly
 * while its nearest neighbors overwhelmingly pull config from a central module.
 * Direct env access in isolation is common; what makes it slop is that it's
 * *alien to this repository's config pattern*.
 *
 * Overlaps with magic-fallback's `env-fallback` when a fallback is present —
 * co-located findings are folded by the ranking dedup, not suppressed here.
 *
 * Base severity `medium`; the ranking engine layers domain proximity on top.
 */
export const envAccessConventionDriftDetector = makeConventionDriftDetector({
  id: "env-access-convention-drift",
  classify: fileEnvAccessStyle,
  precedence: ["centralized", "direct"],
  noneStyle: "none",
  conventionStyle: "centralized",

  findDriftSites(input: DetectorInput) {
    return driftSitesOnAdded(
      input,
      findEnvDriftSites(input.content, input.file),
    );
  },

  message(label, comparisonSet) {
    return `Reads config via \`${label}\`, but ${comparisonSet.length} comparable files in this repo use a central config module — drifts from the local env-access convention.`;
  },
});
