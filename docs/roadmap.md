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
- [ ] `manifest-unresolved-dependency` — package.json/requirements.txt entry
      that doesn't resolve against the known-package set
- [ ] `low-trust-new-dependency` — resolves, but flagged via metadata as
      new/low-downloads/no-source-repo (fixtures can mock this via meta.json
      the same way `knownPackages` works today)

### dead-leftovers
- [ ] `debug-console-log` — `console.log`/`print`-style debug statement
      added in the diff
- [ ] `unused-export` — new export with zero references within the file
      (repo-wide reference checking is a phase-3 concern; file-local is fine
      for phase 1)
- [ ] `commented-out-code` — a block of commented-out code added in the diff
- [ ] `new-todo-in-diff` — new `TODO`/`FIXME`/`XXX` comment on changed lines

### dependency-creep
- [x] `overlapping-dependency` — new manifest entry overlaps functionally
      with an existing dependency (start with a small hardcoded overlap
      table: date libs, HTTP clients, etc. — see taxonomy doc category 6)
- [x] `single-use-new-dependency` — new dependency imported in exactly one
      file for what could plausibly be a one-liner

### magic-fallback
- [ ] `env-fallback` — `process.env.X || default` / `?? default` pattern
- [ ] `hardcoded-secret-fallback` — fallback value for a secret/credential
      that looks like a literal (not read from config)
- [ ] `localhost-fallback-url` — fallback URL pointing at `localhost` /
      `127.0.0.1`

### error-fog
- [ ] `empty-catch` — catch block with no body or comment-only body
- [ ] `broad-catch-generic-500` — catch block converts to a generic
      string/500 response and drops the original error/cause
- [ ] `swallowed-promise-rejection` — `.catch(() => {})` or a clearly
      unawaited promise on a call that can reject

## Phase 2 — Slop ranking engine

- [ ] domain-proximity multiplier — config-driven map of path
      patterns → domain (payments, auth, etc.), replacing the per-detector
      `sensitiveDomains` shortcut from phase 1
- [ ] diff-size / session-length multiplier
- [ ] dedup/correlation of findings that co-occur on the same file/lines
- [ ] per-repo severity weight overrides (groundwork for the feedback loop)

## Phase 3 — Convention drift detector

- [ ] repo embedding index (build + incremental update)
- [ ] convention profile extraction (validation style, error shape, logging,
      env access, test style, DB access pattern)
- [ ] `convention-drift` findings with comparison-set evidence attached
- [ ] fixture format for repo-context fixtures (needs a small reference repo,
      not just single files)

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
