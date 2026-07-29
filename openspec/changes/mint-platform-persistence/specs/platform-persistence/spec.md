## Purpose

The one persistent deployment as a substrate: what it is composed of, what
its stored shapes promise, and how they change. This capability owns the
components the deployment mounts and the boundary between them; the
generated, typed access path every caller reaches the deployment through; and
the discipline by which a stored shape
changes without a deployed reader ever meeting a shape it cannot read. That
there is exactly one deployment, and that it is the sole home of everything
outliving a game, is an invariant this capability rests on rather than one it
states, and so is the guard that keeps a stored mirror of an engine type
faithful — a rule that binds every runtime holding such a mirror, not this one
deployment. Which records exist, what they mean, who may write them, and what
any of them is for belong to the capabilities that own those workflows.

Admission test — a requirement belongs in this capability iff all four hold:
**(a)** the obligation is discharged inside the deployment's own definition —
its components, its schema, its generated client, its rollout — rather than by
any caller; **(b)** it reads identically for a deployment holding no records
yet, so it names no record, no field, and no rule of the game; **(c)** it
constrains what the store is and guarantees, never what is stored in it or
what a reader concludes from it; **(d)** it is a fact about this one
deployment, checkable by opening its definition, rather than a rule binding
every store on the platform alike. Anything failing (a) belongs to the
caller's capability; anything failing (b) is a user story and belongs to the
story capability; anything failing (c) belongs to the capability that owns the
record; anything failing (d) is `global-invariants`'.

Depends on: global-invariants.

## ADDED Requirements

### Requirement: platform-persistence/component-boundaries
Depends on: global-invariants/single-convex-deployment, global-invariants/centaur-state-boundary, global-invariants/runtime-ownership.

The deployment SHALL be composed of separately defined components mounted by one host, each component owning its own tables, and a component's tables SHALL be reachable from outside that component only through the function surface the component itself declares — never read or written directly by the host or by another component. The host SHALL own the deployment's public function surface and its authentication wrappers and SHALL hold no tables duplicating a component's; adding a component SHALL be the deliberate declaration of a new boundary, never a way to reach across an existing one.

#### Scenario: #a-table-has-one-reachable-owner
- **WHEN** any behaviour needs data another component holds
- **THEN** it calls that component's own function; no query, mutation, scheduled job, or migration outside a component reads or writes its tables, so what a component guarantees about its own records cannot be undone from outside it

#### Scenario: #the-host-adds-authority-not-storage
- **WHEN** the mounting host is examined for what it holds
- **THEN** it holds the public surface, the authentication wrappers and the capability declarations, and no table that restates one a component owns — so there is no second copy of a record to fall out of step

#### Scenario: #the-boundary-costs-no-atomicity
- **WHEN** a rule relates records held by two different components
- **THEN** it is still enforceable in one transaction, because the components live in one deployment — the boundary constrains the access path and never the atomicity, which is why it can be drawn strictly

### Requirement: platform-persistence/generated-access-path
Depends on: global-invariants/one-contract-many-surfaces.

Every caller of the deployment SHALL reach it through references generated from the deployment's own definitions, so that a caller no longer matching a function's name, arguments, or result fails its own build rather than its call. No hand-written or string-addressed call path SHALL exist alongside the generated one, and the generation SHALL be part of the build rather than an artifact a repository can hold in a stale state.

#### Scenario: #a-broken-caller-fails-to-build
- **WHEN** a function's arguments or result change
- **THEN** every caller that no longer matches fails to build — the mismatch is found before deployment rather than as a rejected call in a running client

#### Scenario: #no-second-call-path
- **WHEN** the ways to reach the deployment are enumerated
- **THEN** there is one, and it is the generated one; a caller cannot opt out into an untyped path that the type check would not have covered

### Requirement: platform-persistence/schema-change-rollout

A stored shape SHALL change only by a rollout in which every deployed reader can read both the shape it is leaving and the shape it is arriving at: a field is added before anything writes it, written before anything reads it, and removed only once nothing reads it. No step of a rollout SHALL leave a deployed function reading a shape the store does not hold, and no shape change SHALL require the deployment to stop serving.

#### Scenario: #no-step-breaks-a-reader
- **WHEN** a rollout is midway — some records in the old shape, some in the new
- **THEN** every deployed reader handles both, so the rollout has no window in which a read fails and no ordering between deploying code and migrating data that has to be got right

#### Scenario: #removal-is-the-last-step
- **WHEN** a field is being retired
- **THEN** it is removed only after nothing reads it — a change that removes and re-points in one step is not a rollout this permits, however small the record count

#### Scenario: #the-deployment-keeps-serving
- **WHEN** any stored shape changes
- **THEN** the deployment serves throughout; there is no maintenance state in which the platform is down for a schema change, because the discipline above is what makes one unnecessary
