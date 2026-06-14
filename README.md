# Skeptic — AI slop detector

Skeptic detects AI-shaped risk in code diffs: type anesthesia, phantom
dependencies, dead leftovers, convention drift, and more (see
`docs/skeptic-taxonomy.md`). This repo ships three things:

- **Detector harness** — fixture-based tests that make "does this rule work" a
  yes/no question (`npm test`).
- **Ranking engine** — domain proximity, diff-size multipliers, dedup, and
  per-repo policy (`src/ranking/`).
- **Scan CLI** — run the full pipeline against a real git diff (`npm run scan`).

## Running it

```
npm install
npm test
```

`npm test` runs every detector in `src/detectors/index.ts` against every
fixture in `fixtures/`, ranks the findings, prints a per-fixture PASS/FAIL plus
per-category and overall precision/recall/F1, and exits non-zero if anything
fails. That exit code is what CI (and Cursor) should treat as the source of
truth for the harness.

## Scanning a repo

```
npm run scan -- https://github.com/org/repo
npm run scan -- . --base main
npm run scan -- . --commit HEAD~3..HEAD
```

The CLI clones (or uses a local checkout), parses the git diff, runs all
detectors plus the ranking engine, and prints a ranked report. Options:

- `--json` — emit JSON instead of a text report
- `--top <n>` — cap how many findings to print (default: 25)
- `--no-fail` — report findings but always exit 0 (disable the CI gate)

By default, `scan` exits **1** when it finds slop and **0** when the diff is
clean — suitable for GitHub Actions and other CI gates.

## Layout

```
src/
  types.ts              Finding schema + Detector interface — the contract
  detectors/
    index.ts            registry — add new detectors here
    <category>/
      <rule-id>.ts       one file per detector
  ranking/              domain proximity, diff-size, dedup, repo policy
  retrieval/            repo embedding index for convention drift
  cli/                  scan entrypoint (npm run scan)
  harness/
    fixtures.ts         loads fixtures from fixtures/
    match.ts            matches expected vs actual findings
    runner.ts           main script — npm test runs this

fixtures/
  <category>/
    <fixture-name>/
      input.<ext>        one or more files a detector sees
      expected.json      array of findings that SHOULD fire ([] if none)
      meta.json          optional — domain tags, mock registry data, repo corpus
```

## Adding a detector for a new rule

1. **Write the fixtures first.** Under `fixtures/<category>/`, create at
   least one positive fixture (slop that should be flagged) and one negative
   fixture (code that looks similar but is fine, and must NOT be flagged).
   `expected.json` is `[]` for negative fixtures.

   Treat fixtures as the spec. Get them right before writing any detector
   code — they're what "done" means for this rule.

2. **Run `npm test`.** The new fixtures will fail (MISSING — false negative).
   This is expected: the harness correctly reports "not implemented yet."

3. **Implement the detector** in `src/detectors/<category>/<rule-id>.ts`,
   following the pattern in `as-any-cast.ts` or `unresolved-import.ts`:
   read `DetectorInput` (file, content, optional meta), return `Finding[]`.

4. **Register it** in `src/detectors/index.ts`.

5. **Run `npm test` again** and iterate until the new fixtures pass and
   nothing else regresses (watch for new UNEXPECTED lines — those are false
   positives on fixtures that previously passed).

## The one rule that matters most

**Detectors don't get to edit fixtures.** If a fixture fails, the fix is
almost always in the detector, not in `expected.json` or `input.*`.

The one exception is a fixture that's genuinely wrong (e.g., line numbers
don't match the input file, or the expected category is mislabeled) — that's
a real bug, but it gets fixed as its own explicit change, reviewed on its own,
not silently folded into "make the tests pass." A diff that changes both a
detector and its fixtures in the same commit should get extra scrutiny.

This matters more here than in a typical project: Skeptic's flagship category
is "the agent weakened the test instead of fixing the code." Building Skeptic
by letting an agent quietly edit `expected.json` until the suite is green
would be that exact failure mode, applied to itself.

## Prompting Cursor / Opus for a new category

A reasonable per-category prompt:

> Implement detection for `<category>` such that all fixtures in
> `fixtures/<category>/` pass when running `npm test`, without modifying any
> file under `fixtures/`. Follow the existing detector pattern in
> `src/detectors/`. Register the new detector in `src/detectors/index.ts`.
> Run `npm test` after each change and report the final per-category
> precision/recall.

If it reports success, check `git diff --stat fixtures/` before anything
else. It should be empty.

## What's deliberately not here yet

See `docs/roadmap.md` for the full phase checklist. Highlights:

- **Adjudication step** (phase 4) — citation-constrained LLM judge for
  ambiguous categories (`comment-compliance`, `shallow-edge-handling`).
- **Session slop detector** (phase 5) — session-trace fixtures and the
  `test-edit-after-failure` / reward-hacking signal.
- **Live package-registry lookups** for phantom dependencies — fixtures use a
  mock `knownPackages` list in `meta.json`; production should hit npm/PyPI.
- **Remaining convention-drift signals** beyond logging (validation style,
  error shape, env access, test style, DB access).
