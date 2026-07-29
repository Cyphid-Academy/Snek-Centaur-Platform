# mint-application-shell — Proposal

This is a mint change: ADDED-only, no seed/edit pair. It is **not**
self-contained — it requires the counterpart edits listed under *Changes
outside this folder*, which land alongside it.

## Why

Five capabilities already require the same interface to be presented in a
different mode, and none owns the mechanism by which that is expressible:

- `live-game-observation/coach-mode-interface` — *the full interface a member
  would see, with every mutating affordance disabled or absent*;
- `replay-and-audit/team-perspective-replay` — *the live operator interface,
  read-only, over reconstructed state*;
- `replay-and-audit/replay-binding-mutation-free` — *mutation is structurally
  absent from the replay binding*, and *read-only behaviour comes from the
  binding offering no writes — not from each component keeping its own
  replay-aware branch*;
- `game-configuration/host-selected-affordances` — the surface *derives no
  actor, holds no access rule*, and takes what it offers as parameters;
- `bot-configuration/team-configuration-surfaces` — *everything is visible but
  every editing affordance is disabled*.

Each states the consequence. None states the thing that makes the consequence
achievable: that a surface is written once, mounted with its mode and its
affordances as parameters, and reads its state through a binding whose shape
decides what it may do. Written five times as five surfaces' own discipline,
that is five chances to get it wrong; written once, it is a property of the
application.

The same gap accounts for the corpus's largest unowned deliverable. The
migration's audit records the shared UI infrastructure — the data-source
abstraction `replay-and-audit/replay-binding-mutation-free` presumes, the
board renderer, the navigation shell — as `mechanism` with **no target at
all**, while the only board renderer in the repository is app-local to
`visual-tester`. No capability could own it, because every capability that
needs it owns a story rather than an artifact.

## Carving decision

Mint **`application-shell`** — a substrate capability, the corpus's second
component-level carve after `game-runtime`, and the first of three that give
the platform's built artifacts a place to make promises.

It is bounded by a four-prong admission test carried in its Purpose. Prong
(b) is the one that does the work, and it has a concrete counterfactual in the
manner of `game-runtime`'s *would this read identically in a bot-only game*:
**would this requirement read identically for a surface that has not been
designed yet?** Everything this capability admits does — the mounting
contract, the binding, the board rendering, the fact that there is one
application. Everything a story owns does not: a home view, a room's lobby, a
board-and-move affordance, a replay viewer, a Drive chooser each name what a
user sees or may do, and every one of them stays where it is.

Declared dependencies: **game-engine, global-invariants**. `application-shell`
declares nothing downstream of it, which is why it lands at graph depth 2 —
alongside `game-configuration` and `identity-and-authorization`, and before
every capability that owns a view.

## What Changes

- **New capability `application-shell`** (mint delta, ADDED-only, 4
  requirements). One moves whole; three are new.

- **`application-shell/unified-web-application` moves whole.** *There
  SHALL be exactly one web application for all platform interactions* is a
  fact about the application, consumed by every capability that puts a surface
  in it. It sat in the server-acquisition story only because the sentence that
  follows it names servers.

- **`application-shell/surface-mounting-contract`** (new) — the keystone. A
  surface takes its mode and its affordances as parameters of its mounting,
  derives no actor, holds no access rule, and consults no notion of who is
  present, so one surface serves live play, a read-only watcher, and a
  reconstruction of a past moment with no branch of its own. This is what the
  five requirements above each presuppose and none states.

- **`application-shell/one-state-binding`** (new) — every surface obtains
  state through one binding and is written without knowing which source is
  behind it; what a surface may do to state is a property of the binding, and
  a read-only binding offers no mutation *to express* rather than refusing one
  when it is attempted. This is the data-source abstraction `replay-and-audit`
  already depends on existing.

- **`application-shell/one-board-rendering`** (new) — every surface that shows
  a board goes through one component consuming the engine's own domain values,
  and composes over it rather than forking it.

- **`game-configuration/host-selected-affordances` narrows.** Its general
  clause — *derives no actor, holds no access rule, consults no notion of who
  is present* — and its `#hiding-is-not-enforcing` scenario are the mounting
  contract, and keeping them in one surface's requirement is the DRY failure
  the corpus forbids. What stays is genuinely the configuration surface's: its
  three affordance kinds and their independent selectability.

- **The navigation shell stays mechanism.** It has no falsifiable content that
  `unified-web-application` and the story capabilities' own view requirements
  do not already carry. It gains an owner in this change's plan, which folds
  before every capability that navigates.

## Changes outside this folder

These are not optional; the change is incoherent without them and they land in
the same commit.

| File | Edit |
|---|---|
| `migrate-team-server-management/specs/team-server-management/spec.md` | remove `unified-web-application`; Purpose `Depends on:` += `application-shell`; `shared-hosting` declares it |
| `migrate-game-configuration/specs/game-configuration/spec.md` | narrow `host-selected-affordances`; Purpose += `application-shell` |
| `migrate-live-game-observation/specs/live-game-observation/spec.md` | `ui-honours-the-filter` and `coach-mode-interface` declare it; Purpose += `application-shell` |
| `migrate-replay-and-audit/specs/replay-and-audit/spec.md` | `replay-binding-mutation-free` and `team-perspective-replay` declare it; Purpose += `application-shell` |
| task plans citing the moved identifiers | retarget (linted) |
| `legacy-spec-archive/maps/identifier-map.json` | retarget the `unified-web-application` targets |
| `openspec/maps/identifier-lineage.json` | one rename, one split |
| `openspec/capability-graph.md` | regenerate (`pnpm spec:graph`) |
| `openspec/config.yaml` | add `application-shell` to the context capability list (at archive) |

## Open Questions

### Q-A. Is `application-shell` the right name?

**Context.** The corpus's rule is capability ≠ package and *name the role, not
the technology*. `web-application` names the technology; `client-runtime`
collides with `global-invariants`' three-runtime taxonomy, in which a web
client is deliberately not a runtime.

**Options.** (i) `application-shell` — the shell every surface is mounted
into; technology-free; reads slightly narrow against *there is exactly one
application*. (ii) `web-application` — plain, matches the author's sketch,
carries a technology word. (iii) `unified-application`.

**Recommendation:** (i). The cost of changing it is a rename across four
change folders while every delta is still unfolded — near zero now, real once
folded.

### Q-B. Does `one-board-rendering` bind `visual-tester`?

**Context.** `visual-tester` is a separate dev application with its own
`snake-rendering` requirement, and it is **folded**, so making it declare
`application-shell` would need a `## MODIFIED Purpose` on a folded capability
that `revise-game-engine-contract` is already amending.

**Recommendation.** No. The requirement binds *this application*, and the dev
tool's reuse of the same renderer is a plan item rather than an obligation.
Revisit once `visual-tester` is free.
