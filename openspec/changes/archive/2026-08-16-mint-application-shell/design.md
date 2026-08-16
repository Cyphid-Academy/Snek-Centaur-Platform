# mint-application-shell — Design

## Context

The migration carved the corpus by user-story locality on the finding that the
legacy modules' runtime/artifact seams sawed single workflows in half
(`2026-07-24-mint-global-invariants`). `mint-game-runtime` recorded the one
place where the same pathology appears with the polarity reversed — a single
*transaction* sawn across six capabilities. This change records a third shape
of the same problem: a single *artifact's promise* asserted by five
capabilities and owned by none.

The distinction from a runtime-shaped carve matters and is checkable. Module
08 was *the Centaur Server frontend* — every page, every view, every flow.
`application-shell` is *the promises the application makes to a surface built
in it*. Every page, view and flow stays in the story capability that owns it,
and every one of them is still implemented in the same SvelteKit app.

## Decisions

### 1. Carve by shared promise, not by artifact

The capability admits a requirement only if it reads identically for a surface
that has not been designed yet. That test is deliberately harsh: it rejects
every view requirement in the corpus, including the ones that clearly describe
"application-level" work — `accounts-and-profiles/home-view`,
`live-game-observation/coach-mode-interface`,
`replay-and-audit/unified-replay-viewer`. Those name what a user sees; a
substrate requirement cannot.

**What breaks if reversed** (admit views because they are "in the app"): the
capability becomes module 08 with a Purpose paragraph on top, and
`accounts-and-profiles`, `rooms-and-matchmaking`, `tournaments` and
`operator-control` are each reduced to the data behind a screen somebody else
owns.

### 2. The keystone is the mounting contract, not the component library

A component library is mechanism: it has no falsifiable content, and a
requirement mandating one would be a build instruction in the spec. What is
falsifiable is the *contract a surface is written to* — that it takes its mode
and affordances as parameters and resolves no actor. That is what five
capabilities already presuppose, and it is the difference between "the coach's
view is the member's view read-only" being a design intention and being a
property a reviewer can check.

**What breaks if reversed** (require the library, not the contract): the spec
carries a fact about the repository that goes stale, and the property five
capabilities actually depend on stays unstated.

### 3. `replay-binding-mutation-free` stays in `replay-and-audit`

It is tempting to move it: it is the closest thing the corpus has to a
statement about the binding. But its subject is the *replay* binding, and its
purpose is that a replay viewer cannot write. It stays, declaring
`one-state-binding`, which is the general fact it rests on. The two are
independent — you can honour the general rule and still hand the replay path a
mutating binding — so this is a dependency, not a duplication.

**What breaks if reversed** (move it): `replay-and-audit` loses the statement
that its own viewer cannot write, and the general rule has to grow a
replay-specific clause, which fails prong (b).

### 4. `host-selected-affordances` narrows rather than staying whole

Its clause *the component SHALL derive no actor, hold no access rule, and
consult no notion of who is present* is word-for-word the general contract,
and `#hiding-is-not-enforcing` is the general scenario. Under the corpus's DRY
rule a constraint another requirement cleanly implies must not be repeated:
the copy carries no authority and the two drift. The narrowing is one sentence
and one scenario, and what remains — three named affordance kinds,
independently selectable — is a claim only the configuration surface can make.

**What breaks if reversed** (leave it whole): two statements of one rule, one
of which reaches only the configuration surface, and no answer to which is
binding when a third surface is written.

### 5. The board renderer is a requirement; the navigation shell is not

Both are on the author's list of shared infrastructure, and they fall on
opposite sides of the falsifiability line. A second board rendering is a
defect a reviewer can find, and one with consequences — the invisibility
indication rule in `live-game-observation/ui-honours-the-filter` holds
wherever a board is drawn or nowhere. A second navigation structure is a
matter of taste, and `unified-web-application` already forbids the case that
matters (a second application). The shell gets a task, not a requirement.

**What breaks if reversed** (mint a navigation requirement): a requirement
nobody can fail, which is exactly what `global-invariants`' prong (c) exists
to keep out of the corpus.

### 6. `visual-tester` is out of scope

The dev tool is a separate application with its own rendering requirement, and
it is folded — binding it would need a `## MODIFIED Purpose` on a capability
another open change is already amending. The requirement therefore says *every
surface of the application*, and the dev tool's reuse of the renderer is a
plan item. This is a deliberate under-reach, recorded so a later change can
close it rather than rediscover it.

## Constraint-mining

Per the mandatory design rule, each decision was checked for an invariant a
future implementer could silently violate.

- Decision 1 → no new invariant; the guard is the admission test itself.
- Decision 2 → the invariant is that a surface cannot reach around its
  mounting to discover who is present. Minted as
  `application-shell/surface-mounting-contract`, with
  `#the-host-states-what-is-offered` closing the "it could just read the
  session" path and `#hiding-is-not-enforcing` closing the "then the mounting
  is the check" path.
- Decision 3 → the invariant is that read-only-ness is structural rather than
  guarded. Minted as `application-shell/one-state-binding#absence-not-refusal`
  — the general form of the scenario `replay-and-audit` had already mined for
  its own path.
- Decision 5 → the invariant is that a surface composes over the shared
  rendering rather than forking it, since a fork is how a rendering rule
  silently stops holding. Minted as
  `application-shell/one-board-rendering#composition-not-replacement`.
- One invariant was considered and **deliberately not minted**: that a client
  persists no authoritative state across sessions. That is already
  `global-invariants/state-confined-to-owning-runtime#clients-restart-clean`,
  which `one-state-binding` declares instead of restating.

## Risks / Trade-offs

- **"This is module 08 again."** The objection a future reader raises first.
  Mitigated by prong (b)'s counterfactual, which rejects every view
  requirement in the corpus — including the four that most look like
  application work. If a later proposal argues that the replay viewer belongs
  here because it is built in the app, the answer is that it names what a user
  sees, and so does every other view.
- **Three of four requirements are new.** This is not a consolidation like
  `game-runtime`; it is mostly a place to state promises that were never
  stated. The consolidation argument is real but indirect: five capabilities
  assert the consequence of a rule none of them states.
- **`one-board-rendering` under-reaches.** It cannot bind `visual-tester`
  today, so the corpus will briefly say "one rendering" while two exist.
  Recorded as Q-B rather than papered over.
- **The name is a judgement call.** Recorded as Q-A.

## Alternatives considered

- **Do nothing; leave the shared infrastructure unowned.** Rejected: the audit
  already records it as `mechanism` with no target, and the five capabilities
  that presume it keep asserting a consequence with no cause.
- **Put the shared infrastructure in `centaur-server-runtime`.** The server and
  the application are one repository and one deployable, so this is the obvious
  merge, and it must be rejected on meaning rather than on cost: merging them
  internalises the `centaur-server-runtime → application-shell` edge, so the
  merged capability would sit at depth 2 and the fold order would be
  unchanged. What it costs is the admission test. The two tests are different
  counterfactuals — *a surface not yet designed* and *a server operating no
  team* — and no single test covers both except "it is in the server
  repository", which is module 08 restored. The consequence shows up in the
  dependency record: every capability owning a view would declare a capability
  whose key publication, whitelisting and administrative issuers its soundness
  does not rest on, and the graph would stop being a soundness record at
  capability grain. The seam is one the corpus already draws —
  `no-operator-state` says the server *serves* the application and does not
  mediate its data access — and capability boundaries have been orthogonal to
  package boundaries since the `game-runtime` carve put three capabilities in
  one SpacetimeDB module.
- **Put it in `global-invariants`.** Rejected on gi's own terms: these are
  facts about one artifact, checkable by opening its source, and gi is a meta
  layer that constrains without implementing. It would also make gi cite
  `game-engine` for a rendering rule, which is within its declared
  dependencies but plainly implementation-bearing.
- **A narrower `ui-data-binding` capability holding only the binding.**
  Rejected: it would own the binding but not the mounting contract, so the
  five mode requirements would still have no owner, and *there is exactly one
  application* would still be in the server story.
