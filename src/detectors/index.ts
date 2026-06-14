import type { Detector } from "../types.js";
import { asAnyCastDetector } from "./type-anesthesia/as-any-cast.js";
import { tsIgnoreUnexplainedDetector } from "./type-anesthesia/ts-ignore-unexplained.js";
import { nonNullAssertionNearNullableDetector } from "./type-anesthesia/non-null-assertion-near-nullable.js";
import { debugConsoleLogDetector } from "./dead-leftovers/debug-console-log.js";
import { newTodoInDiffDetector } from "./dead-leftovers/new-todo-in-diff.js";
import { commentedOutCodeDetector } from "./dead-leftovers/commented-out-code.js";
import { unresolvedImportDetector } from "./phantom-dependency/unresolved-import.js";
import { overlappingDependencyDetector } from "./dependency-creep/overlapping-dependency.js";
import { singleUseNewDependencyDetector } from "./dependency-creep/single-use-new-dependency.js";
import { manifestUnresolvedDependencyDetector } from "./phantom-dependency/manifest-unresolved-dependency.js";
import { lowTrustNewDependencyDetector } from "./phantom-dependency/low-trust-new-dependency.js";
import { envFallbackDetector } from "./magic-fallback/env-fallback.js";
import { hardcodedSecretFallbackDetector } from "./magic-fallback/hardcoded-secret-fallback.js";
import { localhostFallbackUrlDetector } from "./magic-fallback/localhost-fallback-url.js";
import { emptyCatchDetector } from "./error-fog/empty-catch.js";
import { broadCatchGeneric500Detector } from "./error-fog/broad-catch-generic-500.js";
import { swallowedPromiseRejectionDetector } from "./error-fog/swallowed-promise-rejection.js";
import { loggingConventionDriftDetector } from "./convention-drift/logging-convention-drift.js";
import { singleUseAbstractionDetector } from "./fake-generality/single-use-abstraction.js";

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
  overlappingDependencyDetector,
  singleUseNewDependencyDetector,
  manifestUnresolvedDependencyDetector,
  lowTrustNewDependencyDetector,
  envFallbackDetector,
  hardcodedSecretFallbackDetector,
  localhostFallbackUrlDetector,
  emptyCatchDetector,
  broadCatchGeneric500Detector,
  swallowedPromiseRejectionDetector,
  loggingConventionDriftDetector,
  singleUseAbstractionDetector,
];
