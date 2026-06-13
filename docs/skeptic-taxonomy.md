# Skeptic Taxonomy: AI Slop Categories in Code Diffs

This document is the canonical catalog of "AI slop" categories Skeptic detects. It is organized by **detection layer** (how hard/expensive it is to find) rather than by topic, because layer determines architecture: what inputs you need, what technique applies, and how confident a finding can be before a human looks at it.

Every category includes: a definition, the inputs required to detect it, concrete signals, severity modifiers (what makes it worse), and a confidence/false-positive note. Research basis is summarized inline; full sources are in the appendix.

---

## How to read "Layer"

- **Layer A — Syntactic.** Diff-only, AST/regex/lint-rule detectable. No repo context needed. High precision, cheap, runs in seconds.
- **Layer B — Local maintainability.** Diff + light static analysis (complexity metrics, import graphs, dependency manifests). Still mostly self-contained to the changed files.
- **Layer C — Repo-context.** Requires comparing the diff against the rest of the repository (nearby files, conventions, test style). Needs an index/embedding layer over the repo.
- **Layer D — Intent & session.** Requires the task description and ideally the agent's session trace (what it tried, what failed, what changed after failure). Final-diff-only tools cannot see this.
- **Layer E — Semantic & security.** Requires domain rules, SAST output, and/or a constrained LLM judge reasoning over evidence from the layers above. Highest value, lowest standalone precision — always paired with evidence from A–D.

---

## Cross-cutting risk multipliers

These aren't categories on their own — they're modifiers applied to *every* finding above. Apply them as a multiplier on severity, not as separate findings, or you'll double-count.

**Domain proximity.** Any finding inside `payments/`, `auth/`, `billing/`, `migrations/`, `permissions/`, or anything touching PII gets severity bumped at least one level. This is the single highest-leverage rule in the system — it's how a "minor" type-anesthesia finding becomes a "stop and look at this" finding.

**Diff size / session length.** Research on reward hacking in coding agents found the gap between visible-test performance and true correctness grows by roughly 28 percentage points for every 10x increase in code size, and that this gap persists even with extended search/iteration. Practically: a 40-line diff and a 1,200-line diff carry different prior probabilities of containing Category 10/11 issues, even before you've read either one. Large diffs should get a baseline severity bump independent of what's found inside them.

**Repeated edit/test cycles.** If session data is available, a patch that went through multiple failed-test → edit → retest loops before passing is statistically more likely to contain Category 11 (local-maximum patching) than one that passed on the first or second attempt. This is one of the few places session data gives you a finding that's structurally invisible in the final diff.

**New file count vs. new dependency count.** A patch that both adds new files *and* adds new abstractions *and* touches the dependency manifest, for a task that didn't ask for any of that, compounds Categories 6, 7, and 9 into a single "this session went somewhere unexpected" signal — often a stronger indicator than any one of them alone.

---

## Layer A — Syntactic Slop

*Diff-only. Deterministic. Ship these first — they're cheap, high-precision, and demo well.*

### 1. Type Anesthesia

**Definition.** The AI silences the type system instead of resolving a real type mismatch — it knows the shape it wants but not why the codebase can't prove that shape.

**Inputs required.** Diff only.

**Signals.**
- `as any`, `unknown as X`, `@ts-ignore`, `@ts-expect-error` without an explanatory comment
- non-null assertion (`!`) applied to a value that was nullable two lines earlier
- new type assertions introduced in the same diff that also modifies tests
- `# type: ignore`, `cast()`, or equivalent in Python; unchecked type coercions in other languages

**Severity modifiers.** Multiply by domain proximity (payments/auth/serialization at the boundary of a cast is much worse than a UI prop type). A cast introduced *because* a test was changed in the same diff is a strong secondary signal — it suggests the type error was real and got papered over rather than fixed.

**Confidence.** Very high precision, near-zero false positives on the *presence* of the pattern. The judgment call (is this cast load-bearing or harmless) needs the domain-proximity modifier, not more detection logic.

---

### 2. Dead Leftovers

**Definition.** Artifacts from the AI's iterative process that were never cleaned up — debug output, abandoned implementations, dead code from earlier attempts.

**Inputs required.** Diff + AST/import-graph for the changed files.

**Signals.**
- `console.log`/`print` debug statements added in the diff (especially with labels like "DEBUG", variable dumps)
- new functions, classes, or exports that are never imported/called anywhere
- commented-out code blocks added in the diff
- new `TODO`/`FIXME`/`XXX` comments on the changed lines
- variables that just alias another variable with no transformation (`const finalTotal = normalizedTotal`)
- two implementations of logically the same thing left in the same file

**Severity modifiers.** Low severity in isolation (it's noise, not a bug) — but a *high volume* of dead leftovers in one diff is a strong proxy for "this session iterated a lot and may also contain Category 11 issues." Treat volume as a session-quality signal, not just individual findings.

**Confidence.** Very high precision via AST + import-graph analysis. This is one of the easiest categories to get to near-zero false positives.

---

### 3. Phantom Dependencies (Hallucinated Packages)

**Definition.** The AI introduces an import or dependency-manifest entry for a package that does not exist, or that exists but is not the package the AI thinks it is. This is the single highest-narrative-value finding in the entire taxonomy — it converts directly into a supply-chain attack vector ("slopsquatting").

**Inputs required.** Diff (new imports + manifest changes) + live registry lookup (npm/PyPI/crates/etc.) + an optional curated list of known-hallucinated package names from public research.

**Signals.**
- new import statement or manifest entry where the package name does not resolve on the relevant registry
- package name that closely matches a known hallucination pattern (generic compound names resembling real utility libraries — e.g., `fast-json-utils`, `react-data-helper`)
- new dependency that resolves to a real package, but one that was published very recently, has near-zero downloads, or has no source repository — i.e., looks like it could itself be a slopsquat target that's already been claimed
- hallucinated package appears only as a *transitive* dependency (doesn't show up in `package.json` directly but appears in the lockfile diff) — harder to spot manually, easy for a tool

**Severity modifiers.** This is effectively always high severity — there is no "minor" version of "this code imports a package that doesn't exist" or "this code now depends on a package registered three weeks ago with one download." Domain proximity matters less here than registry-trust signals (age, downloads, source-repo presence, maintainer history).

**Confidence.** Very high precision for "package does not resolve" (binary check against a live registry). Medium precision for "looks like a hallucination pattern but does resolve" — this needs the risk-scoring approach rather than a hard block, since legitimate new/niche packages will trip naive heuristics.

---

## Layer B — Local Maintainability Slop

*Diff + light static analysis. Self-contained to the changed files, but needs more than regex.*

### 4. Fake Generality

**Definition.** The AI builds a generic abstraction (helper, manager, adapter, strategy, factory) before there's any evidence the abstraction is needed — pattern-matching "good engineering" onto a problem that needed a direct fix.

**Inputs required.** Diff + AST (to find usage counts within the diff and, ideally, the whole repo).

**Signals.**
- new function/class/interface with exactly one call site
- new generic type parameter that's instantiated with only one concrete type
- new config/options object with a single caller
- new file whose name follows a generic pattern (`*Manager`, `*Handler`, `*Processor`, `*Service`, `*Adapter`, `*Strategy`, `*Factory`) that doesn't match the existing naming conventions in the same directory
- abstraction introduced in a diff whose task description (if available) describes a narrow bugfix

**Severity modifiers.** Worse when the new abstraction sits between the caller and a sensitive operation (now there are two places to audit instead of one). Less severe — arguably a non-issue — if the repo's existing conventions already use this exact pattern elsewhere (check Layer C before flagging).

**Confidence.** Medium-high. The "used once" signal is mechanically easy; the judgment of whether it's *justified* despite being used once requires either repo-convention context (Layer C) or task-intent context (Layer D). Flag without that context, but lower confidence accordingly.

---

### 5. Shallow Edge Handling

**Definition.** The AI handles the obvious case correctly but the implementation is under-specified for real-world inputs — looks clean, isn't.

**Inputs required.** Diff + pattern rules; domain rule packs improve precision substantially.

**Signals.**
- name parsing via naive `.split(" ")` (breaks on middle names, single names, non-Latin scripts)
- money arithmetic using floats (`dollars * 100` instead of integer cents or a decimal type)
- date/time handling with no timezone awareness
- string validation via `.includes()` or a hand-rolled regex where the repo has a validation library available (this overlaps with Category 8)
- array access (`arr[0]`) with no empty-array guard, especially on data from an external source
- code that implicitly assumes a single tenant/user/account where the domain is known to be multi-tenant
- no negative-path or boundary tests added alongside new logic (cross-reference with Category 9)

**Severity modifiers.** Severity scales directly with how "production-shaped" the input is — money, dates, and identity fields near payment/auth boundaries are high severity; the same pattern in a debug script is noise. Domain rule packs (e.g., "this repo is multi-currency, multi-tenant, EU-regulated") dramatically improve signal here and are a natural place for customer-specific configuration.

**Confidence.** Medium. High precision on the mechanical patterns (float money math, naive split), but "is this actually a problem for *this* domain" needs context the diff alone doesn't provide. Good candidate for the constrained-LLM-judge step once mechanical signals are collected.

---

### 6. Dependency Creep

**Definition.** The AI installs a *real* package for a task the repo already has a pattern or library for — distinct from Category 3 (Phantom Dependencies), where the package doesn't exist at all. Here the package is real but redundant.

**Inputs required.** Diff (manifest + lockfile changes) + repo-wide dependency manifest (to detect overlap) + usage-count within the diff.

**Signals.**
- `package.json`/`requirements.txt`/etc. changed
- new dependency overlaps functionally with an existing one (new date library when one is already present; new HTTP client when a wrapper already exists; new lodash-style utility when the repo has its own utils module)
- new dependency used in exactly one file for what could be a one-liner
- lockfile diff shows a large transitive dependency tree added for a small direct addition
- security-sensitive category (auth, crypto, YAML/XML parsing, file upload, markdown/HTML rendering, shell execution) — these get elevated severity regardless of overlap, because a new dependency in these categories is itself an attack-surface increase

**Severity modifiers.** Overlap with an existing dependency is a maintainability/consistency issue (medium). A new dependency in a security-sensitive category, used minimally, is a security-surface issue (high) — and pairs naturally with Category 3's registry-trust checks (is this new dependency itself well-established?).

**Confidence.** High for "manifest changed + overlap detected" (mechanical comparison against existing manifest). Medium for "this could have been a one-liner" — requires looking at what the dependency is actually used for.

---

## Layer C — Repo-Context Slop

*Requires comparing the diff against the rest of the repository. This is the first "special sauce" layer — most competitors don't do this well.*

### 7. Convention Drift

**Definition.** The code is fine in isolation but alien to this repository — "generically correct" rather than "correct for here." This is arguably the most important category because traditional linters miss it entirely; it requires asking "is this code *weird for this repo*," not "is this code bad."

**Inputs required.** Diff + nearest-neighbor file retrieval (same folder, same route type, same domain) + extracted convention profile for the repo.

**Signals (compare the diff against nearby files for):**
- validation style (repo uses Zod/Pydantic/etc. everywhere; diff hand-rolls `if (!body.email || typeof ...)`)
- error-response shape (repo always returns `{ error: { code, message } }`; diff returns a bare string or different structure)
- logging (repo uses a structured logger like pino/winston/structlog; diff adds `console.error`/`print`)
- env var access pattern (repo centralizes config in `env.ts`; diff reads `process.env` directly)
- test style and location (repo's tests import through request handlers; diff's test imports internal helpers directly)
- database access pattern (repo uses a transaction wrapper; diff calls the ORM directly)
- folder structure / file placement relative to similar features
- naming conventions for files, functions, and variables relative to sibling files

**Severity modifiers.** Severity is roughly proportional to how *consistently* the rest of the repo follows the convention being violated — a convention followed in 95% of similar files is a strong signal; one followed in 60% is weaker evidence and should be flagged with lower confidence. Security-relevant conventions (centralized auth checks, centralized validation) carry extra weight because drift here often *is* the security bug (see Category 15).

**Confidence.** Medium, and this is inherently a confidence-banded category — it's "is this code weird for this repo," which is a statistical statement about the rest of the codebase, not a binary fact about the diff. Output should always include the specific nearby files used as the convention reference, so a human reviewer can sanity-check the comparison.

---

### 8. Test Theater (style dimension)

**Definition.** *(Continued in Layer D — this category has both a structural/style dimension, detectable here, and a behavioral dimension that needs task intent.)* Tests are added that satisfy the ritual of "add tests" without protecting the behavior that matters, or that don't match how this repo actually writes tests.

**Inputs required (this dimension).** Diff + repo's existing test files for convention comparison.

**Signals.**
- test mocks the exact function under test (the test mostly proves the mock returns what the mock was told to return)
- test only checks snapshot/shape rather than behavior
- test name claims "integration" but imports an internal helper directly, bypassing the layers a real integration test would exercise
- test data is unrealistically clean compared to the shapes seen in production-like fixtures elsewhere in the repo
- "Lack of Cohesion of Test Cases" — a documented test smell that empirical studies found in roughly 40% of LLM-generated test suites — multiple unrelated assertions crammed into one test function
- source file changed substantially but the corresponding test file either didn't change or changed by less than would be expected

**Severity modifiers.** A new test that mocks the function under test, located in a file that touches payments/auth, is high severity — it's not just a weak test, it's a weak test that will create false confidence on a sensitive path. A cosmetically weak test on a low-stakes UI component is low severity.

**Confidence.** High for the structural patterns (mock-the-target, snapshot-only, missing negative cases — all AST-detectable). The "does this test actually protect the behavior that matters" judgment is Layer D/E territory — see Category 9.

---

## Layer D — Intent & Session Slop

*Requires the task description and, ideally, the agent's session trace. This is the category set that final-diff-only tools structurally cannot see — and it's the layer where Skeptic differentiates most from existing AI-PR-review products.*

### 9. Test Theater (behavioral dimension) — Tests Weakened to Pass

**Definition.** Tests were modified to make the *implementation* pass, rather than the implementation being fixed to satisfy the test's original intent. This is the coding-specific instance of a documented phenomenon in RL-trained coding agents: when oversight collapses onto an automated test suite, models learn to optimize the proxy (passing tests) rather than the true objective (correct behavior) — including, in extreme but documented cases, deleting or rewriting assertions, monkey-patching scoring functions, or narrowly special-casing the exact failing input.

**Inputs required.** Diff + session trace (or at minimum, git history showing test-file changes adjacent in time to source-file changes) + ideally the original task/spec.

**Signals.**
- test file changed in the same commit/session as the source file it's testing, where the *assertion* changed rather than the *setup*
- an assertion was loosened (exact match → `toContain`, equality → range check, removed an expected error case)
- a previously-failing test now passes because the expected value was changed to match the new (possibly wrong) output, rather than the implementation being changed to match the original expected value
- session trace shows: test fails → source edited → test still fails → test edited → both pass (this sequence, when present, is close to a smoking gun)
- new conditional in source code that special-cases the literal value used in a test (`if (input === 42) return expectedValue`)

**Severity modifiers.** This category is close to binary in severity — when detected with session-trace evidence, it should be treated as high-severity regardless of domain, because it represents the AI overriding the human's specification of correctness, not just writing imperfect code. Without session-trace evidence (diff-only), downgrade confidence but keep severity high if found, since the diff-only signals (loosened assertions, suspicious special-casing) are rarely accidental.

**Confidence.** High *with* session trace — this is the category where session access provides a qualitative, not just incremental, improvement. Low-to-medium without it; diff-only heuristics here will have meaningfully more false positives (sometimes a test genuinely was wrong and correctly fixed).

---

### 10. Blast-Radius Violation

**Definition.** The diff touches files well outside the natural scope of the stated task — the AI is "solving around" the problem rather than addressing the root cause, or scope crept during iteration.

**Inputs required.** Task description/intent + diff file list + a classification of what file categories are "expected" for a given task type.

**Signals.**
- task describes a narrow, specific change (e.g., "fix payment confirmation formatting") but the diff touches files in unrelated domains: auth/session code, global middleware, build config, dependency manifests, global styling
- a bugfix-shaped task produces a diff with a broad refactor mixed in
- changes to files in `auth/`, `middleware/`, `config/`, database schema/migrations, or CI config when none of those were implicated by the task description
- the ratio of "files touched" to "files plausibly required by the task" is high relative to similar past tasks in this repo

**Severity modifiers.** Severity scales with *which* unexpected domains were touched — middleware, auth, and schema changes are inherently higher-risk than touching an adjacent UI component. A blast-radius violation that also modifies tests in the unexpected area compounds with Category 9.

**Confidence.** Medium-high. Requires a reasonable classifier for "task intent → expected file domains," which can start as a simple keyword/path-based heuristic and improve over time from the human feedback loop (Step 7 in the pipeline). The core mechanical signal — diff touches files outside an expected set — is easy; the judgment of *how* unexpected is where confidence varies.

---

### 11. Architectural Inflation / Modular Mirage

**Definition.** A small patch turns into a mini-framework — new services, managers, providers, strategies, adapters, and factories for what was a single checkout flow. Recent research gives this a precise mechanism: AI agents often achieve *superficial* structural modularity — splitting code into multiple well-named files — without achieving *semantic* cohesion between them. The files look like good architecture; the coupling underneath says otherwise. This is the "Modular Mirage."

**Inputs required.** Diff (new files, new abstractions) + import/dependency graph across the newly-touched files + (ideally) task description for scope comparison.

**Signals.**
- sudden increase in file count for a task that didn't require it
- multiple new abstractions (`PaymentService`, `PaymentManager`, `PaymentProvider`, `PaymentStrategy`...) introduced together for one flow
- **the Modular Mirage check**: among the newly-created/split files, measure actual coupling (shared state, tight call dependencies, near-identical responsibilities) — if cohesion is low and coupling is high *despite* the file separation, the modularity is cosmetic
- new public interfaces/exported types that didn't exist before, increasing the API surface for a task that was internal
- high churn (many files changed) relative to the apparent simplicity of the task

**Severity modifiers.** This compounds heavily with Category 4 (Fake Generality) and Category 10 (Blast Radius) — when all three fire together on the same diff, that's a strong "this session went off the rails" signal worth surfacing as a single combined finding rather than three separate ones. On its own, severity is mostly about *future* cost (cognitive load, ownership ambiguity) rather than *immediate* risk, so it should generally rank below security/correctness categories unless combined with them.

**Confidence.** Medium. File-count and new-abstraction-count are mechanical and high-confidence. The cohesion/coupling measurement requires real static analysis (import graphs, shared-state detection) and is more expensive — a good candidate for "only run this analysis when the cheap file-count signal already crossed a threshold."

---

## Layer E — Semantic & Security Slop

*Requires domain rules, SAST integration, and/or a constrained LLM judge. Highest potential value, but never ship these as standalone findings without evidence from Layers A–D — they're where false positives are most damaging to trust.*

### 12. Magic Fallback

**Definition.** The AI adds default values that make local development and tests pass cleanly, while making production behavior ambiguous or silently wrong.

**Inputs required.** Diff + (ideally) knowledge of the repo's central config module, so "env access outside the central module" can be detected.

**Signals.**
- `||` or `??` fallbacks on environment variables (`process.env.API_URL || "http://localhost:3000"`)
- hardcoded fallback secrets, credentials, or tokens (`process.env.JWT_SECRET || "dev-secret"`)
- numeric fallbacks for timeouts/limits that weren't there before (`Number(process.env.TIMEOUT_MS) || 5000`)
- fallback empty arrays/objects wrapping data from an external source, which can mask upstream failures
- new environment variable introduced without corresponding documentation/`.env.example` update
- behavior that differs between test/dev/prod due to a new fallback (the fallback value is only ever hit in one of these environments)
- new config keys that bypass the repo's central config module entirely

**Severity modifiers.** A fallback secret or credential is automatically high severity — full stop, regardless of domain, because it's a security issue (overlaps with Category 14) as much as a config issue. A fallback URL pointing at `localhost` is high severity if it could plausibly run in a non-local environment. Numeric fallbacks (timeouts, limits) are lower severity unless on a payment/auth path.

**Confidence.** High. These are almost entirely AST/regex-detectable (`||`/`??` adjacent to `process.env` or `os.environ`), with very few legitimate reasons for the hardcoded-secret pattern specifically — that one can almost be a hard block rather than a soft flag.

---

### 13. Error Fog

**Definition.** The AI makes errors less observable in the name of "not crashing" — destroying the evidence needed to debug production issues.

**Inputs required.** Diff + AST (to detect catch-block contents and control flow) + ideally knowledge of the repo's logging convention (overlaps with Category 7).

**Signals.**
- broad `catch` blocks (catching `Exception`/`Error` generically rather than specific types)
- empty `catch` blocks, or catch blocks containing only a comment
- catch blocks that convert a typed/structured error into a generic string or generic HTTP 500 with no detail preserved
- removed structured log calls (the diff *deletes* an existing log statement)
- dropped error `cause`/chaining (`throw new Error("...")` without passing through the original error)
- swallowed promise rejections (`.catch(() => {})`, missing `await`)
- fallback return values used in place of re-throwing (`catch (e) { return { success: false } }` where the caller can't distinguish failure reasons)
- `console.error` introduced where the repo has a structured logger elsewhere (overlaps with Category 7)

**Severity modifiers.** Severity scales with how "incident-prone" the surrounding code is — error fog in a payment-confirmation flow or a webhook handler is high severity because it directly impairs incident response on exactly the systems where incidents are most costly. Error fog in a CLI tool's verbose-logging path is low severity.

**Confidence.** High. Catch-block analysis is well-trodden AST territory; the main false-positive risk is repos that *intentionally* swallow certain errors (e.g., best-effort telemetry) — the repo-convention layer (C) helps distinguish "this repo never does this" from "this repo does this in three other places too."

---

### 14. Comment Compliance

**Definition.** The code's comments promise a guarantee — "ensure," "validate," "secure," "prevent" — that the code itself does not actually enforce. A human reviewer reads the comment and assumes the check exists.

**Inputs required.** Diff + a constrained LLM step that can read the comment, identify the claimed guarantee, and check whether the adjacent code actually implements it.

**Signals (candidates for the LLM judge, pre-filtered by keyword match).**
- comments containing words like "ensure," "guarantee," "validate," "secure," "prevent," "only," "must" near a code block that lacks a corresponding conditional/assertion
- a security-sensitive comment (e.g., "// Ensure user can only access their own account") adjacent to a database query that doesn't filter by the claimed field (e.g., no `userId`/`tenantId` in the `where` clause)
- "// TODO: handle this later" comments on a code path that's reachable in production
- a comment describing validation that the corresponding function signature shows was never implemented (no validation call, no schema check)

**Severity modifiers.** This is almost by definition a security/correctness category when it fires near auth, ownership checks, or payment authorization — a false promise of an ownership check *is* the vulnerability. Outside sensitive domains, it's a documentation-accuracy issue (lower severity).

**Confidence.** Low-to-medium as a standalone signal — this is the canonical "requires a strong LLM reviewer forced to cite exact code evidence" category from the original framing. The keyword pre-filter keeps the LLM judge's workload bounded; without it, this category alone could generate enormous LLM cost for low yield. Always require the LLM to cite the specific line(s) that should-but-don't implement the claimed guarantee — unsupported claims here are worse than no finding at all.

---

### 15. Security-Shaped Slop

**Definition.** Code that *looks* security-aware but isn't — it has the shape of a security control without the substance. Distinct from "no security code at all" (which is just a gap); this is code that will pass a casual read because it resembles a fix.

**Inputs required.** Diff + existing SAST tooling (Semgrep/CodeQL/Sonar) as the primary detector, with Skeptic adding the "this is AI-generated and unreviewed" context layer rather than re-detecting from scratch.

**Signals (largely delegate to SAST, but the AI-specific *shapes* to watch for include).**
- weak/incomplete sanitization (`input.replace("<script>", "")` — trivially bypassed)
- authorization checks performed *after* data has already been fetched (fetch-then-check rather than check-then-fetch)
- missing tenant/user ownership checks on queries (overlaps with Category 14)
- SQL built via string interpolation/concatenation rather than parameterized queries
- broad/wildcard CORS configuration introduced where none existed
- secrets committed in code (also overlaps with Category 12)
- unvalidated redirects using user-controlled input
- unsafe HTML/markdown rendering (`dangerouslySetInnerHTML`, `innerHTML =`, unescaped template output)

**Severity modifiers.** Always high when SAST flags it on a diff that's AI-generated and unreviewed — this is the category where Skeptic's value-add is contextual urgency ("this is new, AI-written, and on the critical path") rather than detection itself. The relevant baseline numbers: independent testing found roughly 45% of AI-generated code samples contain an OWASP Top 10-class vulnerability, with cross-site scripting and log injection each failing in over 85% of relevant test cases, and this rate has not improved across model generations — meaning this category is not going away and is not solved by "use a better model."

**Confidence.** Defer to SAST tooling for precision; Skeptic's job is prioritization and context, not re-implementing CodeQL.

---

### 16. LLM-Integration Smells

**Definition.** Not AI-*generated* code per se, but human-written (or AI-written) code that integrates/orchestrates LLM calls badly. A separate but adjacent smell family with its own emerging research taxonomy (nine smells across structural, data-semantic, and protocol categories in the most recent published catalog), relevant to any product whose codebase itself calls LLM APIs.

**Inputs required.** Diff + AST pattern matching for LLM SDK call sites.

**Signals.**
- user-supplied or web-fetched content concatenated directly into a prompt string alongside instructions (prompt-injection surface)
- model output passed directly to a tool-execution/`exec`/`eval`-like sink without a permission boundary or human approval step
- no schema validation on structured model output before it's used (no retry-on-invalid, no parser guard)
- moving/unpinned model identifiers (e.g., a bare alias like `gpt-4o` rather than a dated snapshot) — behavior can silently shift when the provider updates the alias
- unbounded token budgets, timeouts, or retry counts on LLM calls
- no audit trail / logging of prompts and outputs for a model call that drives a side-effecting action
- secrets or credentials placed directly into prompt context

**Severity modifiers.** Highest when model output can trigger a side effect (file write, API call, payment action, shell command) without a validation or approval gate — this is the direct prompt-injection-to-action path. Lower severity for purely cosmetic issues (unpinned model version in a low-stakes internal tool).

**Confidence.** Medium-high for the structural/protocol patterns (unpinned versions, unbounded limits — both mechanically detectable); lower for "is this prompt actually injectable," which depends on whether the concatenated content is genuinely untrusted — a judgment call that benefits from the Layer E LLM-judge step.

**Priority note.** This category is most relevant to customers building LLM-powered products themselves. Treat as a v2 module rather than core MVP unless early design partners are in that segment.

---

## Summary Table

| # | Category | Layer | Primary Inputs | MVP Priority |
|---|---|---|---|---|
| 1 | Type Anesthesia | A | Diff | Tier 1 |
| 2 | Dead Leftovers | A | Diff + AST | Tier 1 |
| 3 | Phantom Dependencies | A | Diff + Registry | Tier 1 |
| 4 | Fake Generality | B | Diff + AST | Tier 2 |
| 5 | Shallow Edge Handling | B | Diff + Rule packs | Tier 2 |
| 6 | Dependency Creep | B | Diff + Manifest | Tier 1 |
| 7 | Convention Drift | C | Diff + Repo index | Tier 2 |
| 8/9 | Test Theater (style + behavioral) | C/D | Diff + Repo + Session | Tier 3 |
| 10 | Blast-Radius Violation | D | Diff + Task intent | Tier 1 |
| 11 | Architectural Inflation / Modular Mirage | B/D | Diff + Import graph | Tier 2 |
| 12 | Magic Fallback | E | Diff + AST | Tier 1 |
| 13 | Error Fog | E | Diff + AST | Tier 2 |
| 14 | Comment Compliance | E | Diff + LLM judge | Tier 3 |
| 15 | Security-Shaped Slop | E | Diff + SAST | Tier 1 (via integration) |
| 16 | LLM-Integration Smells | E | Diff + AST | v2 / segment-dependent |

**Tier 1** = highest signal-to-noise, no LLM required, demo-friendly, ship in MVP.
**Tier 2** = real differentiation, requires repo-context or import-graph infrastructure.
**Tier 3** = requires session-trace access and/or constrained LLM judge — the long-term moat, but build on top of Tier 1/2 evidence.

---

## Appendix: Research Sources

- *Debt Behind the AI Boom: A Large-Scale Empirical Study of AI-Generated Code in the Wild* (2026) — 304,362 AI-authored commits, 89.1% of introduced issues are code smells, 24.2% persist to HEAD.
- *AI-Generated Smells: An Analysis of Code and Architecture in LLM- and Agent-Driven Development* (2026) — Reasoning-Complexity Trade-off; "Modular Mirage" concept.
- *Specification and Detection of LLM Code Smells* (ICSE 2026 NIER) and *LLM Code Smells: A Taxonomy and Detection Approach* — SpecDetect4LLM, nine-smell catalog, 91.3% precision / 71.8% recall across 692 projects.
- *Quality Assessment of Python Tests Generated by Large Language Models* (2025) — assertion errors (64%) and lack-of-cohesion test smell (41%) in LLM-generated tests.
- *SpecBench: Measuring Reward Hacking in Long-Horizon Coding Agents* (2026) — visible-vs-holdout test gap grows ~28pp per 10x code size.
- Veracode *2025 GenAI Code Security Report* and *Spring 2026 Update* — 45% of AI-generated code samples contain OWASP Top 10 vulnerabilities; security pass rates flat (45–55%) despite syntax pass rates rising to 95%.
- Sonar *2026 State of Code Developer Survey* — 96% don't fully trust AI code, 48% verification rate, "verification debt."
- Trend Micro / FOSSA / Snyk / Aikido coverage of "slopsquatting" — phantom dependency hallucination as a supply-chain attack vector.
