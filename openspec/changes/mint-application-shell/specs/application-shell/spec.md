## Purpose

The one application every platform surface is reached in, and the
infrastructure every surface in it shares. This capability owns the fact that
there is exactly one application — spanning platform-wide and team-internal
concerns alike — and the three promises that application makes to every
surface built in it: the single binding through which a surface obtains
platform and game state, whose shape rather than each surface's discipline is
what makes a read-only presentation read-only; the one board rendering every
surface showing a board goes through; and the mounting contract a surface is
written to, which takes its mode and its affordances as parameters and
resolves no actor of its own. What any particular surface shows — a home view,
a room's lobby, a live board, a replay, a team's management page — belongs to
the capability that owns that workflow; where the application is served from,
by whom, and on what terms it may be forked belong to the server the platform
distributes.

Admission test — a requirement belongs in this capability iff all four hold:
**(a)** it is a promise the application makes to every surface built in it,
discharged once in shared infrastructure rather than inside any one surface;
**(b)** it reads identically for a surface that has not been designed yet — no
view, no actor, no workflow appears in it; **(c)** it constrains what the
application is or guarantees, never what a surface does with the guarantee;
**(d)** it is a fact about this one application, checkable by opening its
source, rather than a rule binding every client of the platform alike.
Anything failing (a) belongs to the capability that owns the surface
discharging it; anything failing (b) is a user story and belongs to the story
capability; anything failing (c) belongs to the capability owning the data or
the runtime behind the surface; anything failing (d) is `global-invariants`'.

Depends on: game-engine, global-invariants.

## ADDED Requirements

### Requirement: application-shell/unified-web-application
Depends on: global-invariants/access-follows-identity.

There SHALL be exactly one web application for all platform interactions — its scope spanning both platform-level concerns and team-internal competitive concerns — and every Snek Centaur Server SHALL serve that same application: an open-source client backed by the same platform deployment, with no separate platform application anywhere. Serving the whole platform from interchangeable third-party servers is workable only because access follows identity, which settles what a visitor may read on any of them.

#### Scenario: #no-second-application
- **WHEN** any platform interaction is sought, platform-wide or team-internal
- **THEN** it lives in the one unified application every server serves — there is no separate platform application to visit for any of it

#### Scenario: #same-data-any-server
- **WHEN** a user reaches a platform surface from some server's copy of the application
- **THEN** the serving server is an interchangeable client: it determines where the application was fetched from and nothing else, since what the user may read is settled by their own identity

### Requirement: application-shell/surface-mounting-contract
Depends on: global-invariants/one-contract-many-surfaces.

A surface SHALL take the mode it is mounted in and the affordances it offers as explicit parameters of its mounting, deriving no actor, holding no access rule, and consulting no notion of who is present — so that one surface serves live play, a read-only view for someone watching, and a reconstruction of a past moment without a branch of its own for any of them. Offering an affordance SHALL be a presentation decision and never an authorising one: the owning runtime's contract judges every write it receives on its own rules, however the surface was mounted.

#### Scenario: #one-surface-every-mode
- **WHEN** the same surface is mounted live, read-only, and over a reconstructed past moment
- **THEN** it is the same surface in all three, with no mode-aware branch inside it — so a surface written for live play is the surface a spectator, a coach, and a replay viewer meet, and none of them is a second implementation to keep in step

#### Scenario: #the-host-states-what-is-offered
- **WHEN** one surface is mounted twice, offering different affordances
- **THEN** the two mountings differ only in what the host stated; the surface resolved no actor, read no session, and consulted no access rule to reach the difference

#### Scenario: #hiding-is-not-enforcing
- **WHEN** a write of a kind the surface was not offering reaches the owning runtime anyway
- **THEN** it is judged on that runtime's own rules exactly as any other write; the absent affordance never was the check, so a mounting can be got wrong without anything becoming reachable

### Requirement: application-shell/one-state-binding
Depends on: global-invariants/client-truthfulness, global-invariants/state-confined-to-owning-runtime#clients-restart-clean.

Every surface SHALL obtain the state it renders through one binding, and SHALL be written without knowledge of which source is behind it — a live runtime subscription, a persisted record, or a fixture. What a surface may do to state SHALL be a property of the binding it was mounted against rather than of the surface's own discipline, and a binding that offers no mutation SHALL offer none to express rather than refusing mutations when they are attempted.

#### Scenario: #a-surface-does-not-know-its-source
- **WHEN** a surface renders live state and then the same state reconstructed from a persisted record
- **THEN** it is the same code in both, with no source-aware branch — so a surface written before the replay path existed works under it unchanged

#### Scenario: #absence-not-refusal
- **WHEN** a read-only binding is examined
- **THEN** it has no mutation to invoke at all, so nothing stands between a surface and a write that could be forgotten, bypassed, or got wrong — and a surface that never heard of read-only mode still cannot write through it

#### Scenario: #loss-is-the-bindings-to-report
- **WHEN** the connection behind a binding is lost
- **THEN** the loss reaches the user through the binding, and no surface has to detect staleness for itself or is able to present a stale cache as live state

### Requirement: application-shell/one-board-rendering
Depends on: game-engine/domain-vocabulary, global-invariants/one-shared-engine#no-parallel-implementation.

Every surface of the application that renders a game's board SHALL render it through one component consuming the shared engine's own domain values, so that how terrain, a snake, an item, a hazard, and a fertile tile are drawn is stated once and holds wherever a board appears. A surface SHALL add to the rendering by composing over it — overlays, markers, shadows, affordances — never by rendering a board of its own.

#### Scenario: #one-board-everywhere
- **WHEN** a board appears on a live surface, in a configuration preview, and in a replay
- **THEN** it is the same component in all three, so a board that reads correctly on one of them reads correctly on all of them

#### Scenario: #a-rendering-rule-is-stated-once
- **WHEN** how something on the board is drawn changes
- **THEN** it changes in one place and every surface follows; no surface holds a second rendering that could keep the old appearance

#### Scenario: #composition-not-replacement
- **WHEN** a surface needs to mark something the shared rendering does not know about
- **THEN** it composes its own layer over the rendering rather than forking it — the board underneath stays the one board
