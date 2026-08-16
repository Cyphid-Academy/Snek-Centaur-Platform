# Migrate: identity-and-authorization

## Why

The legacy corpus scatters one user story — *who someone is on the platform
and how they obtain access to a game* — across six modules: identity kinds
and token flows in module 03, credential hosting in module 02, connection
admission in module 04, issuance gating and the admin role in module 05,
mutation authorization in module 06, and the web app's sign-in/custody
mirrors in module 08. Every other capability in the final migration train
sits downstream of this story (the DAG in the capability map, archived
under `docs/spec-migration/`, names it a root), so the train
mints it first among the user-story capabilities.

## Carving decision

Per the author-settled carving (capability map + assignment matrix, Phase B
synthesis, 2026-07-24):

- **`identity-and-authorization` owns**: signing in, identity kinds, roles
  (admin), credential/token issuance and validation, and who may obtain
  access to a game. It is a **root of the user-story DAG — Depends on:
  global-invariants** and nothing else; its spec text cites no peer or
  downstream capability, not even game-engine, and gi sits beneath it
  (gi depends only on game-engine), so the graph stays acyclic.
- **Boundary rulings applied here**: coach-token *issuance* is owned here
  (mirroring spectator tokens) with consumption semantics left to the
  live-observation story; the roster snapshot's *authorization binding* is
  owned here, while snapshot storage/orchestration belongs to the
  game-lifecycle story and the roster mutation-freeze to the
  team-management story; cross-cutting identity rules (kind
  distinguishability, no anonymous mutators, key-custody transmission,
  access-follows-identity) stay with `global-invariants` and are authored
  by the train's `extend-global-invariants` change, not here — this spec
  cites them where its own soundness rests on them (see `design.md`).
- **Dedupe clusters authored once here** (each constituent id retires onto
  the one requirement): credential scoping; the admin role; discovery of
  token-verification material; the platform's Convex deployment as sole
  credential issuer; and connection-admission validation.
- **The delegation model is authored here once, not per relationship.** A
  Snek Centaur Server earning a team's game credential and a peer Cyphid system
  obtaining a capability token are the same mechanism with different
  registrations, so the assertion exchange, the issuer registry, the
  capability claim and the capability registry all live here. What each
  registration means to the story that uses it — homing and whitelist
  admission, the integration surface's client registrations — belongs to
  those stories.
- **Crypto-neutrality**: requirement text names no cryptographic
  primitives, no document formats, no claim names, and no library;
  signature schemes and token formats are mechanism (see `design.md`).
  Compromise containment *is* carried as a requirement — the deliberate
  architectural commitment the legacy review affirmed — stated as the
  audience binding that delivers it rather than as a choice of scheme.

## What Changes

- **New capability: `identity-and-authorization`** — 28 requirements,
  ADDED-only mint delta with a `## Purpose` preamble declaring "Depends
  on: global-invariants."
- **Retirements**: this change's legacy absorptions are recorded in the
  identifier map (completed with the corpus retirement in this PR); the
  migration planning artifacts are archived under
  `docs/spec-migration/`. Three matrix-designated
  code-mechanism ids retire as note-only tombstones (the
  admin-designation mechanism, twice stated, and signing-material
  maintenance).
- **Legacy review items' edge cases are encoded as scenarios** (Google
  specifically binding; expiry never disconnects; compromise contained;
  credential dead at game finish) or carried as authoring policy
  (crypto-neutrality).
- **Constraint-mined requirements** (see `design.md`): per-request
  liveness re-checks (`live-game-issuance`), reject-before-touching-state
  admission, admin-extends-read-only, memory-only client token custody
  (`client-credential-custody`), client-invisible admission records
  (`admission-records-private`), build-time totality of the capability
  registry, principal-kind gating of team administration, proactive
  credential renewal, and the structured capability claim.

## Impact

- New: `openspec/specs/identity-and-authorization/spec.md` (folded at
  archive; 28 requirements).
- `openspec/config.yaml` context capability list gains
  `identity-and-authorization` at archive.
- Code citations of retired ids (currently `03-REQ-001` in
  `packages/convex-snek-platform`) sweep to named identifiers.
- Downstream train changes may cite `identity-and-authorization/*` while
  this change is open (reference-lint overlay).

## Open Questions

1. **Cyphid-wide identity reconciliation: who is authoritative for a person
   across systems?**
   - **Context**: `linked-provider-credentials` makes the platform's own user
     record the durable identity and a provider account a credential linked to
     it. A sibling Cyphid system will hold its own user table on the same
     terms.
   - **Question**: does the federation designate one system authoritative for
     Cyphid identity, define a propagation obligation between systems, or
     accept divergence with a documented reconciliation procedure?
   - **Options**: (A) one authoritative identity system, others linking to it;
     (B) a propagation obligation on every system that links or retires a
     credential; (C) accept divergence and document reconciliation.
   - **Decision (author, 2026-07-27)**: Option A, deferred. A centralised
     Cyphid identity service will be built, and CGP users will be refactored
     onto it then. Until it exists, no reconciliation obligation is taken on —
     and the affordance that would create divergence, in-platform rebinding of
     a user's Google account, is removed from this capability rather than
     built. The provider-to-user mapping stays one-to-one in both directions,
     which is what makes the later refactor a re-pointing of one table rather
     than a reconciliation of histories.

2. **Can a game instance's reducers read arbitrary claims from a validated
   credential, or only the derived identity?**
   - **Context**: `game-token-contents#subject-alone-decides-the-role` makes
     a spectator's read-only status structural by putting the role in the
     subject, which is worth doing on its own terms only if the alternative
     exists.
   - **Question**: is the capability claim readable inside the instance, or
     is the derived identity all a reducer ever sees?
   - **Decision (verified against the runtime, 2026-07-27)**: claims **are**
     readable. A reducer reaches the validated token through the reducer
     context (`ctx.sender_auth().jwt()` in Rust, `ctx.senderAuth.jwt` in
     TypeScript), with `issuer`, `subject` and `audience` as direct accessors
     and arbitrary custom claims through the raw payload. Identity remains
     the hash of issuer and subject.
   - **Consequence**: subject-encoded roles are kept, and the requirement
     forbids deciding a role from a claim explicitly — being able to read one
     is what makes the prohibition worth stating. The structural property is
     that a spectator and an operator are *different identities*, so the
     instance's seeded permissions exclude one of them with no check to omit.
     Readable claims also mean in-game authorization finer than team
     granularity is reachable later if it is ever wanted.

3. **What should the operator application do when renewal fails and the
   chess clock is running?**
   - **Context**: holders renew ahead of expiry so a refusal never lands on a
     turn. That leaves the case where the platform is briefly unreachable
     during the renewal window.
   - **Decision (author, 2026-07-27)**: retry silently while the credential
     in hand is still valid, and surface the loss when it actually lapses.
     This is an extreme edge case signalling a wider failure, and a team
     spending turn clock through it costs little at the margin. Warning
     earlier would spend the operator's attention on something they cannot
     act on: standing down or handing off would take the same unreachable
     platform. Minted as
     `token-lifetime-and-refresh#renewal-failure-is-quiet-until-it-bites`.
