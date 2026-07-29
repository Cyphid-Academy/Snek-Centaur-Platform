## Context

`visual-tester` is folded. Its Purpose declares `game-engine` and
`test-sequences`. This change adds two declarations and one requirement, and
the interesting content is entirely in *why it is its own folder* and *why the
requirement is shaped as a second board source rather than an extension of the
editor*.

## Decisions

### 1. Why a separate change rather than a section of the engine change

The requirement cites requirements that exist only in open changes
(`game-configuration/generation-parameters`,
`game-configuration/board-generation-retry`,
`global-invariants/one-shared-generation`). Fold enforces dependency order
requirement by requirement, so the folder holding it folds after both
suppliers — wherever that folder is.

`revise-game-engine-contract` folds `game-engine`, `test-sequences` and
`visual-tester` together. Carrying this requirement there gates all three on
`migrate-game-configuration`, and the engine change is the *removing* half of
the board-generation move. The two orderings available were:

| | `game-engine` | `game-configuration` |
|---|---|---|
| remove-then-add (engine folds first) | gone | not yet there |
| add-then-remove (engine folds second) | still there | there too |

The first leaves board generation specified nowhere for the length of the
interval. The second leaves it specified in two capabilities at once — two
sets of requirement text, both folded, both binding, with no statement of
which governs. A corpus briefly missing a rule is wrong in a way a reader
notices and a lint can be pointed at; a corpus briefly asserting the same
rule from two owners is wrong in a way that reads as intentional.

**What breaks if reversed**: fold this requirement inside the engine change
and the whole engine contract revision — eleven amended requirements, two
added, six removed — waits on the capability it is feeding, for the sake of
one requirement in a development tool. The tail wags the dog, and the dog is
the graph root.

### 2. Why `generated-board-sessions` and not an extension of `board-editor`

`board-editor` is about what a human may author and what the editor will
refuse. Generation is about where a board *came from* and what the tool
promises about it — determinism under a re-run, editability afterwards, and
what happens when the parameters admit no board. Those are claims about a
session's origin, not about an editing affordance, and three of the five
scenarios have no editor content at all.

Keeping them separate is also what lets `#hand-authoring-needs-no-generator`
be stated: the tool's full surface stays reachable without ever generating.
Folded into `board-editor`, that scenario would be asserting the independence
of a requirement from itself.

**What breaks if reversed**: `board-editor` acquires a dependency on
`game-configuration`, and the editor requirement — the tool's most-read
requirement — can no longer be understood without the configuration story.

### 3. What the invariant declaration buys

`global-invariants/one-shared-generation` forbids a second implementation of
the generation rules anywhere. Declaring it here is not decoration: the
cheapest way to satisfy "the tester can generate a board" without a
`game-configuration` dependency is for the tester to grow a small generator of
its own, and it would be a *good-faith* implementation — a test tool wanting
no production dependency is a defensible instinct. The invariant is what makes
that instinct a spec violation rather than a design preference, and the
declaration is what puts it in front of the person acting on it.

The requirement's own wording carries the same load in a second place: the
board a session begins on is "the platform's one shared implementation's"
output, not "a board matching the generation rules". The second phrasing is
satisfiable by a reimplementation that happens to agree.

### 4. The declined path is a requirement, not a UI note

`#declined-generation-changes-nothing` exists because the tempting
implementation of an infeasible parameter set is to fall back to something
showable. A tool that silently substituted a board would be reporting resolver
behaviour on a board other than the one the tester asked for — which is the
one thing this tool must never do. Stating it as a scenario makes a fallback a
spec violation rather than a helpful touch.

## Constraint-mining

- Decision 1 → no invariant; the constraint is fold order and it is checked by
  `spec:fold` itself.
- Decision 3 → the invariant already exists
  (`global-invariants/one-shared-generation`); what this change adds is a
  consumer that declares it, which is what makes the invariant reachable from
  the tool's own spec.
- Decision 4 → minted as
  `generated-board-sessions#declined-generation-changes-nothing`.

## Correspondence with the code

`apps/visual-tester/src/lib/factory.ts` already calls the generator the engine
package exports, and `store.svelte.ts` already starts a session on what it
returns — so the one-implementation half of this requirement holds today and
is not a migration. Three gaps are real and are tasks, not spec problems: the
seed is always drawn randomly and can never be supplied, the parameter ranges
are re-typed in the tool's panel instead of read from their declaration, and
the generation path names two default teams of its own.
