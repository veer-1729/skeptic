import type { AdjudicationInput, AdjudicationVerdict, FindingRef } from "../types.js";
import { rankedFindingRef } from "./adjudicate.js";
import { AdjudicationError } from "./errors.js";
import { parseChatCompletionContent, parseVerdictResponse } from "./parse-verdict-response.js";
import type { Adjudicator } from "./types.js";
import type { UnitFiles } from "./validate-citation.js";

export interface LlmAdjudicatorConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface LlmAdjudicatorOptions {
  fetch?: typeof fetch;
  unit?: UnitFiles;
}

function defaultBaseUrl(): string {
  return "https://api.openai.com/v1";
}

function unitFileSummary(unit: UnitFiles | undefined): string {
  if (!unit) return "No unit file list provided.";
  const lines: string[] = [];
  for (const [file, entry] of unit.files) {
    const range =
      entry.addedRanges && entry.addedRanges.length > 0
        ? ` (added lines: ${entry.addedRanges.map((r) => `${r.start}-${r.end}`).join(", ")})`
        : "";
    lines.push(`- ${file}: ${entry.lineCount} lines${range}`);
  }
  return lines.join("\n");
}

function buildSystemPrompt(): string {
  return [
    "You are Skeptic's adjudication step. You receive a single ranked detector finding (not a full code review request) plus the surrounding code snippet.",
    "Decide whether the finding is a real problem given ONLY the evidence in the snippet and finding metadata.",
    "",
    "The detector already matched a real code pattern. Your default is to CONFIRM that pattern unless the evidence shows it is a false positive. Do not dismiss a finding without a concrete reason in the snippet.",
    "",
    "Decision procedure:",
    "1. Read the finding's concern, then read the snippet line by line.",
    "2. Check whether the snippet contains a GENUINE safeguard that resolves the concern — e.g. the claimed guard, filter, ownership check, or validation is actually performed in the code (a comment that promises a check is satisfied when the adjacent code performs that check).",
    "3. If a genuine safeguard is present, the finding is a false positive: outcome = rejected, and cite the exact line that satisfies it.",
    "4. Otherwise outcome = confirmed, citing the flagged line.",
    "5. Use needs_review only when the snippet is genuinely insufficient to decide.",
    "",
    "A superficial wrapper is NOT a safeguard and does NOT resolve a finding. For example: Math.round / Math.floor does not make float money arithmetic safe; casting to `any` does not resolve a type mismatch; renaming or logging does not fix the underlying issue. When in doubt between confirmed and rejected, prefer confirmed.",
    "",
    "For comment-compliance findings specifically: a comment's promised guarantee is satisfied when the adjacent code performs an equivalent check, even if the wording differs. A query scoped to the current user's id (e.g. `where userId = $1` with the user id bound) satisfies a comment promising that a user can only access their own data — in that case reject and cite the query line.",
    "",
    "Outcome rules:",
    "- Outcome must be one of: confirmed, rejected, needs_review.",
    "- confirmed or needs_review MUST include at least one citation with a valid file path and line numbers present in the snippet.",
    "- rejected SHOULD cite the line that disproves the finding when such a line exists; it may omit citations otherwise.",
    "- Citations must use exact repo-relative file paths and 1-based line numbers from the snippet. Never invent files, lines, or guarantees not visible in the evidence.",
    "- rationale must explain, with reference to the cited lines, why the finding stands or is a false positive.",
    "- proposedFix is optional; when present, describe the smallest concrete fix.",
    "",
    "Respond with JSON only:",
    '{"outcome":"confirmed|rejected|needs_review","citations":[{"file":"...","lineStart":N,"lineEnd":N,"excerpt":"..."}],"rationale":"...","proposedFix":"..."}',
  ].join("\n");
}

function buildUserPrompt(input: AdjudicationInput, unit: UnitFiles | undefined): string {
  const ref = rankedFindingRef(input.finding);
  const parts = [
    "## Finding",
    JSON.stringify(
      {
        category: input.finding.category,
        ruleId: input.finding.ruleId,
        file: ref.file,
        lineStart: ref.lineStart,
        lineEnd: ref.lineEnd,
        message: input.finding.message,
        severity: input.finding.severity,
        adjustedSeverity: input.finding.adjustedSeverity,
        confidence: input.finding.confidence,
        score: input.finding.score,
        rank: input.finding.rank,
      },
      null,
      2,
    ),
    "",
    "## Snippet (only cite lines from here)",
    input.snippet || "(empty snippet)",
    "",
    "## Unit files",
    unitFileSummary(unit),
  ];

  if (input.taskDescription) {
    parts.push("", "## Task description", input.taskDescription);
  }

  return parts.join("\n");
}

export class LlmAdjudicator implements Adjudicator {
  private readonly config: Required<Pick<LlmAdjudicatorConfig, "apiKey" | "model">> &
    Pick<LlmAdjudicatorConfig, "baseUrl">;
  private readonly fetchFn: typeof fetch;
  private readonly unit?: UnitFiles;

  constructor(config: LlmAdjudicatorConfig, options: LlmAdjudicatorOptions = {}) {
    this.config = {
      apiKey: config.apiKey,
      model: config.model,
      baseUrl: config.baseUrl ?? defaultBaseUrl(),
    };
    this.fetchFn = options.fetch ?? fetch;
    this.unit = options.unit;
  }

  async judge(input: AdjudicationInput): Promise<AdjudicationVerdict> {
    const findingRef: FindingRef = rankedFindingRef(input.finding);
    const url = `${this.config.baseUrl!.replace(/\/$/, "")}/chat/completions`;

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: buildUserPrompt(input, this.unit) },
        ],
        temperature: 0,
      }),
    });

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new AdjudicationError(`Adjudicator HTTP ${response.status}: invalid JSON body`, response.status);
    }

    if (!response.ok) {
      const msg =
        typeof body === "object" &&
        body !== null &&
        typeof (body as { error?: { message?: unknown } }).error?.message === "string"
          ? (body as { error: { message: string } }).error.message
          : `HTTP ${response.status}`;
      throw new AdjudicationError(`Adjudicator request failed: ${msg}`, response.status);
    }

    const rawVerdict = parseChatCompletionContent(body);
    return parseVerdictResponse(rawVerdict, findingRef);
  }
}
