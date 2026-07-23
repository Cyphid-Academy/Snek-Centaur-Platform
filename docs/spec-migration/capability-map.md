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

## Minted

| Capability | Owns | Notes |
|---|---|---|
| `game-engine` | The complete rules of the game and the shared executable engine defining them — independent of storage, networking, and UI | Renamed from `game-rules` by the `mint-global-invariants` change |
| `test-sequences` | UI-free data contract for recorded resolver runs | |
| `visual-tester` | The dev app for board authoring, simulation, and test-sequence runs | |
| `global-invariants` | Cross-cutting rules no single user-story capability owns (admission test in its Purpose) | Minted by the open `mint-global-invariants` change |

## Prospective (user-story capabilities)

| Capability | The user story it owns | Draws on |
|---|---|---|
| `game-lifecycle` | A game is created, launched (or walks over), played, finishes, and spawns its successor — including the per-game SpacetimeDB instance's provision/teardown bracket | 02, 04, 05 |
| `game-configuration` | Admins shape a game before launch — parameters, board preview, the freeze at launch | 02, 05 |
| `identity-and-authorization` | Signing in, roles (captain, admin, coach), credential/token issuance, and who may obtain access to a game | 02, 03, 04, 05 |
| `live-game-observation` | Watching a live game — real-time state delivery, visibility/invisibility filtering, spectating, coach read access | 02, 04, 05 |
| `operator-control` | An operator selects a snake, holds it exclusively, steers it manually, stages moves, is displaced or booted | 02, 04, 06, 08 |
| `turn-pacing` | The team decides when a turn resolves — tempo (thinking/flow), turn declaration, the chess clock | 04, 05, 06, 07, 08 |
| `bot-configuration` | The captain configures the team's bot heuristics between and during games | 06, 07, 08 |
| `decision-transparency` | The bot explains itself — computed display state, decision breakdowns, worst-case previews, the extensible recorded-output slots | 02, 06, 07, 08 |
| `replay-and-audit` | Reliving and auditing a finished game — record sufficiency, export, persistence, the action log, the unified viewer, public readability | 02, 04, 05, 06, 08 |
| `team-server-management` | A team acquires and runs its Snek Centaur Server — nomination, hosting, healthcheck, invitations, warm-up | 02, 03, 05, 07, 08 |
| `rooms-and-matchmaking` | Players form rooms and get into games | 05, 08 |
| `tournaments` | Multi-round competitive play | 05, 08 |
| `accounts-and-profiles` | User records, profiles, API keys, leaderboards | 05, 08 |
| `bot-framework` (working name) | Authoring bot logic — the heuristic authoring surface, its safety rails, and the decision engine's contract with authors | 07 |

Not every legacy requirement lands in a user-story capability: engine-level
rules stay in `game-engine`, cross-cutting rules go to `global-invariants`,
and purely mechanical detail stays in code with `design.md` rationale.
