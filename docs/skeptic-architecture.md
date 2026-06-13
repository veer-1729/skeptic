# Skeptic: Architecture Overview

## 1. What Skeptic is

Skeptic is an AI slop detector. Point it at a diff — and, where available, the repo and the agent's session trace — and it tells you what's slop, which of the 16 taxonomy categories each instance belongs to, why it matters, and how confident it is. The taxonomy *is* the product. This document is "how do we detect each layer of it well."

Three things separate Skeptic from running a linter with an AI-flavored rule pack:

1. **It detects categories nothing else looks for.** Convention drift ("is this weird for *this* repo") and session-level reward-hacking patterns ("did the agent weaken the test instead of fixing the bug") are both real categories in the taxonomy that diff-only, repo-agnostic tools structurally cannot see.
2. **Every finding is tagged to a taxonomy category and comes with evidence** — file/line, the rule or pattern that fired, and (for convention findings) the comparison set of nearby files used to decide "weird for this repo."
3. **Domain proximity and diff-size/session-length act as severity multipliers.** The same `as any` cast is noise in a UI prop and a headline finding three lines from a Stripe charge call — Skeptic's scoring reflects that, not just the raw pattern match.

Where existing SAST/lint tools already do something well — Category 15, security-shaped slop, where CodeQL/Semgrep/Sonar are mature — Skeptic doesn't reinvent it. It ingests their output as one more tagged, contextualized slop finding alongside everything else it detects directly. That's an implementation detail, not the pitch.

---

## 2. Design principles (each tied to a research finding)

**Principle 1 — Most commits aren't slop; find the ones that are.** The large-scale commit study found that while AI-introduced issues exist in 61% of repositories, only 8.7% of *commits* contain them. Skeptic should be cheap to run on the ~91% of commits that are clean and spend its expensive analysis (convention mining, the adjudication step) only on the minority that trip earlier signals.

**Principle 2 — Diff size and session length are priors, not just context.** Reward-hacking research on coding agents found the gap between "passes the tests it was given" and "actually correct" grows roughly 28 percentage points for every 10x increase in code size. A 1,200-line AI diff should enter Skeptic's scoring with a higher baseline slop-likelihood than a 40-line diff, *before* any specific pattern is even matched. Implemented as a multiplier, not a separate finding.

**Principle 3 — Domain proximity is the highest-leverage severity modifier in the system.** A type-anesthesia cast in a UI prop type is noise; the same cast three lines from a payment-charge call is the headline finding. Every category's severity gets multiplied by a domain-proximity score (payments/auth/migrations/PII = high), computed once per file and reused across all findings in that file.

**Principle 4 — Don't re-detect what SAST already detects well.** ~45% of AI-generated code samples contain OWASP Top 10-class vulnerabilities, and this rate is flat across model generations — it's not going away, but it's also a well-solved *detection* problem. For Category 15, Skeptic's value-add is tagging a SAST finding as "new, AI-authored, unreviewed, and on the critical path" — not re-implementing CodeQL.

**Principle 5 — Session-trace evidence is categorically different, not incrementally better.** Wherever a finding has both a diff-only heuristic and a session-trace-confirmable version (most clearly the test-weakening pattern in Category 9), Skeptic represents these as separate confidence tiers of the *same* finding — diff-only is "this looks suspicious," session-confirmed is "this happened." Never blur the two.

**Principle 6 — Skeptic only ever judges evidence, never raw "review this code."** Given that 96% of developers don't trust AI-generated code, an LLM step that free-form comments on a diff inherits the exact trust problem it's meant to solve. Skeptic's adjudication step runs on a simple rule: don't believe a claim — whether it's a code comment, a test, or a green CI run — until the evidence in front of you supports it. Its input is always a structured finding (file/line, pattern that fired, repo-convention context, session-trace excerpt); its output is always a citation-constrained verdict. This is what makes the output auditable rather than "another AI opinion" — which is the whole point of a tool called Skeptic.

**Principle 7 — Convention-drift findings are confidence-banded, with the evidence shown.** "Is this weird for this repo" is a statistical claim about the rest of the codebase, not a binary fact about the diff. Every convention-drift finding ships with the specific nearby files used as the comparison set, so a human can sanity-check it in seconds.

**Principle 8 — The feedback loop is per-repo, not global.** Research on real review processes found teams fix some smells and deliberately ignore others depending on context — there's no universal severity ranking. Each repo/team's "useful / false positive / not worth fixing / fixed" labels retune *that repo's* weights and suppression rules. A finding category that's noise for one team can be the headline finding for another.

---

## 3. Component breakdown

### 3.1 Inputs

Four input types, three optional — Skeptic degrades gracefully as inputs are added:

- **Diff** (required). The unit of analysis is `git diff main...HEAD` or an equivalent PR/commit diff. Repo-wide scans are out of scope — that's "where's our existing debt," a different question from "did this new patch introduce slop."
- **Repo context** (strongly recommended, indexed once per repo and incrementally updated). Powers the convention drift detector.
- **Session trace** (optional, highest marginal value). From Claude Code / Cursor / Copilot-style logs: task description, tool-call sequence, file reads/edits in order, test runs and results over time. Without this, the session-behavior findings fall back to diff-only heuristics with explicitly lower confidence.
- **External tool output** (optional). Lint/SAST results, ingested as additional tagged findings for Category 15.

### 3.2 Mechanical Slop Detector (Tiers A–B)

AST + regex + manifest-diff rules. This is the fast, no-repo-index detector covering type anesthesia, dead leftovers, phantom dependencies, dependency creep, magic fallback, error fog, and the mechanical signals of architectural inflation (new-file-count, new-abstraction-count).

- Runs in seconds.
- Near-zero false positives on *presence* of a pattern — the judgment of whether a given instance is severe comes from Principle 3's domain-proximity multiplier downstream, not from this detector second-guessing itself.
- The phantom-dependency check (live registry lookup + hallucination-pattern matching) is the standout standalone feature — it's the easiest "holy shit, look at that" moment in the product and the natural anchor for a free CLI / GitHub Action.

### 3.3 Convention Drift Detector (Tier C)

Built from a one-time (then incrementally updated) embedding index over the repo, chunked by folder/domain/file-type. For each changed file, retrieves nearest-neighbor files (same folder, same route type, same domain) and extracts a convention profile: validation style, error-response shape, logging pattern, env-access pattern, test style and location, DB-access pattern, naming conventions.

Detects convention drift directly, plus the style dimension of test theater (does this test look like how this repo writes tests). Per Principle 7, every finding ships with its comparison set — both a trust mechanism and a debugging tool for repos mid-migration between two conventions.

### 3.4 Session Slop Detector (Tier D)

The detector with no real commercial analog today. Parses the session trace into a structured timeline (task spec → file reads/edits → test runs/results → retries) and looks for reward-hacking patterns:

- **Test-edit-after-failure sequences** — the core "did the agent weaken the test instead of fixing the code" detector. The highest-confidence, highest-severity output of this detector when it fires.
- **Edit-loop count and scope drift over time** — feeds the blast-radius finding and the diff-size/session-length multiplier from Principle 2: does the touched-file set expand as the session progresses, beyond what the original task implied?
- **Output**: per-session **trajectory findings** (timestamped events with file/line references) feeding the ranking engine, plus the basis for the **Slop Score** (3.7).

Explicitly a v1.5/v2 capability gated on session-log access (an integration question with Claude Code, Cursor, etc.), but the finding schema (3.5) should have a slot for trajectory findings from day one even before any detector populates it.

### 3.5 Slop Ranking Engine

Where Principles 2, 3, and 8 get applied. Takes the raw findings from 3.2–3.4 (plus any ingested SAST findings) and:

- **Multiplies.** Applies domain-proximity and diff-size/session-length multipliers to every finding.
- **Deduplicates and correlates.** Findings that co-occur on the same files/lines — classically, fake generality + modular mirage + blast radius all firing on the same diff — get merged into a single combined finding rather than presented as three line items. "This session went off the rails" is more actionable than three disconnected notes.
- **Ranks.** Produces an ordered list of findings, bounded to a small number per PR, each carrying its file/line, the pattern/detector that fired, convention comparison set (if applicable), and trajectory evidence (if available).
- **Applies per-repo learned weights** from the feedback loop (3.8).

### 3.6 Adjudication step

Per Principle 6, this step never sees raw source with an open-ended "review this" prompt — it receives the top-N ranked findings from 3.5, the task description, and relevant convention context, and for each one:

- Confirms or rejects it.
- If confirmed, writes the entry that appears in the Slop Report: file/line citation (required — unsupported claims are rejected), why it matters, and the smallest proposed fix.
- Is the only place the genuinely ambiguous categories — shallow edge handling and comment compliance (does the comment's promised guarantee actually exist in the code) — get resolved, since both require reasoning over evidence rather than pattern-matching.

Cost-bounded by construction: runs only on the pre-ranked output of 3.5, never on the full diff. LLM cost per PR stays roughly constant regardless of diff size — which matters given Principle 2 already weights large diffs higher without needing to also make them more expensive to process.

### 3.7 Outputs

- **Slop Report** — posted as a PR comment / dashboard entry. A small, ranked, evidence-cited list of what's slop in this diff, tagged by taxonomy category. Explicitly not "here are 40 issues" — success is measured by how quickly a reviewer can act on it, not by finding count.
- **Slop Score** — a per-session number/band from the session slop detector (3.4), independent of any single diff's findings. This is the most shareable artifact and the one most likely to get argued about — "this session scored a 40, what happened?"
- **Phantom Dependency Alert** — fires on its own fast path (3.2 only), without waiting for the rest of the pipeline. High urgency, low latency.

### 3.8 Slop feedback loop

Every Slop Report entry gets a label: useful / false positive / not worth fixing / fixed. These labels retune 3.5's per-repo weighting (Principle 8) — over time, a repo's Slop Report reflects what *that team* has historically cared about, not a generic severity table.

---

## 4. Build order

Follows Principle 1 (clear the easy majority cheaply) and the MVP tiering from the taxonomy doc:

1. **Mechanical Slop Detector + Phantom Dependency check** (3.2) — standalone, no repo index, demo-ready, doubles as the adoption wedge (free CLI / GitHub Action).
2. **Slop Ranking Engine with domain-proximity and diff-size multipliers** (3.5, partial) — even fed only by 3.2, this is what turns "a list of pattern matches" into "a ranked Slop Report," which is the real differentiation versus running the rules directly.
3. **Convention Drift Detector** (3.3) — requires building the repo-indexing infrastructure; the first genuinely hard-to-replicate Tier-C capability.
4. **Adjudication step** (3.6) — layers on once 1–3 produce a reliable ranked-finding stream; brings the comment-compliance and shallow-edge-handling categories online.
5. **Session Slop Detector** (3.4) — gated on session-log access, an integration/partnership question as much as an engineering one. The long-term moat and the basis for the Slop Score, correctly last because it depends on data access likely earned through adoption of 1–4 first.

---

## 5. Open questions for next pass

- **Session-log access**: which agentic coding tools expose session traces in a consumable format today, and what's the integration cost per tool? Determines how soon 3.4 is realistic.
- **Convention-profile staleness**: how often does the repo index need rebuilding, and how does Skeptic behave during a deliberate convention migration (where "drift" is the goal, not the problem)?
- **Finding schema**: the concrete JSON shape passed from 3.5 to 3.6 needs to be designed before any of this is buildable — natural next deliverable.
