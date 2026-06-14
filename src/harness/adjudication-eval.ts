import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { MockAdjudicator } from "../adjudication/mock-adjudicator.js";
import {
  acceptedVerdicts,
  adjudicateFindings,
} from "../adjudication/adjudicate.js";
import {
  unitFilesFromInputs,
  validateVerdict,
} from "../adjudication/validate-citation.js";
import type {
  AdjudicationInput,
  AdjudicationVerdict,
  ExpectedAdjudicationVerdict,
  RankedFinding,
} from "../types.js";

const EVAL_DIR = join(process.cwd(), "adjudication-eval");

interface EvalCaseInput {
  finding: RankedFinding;
  snippet: string;
  taskDescription?: string;
  unitFiles: { file: string; content: string; addedRanges?: { start: number; end: number }[] }[];
}

interface EvalCaseExpected {
  verdict: ExpectedAdjudicationVerdict;
  /** When false, citation validation must fail (invalid mock verdict). */
  validationPasses: boolean;
  /** When true, verdict is kept after validation. */
  accepted: boolean;
}

interface EvalCase {
  name: string;
  input: EvalCaseInput;
  mockVerdict: AdjudicationVerdict;
  expected: EvalCaseExpected;
}

function loadCases(): EvalCase[] {
  const cases: EvalCase[] = [];
  if (!existsSync(EVAL_DIR)) return cases;

  for (const name of readdirSync(EVAL_DIR).sort()) {
    const dir = join(EVAL_DIR, name);
    if (!statSync(dir).isDirectory()) continue;

    const input = JSON.parse(readFileSync(join(dir, "input.json"), "utf-8")) as EvalCaseInput;
    const mockVerdict = JSON.parse(
      readFileSync(join(dir, "mock-verdict.json"), "utf-8"),
    ) as AdjudicationVerdict;
    const expected = JSON.parse(
      readFileSync(join(dir, "expected.json"), "utf-8"),
    ) as EvalCaseExpected;

    cases.push({ name, input, mockVerdict, expected });
  }

  return cases;
}

function assertExpected(
  name: string,
  actual: AdjudicationVerdict,
  expected: ExpectedAdjudicationVerdict,
): string[] {
  const issues: string[] = [];
  if (actual.outcome !== expected.outcome) {
    issues.push(`outcome: expected ${expected.outcome}, got ${actual.outcome}`);
  }
  if (expected.citationCount !== undefined && actual.citations.length !== expected.citationCount) {
    issues.push(
      `citationCount: expected ${expected.citationCount}, got ${actual.citations.length}`,
    );
  }
  if (expected.citations) {
    for (const want of expected.citations) {
      const got = actual.citations.find(
        (c) =>
          c.file === want.file &&
          c.lineStart === want.lineStart &&
          c.lineEnd === want.lineEnd,
      );
      if (!got) {
        issues.push(
          `missing citation ${want.file}:${want.lineStart}-${want.lineEnd}`,
        );
      }
    }
  }
  if (expected.rationaleContains) {
    for (const sub of expected.rationaleContains) {
      if (!actual.rationale.includes(sub)) {
        issues.push(`rationale missing "${sub}"`);
      }
    }
  }
  if (issues.length > 0) {
    return [`${name}: ${issues.join("; ")}`];
  }
  return [];
}

async function main(): Promise<void> {
  const cases = loadCases();
  if (cases.length === 0) {
    console.error(`No cases found under ${EVAL_DIR}`);
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;

  console.log("— adjudication eval —");

  for (const c of cases) {
    const unit = unitFilesFromInputs(c.input.unitFiles);
    const adjudicationInput: AdjudicationInput = {
      finding: c.input.finding,
      snippet: c.input.snippet,
      taskDescription: c.input.taskDescription,
    };
    const adjudicator = new MockAdjudicator([c.mockVerdict]);
    const results = await adjudicateFindings([adjudicationInput], adjudicator, unit);
    const [result] = results;
    if (!result) {
      failed++;
      console.log(`FAIL  ${c.name} — no result`);
      continue;
    }

    const validationPassed = result.validationErrors.length === 0;
    const wasAccepted = validationPassed;

    const issues: string[] = [];
    if (validationPassed !== c.expected.validationPasses) {
      issues.push(
        `validationPasses: expected ${c.expected.validationPasses}, got ${validationPassed}` +
          (result.validationErrors.length ? ` (${result.validationErrors.join(", ")})` : ""),
      );
    }
    if (wasAccepted !== c.expected.accepted) {
      issues.push(`accepted: expected ${c.expected.accepted}, got ${wasAccepted}`);
    }
    if (validationPassed) {
      issues.push(...assertExpected(c.name, result.verdict, c.expected.verdict));
    }

    const accepted = acceptedVerdicts(results);
    if (c.expected.accepted && accepted.length !== 1) {
      issues.push(`acceptedVerdicts count: expected 1, got ${accepted.length}`);
    }
    if (!c.expected.accepted && accepted.length !== 0) {
      issues.push(`acceptedVerdicts count: expected 0, got ${accepted.length}`);
    }

    if (issues.length === 0) {
      passed++;
      console.log(`PASS  ${c.name}`);
    } else {
      failed++;
      console.log(`FAIL  ${c.name}`);
      for (const issue of issues) console.log(`        ${issue}`);
    }
  }

  console.log(`\n${passed}/${passed + failed} adjudication eval cases passing`);
  if (failed > 0) process.exit(1);
}

main();
