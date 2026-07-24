# Migrate: platform-integrations

## Why

The legacy corpus scatters one integrator story — *an admin automates the
platform from outside* — across three modules: API-key authorization in
module 03, the HTTP API surface and webhooks in module 05, and the
key-management view in module 08. No single legacy module owns the story a
user experiences as one thing: obtain a key, drive the platform's
management surface programmatically, and be told when games start and end.
The final migration train mints this capability last (it is a leaf of the
DAG), completing the disposal of modules 03, 05, and 08.

## Carving decision

Per the author-settled carving (capability map + assignment matrix, Phase B
synthesis, 2026-07-24; open question Q2 resolved **yes, mint**):

- **`platform-integrations` owns**: API keys (creation, custody, scope,
  revocation), the HTTP API as a behavioural surface, and webhooks
  (subscriptions, the two lifecycle events, delivery semantics). The
  rejected alternative — keys to accounts-and-profiles, webhooks to
  game-lifecycle, the API surface scattered per owning story — would have
  dismembered a workflow one integrator experiences end to end.
- **Depends on: identity-and-authorization, game-lifecycle** — exactly the
  DAG ceiling. Identity supplies the admin role, credential-custody
  hygiene, and server-side mutation authorization; game-lifecycle supplies
  the launch orchestration the API triggers, the status transitions the
  webhooks fire on, and the persistence/teardown bracket that delivery
  must never block. The domain objects the API administers (teams, rooms)
  are named as vocabulary, not cited — their rules live with their owning
  capabilities and reach the API through the parity requirement.
- **Admin-only keys** (the legacy corpus's own resolved review position)
  are carried as binding: keys are an admin-only affordance with global
  scope, and the one legacy passage predating that resolution (the module
  08 view's "every authenticated user") is re-authored admin-only. The
  key scope is stated so it stays consistent with the identity
  capability's strictly observational admin role: the API's mutating
  reach is its management surface, and no key ever acts inside a game or
  touches Centaur state (see `design.md`).
- **Endpoint families are behavioural scope statements**, per the author
  decision: the spec enumerates what must be administrable
  programmatically; URL shapes, payload schemas, and status codes are
  mechanism.

## What Changes

- **New capability: `platform-integrations`** — 10 requirements,
  ADDED-only mint delta with a `## Purpose` preamble declaring "Depends
  on: identity-and-authorization, game-lifecycle."
- **Retirements**: this change's legacy absorptions are recorded in the
  identifier map (completed with the corpus retirement in this PR); the
  migration planning artifacts are archived under
  `legacy-spec-archive/spec-migration/`. Every absorption has a
  named-requirement target — no code-mechanism tombstones; every id in
  this cluster is behavioural.
- **1 legacy review item's decision is encoded as a scenario**: the
  deliberate absence of any game-creation event — `game_start` fires only
  at the `playing` transition
  (`lifecycle-event-notifications#no-creation-event`).
- **Constraint-mined scenarios** (see `design.md`): per-request re-check
  that the key's creator is still an admin
  (`admin-api-keys#creator-no-longer-admin`); immediate revocation with
  revoked records retained for audit (`key-management#revocation-immediate`,
  `#revoked-records-retained`); and deduplication-identifier stability
  across redeliveries (`at-least-once-delivery#same-id-on-every-redelivery`).

## Impact

- New: `openspec/specs/platform-integrations/spec.md` (folded at archive;
  10 requirements).
- `openspec/config.yaml` context capability list gains
  `platform-integrations` at archive.
- No code citation sweep: no code currently cites any id this change
  retires.

## Open Questions

None. The mint itself (Q2), the dependency ceiling (Q8), the full-train
disposal (Q6), and the admin-only key model were settled with the author
in the Phase B synthesis; the two reconciliations this change performs —
the module 08 view text superseded by the admin-only resolution, and the
key-scope phrasing kept consistent with the strictly observational admin
role — follow directly from those settled decisions and are recorded in
`design.md`. No contradiction or gap requiring a fresh human decision
surfaced while re-authoring from the legacy text.
