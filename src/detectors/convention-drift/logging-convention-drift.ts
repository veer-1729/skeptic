import type { DetectorInput } from "../../types.js";
import {
  driftSitesOnAdded,
  makeConventionDriftDetector,
} from "./factory.js";
import {
  fileLoggingStyle,
  findLoggingDriftSites,
} from "../../context/conventions/logging.js";

/**
 * Convention drift (Layer C): the changed file logs with `console.error`/
 * `.warn`/`.info` (or a bare `print(...)`) while its nearest neighbors in the
 * repo overwhelmingly use a structured logger. The same line in isolation is
 * fine — what makes it slop is that it's *alien to this repository*. Pure: it
 * only reads the changed file and the `RepoContext` the harness hands it, never
 * touching the index or filesystem itself.
 *
 * Base severity `medium`; the ranking engine layers domain proximity on top
 * (so the same drift in `src/payments/` outranks it in a generic route).
 */
export const loggingConventionDriftDetector = makeConventionDriftDetector({
  id: "logging-convention-drift",
  classify: fileLoggingStyle,
  precedence: ["structured", "console", "print"],
  noneStyle: "none",
  conventionStyle: "structured",

  findDriftSites(input: DetectorInput) {
    return driftSitesOnAdded(
      input,
      findLoggingDriftSites(input.content, input.file),
    );
  },

  message(label, comparisonSet) {
    return `Logs via \`${label}\`, but ${comparisonSet.length} comparable files in this repo use a structured logger — drifts from the local logging convention.`;
  },
});
