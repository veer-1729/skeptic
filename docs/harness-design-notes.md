# Harness design notes — phase 1 schema proposal

Status: proposal, no code changed yet. Written per the `AGENTS.md` "contract"
rule: any change to `src/types.ts` (especially `meta`) gets proposed in writing
first, with `npm test` confirmed green before and after.

**Baseline:** `npm test` shows `4/4 fixtures passing | overall precision=1.00
recall=1.00 f1=1.00` against the current schema. That's the bar every change
below must preserve.

This doc covers four things:

1. What's wrong with `meta` as it stands.
2. A typed, namespaced replacement that scales to the rest of phase 1.
3. The bigger schema gap the `meta` question exposed: the harness has no concept
   of "added in the diff," yet half the phase-1 rules are defined that way.
4. Smaller matcher/runner/loader fixes phase 1 will want, ranked by urgency.

Everything here is designed to land **without touching `fixtures/`** and without
breaking the two existing detectors.

---

## 1. The problem with `meta` today

`DetectorInput.meta` is `Record<string, unknown>`. Detectors reach into it with
ad-hoc casts:

```ts
const domain = meta?.domain as string | undefined;                 // as-any-cast.ts
const known = new Set((meta?.knownPackages as string[]) ?? []);    // unresolved-import.ts
```

Three concrete failure modes as more categories come online (see
`docs/roadmap.md` phase 1):

- **No namespacing → key collisions.** `domain`, `knownPackages`,
  `overlapTable`, `secretPatterns`, `registry`, `addedLines`… all land in one
  flat bag. Two categories will eventually want a key with the same name and
  different meaning (e.g. dependency-creep's "existing dependencies" vs.
  phantom-dependency's "known packages" — related but not identical).
- **No type safety, no discoverability.** Nothing tells the author of the next
  detector what keys exist or what shape they have. Every detector re-invents
  the cast, and a typo (`meta?.knownPackage`) silently yields `undefined`, which
  reads as "nothing is known" — a false-positive generator.
- **Duplicated domain logic.** `as-any-cast.ts` hardcodes
  `new Set(["payments","auth","billing","permissions","migrations"])`. The
  roadmap's next type-anesthesia rules (`ts-ignore-unexplained`,
  `non-null-assertion-near-nullable`) and magic-fallback / error-fog all want the
  same sensitive-domain notion. `AGENTS.md` calls this a known phase-1 shortcut
  and says not to remove it *without replacing it* — this proposal replaces it.

---

## 2. Proposed `meta` shape: typed, namespaced `AnalysisMeta`

Replace `meta?: Record<string, unknown>` with an explicit interface whose fields
are all optional and each **owned by one concern**. A detector reads only its
namespace; a missing namespace means "no context for this," which each detector
already handles gracefully (empty known-set, undefined domain, etc.).

```ts
// src/types.ts (proposed)

/** Sensitive domains that bump severity (phase-1 domain-proximity shortcut;
 *  moves to the ranking engine in phase 2 per the architecture doc). */
export type Domain =
  | "payments" | "auth" | "billing" | "permissions" | "migrations" | "pii";

/** Package-resolution context: phantom-dependency + dependency-creep. */
export interface PackageContext {
  /** Names that resolve against the (mock, in fixtures) registry. */
  known?: string[];
  /** Dependencies already present in the repo before this diff —
   *  the comparison set for dependency-creep / overlap. */
  existing?: string[];
  /** Per-package registry trust metadata for low-trust-new-dependency. */
  registry?: Record<string, RegistryInfo>;
}

export interface RegistryInfo {
  resolves: boolean;
  publishedDaysAgo?: number;
  weeklyDownloads?: number;
  hasSourceRepo?: boolean;
}

/** Functional-overlap groups for dependency-creep's overlapping-dependency
 *  rule (start hardcoded: date libs, HTTP clients, …). Each inner array is a
 *  set of packages that do "the same job". */
export interface OverlapTable {
  groups: string[][];
}

/** Secret/credential signal config for magic-fallback. */
export interface SecretContext {
  /** Env-var name fragments that mark a value as a secret (JWT_SECRET, …). */
  nameHints?: string[];
}

/** Context shared by every file in one analysis unit, plus per-file overrides. */
export interface AnalysisMeta {
  domain?: Domain;
  packages?: PackageContext;
  dependencyOverlap?: OverlapTable;
  secrets?: SecretContext;
}
```

Why this shape and not, say, a discriminated union per category:

- **Additive.** A new category adds one optional namespace. It can't break an
  existing detector, and `npm test` stays green by construction (existing
  detectors don't read the new field).
- **Self-documenting.** The next detector author sees exactly what's available
  and its shape. No casts.
- **Maps cleanly onto fixtures.** `meta.json` becomes a literal of
  `AnalysisMeta`. The current `{ "domain": "payments" }` stays valid;
  `{ "knownPackages": [...] }` migrates to `{ "packages": { "known": [...] } }`
  — but see the migration note in §6, this is doable **without editing fixture
  files** by having the loader accept both shapes during phase 1.

The two existing detectors change one line each:

```ts
const domain = meta?.domain;                       // typed as Domain | undefined
const known = new Set(meta?.packages?.known ?? []);
```

The hardcoded sensitive-domain set moves to a shared module
(`src/context/domains.ts`, `isSensitiveDomain(domain)`), so the three upcoming
type-anesthesia/magic-fallback/error-fog rules share one definition instead of
copy-pasting the set. This is the "replace, don't just remove" the AGENTS note
asks for.

---

## 3. The bigger gap: the harness has no "diff"

This is the most important finding in this review, and it's larger than `meta`.

Skeptic's unit of analysis is **a diff** (`docs/skeptic-architecture.md` §3.1:
"Repo-wide scans are out of scope"). But `DetectorInput` only carries full-file
`content`. Many phase-1 rules in `docs/roadmap.md` are explicitly scoped to
*added* lines:

- dead-leftovers: `debug-console-log` ("added in the diff"),
  `commented-out-code` ("added in the diff"), `new-todo-in-diff` ("on changed
  lines").
- magic-fallback: env/secret/localhost fallbacks that *weren't there before*.
- phantom `manifest-unresolved-dependency`: a *new* manifest entry.

Right now a detector cannot tell an added line from a pre-existing one. Two ways
to resolve it:

**Option A (recommended for phase 1): "the whole input file is the added diff."**
Make the assumption explicit and lean into it. Fixtures are small synthetic
snippets of *new* code — that's already how `001-as-any-near-money` etc. are
written. Document that phase-1 detectors may treat the entire `content` as
added, and add an **optional** field for when a fixture needs to distinguish:

```ts
export interface DetectorInput {
  file: string;
  content: string;
  /** Added line ranges (1-based, inclusive). Absent ⇒ treat whole file as
   *  added (the phase-1 default). Lets a fixture later supply real diff
   *  context without a schema change. */
  addedRanges?: { start: number; end: number }[];
  meta?: AnalysisMeta;
}
```

This costs nothing today (no fixture has `addedRanges`, so behavior is
unchanged and the suite stays 4/4), and gives every "added in the diff" rule a
single helper — `isAdded(line, input)` — to gate on. It also means the
"whole-file-is-added" simplification is written down in the type, not folded
silently into each detector.

**Option B (defer): real diff fixtures.** A `diff.json`/unified-diff input with
added/removed/context lines. More faithful, but it's a fixture-format change,
which is a human-reviewed fixtures-session concern, not an implementation one.
Note it as the eventual phase-3-ish upgrade; don't build it now.

Recommendation: ship Option A's optional field now; it's forward-compatible with
Option B (a diff loader would just populate `addedRanges`).

---

## 4. Per-file vs. shared context (loader change)

`loadFixtures` copies the **same** `meta` object onto every `input.*` file in a
fixture. That's fine while fixtures are single-file. It breaks down for the
multi-file fixtures phase 1 already implies:

- dependency-creep / `manifest-unresolved-dependency` want a `package.json`
  *and* a source file in one fixture, where `packages.existing` is a
  repo-level fact but `domain` is per-file.
- A future fixture with a `payments/charge.ts` and a `ui/badge.tsx` wants a
  different `domain` per file.

Proposed loader behavior (no fixture edits required; purely additive):

- Top-level keys in `meta.json` remain **shared** across all inputs (today's
  behavior — unchanged).
- An optional `files` map applies per-file overrides, merged over the shared
  object:

```jsonc
{
  "packages": { "existing": ["axios"] },     // shared
  "files": {
    "input.ts":        { "domain": "payments" },
    "input.package.json": {}                  // manifest file, no domain
  }
}
```

Until a fixture uses `files`, every fixture behaves exactly as today.

A detector also frequently needs to know *what kind* of file it's looking at
(source vs. manifest vs. test) so manifest rules don't run on `.ts` and vice
versa. For phase 1 this is cheaply inferred from the filename
(`input.package.json`, `input.requirements.txt`, `input.test.ts`); no schema
field needed yet. Flag it here so detectors gate on filename deliberately rather
than each inventing its own check.

---

## 5. Matcher / runner fixes phase 1 will want

The matcher and runner are sound for two detectors. Two issues surface once
*every* detector runs against *every* fixture (which is how the runner already
works — `detectors.flatMap`):

1. **False positives/negatives are attributed by `fixture.category`, not by the
   finding's own category** (`runner.ts` uses `perCategory.get(fixture.category)`).
   Today only category-matching detectors fire, so it's invisible. But the whole
   point of negative fixtures is to catch a detector firing where it shouldn't —
   and when, say, a magic-fallback detector spuriously fires on a
   type-anesthesia fixture, that false positive is currently booked against
   *type-anesthesia*. Fix: attribute each FP to `finding.category` and each FN to
   `expected.category`. Per-fixture PASS/FAIL is unaffected; only the per-category
   precision/recall table gets more honest. **Recommended for phase 1** — it's
   the metric that tells you a new detector is leaking onto other categories'
   fixtures.

2. **Greedy match order.** `matchFindings` takes the first overlapping actual
   finding per expected. With multiple same-category findings on overlapping
   lines this can mis-pair (and over- or under-count severity-mismatch warnings).
   Low priority — no current fixture has overlapping same-category findings — but
   worth a note before the denser dead-leftovers / error-fog fixtures land. A
   stable fix is to prefer the most specific match (equal `ruleId`, then tightest
   line overlap) before falling back to "any rule in category."

Not broken, leave alone: line-overlap matching, severity-as-warning (both are
deliberate and good), the non-zero exit code as source of truth.

---

## 6. Migration plan (keeps the suite green, leaves fixtures untouched)

1. Add `Domain`, `PackageContext`, `OverlapTable`, `SecretContext`,
   `AnalysisMeta`, `RegistryInfo` to `src/types.ts`. Change
   `DetectorInput.meta` to `AnalysisMeta` and add optional `addedRanges`.
2. During phase 1, have `loadFixtures` accept **both** the legacy flat shape
   (`knownPackages`) and the new nested shape (`packages.known`), normalizing to
   `AnalysisMeta`. This is the one piece that lets the schema change land with
   **zero edits under `fixtures/`** — the existing `meta.json` files keep
   working. (When a future fixtures session rewrites those `meta.json` files to
   the nested shape, the legacy adapter can be dropped; that's a human-reviewed
   fixtures change, not an implementation one.)
3. Update the two detectors to read the typed namespaces; extract the
   sensitive-domain set into `src/context/domains.ts`.
4. Add `isAdded(line, input)` and `isSensitiveDomain(domain)` helpers under
   `src/context/`.
5. Run `npm test` — expect **4/4 still passing** (no behavioral change; the
   legacy meta adapter and whole-file-is-added default preserve current
   results). Confirm `git diff --stat fixtures/` is empty.

Order matters: 1→2 before 3 so the suite never goes red between steps.

---

## 7. Out of scope (deliberately not proposing now)

- **Cross-file detectors** (blast-radius, modular-mirage coupling analysis).
  They need a view of the whole changed-file set, not one file at a time. That's
  a phase-2/D runner change (run-once-per-diff in addition to run-per-file),
  noted for later, not built now.
- **Real unified-diff fixture format** (Option B in §3) — a fixtures-session
  decision.
- **Moving domain proximity into a ranking engine.** That's explicitly phase 2
  (`docs/roadmap.md`). This proposal keeps the phase-1 detection-time shortcut,
  it just de-duplicates it behind one helper.

---

## 8. Summary of recommended phase-1 changes

| Change | Why | Risk |
|---|---|---|
| Typed namespaced `AnalysisMeta` | kills flat-bag collisions + casts | low (additive) |
| Optional `addedRanges` + whole-file-is-added default | half of phase-1 rules need "added in diff" | none today |
| Per-file `files` overrides in loader | multi-file fixtures (manifest + source) | none today (additive) |
| Attribute FP/FN by finding category | honest per-category metrics when detectors overlap | low |
| Shared `isSensitiveDomain` helper | replaces duplicated set per AGENTS note | low |
| Legacy-meta adapter in loader | lands all of the above with no fixture edits | low, temporary |

Deferred: stricter greedy-match ordering, real diff fixtures, cross-file runner,
phase-2 ranking engine.
