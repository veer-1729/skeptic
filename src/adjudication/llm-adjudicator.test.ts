import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AdjudicationError } from "./errors.js";
import { LlmAdjudicator } from "./llm-adjudicator.js";
import { parseChatCompletionContent, parseVerdictResponse } from "./parse-verdict-response.js";
import type { AdjudicationInput, FindingRef } from "../types.js";

const findingRef: FindingRef = {
  category: "shallow-edge-handling",
  ruleId: "float-money-math",
  file: "src/payments/charge.ts",
  lineStart: 3,
  lineEnd: 3,
};

const sampleInput: AdjudicationInput = {
  finding: {
    category: "shallow-edge-handling",
    ruleId: "float-money-math",
    severity: "medium",
    file: "src/payments/charge.ts",
    lineStart: 3,
    lineEnd: 3,
    message: "Float money math",
    confidence: 0.85,
    adjustedSeverity: "high",
    score: 13.5,
    rank: 1,
    appliedMultipliers: { domain: 1.5, diffSize: 1 },
  },
  snippet: "return Math.round(amount * 100);",
};

function mockFetch(response: { status: number; body: unknown }): typeof fetch {
  return async () =>
    ({
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: async () => response.body,
    }) as Response;
}

describe("parseVerdictResponse", () => {
  it("parses confirmed verdict with citations", () => {
    const verdict = parseVerdictResponse(
      {
        outcome: "confirmed",
        rationale: "Float multiply by 100 is lossy.",
        citations: [{ file: "src/payments/charge.ts", lineStart: 3, lineEnd: 3 }],
        proposedFix: "Use integer cents.",
      },
      findingRef,
    );
    assert.equal(verdict.outcome, "confirmed");
    assert.equal(verdict.findingRef.file, findingRef.file);
    assert.equal(verdict.citations.length, 1);
    assert.equal(verdict.proposedFix, "Use integer cents.");
  });

  it("coerces string line numbers", () => {
    const verdict = parseVerdictResponse(
      {
        outcome: "rejected",
        rationale: "Intentional pattern.",
        citations: [{ file: "src/a.ts", lineStart: "2", lineEnd: "4" }],
      },
      findingRef,
    );
    assert.equal(verdict.citations[0]?.lineStart, 2);
    assert.equal(verdict.citations[0]?.lineEnd, 4);
  });

  it("throws on invalid outcome", () => {
    assert.throws(
      () =>
        parseVerdictResponse({ outcome: "maybe", rationale: "x" }, findingRef),
      AdjudicationError,
    );
  });

  it("throws on missing rationale", () => {
    assert.throws(
      () => parseVerdictResponse({ outcome: "rejected", rationale: "  " }, findingRef),
      AdjudicationError,
    );
  });

  it("uses findingRef from argument not model output", () => {
    const verdict = parseVerdictResponse(
      {
        outcome: "rejected",
        rationale: "False positive.",
        findingRef: { category: "dead-leftovers", ruleId: "x", file: "other.ts", lineStart: 1, lineEnd: 1 },
      },
      findingRef,
    );
    assert.equal(verdict.findingRef.ruleId, "float-money-math");
  });
});

describe("parseChatCompletionContent", () => {
  it("extracts JSON from choices[0].message.content", () => {
    const raw = parseChatCompletionContent({
      choices: [{ message: { content: '{"outcome":"rejected","rationale":"ok","citations":[]}' } }],
    });
    assert.deepEqual(raw, { outcome: "rejected", rationale: "ok", citations: [] });
  });

  it("throws on invalid JSON content", () => {
    assert.throws(
      () =>
        parseChatCompletionContent({
          choices: [{ message: { content: "not json" } }],
        }),
      AdjudicationError,
    );
  });
});

describe("LlmAdjudicator", () => {
  it("returns parsed verdict on happy path", async () => {
    const adjudicator = new LlmAdjudicator(
      { apiKey: "test-key", model: "gpt-4o-mini" },
      {
        fetch: mockFetch({
          status: 200,
          body: {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    outcome: "confirmed",
                    rationale: "Lossy float cents conversion.",
                    citations: [{ file: "src/payments/charge.ts", lineStart: 3, lineEnd: 3 }],
                  }),
                },
              },
            ],
          },
        }),
      },
    );

    const verdict = await adjudicator.judge(sampleInput);
    assert.equal(verdict.outcome, "confirmed");
    assert.equal(verdict.findingRef.lineStart, 3);
  });

  it("throws on HTTP error", async () => {
    const adjudicator = new LlmAdjudicator(
      { apiKey: "bad-key", model: "gpt-4o-mini" },
      { fetch: mockFetch({ status: 401, body: { error: { message: "Unauthorized" } } }) },
    );

    await assert.rejects(() => adjudicator.judge(sampleInput), AdjudicationError);
  });

  it("throws when model returns invalid outcome", async () => {
    const adjudicator = new LlmAdjudicator(
      { apiKey: "test-key", model: "gpt-4o-mini" },
      {
        fetch: mockFetch({
          status: 200,
          body: {
            choices: [
              {
                message: {
                  content: JSON.stringify({ outcome: "unknown", rationale: "hmm" }),
                },
              },
            ],
          },
        }),
      },
    );

    await assert.rejects(() => adjudicator.judge(sampleInput), AdjudicationError);
  });
});
