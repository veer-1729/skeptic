import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import type { DetectorInput, ExpectedFinding } from "../types.js";

export interface Fixture {
  category: string;
  name: string;
  dir: string;
  inputs: DetectorInput[];
  expected: ExpectedFinding[];
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
      const meta = existsSync(metaPath)
        ? (JSON.parse(readFileSync(metaPath, "utf-8")) as Record<string, unknown>)
        : undefined;

      const inputs: DetectorInput[] = readdirSync(dir)
        .filter((f) => f.startsWith("input."))
        .map((f) => ({
          file: f,
          content: readFileSync(join(dir, f), "utf-8"),
          meta,
        }));

      if (inputs.length === 0) {
        throw new Error(`Fixture ${category}/${name} has no input.* file`);
      }

      fixtures.push({ category, name, dir, inputs, expected });
    }
  }

  return fixtures;
}
