import type { DetectorInput } from "../../types.js";
import {
  driftSitesOnAdded,
  makeConventionDriftDetector,
} from "./factory.js";
import {
  fileErrorResponseStyle,
  findErrorDriftSites,
} from "../../context/conventions/error-shape.js";

/**
 * Convention drift (Layer C): the changed file returns bare error responses
 * (`{ message }`, `res.send("...")`) while its nearest neighbors overwhelmingly
 * use structured errors (`AppError`, `{ error: { code, message } }`). Fine in
 * isolation — slop when it's alien to this repository's error shape.
 *
 * Base severity `medium`; the ranking engine layers domain proximity on top.
 */
export const errorShapeConventionDriftDetector = makeConventionDriftDetector({
  id: "error-shape-convention-drift",
  classify: fileErrorResponseStyle,
  precedence: ["structured", "bare"],
  noneStyle: "none",
  conventionStyle: "structured",

  findDriftSites(input: DetectorInput) {
    return driftSitesOnAdded(
      input,
      findErrorDriftSites(input.content, input.file),
    );
  },

  message(label, comparisonSet) {
    return `Returns errors via \`${label}\`, but ${comparisonSet.length} comparable files in this repo use structured error responses — drifts from the local error-shape convention.`;
  },
});
