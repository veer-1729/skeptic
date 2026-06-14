import type { AdjudicationVerdict, Citation, FindingRef, VerdictOutcome } from "../types.js";
import { AdjudicationError } from "./errors.js";

const VALID_OUTCOMES = new Set<VerdictOutcome>(["confirmed", "rejected", "needs_review"]);

function normalizeCitation(raw: unknown): Citation | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const obj = raw as Record<string, unknown>;
  const file = typeof obj.file === "string" ? obj.file : undefined;
  const lineStart = coerceLine(obj.lineStart);
  const lineEnd = coerceLine(obj.lineEnd ?? obj.lineStart);
  if (!file || lineStart === undefined || lineEnd === undefined) return undefined;
  if (lineEnd < lineStart) return undefined;

  const citation: Citation = { file, lineStart, lineEnd };
  if (typeof obj.excerpt === "string" && obj.excerpt.length > 0) {
    citation.excerpt = obj.excerpt;
  }
  return citation;
}

function coerceLine(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const n = Number(value);
    if (n >= 1) return n;
  }
  return undefined;
}

/**
 * Parse model JSON into an {@link AdjudicationVerdict}.
 * `findingRef` is always taken from the input finding — never from model output.
 */
export function parseVerdictResponse(raw: unknown, findingRef: FindingRef): AdjudicationVerdict {
  if (typeof raw !== "object" || raw === null) {
    throw new AdjudicationError("Adjudicator response is not a JSON object");
  }

  const obj = raw as Record<string, unknown>;
  const outcomeRaw = obj.outcome;
  if (typeof outcomeRaw !== "string" || !VALID_OUTCOMES.has(outcomeRaw as VerdictOutcome)) {
    throw new AdjudicationError(
      `Invalid adjudicator outcome: ${String(outcomeRaw)} (expected confirmed|rejected|needs_review)`,
    );
  }
  const outcome = outcomeRaw as VerdictOutcome;

  const rationale = obj.rationale;
  if (typeof rationale !== "string" || rationale.trim().length === 0) {
    throw new AdjudicationError("Adjudicator response missing non-empty rationale");
  }

  const citations: Citation[] = [];
  if (Array.isArray(obj.citations)) {
    for (const item of obj.citations) {
      const c = normalizeCitation(item);
      if (c) citations.push(c);
    }
  }

  const verdict: AdjudicationVerdict = {
    findingRef,
    outcome,
    citations,
    rationale: rationale.trim(),
  };

  if (typeof obj.proposedFix === "string" && obj.proposedFix.trim().length > 0) {
    verdict.proposedFix = obj.proposedFix.trim();
  }

  return verdict;
}

/** Extract JSON object from an OpenAI chat/completions response body. */
export function parseChatCompletionContent(body: unknown): unknown {
  if (typeof body !== "object" || body === null) {
    throw new AdjudicationError("Chat completion response is not an object");
  }
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new AdjudicationError("Chat completion response has no choices");
  }
  const message = (choices[0] as { message?: { content?: unknown } })?.message;
  const content = message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new AdjudicationError("Chat completion response has empty message content");
  }

  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new AdjudicationError("Chat completion message content is not valid JSON");
  }
}
