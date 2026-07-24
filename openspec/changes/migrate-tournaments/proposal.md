## Why

Sixteenth change of the final spec-migration train. The "multi-round
competitive play" story — rounds, scheduling, forfeits, walkovers — has
no vocabulary owner today: the tournament mode lifecycle lives in module
05 (§5.10, plus the forfeit-scoring field of §5.6), while the refusal
branches that give forfeits their meaning live in module 03 (§3.3).
Its lifecycle *transitions* were re-authored by the open
migrate-game-lifecycle change as deliberately format-abstract hooks
("a competition format may override the abort", "a format may govern
that none follows", the straight-to-finished transition); nothing yet
names the format that exercises them. Re-authoring the tournament as one
capability puts the whole format in one readable place and retires 7
legacy ids.

## Carving decision

Mint **`tournaments`** exactly as drawn in the capability map and
assignment matrix (author-approved with the capability set and DAG).
The legacy requirements and review items this change absorbs are
recorded in the identifier map under this change's name; the scope also
includes the forfeit/walkover/no-contest **scoring** aspect of
03-REQ-056 (that id itself was retired by
migrate-game-lifecycle, which covers the refusal *transitions*; the
scoring and round semantics are authored here per the author routing).
Declared dependencies: **game-lifecycle, rooms-and-matchmaking,
team-server-management** (the DAG ceiling for this capability, all three
actually cited).

Deliberate boundaries:

- **The format composes the lifecycle's abstractions; it never restates
  them.** game-lifecycle authored the abstract hooks — the launch-gate
  override for schedule-bound formats, the walkover transition in the
  status machine, the "a format may govern that none follows" arm of
  successor auto-creation. This capability is their one concrete
  instance: tournaments/scheduled-start-override,
  tournaments/walkover-and-no-contest, and
  tournaments/round-scheduling#nothing-after-the-final-round cite those
  hooks rather than re-deriving any transition or gate.
- **Scoring vocabulary is phrased abstractly.** game-engine is outside
  this capability's dependency ceiling, so the walkover value is stated
  as what it is — par, 1.0, the normalised-scoring value for a field of
  one — without citing the engine's scoring requirements. The number is
  single-sourced there; this capability states the outcome, not the
  formula.
- **The roster-freeze extension composes without a citation.**
  team-management is not in this capability's DAG row. Its freeze was
  deliberately phrased as holdable longer "by enclosing competitive
  engagements"; tournaments/tournament-roster-freeze is authored as this
  capability's own requirement — the tournament *is* such an enclosing
  engagement — so the two compose by construction, with no cross-DAG
  reference.
- **Scheduled rounds bypass the room gate; the first start uses it.**
  A tournament is initiated like any game, through
  rooms-and-matchmaking/game-start-gate; every subsequent round
  auto-starts with no readiness check — the deliberate absence is
  authored explicitly (#no-ready-check-between-rounds), not left for an
  implementer to infer.

## What Changes

- **New capability `tournaments`** (mint delta, ADDED-only, 7
  requirements): the round structure (each round a full game on a fresh
  instance, meta-parameters tournament-level, participant set fixed);
  round config inheritance minus the meta-parameters; platform-sole
  round scheduling (never before the scheduled start, interlude
  chaining, auto-start with no ready check, nothing after the final
  round); the concrete schedule-bound override of the launch gates
  (unhealthy ignored, refusal forfeits the seat, bounded resolution);
  forfeit scoring (loss with score 0, distinguishable by marking, not
  value); the walkover (sole acceptor at par 1.0) and no-contest (no
  winner) resolutions; the tournament-wide roster freeze anchored to the
  tournament's in-progress state.
- **Retirements**: this change's legacy absorptions are recorded in the
  identifier map (completed with the corpus retirement in this PR); the
  migration planning artifacts are archived under
  `legacy-spec-archive/spec-migration/`.

## Impact

- New: `openspec/changes/migrate-tournaments/specs/tournaments/spec.md`
  (folded to `openspec/specs/tournaments/spec.md` at archive).
- `openspec/config.yaml` context capability list gains `tournaments`
  (at archive).
- Code citations: the tournament record and chaining scheduler, the
  invitation-resolution branching, the outcome/forfeit recording, and
  the freeze check gain `// spec: tournaments/...` citations when the
  implementation lands.

## Open Questions

1. **Roster freeze: whole-event, or mutable between rounds?**
   - **Context**: the legacy sources took two passes at this and never
     converged in one place. The module-03 review that minted the
     mid-game freeze (03-REVIEW-006, retired by migrate-team-management)
     explicitly surfaced — and left **unresolved** — the sub-question:
     as written there ("in progress" = a game in `playing`), roster
     mutations would be *permitted* between tournament rounds, and the
     item flags that a whole-event freeze would need its own decision.
     The later module-05 review 05-REVIEW-003 then decided exactly that
     question — Option B, tournament-wide freeze from first-round start
     to final-round end, interludes included — and 05-REQ-064 was
     amended to match, reasoning that a tournament is one coherent
     competitive unit and inter-round member swaps would be confusing
     and strategically abusable.
   - **Question**: is the whole-event freeze (rosters frozen across
     rounds AND interludes) the confirmed intent, or should rosters be
     mutable between rounds?
   - **Options**: (A) whole-event freeze per 05-REVIEW-003 — the later,
     decided source; the delta is authored this way
     (tournaments/tournament-roster-freeze, with
     #frozen-through-the-interlude and the anchoring scenario). (B)
     per-round freeze with mutable interludes — the reading the 03
     review's unresolved sub-question would leave standing; choosing it
     would rewrite the freeze requirement to anchor on round play and
     drop both interlude scenarios.
   - The delta is authored per option A, since 05-REVIEW-003 is the
     later decided source; author confirmation is requested because the
     03 review deliberately declined to decide this and the corpus never
     reconciled the two in one place.
   - **Decision (author, 2026-07-24)**: Option A confirmed. The whole-event freeze per 05-REVIEW-003 stands as authored.
