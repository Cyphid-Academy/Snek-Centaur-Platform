# Migrate: platform-integrations

## Why

The legacy corpus scatters one integrator story — *an admin automates the
platform from outside* — across three modules: programmatic authorization
in module 03, the integration surface and webhooks in module 05, and the
management view in module 08. No single legacy module owns the story a
user experiences as one thing: register a system, drive the platform's
management surface programmatically, and be told when games start and end.
The final migration train mints this capability last (it is a leaf of the
DAG), completing the disposal of modules 03, 05, and 08.

## Carving decision

Per the author-settled carving (capability map + assignment matrix, Phase B
synthesis, 2026-07-24; open question Q2 resolved **yes, mint**):

- **`platform-integrations` owns**: integration clients (registration,
  ceilings, revocation), the platform's public function surface as the
  integration surface, and webhooks (subscriptions, the two lifecycle
  events, delivery semantics).
  The rejected alternative — client registration to accounts-and-profiles,
  webhooks to game-lifecycle, the API surface scattered per owning story —
  would have dismembered a workflow one integrator experiences end to end.
- **Depends on: identity-and-authorization, game-lifecycle,
  global-invariants.** Identity supplies the admin role, credential-custody
  hygiene, and server-side mutation authorization; game-lifecycle supplies
  the launch orchestration the API triggers, the status transitions the
  webhooks fire on, and the persistence/teardown bracket that delivery
  must never block; global-invariants supplies the four invariants this
  surface's soundness rests on — one contract behind every surface, the
  closed enumeration of identity kinds, credential confinement, and
  instance hermeticity (see `design.md`). The declaration is extended
  whenever a citation is warranted, so this list grows if a later
  requirement's soundness depends on a further invariant. The domain
  objects the API administers (teams, rooms) are named as vocabulary, not
  cited — their rules live with their owning capabilities and reach the
  API through the parity requirement.
- **Registration is admin-only; the client's reach is its own** (the
  legacy corpus's own resolved review position, carried forward with the
  bearer credential replaced): only admins register clients, and the one
  legacy passage predating that resolution (the module 08 view's "every
  authenticated user") is re-authored admin-only. What a client may do is
  the ceiling on its registration, not the registrar's authority, which is
  what keeps this surface consistent with the identity capability's
  strictly observational admin role: the API's mutating reach is its
  management surface, and no client ever acts inside a game or touches
  Centaur state (see `design.md`).
- **Endpoint families are behavioural scope statements**, per the author
  decision: the spec enumerates what must be administrable
  programmatically; URL shapes, payload schemas, and status codes are
  mechanism.

## What Changes

- **New capability: `platform-integrations`** — 11 requirements,
  ADDED-only mint delta with a `## Purpose` preamble declaring "Depends
  on: identity-and-authorization, game-lifecycle, global-invariants."
- **Retirements**: this change's legacy absorptions are recorded in the
  identifier map (completed with the corpus retirement in this PR); the
  migration planning artifacts are archived under
  `docs/spec-migration/`. Every absorption has a
  named-requirement target — no code-mechanism tombstones; every id in
  this cluster is behavioural.
- **1 legacy review item's decision is encoded as a scenario**: the
  deliberate absence of any game-creation event — `game_start` fires only
  at the `playing` transition
  (`lifecycle-event-notifications#no-creation-event`).
- **Constraint-mined scenarios** (see `design.md`): a client's reach not
  tracking its registrar's standing
  (`integration-clients#a-client-is-not-its-registrar`); revocation
  stopping issuance at once with revoked records retained for audit
  (`client-management#revocation-immediate`, `#revoked-records-retained`);
  team administration granted on the recorded ceiling
  (`client-capability-bounds#a-roster-system-may-run-its-rosters`);
  deduplication-identifier stability across redeliveries
  (`at-least-once-delivery#same-id-on-every-redelivery`); and the
  delivery destination admitted at registration *and* re-checked against
  the address each attempt reaches
  (`delivery-destination-admission#rechecked-against-the-address-actually-reached`).

## Impact

- New: `openspec/specs/platform-integrations/spec.md` (folded at archive;
  11 requirements).
- `openspec/config.yaml` context capability list gains
  `platform-integrations` at archive.
- No code citation sweep: no code currently cites any id this change
  retires.

## Open Questions

None. The mint itself, which peer stories this capability may cite, and the
admin-only registration model were settled with the author in the Phase B
synthesis. Two decisions this change makes beyond those follow from the
author's direction and are recorded in `design.md`: there is no
integration-specific request surface — external callers invoke the
platform's own public functions, and capabilities are defined in terms of
them — and team administration is in the grantable set, because the
integration this surface exists for is a roster system that owns its own
classes.

Two questions raised during review are now resolved:

- **Decision — this capability owns delivery-destination admission.** A
  subscription's only stated field constraint was "a delivery URL", so a
  registered client could aim the platform's own outbound deliveries at
  the deployment's endpoints or at the instance-provisioning host. No
  invariant covers it (`global-invariants/credential-confinement` governs
  credentials, and a webhook payload carries none) and no capability owns
  egress policy, so the capability that lets an outside party choose the
  address takes it: `delivery-destination-admission` requires HTTPS and a
  publicly routable destination, checked **at registration and again at
  each delivery attempt** because a name can be re-pointed afterwards.
  Rationale and the declined dependency candidates are in `design.md`.
- **Decision — configuring a game is inside the documented programmatic
  surface.** Administering games is already in the floor, and an
  integrator cannot start a game without deciding what game is played, so
  the not-yet-launched configuration edit is inside the promise
  (`functions-are-the-api#configuring-a-game-is-inside-the-surface`).
  The reach is granted on the *function's* principal-kind declaration,
  not by anything this capability or `game-configuration` says about
  permissions — that capability carries no permission gating of its own.
  What it must expose is recorded as a seam in `tasks.md` §3.6.
