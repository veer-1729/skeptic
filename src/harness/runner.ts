import { join } from "path";
import { detectors } from "../detectors/index.js";
import { loadFixtures } from "./fixtures.js";
import { matchFindings } from "./match.js";
import type { DetectorInput, Finding } from "../types.js";

const FIXTURES_DIR = join(process.cwd(), "fixtures");

function runDetectors(input: DetectorInput): Finding[] {
  return detectors.flatMap((d) => d.run(input));
}

interface CategoryStats {
  tp: number;
  fp: number;
  fn: number;
}

function precisionRecallF1(s: CategoryStats) {
  const precision = s.tp + s.fp === 0 ? 1 : s.tp / (s.tp + s.fp);
  const recall = s.tp + s.fn === 0 ? 1 : s.tp / (s.tp + s.fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1 };
}

function bump(perCategory: Map<string, CategoryStats>, category: string, key: keyof CategoryStats) {
  const s = perCategory.get(category) ?? { tp: 0, fp: 0, fn: 0 };
  s[key]++;
  perCategory.set(category, s);
}

function main() {
  const fixtures = loadFixtures(FIXTURES_DIR);
  if (fixtures.length === 0) {
    console.error(`No fixtures found under ${FIXTURES_DIR}`);
    process.exit(1);
  }

  const overall: CategoryStats = { tp: 0, fp: 0, fn: 0 };
  const perCategory = new Map<string, CategoryStats>();
  let failedFixtures = 0;

  for (const fixture of fixtures) {
    const actual = fixture.inputs.flatMap((input) => runDetectors(input));
    const { matched, falseNegatives, falsePositives } = matchFindings(actual, fixture.expected);

    const stats: CategoryStats = { tp: matched.length, fp: falsePositives.length, fn: falseNegatives.length };
    overall.tp += stats.tp;
    overall.fp += stats.fp;
    overall.fn += stats.fn;

    // Attribute each finding to its own category, not the fixture's — so a
    // detector that fires on another category's fixture books the false
    // positive against the right category.
    for (const m of matched) bump(perCategory, m.actual.category, "tp");
    for (const fn of falseNegatives) bump(perCategory, fn.category, "fn");
    for (const fp of falsePositives) bump(perCategory, fp.category, "fp");

    const pass = stats.fp === 0 && stats.fn === 0;
    if (!pass) failedFixtures++;

    console.log(`${pass ? "PASS" : "FAIL"}  ${fixture.category}/${fixture.name}`);

    for (const m of matched) {
      if (m.expected.severity && m.expected.severity !== m.actual.severity) {
        console.log(
          `    severity mismatch: expected ${m.expected.severity}, got ${m.actual.severity} (${m.actual.ruleId})`
        );
      }
    }
    for (const fn of falseNegatives) {
      console.log(
        `    MISSING: ${fn.category} ${fn.ruleId ?? "(any rule)"} @ L${fn.lineStart}-${fn.lineEnd}`
      );
    }
    for (const fp of falsePositives) {
      console.log(
        `    UNEXPECTED: ${fp.category} ${fp.ruleId} @ L${fp.lineStart}-${fp.lineEnd} — "${fp.message}"`
      );
    }
  }

  console.log("\n— per category —");
  for (const [category, stats] of perCategory) {
    const { precision, recall, f1 } = precisionRecallF1(stats);
    console.log(
      `${category.padEnd(22)} tp=${stats.tp} fp=${stats.fp} fn=${stats.fn}` +
        `  precision=${precision.toFixed(2)} recall=${recall.toFixed(2)} f1=${f1.toFixed(2)}`
    );
  }

  const { precision, recall, f1 } = precisionRecallF1(overall);
  console.log(
    `\n${fixtures.length - failedFixtures}/${fixtures.length} fixtures passing` +
      `  |  overall precision=${precision.toFixed(2)} recall=${recall.toFixed(2)} f1=${f1.toFixed(2)}`
  );

  if (failedFixtures > 0) process.exit(1);
}

main();
