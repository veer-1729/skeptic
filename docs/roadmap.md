# Skeptic build roadmap

Phases follow `docs/skeptic-architecture.md` section 4. Each item is one
rule the harness should eventually detect, tagged with its taxonomy
category (see `docs/skeptic-taxonomy.md`). Check off the fixtures box and
the detector box separately — a category isn't "done" until both are
checked and `npm test` is fully green.

Legend: `[ ]` not started · `[f]` fixtures written & committed · `[x]` done

## Phase 1 — Mechanical detector (Tier A/B, diff-only, no repo index)

### harness
- [ ] remove the legacy flat-meta adapter in `src/harness/fixtures.ts` once the
      `meta.json` fixtures migrate to the nested `AnalysisMeta` shape (the
      adapter is a deliberate temporary so the schema change landed without
      touching fixtures — see `docs/harness-design-notes.md`)

### type-anesthesia
- [x] `as-any-cast` — `expr as any`
- [x] `ts-ignore-unexplained` — `@ts-ignore` / `@ts-expect-error` with no
      explanatory comment on the same or preceding line
- [x] `non-null-assertion-near-nullable` — `!` applied to a value that was
      typed/declared as nullable a few lines earlier in the same function

### phantom-dependency
- [x] `unresolved-import` — import of a package not in the known-package set
- [x] `manifest-unresolved-dependency` — package.json/requirements.txt entry
      that doesn't resolve against the known-package set
- [x] `low-trust-new-dependency` — resolves, but flagged via metadata as
      new/low-downloads/no-source-repo (`RegistryInfo` in `src/types.ts` now
      carries `publishedDaysAgo`, `weeklyDownloads`, and `hasSourceRepo` —
      the speculative trim from the harness schema change is closed)

### dead-leftovers
- [x] `debug-console-log` — `console.log`/`print`-style debug statement
      added in the diff
- [ ] `unused-export` — deferred to phase 3 (needs repo-wide reference data).
      Unlike the other three rules in this category, the file-local "zero
      references" approximation is *unsound* for exported symbols: `export`
      means "for cross-file use," so being unreferenced within its own file is
      the normal case, not a leftover signal — a file-local detector fires on
      essentially every export. Resolving it requires knowing whether any other
      file imports the symbol, which doesn't exist until the repo-context
      infrastructure lands. (The other three rules — `debug-console-log`,
      `commented-out-code`, `new-todo-in-diff` — are genuinely diff-local
      signals, so file-local detection is correct for them.)
- [x] `commented-out-code` — a block of commented-out code added in the diff
- [x] `new-todo-in-diff` — new `TODO`/`FIXME`/`XXX` comment on changed lines

### dependency-creep
- [x] `overlapping-dependency` — new manifest entry overlaps functionally
      with an existing dependency (start with a small hardcoded overlap
      table: date libs, HTTP clients, etc. — see taxonomy doc category 6)
- [x] `single-use-new-dependency` — new dependency imported in exactly one
      file for what could plausibly be a one-liner

### magic-fallback
- [x] `env-fallback` — `process.env.X || default` / `?? default` pattern
- [x] `hardcoded-secret-fallback` — fallback value for a secret/credential
      that looks like a literal (not read from config)
- [x] `localhost-fallback-url` — fallback URL pointing at `localhost` /
      `127.0.0.1`
- Known gaps (phase 1): Python `os.environ`, destructuring defaults
  (`const { PORT = 3000 } = process.env`). Central-config-module bypass
  (env access outside the repo's config module) is convention-drift territory.

### error-fog
- [x] `empty-catch` — catch block with no body or comment-only body
- [x] `broad-catch-generic-500` — catch block converts to a generic
      string/500 response and drops the original error/cause
- [x] `swallowed-promise-rejection` — `.catch(() => {})` or a clearly
      unawaited promise on a call that can reject

## Phase 2 — Slop ranking engine

- [x] domain-proximity multiplier — config-driven map of path
      patterns → domain (payments, auth, etc.), replacing the per-detector
      `sensitiveDomains` shortcut from phase 1
- [x] diff-size / session-length multiplier (diff-size band implemented;
      session-length lands with Phase 5)
- [x] dedup/correlation of findings that co-occur on the same file/lines
      (per-file overlapping line ranges collapse to one survivor; absorbed
      rule IDs recorded on `correlatedWith` — `src/ranking/dedup.ts`)
- [x] per-repo severity weight overrides (groundwork for the feedback loop):
      `repoPolicy` on UnitContext supports rule suppression + per-rule
      base-severity override, applied before domain proximity —
      `src/ranking/policy.ts`

## Phase 3 — Convention drift detector

Logging slice landed end-to-end (real retrieval index, one convention shipped).

- [x] repo embedding index (build) — deterministic `LocalLexicalEmbedder`
      (feature-hashed TF) behind an `Embedder` seam + cosine `nearestNeighbors`
      with same-folder/extension boost and stable tiebreak
      (`src/retrieval/embedder.ts`, `src/retrieval/repo-index.ts`). Incremental
      update / caching deferred (build-per-unit is fine for the harness).
- [x] convention profile extraction — **logging** convention implemented
      (`fileLoggingStyle` + `loggingProfile` with adherence thresholds,
      `src/context/conventions/logging.ts`). Other signals (validation style,
      error shape, env access, test style, DB access pattern) remain.
- [x] `convention-drift` findings with comparison-set evidence attached —
      `logging-convention-drift` detector emits `Finding.comparisonSet`
      (`src/detectors/convention-drift/logging-convention-drift.ts`); ranking
      layers domain proximity on top unchanged
- [x] fixture format for repo-context fixtures — `repo/` corpus + `changed`
      manifest in `meta.json`, split into changed inputs vs. context-only
      corpus; flat fixtures unchanged. 6 logging fixtures (2 positive incl. a
      domain-proximity composition test, 4 negative controls)
- [ ] remaining convention signals (error shape, env access, validation, DB
      access, naming/placement) + a model-based embedder via the existing seam

## Phase 4 — Adjudication step

- [ ] citation-constrained verdict schema (every output requires a valid
      file/line reference or is rejected)
- [ ] `shallow-edge-handling` (ambiguous cases needing reasoning)
- [ ] `comment-compliance`
- [ ] rubric-based eval set for adjudicator quality (separate from the
      mechanical fixture suite)

## Phase 5 — Session slop detector

- [ ] session trace schema + fixture format
- [ ] `test-edit-after-failure` detector (the core reward-hacking signal)
- [ ] scope-drift-over-time detector (feeds blast-radius + the phase-2
      diff-size/session-length multiplier)
- [ ] Slop Score aggregation across a session
