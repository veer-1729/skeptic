import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import type { AnalysisMeta, DetectorInput, ExpectedFinding, LineRange } from "../types.js";

export interface Fixture {
  category: string;
  name: string;
  dir: string;
  inputs: DetectorInput[];
  expected: ExpectedFinding[];
}

/**
 * Normalizes a raw meta.json object into AnalysisMeta.
 *
 * Accepts both the nested AnalysisMeta shape and the legacy flat shape
 * (`knownPackages`) so the schema change lands without editing any fixture.
 * TODO(legacy-meta): drop the flat-key handling once the meta.json files
 * migrate to nested AnalysisMeta (tracked in docs/roadmap.md, phase 1).
 */
function adaptMeta(raw: Record<string, unknown>): AnalysisMeta {
  const meta: AnalysisMeta = {};

  if (raw.domain !== undefined) meta.domain = raw.domain as AnalysisMeta["domain"];
  if (raw.packages !== undefined) meta.packages = raw.packages as AnalysisMeta["packages"];
  if (raw.dependencyOverlap !== undefined)
    meta.dependencyOverlap = raw.dependencyOverlap as AnalysisMeta["dependencyOverlap"];
  if (raw.secrets !== undefined) meta.secrets = raw.secrets as AnalysisMeta["secrets"];

  // Legacy flat keys → nested namespaces.
  if (raw.knownPackages !== undefined) {
    meta.packages = { ...(meta.packages ?? {}), known: raw.knownPackages as string[] };
  }

  return meta;
}

/**
 * `addedRanges` is a sibling of AnalysisMeta, not part of it — the diff a
 * detector sees, not contextual config. It's read here separately and never
 * routed through adaptMeta, so it can't leak into `meta`.
 */
function readAddedRanges(raw: Record<string, unknown>): LineRange[] | undefined {
  return raw.addedRanges as LineRange[] | undefined;
}

interface FixtureContext {
  sharedMeta: AnalysisMeta;
  perFileMeta: Record<string, AnalysisMeta>;
  sharedAdded?: LineRange[];
  perFileAdded: Record<string, LineRange[] | undefined>;
}

/**
 * Splits a raw meta.json into shared values (top-level keys, applied to every
 * input file) and per-file overrides (under an optional `files` map keyed by
 * input filename, merged over / replacing the shared values). Both `meta` and
 * `addedRanges` follow the same shared-plus-override shape.
 */
function loadContext(raw: Record<string, unknown> | undefined): FixtureContext {
  if (!raw) return { sharedMeta: {}, perFileMeta: {}, perFileAdded: {} };

  const { files, ...top } = raw;
  const sharedMeta = adaptMeta(top);
  const sharedAdded = readAddedRanges(top);
  const perFileMeta: Record<string, AnalysisMeta> = {};
  const perFileAdded: Record<string, LineRange[] | undefined> = {};

  if (files && typeof files === "object") {
    for (const [name, override] of Object.entries(files as Record<string, unknown>)) {
      const obj = (override as Record<string, unknown>) ?? {};
      perFileMeta[name] = adaptMeta(obj);
      perFileAdded[name] = readAddedRanges(obj);
    }
  }

  return { sharedMeta, perFileMeta, sharedAdded, perFileAdded };
}

/**
 * Loads every fixture under fixturesDir. Expected layout:
 *
 *   fixtures/<category>/<fixture-name>/
 *     input.<ext>      one or more — the file(s) a detector sees
 *     expected.json    array of ExpectedFinding, [] for "should not fire"
 *     meta.json        optional — domain tags, mock registry data, etc.
 *
 * Throws on malformed fixtures rather than skipping them — a fixture
 * that can't be loaded is a bug in the fixture, not a 0-finding result.
 */
export function loadFixtures(fixturesDir: string): Fixture[] {
  const fixtures: Fixture[] = [];

  for (const category of readdirSync(fixturesDir)) {
    const categoryDir = join(fixturesDir, category);
    if (!statSync(categoryDir).isDirectory()) continue;

    for (const name of readdirSync(categoryDir)) {
      const dir = join(categoryDir, name);
      if (!statSync(dir).isDirectory()) continue;

      const expectedPath = join(dir, "expected.json");
      if (!existsSync(expectedPath)) {
        throw new Error(`Fixture ${category}/${name} is missing expected.json`);
      }
      const expected: ExpectedFinding[] = JSON.parse(readFileSync(expectedPath, "utf-8"));

      const metaPath = join(dir, "meta.json");
      const rawMeta = existsSync(metaPath)
        ? (JSON.parse(readFileSync(metaPath, "utf-8")) as Record<string, unknown>)
        : undefined;
      const { sharedMeta, perFileMeta, sharedAdded, perFileAdded } = loadContext(rawMeta);

      const inputs: DetectorInput[] = readdirSync(dir)
        .filter((f) => f.startsWith("input."))
        .map((f) => {
          // Per-file addedRanges overrides shared only when explicitly set
          // (matching how meta inherits unspecified shared keys); absent ⇒
          // undefined ⇒ detectors treat the whole file as added (the phase-1
          // default documented on DetectorInput).
          const addedRanges = perFileAdded[f] ?? sharedAdded;
          return {
            file: f,
            content: readFileSync(join(dir, f), "utf-8"),
            meta: { ...sharedMeta, ...(perFileMeta[f] ?? {}) },
            ...(addedRanges ? { addedRanges } : {}),
          };
        });

      if (inputs.length === 0) {
        throw new Error(`Fixture ${category}/${name} has no input.* file`);
      }

      fixtures.push({ category, name, dir, inputs, expected });
    }
  }

  return fixtures;
}
