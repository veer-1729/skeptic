import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import {
  acceptedVerdicts,
  adjudicateFindings,
} from "../adjudication/adjudicate.js";
import { isLiveAdjudicatorConfigured, resolveAdjudicator } from "../adjudication/resolve-adjudicator.js";
import { unitFilesFromInputs } from "../adjudication/validate-citation.js";
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
  validationPasses: boolean;
  accepted: boolean;
  /** When false, skip in live LLM eval (mock-only rubric cases). */
  liveEval?: boolean;
}

interface EvalCase {
  name: string;
  input: EvalCaseInput;
  expected: EvalCaseExpected;
}

function loadCases(): EvalCase[] {
  const cases: EvalCase[] = [];
  if (!existsSync(EVAL_DIR)) return cases;

  for (const name of readdirSync(EVAL_DIR).sort()) {
    const dir = join(EVAL_DIR, name);
    if (!statSync(dir).isDirectory()) continue;

    const input = JSON.parse(readFileSync(join(dir, "input.json"), "utf-8")) as EvalCaseInput;
    const expected = JSON.parse(
      readFileSync(join(dir, "expected.json"), "utf-8"),
    ) as EvalCaseExpected;

    cases.push({ name, input, expected });
  }

  return cases;
}

function softAssertExpected(
  name: string,
  actual: AdjudicationVerdict,
  expected: ExpectedAdjudicationVerdict,
): string[] {
  const issues: string[] = [];
  if (actual.outcome !== expected.outcome) {
    issues.push(`outcome: expected ${expected.outcome}, got ${actual.outcome}`);
  }
  if (expected.citationCount !== undefined && actual.citations.length < expected.citationCount) {
    issues.push(
      `citationCount: expected at least ${expected.citationCount}, got ${actual.citations.length}`,
    );
  }
  if (expected.rationaleContains) {
    for (const sub of expected.rationaleContains) {
      if (!actual.rationale.toLowerCase().includes(sub.toLowerCase())) {
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
  if (!isLiveAdjudicatorConfigured()) {
    console.error(
      "SKEPTIC_ADJUDICATOR_API_KEY is not set — live adjudication eval requires a configured API key.",
    );
    process.exit(1);
  }

  const cases = loadCases();
  if (cases.length === 0) {
    console.error(`No cases found under ${EVAL_DIR}`);
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;

  console.log("— adjudication eval (live LLM) —");

  for (const c of cases) {
    if (c.expected.liveEval === false) {
      console.log(`SKIP  ${c.name} (mock-only)`);
      continue;
    }
    const unit = unitFilesFromInputs(c.input.unitFiles);
    const adjudicationInput: AdjudicationInput = {
      finding: c.input.finding,
      snippet: c.input.snippet,
      taskDescription: c.input.taskDescription,
    };

    try {
      const adjudicator = resolveAdjudicator(unit);
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
        issues.push(...softAssertExpected(c.name, result.verdict, c.expected.verdict));
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
    } catch (err) {
      failed++;
      console.log(`FAIL  ${c.name}`);
      console.log(`        ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`\n${passed}/${passed + failed} live adjudication eval cases passing`);
  if (failed > 0) process.exit(1);
}

main();
