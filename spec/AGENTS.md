# Agent Context — Spec Work

This file is the agent context for **specification authoring work** in this repository. If you are doing implementation work (writing TypeScript, configuring packages, editing CI), read the root `AGENTS.md` instead.

> **Essential reading:** Before doing any spec work in this repo, read **[`spec/SPEC-INSTRUCTIONS.md`](SPEC-INSTRUCTIONS.md)** in full. It defines the modular authoring process, phase gates, review protocol, and module dependency graph that govern all specification work. Every conversation that touches spec content must follow those rules.

## Spec Body vs REVIEW Items — No Journey Narration

The Requirements, Design, and Exported Interfaces sections of every spec module describe **only the current correct behaviour of the system**. They must not include the *semantic content* of states the spec used to be in: what an earlier draft said, what mechanism was considered and dropped, what field a removed type used to carry, what option among several was rejected. Inlining that content bloats the spec and — more importantly — primes readers (human or AI) with directions that are no longer the plan, fraying focus and inviting accidental regression to settled-and-rejected calls. The body must read as if the current text were the first and only version ever written.

Journey content — prior drafts, removed mechanisms, "we changed this because…" rationale, and the option-space behind a decision — belongs strictly in **resolved REVIEW items**, whose `Context` / `Question` / `Options` / `Decision` / `Rationale` format (see `SPEC-INSTRUCTIONS.md` §REVIEW Item Format / Resolution) exists precisely to carry it. Resolved REVIEW items have been migrated out of the module files into per-module `spec/review/XX-module-name.review.md` decision logs. Each module file retains its `## REVIEW Items` section heading with a single pointer to its `.review.md` file. New open items should be written inline in the module file as usual; once resolved they migrate to the `.review.md` at the next migration pass.

**Opaque pointers into resolved REVIEW items are allowed and valuable.** A trailing `(see resolved [MODULE-ID]-REVIEW-NNN)` or `See resolved [MODULE-ID]-REVIEW-NNN.` next to the current rule it settles is good practice: the pointer is a stable, low-attention reference that lets a curious reader fetch the journey on demand without forcing it into every reader's working memory. The rule is **the pointer is fine; the prior content the pointer would otherwise replace is not**. A clause that only *names* a resolved REVIEW item is allowed; a clause that *summarises* what the rejected option was, what the earlier draft said, or why the change was made is not (the REVIEW item itself carries that).

Concrete anti-patterns the agent must refuse to write into a module body:

- **Retired-with-explanation requirements**: `*(Retired — the original X rule no longer applies because Y was removed in favour of Z. ID not reused.)*`. Use `*(Retired. ID not reused. See resolved [MODULE-ID]-REVIEW-NNN.)*` and let the REVIEW item carry the substance.
- **Earlier-draft framing inside body text**: phrases of the form *"earlier drafts of …"*, *"previously …"*, *"formerly …"*, *"no longer needed"*, *"has been refined"*, *"is now exported"*, *"is now …"*, *"this replaces what we had before"*, *"originally we …"* — all narrate change rather than state current behaviour.
- **Narration of removed mechanisms**: paragraphs explaining what an abandoned field, type, structure, or phase used to do and why it is gone.
- **Anti-explanations**: `"There is no stacking …"`, `"No Phase 9d. … there are no cached fields to recompute"`, `"This is not a snapshot"`. State what *is*; do not enumerate what *isn't*.
- **In-body enumeration of rejected alternatives**.
- **Justifications inside requirements/design that belong in a REVIEW item's Rationale**.

Pure forward-looking constraints on future editors and present-tense justifications that are load-bearing for regression prevention are **not** journey narration and are appropriate in the body.

## Commit Messages for Squash-Merged Tasks

Project tasks are squash-merged to `main`: the final commit message you stage during a task becomes the single commit that lands. Write that message to describe **the entire task** — every spec change, every cascade, every follow-up edit made across the conversation — not just the most recent edit you happened to make before staging.

## Spec File Locations

Spec modules live in `spec/` (formerly `specs/`):

```
spec/
  01-game-rules.md
  02-platform-architecture.md
  03-auth-and-identity.md
  04-stdb-engine.md
  05-convex-platform.md
  06-centaur-state.md
  07-bot-framework.md
  08-centaur-server-app.md
  09-platform-ui.md
  review/
    01-game-rules.review.md
    ...
  informal-spec/
    team-snek-centaur-platform-spec.md
    general-centaur-game-engine-spec.md
    infrastructure-topology.svg
  SPEC-INSTRUCTIONS.md
  AGENTS.md              ← this file
```

## Spec Authoring Status

Progress on the modular spec (see `SPEC-INSTRUCTIONS.md` for the phase/module framework):

- **Module 01 — game-rules**: Phase 2 complete. 0 REVIEW items open. Decision log: `spec/review/01-game-rules.review.md`.
- **Module 02 — platform-architecture**: Phase 2 complete. 0 REVIEW items open. Decision log: `spec/review/02-platform-architecture.review.md`.
- **Module 03 — auth-and-identity**: Phase 2 complete. 0 REVIEW items open. Decision log: `spec/review/03-auth-and-identity.review.md`.
- **Module 04 — stdb-engine**: Phase 2 complete. 0 REVIEW items open. Decision log: `spec/review/04-stdb-engine.review.md`.
- **Module 05 — convex-platform**: Phase 2 complete. 0 REVIEW items open. Decision log: `spec/review/05-convex-platform.review.md`.
- **Module 06 — centaur-state**: Phase 2 complete. 0 REVIEW items open. Decision log: `spec/review/06-centaur-state.review.md`.
- **Module 07 — bot-framework**: Phase 2 complete. 0 REVIEW items open. Decision log: `spec/review/07-bot-framework.review.md`.
- **Module 08 — centaur-server-app**: Phase 2 complete. 0 REVIEW items open. Decision log: `spec/review/08-centaur-server-app.review.md`.
- **Module 09 — platform-ui**: Phase 1 (Requirements) drafted. (Module absorbed into Module 08; retained as a redirect stub.)

Update this list as modules advance. Keep each entry to a single line — phase status and REVIEW count only. Detail about resolved items, cascades, and rationale belongs in the module files (in the resolved REVIEW item bodies), not here.
