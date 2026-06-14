import { loadDotEnv } from "../load-env.js";
import { LlmAdjudicator } from "./llm-adjudicator.js";

loadDotEnv();
import { MockAdjudicator } from "./mock-adjudicator.js";
import type { Adjudicator } from "./types.js";
import type { UnitFiles } from "./validate-citation.js";

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";

export function isLiveAdjudicatorConfigured(): boolean {
  const key = process.env.SKEPTIC_ADJUDICATOR_API_KEY;
  return typeof key === "string" && key.trim().length > 0;
}

/** Select live LLM adjudicator when API key is set; otherwise empty mock. */
export function resolveAdjudicator(unit: UnitFiles): Adjudicator {
  if (!isLiveAdjudicatorConfigured()) {
    return new MockAdjudicator([]);
  }

  return new LlmAdjudicator(
    {
      apiKey: process.env.SKEPTIC_ADJUDICATOR_API_KEY!.trim(),
      model: process.env.SKEPTIC_ADJUDICATOR_MODEL?.trim() || DEFAULT_MODEL,
      baseUrl: process.env.SKEPTIC_ADJUDICATOR_BASE_URL?.trim() || DEFAULT_BASE_URL,
    },
    { unit },
  );
}
