> **ARCHIVED (2026-07-24)** — planning record. The live dependency graph is each capability Purpose's `Depends on:` declaration (lint-derived); implementation order follows it.

# Prospective Capability Map

The target carving of the platform spec into **user-story capabilities**,
plus the cross-cutting `global-invariants` capability. Status meanings:
**minted** — exists in `openspec/specs/` (or is minted by an open change);
**prospective** — a working hypothesis, finalized only by the carving
decision of the migration change that mints it (names and boundaries may
change; splits and merges are expected).

Legacy modules were carved by runtime/artifact (implementation sequencing),
so most user stories cross module boundaries; the "Draws on" column names
the legacy modules expected to feed each capability.

**Revision 2026-07-24 (Phase B synthesis):** the whole-corpus atlas pass
produced a per-id assignment for every undisposed legacy id — see
[`assignment-matrix.md`](assignment-matrix.md), which is the operative
draft partition and carries the open carving questions. This map's
prospective set is updated to match: `team-management` and
`platform-integrations` added (pending the carving decision), the
dependency DAG and the change-train archive order are drafted below.

## Minted

| Capability | Owns | Notes |
|---|---|---|
| `game-engine` | The complete rules of the game and the shared executable engine defining them — independent of storage, networking, and UI | Renamed from `game-rules` by the `mint-global-invariants` change |
| `test-sequences` | UI-free data contract for recorded resolver runs | |
| `visual-tester` | The dev app for board authoring, simulation, and test-sequence runs | |
| `global-invariants` | Cross-cutting rules no single user-story capability owns (admission test in its Purpose) | Extended by the final train's `extend-global-invariants` change |

## Prospective (user-story capabilities)

| Capability | The user story it owns | Draws on |
|---|---|---|
| `identity-and-authorization` | Signing in, identity kinds, roles (admin), credential/token issuance and validation, who may obtain access to a game | 02, 03, 04, 05, 06, 08 |
| `team-management` *(new, Q1)* | The captain runs the team — creation, roster, captaincy transfer, coaches, archiving, the mid-game roster freeze | 03, 05, 08 |
| `team-server-management` | A team acquires and runs its Snek Centaur Server — nomination, hosting, invitations, healthcheck, the forkable reference app | 02, 03, 05, 08 |
| `game-configuration` | Admins shape a game before launch — parameters, board preview, the freeze at launch | 02, 05, 08 |
| `game-lifecycle` | A game is created, launched (or walks over), played, finishes, and spawns its successor — including the per-game SpacetimeDB instance's provision/teardown bracket | 02, 03, 04, 05, 06, 08 |
| `rooms-and-matchmaking` | Players form rooms, enrol teams, declare readiness, and get into games | 05, 08 |
| `live-game-observation` | Watching a live game — real-time delivery, invisibility filtering, spectating, coach read access, the scoreboard | 02, 03, 04, 05, 06, 08 |
| `operator-control` | An operator selects a snake, holds it exclusively, steers it manually, stages moves, is displaced or booted | 02, 03, 04, 06, 07, 08 |
| `turn-pacing` | The team decides when a turn resolves — tempo, declaration, the chess clock realization, bot submission timing, Captain overrides | 04, 06, 07, 08 |
| `bot-framework` *(name confirmation Q3)* | Authoring bot logic — the heuristic vocabulary and safety rails, and the decision engine's observable behaviour (stateMap, worst-case scoring, softmax) | 07 |
| `bot-configuration` | The captain and operators configure bot heuristics — team defaults, bot params, live per-snake portfolio editing | 06, 07, 08 |
| `decision-transparency` | The bot explains itself — computed display state, decision breakdowns, worst-case previews, the recorded-output slots | 02*, 06, 07, 08 |
| `replay-and-audit` | Reliving and auditing a finished game — record sufficiency, export, persistence, attribution, the action log, the unified viewer, public readability | 02, 03, 04, 05, 06, 07, 08 |
| `accounts-and-profiles` | User records, profiles, team profiles, leaderboards, stats | 05, 08 |
| `tournaments` | Multi-round competitive play — rounds, scheduling, forfeits, walkovers | 03, 05 |
| `platform-integrations` *(new, Q2)* | An admin automates the platform from outside — API keys, the HTTP API, webhooks | 03, 05, 08 |

\* module 02's constraint-mined "extensible Centaur state slots" ledger
entry (no numeric id).

Not every legacy requirement lands in a user-story capability: engine-level
rules stay in `game-engine`, cross-cutting rules go to `global-invariants`
(authored by the train's dedicated `extend-global-invariants` change), and
purely mechanical detail stays in code with `design.md` rationale.

## Proposed dependency DAG (ceiling, Q8)

Authoring changes declare only the dependencies their spec text actually
cites; this DAG is the permitted ceiling, kept acyclic (lint-enforced via
each Purpose's "Depends on:" declaration).

| Capability | May depend on |
|---|---|
| identity-and-authorization | (none) |
| team-management | identity-and-authorization |
| team-server-management | identity-and-authorization, team-management |
| game-configuration | game-engine |
| game-lifecycle | game-engine, game-configuration, identity-and-authorization, team-server-management |
| rooms-and-matchmaking | game-lifecycle, game-configuration, team-management |
| live-game-observation | game-engine, identity-and-authorization |
| operator-control | game-engine, identity-and-authorization, live-game-observation |
| bot-framework | game-engine, operator-control |
| bot-configuration | bot-framework, team-management |
| turn-pacing | game-engine, operator-control, bot-framework, bot-configuration |
| decision-transparency | bot-framework, operator-control |
| replay-and-audit | game-engine, identity-and-authorization, game-lifecycle, live-game-observation, operator-control, turn-pacing, decision-transparency |
| accounts-and-profiles | identity-and-authorization, team-management, replay-and-audit |
| tournaments | game-lifecycle, rooms-and-matchmaking, team-server-management |
| platform-integrations | identity-and-authorization, game-lifecycle |

Notable direction choices: `bot-framework` defines the heuristic vocabulary
that `bot-configuration` configures (07-REQ-013 stays in bot-framework to
keep this acyclic); `turn-pacing` sits above bot-framework/bot-configuration
because bot submission timing is part of the pacing story; global-invariants
stays out of the DAG (it constrains implementers; capabilities do not cite
it as a dependency).

## Change-train plan (the final migration PR)

One change folder per capability, each authored in its own commit(s) with a
dedicated design.md. **The train merges with all 17 changes OPEN** (author
decision 2026-07-24, after investigating OpenSpec protocol: `specs/`
records implemented behaviour, so archiving happens per change in the PR
that completes that capability's implementation — enforced by the
archive-due gate, with fold refusing out-of-DAG-order archives). The
numbered order below is the dependency (and expected implementation)
order; each capability's pre-implementation review happens against its
still-open change folder right before that work begins. The
`extend-global-invariants` change owns every global-invariants
addition/modification (Q5), satisfying the one-owner-per-requirement train
precondition.

1. extend-global-invariants (ADDED-only to the existing capability)
2. identity-and-authorization
3. team-management
4. team-server-management
5. game-configuration
6. game-lifecycle
7. rooms-and-matchmaking
8. live-game-observation
9. operator-control
10. bot-framework
11. bot-configuration
12. turn-pacing
13. decision-transparency
14. replay-and-audit
15. accounts-and-profiles
16. tournaments
17. platform-integrations

Per-change obligations (config.yaml tasks rules): identifier-map entries
with `change` attribution finalized at archive; module-02 ledger entries
cleared as their ids graduate; the change that disposes a module's last id
flips its cutover row and extends `MIGRATED_MODULES` in
`scripts/check-spec-citations.mjs`; every minted capability joins
config.yaml's capability list at archive.
