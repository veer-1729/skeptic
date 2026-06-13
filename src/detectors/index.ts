import type { Detector } from "../types.js";
import { asAnyCastDetector } from "./type-anesthesia/as-any-cast.js";
import { tsIgnoreUnexplainedDetector } from "./type-anesthesia/ts-ignore-unexplained.js";
import { nonNullAssertionNearNullableDetector } from "./type-anesthesia/non-null-assertion-near-nullable.js";
import { debugConsoleLogDetector } from "./dead-leftovers/debug-console-log.js";
import { newTodoInDiffDetector } from "./dead-leftovers/new-todo-in-diff.js";
import { commentedOutCodeDetector } from "./dead-leftovers/commented-out-code.js";
import { unresolvedImportDetector } from "./phantom-dependency/unresolved-import.js";

/**
 * Detector registry. Add each new detector here as it's implemented —
 * the harness picks up anything registered here automatically and runs
 * it against every fixture.
 */
export const detectors: Detector[] = [
  asAnyCastDetector,
  tsIgnoreUnexplainedDetector,
  nonNullAssertionNearNullableDetector,
  debugConsoleLogDetector,
  newTodoInDiffDetector,
  commentedOutCodeDetector,
  unresolvedImportDetector,
];
