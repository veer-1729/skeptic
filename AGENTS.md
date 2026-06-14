# AGENTS.md — Skeptic

Skeptic is an AI slop detector: given a code diff (and eventually repo
context + agent session traces), it detects which parts match one of 16
known "AI-shaped risk" categories, tagged with evidence (file/line, rule
ID, severity, confidence).

**Read these before doing anything else:**
- `docs/skeptic-taxonomy.md` — the 16 categories this project detects, with
  detection signals and severity modifiers for each
- `docs/skeptic-architecture.md` — system architecture, design principles,
  and the build order
- `docs/roadmap.md` — current status, what's implemented, what's next
- `README.md` — how the fixture harness works mechanically

## The contract

- `src/types.ts` defines `Finding`, `ExpectedFinding`, `DetectorInput`, and
  `Detector`. Every detector and fixture depends on these. Don't change them
  casually — if a change is needed (e.g. extending `meta`), propose it in
  writing first (a short note is fine), confirm `npm test` passes on the
  existing suite before *and* after, and call out anything the change makes
  obsolete.
- Every detector: implements `Detector` — `run(input: DetectorInput): Finding[]`,
  pure, no side effects, no network/filesystem access beyond what's in
  `input`. Registered in `src/detectors/index.ts`.
- `npm test` is the source of truth, not "the diff looks right." A category
  is done when its fixtures pass and the full suite shows no regressions.

## The one hard rule

**Never modify anything under `fixtures/` while implementing a detector.**

Fixtures (`input.*`, `expected.json`, `meta.json`) are the spec. They're
written and reviewed by a human in a dedicated fixtures session, *before*
implementation starts. If a fixture looks wrong — bad line numbers, wrong
category, contradicts another fixture — stop and explain the problem instead
of editing it or writing a detector that's shaped to match it.

If you're asked to implement a category and `fixtures/<category>/` doesn't
exist or looks incomplete, say so rather than inventing fixtures yourself.

Why this is non-negotiable here specifically: Skeptic's flagship detection
category is "the agent weakened the test instead of fixing the code."
Quietly editing fixtures until `npm test` is green would be that exact
failure mode, applied to building Skeptic itself. Treat `git diff --stat
fixtures/` being non-empty at the end of an implementation session as a bug
in the session, not a detail.

## Workflow per category

1. **Fixtures session** (human-reviewed): draft 4-8 fixtures for the
   category — at least 2 positive (should fire) and 2 negative (looks
   similar, should NOT fire). Run `npm test` and confirm they fail with
   `MISSING` (expected — nothing's implemented yet). Human reviews/edits,
   then commits.
2. **Implementation session**: implement the detector(s) against the
   committed fixtures, following the pattern in
   `src/detectors/type-anesthesia/as-any-cast.ts`. Run `npm test` after
   each meaningful change. Report final per-category precision/recall.
3. **Before declaring done**: `git diff --stat fixtures/` is empty, the full
   suite passes, and `docs/roadmap.md` is updated to check off what landed.

## Conventions

- One rule = one file: `src/detectors/<category>/<rule-id>.ts`.
- Use the TypeScript AST (`typescript` package) for anything structural —
  avoid regex for things that have a syntax tree (casts, imports, catch
  blocks, etc.). Regex is fine for things that genuinely are textual (e.g.
  scanning comments for keywords).
- Severity/domain logic that's currently duplicated per-detector (see
  `as-any-cast.ts`'s `sensitiveDomains` set) is a known phase-1 shortcut —
  it moves to the ranking engine in phase 2. Don't be surprised by it, don't
  remove it without replacing it.
- Adjudication: `npm test` uses `MockAdjudicator` only (offline). Live LLM
  eval is opt-in via `npm run test:adjudication:live` and requires
  `SKEPTIC_ADJUDICATOR_API_KEY`.
