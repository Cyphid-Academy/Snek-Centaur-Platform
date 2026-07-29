# mint-centaur-server-runtime — Proposal

This is a mint change: ADDED-only, no seed/edit pair. It is **not**
self-contained — it requires the counterpart edits listed under *Changes
outside this folder*, which land alongside it. It archives **after**
`mint-application-shell`.

## Why

`team-server-management` currently owns two different things under one
Purpose. Its first sentence is a user story — *a team acquires and runs its
Snek Centaur Server* — and most of its requirements serve it: the captain
names a domain, the two facts that jointly confer authority, the inbox, the
invitation and its answer, the hosting relationship over time.

Seven of its seventeen requirements are not that story at all. They are what a
deployment must *be* in order to be a Snek Centaur Server: it generates and
publishes a keypair on first boot; it exposes an administration API bounded by
recorded issuer ceilings; the distributed library keeps co-tenants' credentials
apart; a shared reference deployment runs only reference heuristics; it holds
no identity state; it answers a liveness endpoint; and it is delivered as a
forkable repository whose compatibility surface is three well-known paths plus
the library's published interfaces. Every one of those is stated for a server
that has been named by nobody and admitted nobody — they are true of the
artifact before any team relationship exists.

That is not a cosmetic mis-filing. The fork/mirror publishing path is one of
the corpus's unowned foundational deliverables:
`.github/workflows/mirror-centaur-server.yml` does not exist and
`@cyphid/snek-centaur-server-lib` is at `0.0.0`, while
`centaur-server-runtime/forkable-reference-app` already makes the library's
surface a compatibility contract a fork binds to. The distribution channel the
educational product depends on belongs to nobody, because the capability it
would belong to is a story about acquiring a server rather than about building
one.

## Carving decision

Mint **`centaur-server-runtime`** — a substrate capability owning the server
artifact's own promises.

Bounded by a four-prong admission test carried in its Purpose. Prong (b) is
the one that does the work, with a concrete counterfactual in the manner of
`game-runtime`'s *would this read identically in a bot-only game*: **does it
read identically for a server that operates no team?** Key publication, the
administration API, the library's tenant separation, the liveness endpoint,
the reference-heuristics policy, the absence of identity state and the fork
surface all do. `whitelist-admission`, `invitation-acceptance`,
`homing-inbox`, `two-sided-consent`, `shared-hosting` and `reference-server-home`
do not — each needs a team, a relationship, or a game — and every one of them
stays in `team-server-management`. So does `bot-framework/embedded-team-player`,
which runs in this very process and would be the first thing pulled in by an
"it's on the server" argument: it needs a game.

Declared dependencies: **application-shell, global-invariants**. The server
serves the one application, which is why the edge points that way.

## What Changes

- **New capability `centaur-server-runtime`** (mint delta, ADDED-only, 8
  requirements). Six move whole, one is the server half of a requirement that
  splits, one is new.

- **Six move whole from `team-server-management`:** `server-key-publication`,
  `server-administration-api`, `library-tenant-separation`,
  `reference-heuristics-on-shared-hosting`, `no-operator-state`,
  `forkable-reference-app`.

- **`server-healthcheck` splits, and the split is forced.** As written it
  binds two runtimes in one sentence — the server exposes an endpoint, the
  platform records a status and displays it — which is precisely what
  `global-invariants/runtime-ownership` exists to prevent, and precisely the
  reason `mint-game-runtime` split `replay-and-audit/append-only-history`. The
  endpoint becomes `centaur-server-runtime/healthcheck-endpoint`; the recorded
  status and its on-demand checking stay in `team-server-management` under the
  original slug, so every existing citation of the platform-side half —
  `game-lifecycle/launch-gates` among them — keeps resolving unchanged.

- **One genuinely new requirement,
  `centaur-server-runtime/published-library-surface`** — the library is
  published as a versioned artifact a fork resolves without access to the
  platform's own repository; its published interfaces are the code half of the
  compatibility surface; a pinned fork keeps building and keeps being
  operated; and a removal or narrowing ships as a breaking version rather than
  reaching pinned forks at all. This is the falsifiable core of the
  fork/mirror deliverable. The mirror workflow itself stays **mechanism** and
  gains an owner in this change's plan — the same disposition
  `mint-game-runtime` gave the SpacetimeDB toolchain.

- **`team-server-management` keeps the story and gains three honest edges.**
  `whitelist-admission` and `invitation-acceptance` each name the reference
  implementation's whitelist and now declare the API that administers it;
  `shared-hosting` names the application and now declares it; `server-healthcheck`
  declares the endpoint it calls.

## Changes outside this folder

| File | Edit |
|---|---|
| `migrate-team-server-management/specs/team-server-management/spec.md` | remove 6 requirement blocks; narrow `server-healthcheck` to the platform half; Purpose `Depends on:` += `centaur-server-runtime`; rewrite the Purpose's scope sentence; three requirements gain declarations |
| `migrate-team-server-management/tasks.md` | retarget every citation of a moved identifier (linted) |
| `migrate-bot-framework/tasks.md`, `migrate-bot-configuration/tasks.md` | one citation each of `forkable-reference-app` (linted) |
| `packages/centaur-server-lib/src/index.ts`, `apps/centaur-server-reference/src/routes/.well-known/*` | `// spec:` citations of the moved identifiers |
| `legacy-spec-archive/maps/identifier-map.json` | retarget the affected `target` fields |
| `openspec/maps/identifier-lineage.json` | six renames, one split |
| `openspec/capability-graph.md` | regenerate (`pnpm spec:graph`) |
| `openspec/config.yaml` | add `centaur-server-runtime` to the context capability list (at archive) |

## Open Questions

### Q-A. Does `whitelist-admission` stay, or split?

**Context.** Its first sentence — *a server decides independently which teams
it operates* — is server-authored; its second — *the platform holds no
representation of the decision* — is a platform constraint; its third names the
reference implementation's whitelist. Prong (b) rejects it (it needs a team),
but a reader will ask.

**Recommendation:** it stays whole. Its subject is the team↔server
relationship, and the reference implementation's whitelist mechanics already
move with `server-administration-api`, which it now declares. Splitting a
three-sentence requirement to relocate one clause costs more than the
inconsistency it removes.

### Q-B. Does `reference-server-home` stay?

**Context.** It is about a deployment Cyphid operates, which sounds like this
capability's business.

**Recommendation:** it stays. Its content is *having no infrastructure is
never a bar to playing* — a team's story about acquiring a server — plus the
platform-side guarantee that the reference deployment holds no privilege
another lacks. Neither is a promise the artifact makes. This is the clearest
worked example that "it is about the reference implementation" is not
sufficient for admission.

### Q-C. Does the mirror workflow become a requirement?

**Context.** Q33 lists the fork/mirror publishing path as unowned. The
`mint-game-runtime` precedent (its Q-C) kept the SpacetimeDB toolchain as
mechanism and gave its tasks owners split by fold order.

**Recommendation:** the same disposition. No requirement mandates a workflow
file. `published-library-surface` states what a fork may rely on, which is the
part that is falsifiable and the part a fork author would be harmed by losing;
the workflow, the tag scheme and the subtree split are this change's tasks.
