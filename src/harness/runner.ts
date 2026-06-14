import { join } from "path";
import { detectors } from "../detectors/index.js";
import { domainForFile } from "../context/domains.js";
import { loadFixtures } from "./fixtures.js";
import { matchFindings } from "./match.js";
import { rankFindings } from "../ranking/rank.js";
import { createRepoContext } from "../retrieval/repo-index.js";
import type {
  DetectorInput,
  ExpectedFinding,
  Finding,
  NeighborFile,
  RankedFinding,
  RepoPolicy,
  UnitContext,
} from "../types.js";

const FIXTURES_DIR = join(process.cwd(), "fixtures");

/** Per-file detectors: each changed file, one at a time. */
function runPerFile(input: DetectorInput): Finding[] {
  return detectors.flatMap((d) => d.run?.(input) ?? []);
}

/** Whole-diff detectors: every file in the fixture at once. */
function runProject(inputs: DetectorInput[]): Finding[] {
  return detectors.flatMap((d) => d.runProject?.(inputs) ?? []);
}

/**
 * Repo-context detectors: build the retrieval index over the corpus and run the
 * `runRepo` hook on the changed files only. The corpus is context (the rest of
 * the repo), never itself a source of findings. No-op when there's no corpus.
 */
function runRepo(inputs: DetectorInput[], corpus?: NeighborFile[]): Finding[] {
  if (!corpus || corpus.length === 0) return [];
  const repo = createRepoContext(
    inputs.map((i) => ({ file: i.file, content: i.content })),
    corpus,
  );
  return detectors.flatMap((d) => d.runRepo?.(inputs, repo) ?? []);
}

/** Added/changed line count for one input: its diff ranges, else whole file. */
function changedLines(input: DetectorInput): number {
  if (input.addedRanges && input.addedRanges.length > 0) {
    return input.addedRanges.reduce((sum, r) => sum + (r.end - r.start + 1), 0);
  }
  return input.content.split("\n").length;
}

/**
 * Build the per-diff ranking context from a fixture's inputs: a file→domain
 * resolver (explicit meta, else path inference) and the total changed-line
 * count across the unit.
 */
function buildContext(inputs: DetectorInput[], repoPolicy?: RepoPolicy): UnitContext {
  const metaByFile = new Map(inputs.map((i) => [i.file, i.meta]));
  return {
    domainForFile: (file) => domainForFile(file, metaByFile.get(file)),
    totalChangedLines: inputs.reduce((sum, i) => sum + changedLines(i), 0),
    repoPolicy,
  };
}

/**
 * Hard ranking assertions for a matched pair (rank / diff-size band / dedup
 * correlation). Unlike severity these fail the fixture — they're the only
 * signal those ranking behaviors have. Returns human-readable mismatch lines.
 */
function rankingMismatches(expected: ExpectedFinding, actual: RankedFinding): string[] {
  const issues: string[] = [];
  if (expected.rank !== undefined && expected.rank !== actual.rank) {
    issues.push(`rank: expected #${expected.rank}, got #${actual.rank} (${actual.ruleId})`);
  }
  if (
    expected.diffSizeMultiplier !== undefined &&
    Math.abs(expected.diffSizeMultiplier - actual.appliedMultipliers.diffSize) > 1e-9
  ) {
    issues.push(
      `diffSize: expected ${expected.diffSizeMultiplier}, got ${actual.appliedMultipliers.diffSize} (${actual.ruleId})`
    );
  }
  if (expected.correlatedWith !== undefined) {
    const got = [...(actual.correlatedWith ?? [])].sort();
    const want = [...expected.correlatedWith].sort();
    if (got.length !== want.length || got.some((id, i) => id !== want[i])) {
      issues.push(
        `correlatedWith: expected [${want.join(", ")}], got [${got.join(", ")}] (${actual.ruleId})`
      );
    }
  }
  if (expected.comparisonSet !== undefined) {
    // Subset assertion: every expected neighbor must be cited (robust to `k`
    // and tie-order). Extra neighbors in the actual set are allowed.
    const got = new Set(actual.comparisonSet ?? []);
    const missing = expected.comparisonSet.filter((p) => !got.has(p));
    if (missing.length > 0) {
      issues.push(
        `comparisonSet: missing [${missing.join(", ")}], got [${[...got].join(", ")}] (${actual.ruleId})`
      );
    }
  }
  return issues;
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
    const raw = [
      ...fixture.inputs.flatMap((input) => runPerFile(input)),
      ...runProject(fixture.inputs),
      ...runRepo(fixture.inputs, fixture.corpus),
    ];
    const actual = rankFindings(raw, buildContext(fixture.inputs, fixture.repoPolicy));
    const { matched, falseNegatives, falsePositives } = matchFindings(actual, fixture.expected);

    const assertionMismatches = matched.flatMap((m) => rankingMismatches(m.expected, m.actual));

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

    const pass = stats.fp === 0 && stats.fn === 0 && assertionMismatches.length === 0;
    if (!pass) failedFixtures++;

    console.log(`${pass ? "PASS" : "FAIL"}  ${fixture.category}/${fixture.name}`);

    for (const m of matched) {
      const correlated =
        m.actual.correlatedWith && m.actual.correlatedWith.length > 0
          ? ` +[${m.actual.correlatedWith.join(", ")}]`
          : "";
      console.log(
        `    #${m.actual.rank} ${m.actual.ruleId} (score ${m.actual.score.toFixed(2)}, sev ${m.actual.adjustedSeverity})${correlated}`
      );
      if (m.actual.comparisonSet && m.actual.comparisonSet.length > 0) {
        console.log(`      vs repo: [${m.actual.comparisonSet.join(", ")}]`);
      }
      if (m.expected.severity && m.expected.severity !== m.actual.adjustedSeverity) {
        console.log(
          `    severity mismatch: expected ${m.expected.severity}, got ${m.actual.adjustedSeverity} (${m.actual.ruleId})`
        );
      }
    }
    for (const issue of assertionMismatches) {
      console.log(`    ASSERT: ${issue}`);
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
