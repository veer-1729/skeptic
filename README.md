# Skeptic — detector harness (phase 0)

This is the fixture-based harness described in the architecture doc. It exists
so that "does this detector work" is a yes/no question with a printed report,
not a judgment call from reading a diff.

## Running it

```
npm install
npm test
```

`npm test` runs every detector in `src/detectors/index.ts` against every
fixture in `fixtures/`, prints a per-fixture PASS/FAIL plus per-category and
overall precision/recall/F1, and exits non-zero if anything fails. That exit
code is what CI (and Cursor) should treat as the source of truth.

## Layout

```
src/
  types.ts              Finding schema + Detector interface — the contract
  detectors/
    index.ts            registry — add new detectors here
    <category>/
      <rule-id>.ts       one file per detector
  harness/
    fixtures.ts         loads fixtures from fixtures/
    match.ts            matches expected vs actual findings
    runner.ts           main script — npm test runs this

fixtures/
  <category>/
    <fixture-name>/
      input.<ext>        one or more files a detector sees
      expected.json      array of findings that SHOULD fire ([] if none)
      meta.json          optional — domain tags, mock registry data, etc.
```

## Adding a detector for a new rule

1. **Write the fixtures first.** Under `fixtures/<category>/`, create at
   least one positive fixture (slop that should be flagged) and one negative
   fixture (code that looks similar but is fine, and must NOT be flagged).
   `expected.json` is `[]` for negative fixtures.

   Treat fixtures as the spec. Get them right before writing any detector
   code — they're what "done" means for this rule.

2. **Run `npm test`.** The new fixtures will fail (MISSING — false negative).
   This is expected and is the same phase-0 signal: the harness correctly
   reports "not implemented yet."

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

- Severity/domain multipliers beyond the minimal per-detector tagging shown
  in `as-any-cast.ts` — these belong in the ranking engine (phase 2).
- Real package-registry lookups for phantom dependencies — fixtures use a
  mock `knownPackages` list in `meta.json`; production should hit npm/PyPI.
- Multi-file fixtures, repo-context fixtures (convention drift), and
  session-trace fixtures — these need their own fixture formats, introduced
  in phases 3 and 5.
