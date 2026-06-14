import type { DetectorInput } from "../../types.js";
import {
  driftSitesOnAdded,
  makeConventionDriftDetector,
} from "./factory.js";
import {
  fileValidationStyle,
  findValidationDriftSites,
} from "../../context/conventions/validation.js";

/**
 * Convention drift (Layer C): the changed file hand-rolls input validation
 * (`if (!field || typeof field !== "string")`) while its nearest neighbors
 * overwhelmingly use a schema library (Zod/Yup/Joi). Common AI slop when the
 * repo already has Zod everywhere.
 *
 * Base severity `medium`; the ranking engine layers domain proximity on top.
 */
export const validationConventionDriftDetector = makeConventionDriftDetector({
  id: "validation-convention-drift",
  classify: fileValidationStyle,
  precedence: ["schema", "hand-rolled"],
  noneStyle: "none",
  conventionStyle: "schema",

  findDriftSites(input: DetectorInput) {
    return driftSitesOnAdded(
      input,
      findValidationDriftSites(input.content, input.file),
    );
  },

  message(label, comparisonSet) {
    return `Validates input via \`${label}\`, but ${comparisonSet.length} comparable files in this repo use a schema library — drifts from the local validation convention.`;
  },
});
