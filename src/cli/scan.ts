#!/usr/bin/env node
/**
 * Scan a GitHub repo or local checkout for AI slop in a git diff.
 *
 * Usage:
 *   npm run scan -- https://github.com/org/repo
 *   npm run scan -- ./my-checkout --base main
 *   npm run scan -- https://github.com/org/repo --commit abc1234
 */
import { execFileSync } from "child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import ts from "typescript";
import { detectors } from "../detectors/index.js";
import { functionEnclosingLine } from "../context/comment-guarantees.js";
import { domainForFile } from "../context/domains.js";
import { parseManifest } from "../context/manifest.js";
import { rankFindings } from "../ranking/rank.js";
import { createRepoContext } from "../retrieval/repo-index.js";
import { adjudicateFindings, acceptedVerdicts, type AdjudicationResult } from "../adjudication/adjudicate.js";
import { isLiveAdjudicatorConfigured, resolveAdjudicator } from "../adjudication/resolve-adjudicator.js";
import { unitFilesFromInputs } from "../adjudication/validate-citation.js";
import type { AdjudicationInput, AdjudicationVerdict, RankedFinding } from "../types.js";
import { parseUnifiedDiff } from "./git-diff.js";
import {
  buildCorpus,
  buildScanInputs,
  buildScanMeta,
  packageNamesFromRoot,
  readRepoFile,
} from "./load-repo.js";

interface ScanOptions {
  base?: string;
  commit?: string;
  top: number;
  json: boolean;
  keepClone: boolean;
  noFail: boolean;
  adjudicate: boolean;
}

function usage(): never {
  console.error(`Usage: npm run scan -- [options] <github-url|local-path>

Options:
  --base <branch>   Diff against this branch (default: origin/HEAD or main)
  --commit <ref>    Scan one commit's patch (git show), not a branch range
  --top <n>         Max findings to print (default: 25)
  --json            Emit JSON instead of a text report
  --keep-clone      Keep the temp clone directory (GitHub URLs only)
  --no-fail         Report findings without failing the process (exit 0)
  --adjudicate      Run adjudication on top findings (live LLM when SKEPTIC_ADJUDICATOR_API_KEY is set)
  --help            Show this help

Examples:
  npm run scan -- https://github.com/expressjs/express
  npm run scan -- . --base main
  npm run scan -- https://github.com/org/repo --commit HEAD~3..HEAD`);
  process.exit(1);
}

function parseArgs(argv: string[]): { target: string; opts: ScanOptions } {
  const opts: ScanOptions = { top: 25, json: false, keepClone: false, noFail: false, adjudicate: false };
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--help" || arg === "-h") usage();
    if (arg === "--json") {
      opts.json = true;
      continue;
    }
    if (arg === "--keep-clone") {
      opts.keepClone = true;
      continue;
    }
    if (arg === "--no-fail") {
      opts.noFail = true;
      continue;
    }
    if (arg === "--adjudicate") {
      opts.adjudicate = true;
      continue;
    }
    if (arg === "--base") {
      opts.base = argv[++i];
      if (!opts.base) usage();
      continue;
    }
    if (arg === "--commit") {
      opts.commit = argv[++i];
      if (!opts.commit) usage();
      continue;
    }
    if (arg === "--top") {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n < 1) usage();
      opts.top = n;
      continue;
    }
    if (arg.startsWith("-")) usage();
    positional.push(arg);
  }

  if (positional.length !== 1) usage();
  return { target: positional[0]!, opts };
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf-8", maxBuffer: 32 * 1024 * 1024 });
}

function normalizeGithubUrl(input: string): string {
  if (/^[\w-]+\/[\w.-]+$/.test(input)) return `https://github.com/${input}.git`;
  if (input.startsWith("github.com/")) return `https://${input}.git`;
  if (input.endsWith(".git")) return input;
  if (/^https?:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/.test(input)) {
    return input.replace(/\/?$/, ".git");
  }
  return input;
}

function isGithubUrl(input: string): boolean {
  return (
    input.startsWith("https://github.com/") ||
    input.startsWith("git@github.com:") ||
    /^[\w-]+\/[\w.-]+$/.test(input)
  );
}

function resolveRepoRoot(target: string, keepClone: boolean): { root: string; cleanup: () => void } {
  if (isGithubUrl(target) || target.startsWith("http://") || target.startsWith("https://")) {
    const url = normalizeGithubUrl(target);
    const dir = mkdtempSync(join(tmpdir(), "skeptic-scan-"));
    console.error(`Cloning ${url} → ${dir}`);
    git(process.cwd(), ["clone", "--depth", "100", url, dir]);
    return {
      root: dir,
      cleanup: () => {
        if (!keepClone) rmSync(dir, { recursive: true, force: true });
        else console.error(`Clone kept at ${dir}`);
      },
    };
  }

  const root = resolve(target);
  if (!existsSync(join(root, ".git"))) {
    throw new Error(`Not a git repository: ${root}`);
  }
  return { root, cleanup: () => {} };
}

function detectBaseBranch(root: string, explicit?: string): string {
  if (explicit) return explicit;
  for (const candidate of ["origin/HEAD", "origin/main", "origin/master", "main", "master"]) {
    try {
      git(root, ["rev-parse", "--verify", candidate]);
      return candidate;
    } catch {
      /* try next */
    }
  }
  return "HEAD~1";
}

function packageNamesAtRef(root: string, ref: string): string[] {
  try {
    const content = git(root, ["show", `${ref}:package.json`]);
    return parseManifest("package.json", content).map((e) => e.name);
  } catch {
    return [];
  }
}

function loadDiff(root: string, opts: ScanOptions): { diff: string; label: string } {
  if (opts.commit) {
    if (opts.commit.includes("..")) {
      const diff = git(root, ["diff", opts.commit]);
      return { diff, label: opts.commit };
    }
    const diff = git(root, ["show", opts.commit, "--format=", "--patch", "--unified=3"]);
    return { diff, label: opts.commit };
  }

  const base = detectBaseBranch(root, opts.base);
  try {
    const diff = git(root, ["diff", `${base}...HEAD`, "--patch", "--unified=3"]);
    return { diff, label: `${base}...HEAD` };
  } catch {
    const diff = git(root, ["show", "HEAD", "--format=", "--patch", "--unified=3"]);
    return { diff, label: "HEAD (single commit)" };
  }
}

function changedLines(input: { addedRanges?: { start: number; end: number }[]; content: string }): number {
  if (input.addedRanges?.length) {
    return input.addedRanges.reduce((sum, r) => sum + (r.end - r.start + 1), 0);
  }
  return input.content.split("\n").length;
}

/** Largest enclosing-function snippet we'll send; bigger functions fall back to a window. */
const MAX_SNIPPET_LINES = 60;

/** 1-based [start, end] line range of the function enclosing `line`, if any. */
function enclosingFunctionRange(
  content: string,
  file: string,
  line: number,
): { start: number; end: number } | undefined {
  const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const fn = functionEnclosingLine(sourceFile, line);
  if (!fn) return undefined;
  const start = sourceFile.getLineAndCharacterOfPosition(fn.getStart(sourceFile)).line + 1;
  const end = sourceFile.getLineAndCharacterOfPosition(fn.getEnd()).line + 1;
  return { start, end };
}

/**
 * Source context for adjudication. Prefers the enclosing function (so the
 * adjudicator can see a guard anywhere in the body — essential for
 * comment-compliance), capped at {@link MAX_SNIPPET_LINES}; otherwise a small
 * window around the finding.
 */
function snippetForFinding(root: string, finding: RankedFinding): string {
  try {
    const content = readRepoFile(root, finding.file);
    const lines = content.split("\n");

    const fnRange = enclosingFunctionRange(content, finding.file, finding.lineStart);
    if (fnRange && fnRange.end - fnRange.start + 1 <= MAX_SNIPPET_LINES) {
      return lines.slice(fnRange.start - 1, fnRange.end).join("\n");
    }

    const start = Math.max(0, finding.lineStart - 3);
    const end = Math.min(lines.length, finding.lineEnd + 2);
    return lines.slice(start, end).join("\n");
  } catch {
    return "";
  }
}

async function runAdjudication(
  root: string,
  findings: RankedFinding[],
  inputs: { file: string; content: string; addedRanges?: { start: number; end: number }[] }[],
  top: number,
): Promise<{
  provider: "live" | "mock";
  candidates: number;
  accepted: number;
  results: AdjudicationResult[];
}> {
  const candidates = findings.slice(0, top);
  const unit = unitFilesFromInputs(inputs);
  const adjudicator = resolveAdjudicator(unit);
  const adjudicationInputs: AdjudicationInput[] = candidates.map((finding) => ({
    finding,
    snippet: snippetForFinding(root, finding),
  }));
  const results = await adjudicateFindings(adjudicationInputs, adjudicator, unit);
  return {
    provider: isLiveAdjudicatorConfigured() ? "live" : "mock",
    candidates: candidates.length,
    accepted: acceptedVerdicts(results).length,
    results,
  };
}

function runScan(root: string, opts: ScanOptions): {
  label: string;
  findings: RankedFinding[];
  changedFiles: number;
  inputs: ReturnType<typeof buildScanInputs>;
} {
  const { diff, label } = loadDiff(root, opts);
  const parsed = parseUnifiedDiff(diff);

  if (parsed.length === 0) {
    return { label, findings: [], changedFiles: 0 };
  }

  const baseRef = opts.base ?? detectBaseBranch(root);
  const existingPackages = packageNamesAtRef(root, baseRef);
  const meta = buildScanMeta(root, existingPackages.length > 0 ? existingPackages : packageNamesFromRoot(root));

  const inputs = buildScanInputs(root, parsed, meta);
  const changedPaths = new Set(parsed.map((p) => p.path));
  const corpus = buildCorpus(root, changedPaths, meta);

  const repo = corpus.length > 0 ? createRepoContext(inputs, corpus) : null;
  const raw = [
    ...inputs.flatMap((input) => detectors.flatMap((d) => d.run?.(input) ?? [])),
    ...detectors.flatMap((d) => d.runProject?.(inputs) ?? []),
    ...(repo ? detectors.flatMap((d) => d.runRepo?.(inputs, repo) ?? []) : []),
  ];

  const metaByFile = new Map(inputs.map((i) => [i.file, i.meta]));
  const ranked = rankFindings(raw, {
    domainForFile: (file) => domainForFile(file, metaByFile.get(file)),
    totalChangedLines: inputs.reduce((sum, i) => sum + changedLines(i), 0),
  });

  return { label, findings: ranked, changedFiles: inputs.length, inputs };
}

function printAdjudicationVerdict(v: AdjudicationVerdict): void {
  const cite =
    v.citations.length > 0
      ? v.citations.map((c) => `${c.file}:${c.lineStart}-${c.lineEnd}`).join(", ")
      : "(none)";
  console.log(
    `  [${v.outcome}] ${v.findingRef.category}/${v.findingRef.ruleId} @ ${v.findingRef.file}:${v.findingRef.lineStart}`,
  );
  console.log(`    citations: ${cite}`);
  console.log(`    ${v.rationale}`);
  if (v.proposedFix) console.log(`    fix: ${v.proposedFix}`);
}

function printReport(
  target: string,
  label: string,
  findings: RankedFinding[],
  changedFiles: number,
  top: number,
  adjudication?: {
    provider: "live" | "mock";
    candidates: number;
    accepted: number;
    results: AdjudicationResult[];
  },
) {
  console.log(`Skeptic scan — ${target}`);
  console.log(`Diff: ${label} | ${changedFiles} changed file(s) analyzed\n`);

  if (findings.length === 0) {
    console.log("No slop findings in this diff.");
    return;
  }

  const byCategory = new Map<string, number>();
  for (const f of findings) byCategory.set(f.category, (byCategory.get(f.category) ?? 0) + 1);

  console.log("— summary —");
  for (const [cat, count] of [...byCategory.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count}`);
  }
  console.log(`\n— top ${Math.min(top, findings.length)} findings —`);

  for (const f of findings.slice(0, top)) {
    const corr =
      f.correlatedWith && f.correlatedWith.length > 0 ? ` +[${f.correlatedWith.join(", ")}]` : "";
    console.log(
      `#${f.rank} [${f.category}] ${f.ruleId} @ ${f.file}:${f.lineStart}` +
        `  sev=${f.adjustedSeverity} score=${f.score.toFixed(2)} conf=${f.confidence.toFixed(2)}${corr}`,
    );
    console.log(`    ${f.message}`);
    if (f.comparisonSet?.length) {
      console.log(`    vs repo: [${f.comparisonSet.slice(0, 5).join(", ")}${f.comparisonSet.length > 5 ? ", …" : ""}]`);
    }
  }

  if (findings.length > top) {
    console.log(`\n… ${findings.length - top} more finding(s). Use --top to see more.`);
  }

  if (adjudication) {
    console.log("\n— adjudication —");
    if (adjudication.provider === "mock") {
      console.log(
        "Live adjudicator not configured — set SKEPTIC_ADJUDICATOR_API_KEY to enable the LLM provider.",
      );
    } else {
      console.log(`Provider: live (${process.env.SKEPTIC_ADJUDICATOR_MODEL ?? "gpt-4o-mini"})`);
    }
    console.log(
      `${adjudication.candidates} candidate(s); ${adjudication.accepted} passed citation validation.`,
    );

    const rejectedValidation = adjudication.results.filter((r) => r.validationErrors.length > 0);
    if (rejectedValidation.length > 0) {
      console.log(`${rejectedValidation.length} verdict(s) failed citation validation:`);
      for (const r of rejectedValidation) {
        console.log(
          `  ${r.verdict.findingRef.ruleId} @ ${r.verdict.findingRef.file}:${r.verdict.findingRef.lineStart} — ${r.validationErrors.join("; ")}`,
        );
      }
    }

    const accepted = acceptedVerdicts(adjudication.results);
    if (accepted.length > 0) {
      console.log("\nAccepted verdicts:");
      for (const v of accepted) printAdjudicationVerdict(v);
    }
  }
}

async function main() {
  const { target, opts } = parseArgs(process.argv.slice(2));
  const { root, cleanup } = resolveRepoRoot(target, opts.keepClone);

  try {
    const { label, findings, changedFiles, inputs } = runScan(root, opts);
    const adjudication = opts.adjudicate
      ? await runAdjudication(root, findings, inputs, opts.top)
      : undefined;

    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            target,
            diff: label,
            changedFiles,
            findings,
            adjudication,
          },
          null,
          2,
        ),
      );
    } else {
      printReport(target, label, findings, changedFiles, opts.top, adjudication);
    }

    process.exit(!opts.noFail && findings.length > 0 ? 1 : 0);
  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
