import type { Detector } from "../types.js";
import { asAnyCastDetector } from "./type-anesthesia/as-any-cast.js";
import { unresolvedImportDetector } from "./phantom-dependency/unresolved-import.js";

/**
 * Detector registry. Add each new detector here as it's implemented —
 * the harness picks up anything registered here automatically and runs
 * it against every fixture.
 */
export const detectors: Detector[] = [asAnyCastDetector, unresolvedImportDetector];
