## Why

The visual tester has two ways to obtain the board a session starts on, and
only one of them is in the spec. Hand-authoring is `board-editor`'s whole
subject. Running the platform's own generator over parameters and a seed has
been in `apps/visual-tester/src/lib/factory.ts` since long before this train
and appears nowhere in the corpus — `board-editor` only ever gestured at it,
promising a fresh session where "board generation and editing work
immediately" without any requirement saying what board generation *is* here.

That gap was unstateable while generation lived inside `game-engine`: there
was no capability the tester could point at for "the parameters a board is
generated from". `revise-game-engine-contract` and `migrate-game-configuration`
move generation to `game-configuration`, and this change is what the tester
does about it.

## Carving decision

**A separate change folder, not a section of `revise-game-engine-contract`.**
The requirement cites `game-configuration` and `global-invariants`
requirements that exist only in open changes, so whichever folder carries it
folds after both of them. Carried inside the engine change, that would drag
`game-engine`'s own contract revision down with it — and the engine change is
the half of the board-generation move that *removes* the requirements
`migrate-game-configuration` adds. Folding the remover after the adder puts
board generation in both capabilities at once for the length of the interval;
folding it before leaves a gap in which it is in neither. A gap is a corpus
briefly missing a rule, an overlap is a corpus briefly asserting a
contradiction, and the second is worse.

Split out, each folder folds where it should: `revise-game-engine-contract`
keeps only requirement amendments to `visual-tester` (the timing work, which
needs nothing from `game-configuration`), so `visual-tester` stays at depth 2
and the engine change **remains fold-first**; the move is remove-then-add with
no overlap; and this folder folds last, once its two suppliers have.

The cost is one more change folder. The **two-open-changes-one-Purpose** rule
is satisfied because only this change amends `visual-tester`'s Purpose — the
engine change's delta is `## MODIFIED Requirements` only.

Declared dependencies gained by `visual-tester`: **game-configuration** and
**global-invariants**.

## What Changes

- **`## MODIFIED Purpose` for `visual-tester`** — declaring
  `game-configuration` and `global-invariants` alongside the `game-engine` and
  `test-sequences` it already had, and naming both board sources in the prose
  so the capability's own summary stops describing only half of what the tool
  does.
- **ADDED `visual-tester/generated-board-sessions`** (5 scenarios) — the tool
  offers, beside hand-authoring, a session begun on the board the platform's
  one shared generator returns for supplied parameters and a seed. Both routes
  are first class and yield the same kind of session: a generated board is
  thereafter editable, stageable, simulable, scrubbable and savable exactly as
  a hand-authored one, and no affordance is reachable only through generation.
  The same parameters and seed reproduce the board. Where generation declines
  the parameters, the tool reports the constraint that failed and leaves the
  session in progress untouched rather than substituting a board of its own.
- It declares `global-invariants/one-shared-generation`, which is the point: a
  tester that grew its own generator to avoid a dependency is exactly the
  violation that invariant exists to catch.

No implementation is performed by this change.

## Impact

- `openspec/specs/visual-tester/spec.md` at archive: one requirement added and
  the Purpose amended.
- `openspec/capability-graph.md` is regenerated: `visual-tester` gains two
  capability-grain edges and moves from depth 2 to depth 4, below
  `game-configuration`. The graph stays acyclic — `game-configuration`'s
  closure is `application-shell`, `global-invariants` and `game-engine`, and
  none of them reaches `visual-tester`.
- **Fold order**: this change folds after `migrate-game-configuration` (the
  generation parameters and the seeded, all-or-nothing generation attempt) and
  after `mint-platform-persistence` (the one-implementation invariant), and
  `migrate-game-configuration` in turn follows `mint-application-shell`. It
  folds only `visual-tester`, so nothing else waits on it.
- `openspec/config.yaml` needs no capability-list edit — `visual-tester` is
  already in it.
- Code: `apps/visual-tester/` gains `// spec:` citations on the generation
  path, and three gaps between the requirement and the existing code are
  planned in `tasks.md`.

## Open Questions

1. **Do the configured teams drive generation, or does generation's roster
   adopt the configuration?**
   - **Context**: `factory.ts` names two default teams of its own, so a board
     generated while the session is configured for a different roster arrives
     needing a reconciliation the tool then has to perform. The requirement is
     deliberately silent — it says a generated board begins a session, not
     which side wins when the two disagree.
   - Either answer is consistent with the requirement; the choice is a
     usability one and is carried as task 2.4 rather than resolved here,
     because it wants the author in front of the tool.

2. **Does the eventual shared generation component change this requirement?**
   - **Context**: the end state the author named is a common board-generation
     component — configuration parameters and a seed in, a deterministic board
     out — that every surface needing a board embeds, this tool included, so
     the tester's generation panel and the platform's board preview are one
     component rather than two callers that happen to agree today.
   - **Decision (author, 2026-07-28)**: no. The requirement is worded to be
     satisfied by calling the shared implementation *however it is packaged*,
     so the extraction lands without re-opening this spec. Recorded as
     deferred task 2.6 so the end state is not lost.
