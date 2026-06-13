import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import type { AnalysisMeta, DetectorInput, ExpectedFinding } from "../types.js";

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
 * Splits a raw meta.json into shared meta (top-level keys, applied to every
 * input file) and per-file overrides (under an optional `files` map keyed by
 * input filename, merged over the shared meta).
 */
function loadMeta(raw: Record<string, unknown> | undefined): {
  shared: AnalysisMeta;
  perFile: Record<string, AnalysisMeta>;
} {
  if (!raw) return { shared: {}, perFile: {} };

  const { files, ...top } = raw;
  const shared = adaptMeta(top);
  const perFile: Record<string, AnalysisMeta> = {};

  if (files && typeof files === "object") {
    for (const [name, override] of Object.entries(files as Record<string, unknown>)) {
      perFile[name] = adaptMeta((override as Record<string, unknown>) ?? {});
    }
  }

  return { shared, perFile };
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
      const { shared, perFile } = loadMeta(rawMeta);

      const inputs: DetectorInput[] = readdirSync(dir)
        .filter((f) => f.startsWith("input."))
        .map((f) => ({
          file: f,
          content: readFileSync(join(dir, f), "utf-8"),
          meta: { ...shared, ...(perFile[f] ?? {}) },
        }));

      if (inputs.length === 0) {
        throw new Error(`Fixture ${category}/${name} has no input.* file`);
      }

      fixtures.push({ category, name, dir, inputs, expected });
    }
  }

  return fixtures;
}
