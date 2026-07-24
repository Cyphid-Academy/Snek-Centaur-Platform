# Migrate: identity-and-authorization

## Why

The legacy corpus scatters one user story — *who someone is on the platform
and how they obtain access to a game* — across six modules: identity kinds
and token flows in module 03, credential hosting in module 02, connection
admission in module 04, issuance gating and the admin role in module 05,
mutation authorization in module 06, and the web app's sign-in/custody
mirrors in module 08. Every other capability in the final migration train
sits downstream of this story (the DAG in the capability map, archived
under `legacy-spec-archive/spec-migration/`, names it a root), so the train
mints it first among the user-story capabilities.

## Carving decision

Per the author-settled carving (capability map + assignment matrix, Phase B
synthesis, 2026-07-24):

- **`identity-and-authorization` owns**: signing in, identity kinds, roles
  (admin), credential/token issuance and validation, and who may obtain
  access to a game. It is a **root capability — Depends on: none**; its
  spec text cites no other capability, not even game-engine.
- **Boundary rulings applied here**: coach-token *issuance* is owned here
  (mirroring spectator tokens) with consumption semantics left to the
  live-observation story; the roster snapshot's *authorization binding* is
  owned here, while snapshot storage/orchestration belongs to the
  game-lifecycle story and the roster mutation-freeze to the
  team-management story; cross-cutting identity rules (kind
  distinguishability, no anonymous mutators, key-custody transmission,
  access-follows-identity) stay with `global-invariants` and are authored
  by the train's `extend-global-invariants` change, not here.
- **Dedupe clusters authored once here** (each constituent id retires onto
  the one requirement): credential scoping; the admin role; discovery of
  token-verification material; Convex as sole credential issuer; and
  connection-admission validation.
- **Crypto-neutrality**: requirement text names no cryptographic
  primitives; signature schemes and token formats are mechanism (see
  `design.md`). The signing-independence invariant *is* carried as a
  requirement — it is the deliberate architectural commitment the legacy
  review affirmed, stated without naming schemes.

## What Changes

- **New capability: `identity-and-authorization`** — 22 requirements,
  ADDED-only mint delta with a `## Purpose` preamble declaring "Depends
  on: (none — root alongside game-engine)."
- **Retirements**: this change's legacy absorptions are recorded in the
  identifier map (completed with the corpus retirement in this PR); the
  migration planning artifacts are archived under
  `legacy-spec-archive/spec-migration/`. Three matrix-designated
  code-mechanism ids retire as note-only tombstones (the
  admin-designation mechanism, twice stated, and signing-material
  maintenance).
- **6 legacy review items' edge cases are encoded as scenarios** (Google
  specifically binding; email fork keeps history; expiry never
  disconnects; signing independence; credential dead at game finish) or
  carried as authoring policy (crypto-neutrality).
- **Constraint-mined requirements** (see `design.md`): per-request
  liveness re-checks (`live-game-issuance`), reject-before-touching-state
  admission, admin-extends-read-only, memory-only client token custody
  (`client-credential-custody`), and client-invisible admission records
  (`admission-records-private`).

## Impact

- New: `openspec/specs/identity-and-authorization/spec.md` (folded at
  archive; 22 requirements).
- `openspec/config.yaml` context capability list gains
  `identity-and-authorization` at archive.
- Code citations of retired ids (currently `03-REQ-001` in
  `packages/convex-snek-platform`) sweep to named identifiers.
- Downstream train changes may cite `identity-and-authorization/*` while
  this change is open (reference-lint overlay).

## Open Questions

None. The carving, DAG position, dedupe clusters, and boundary rulings
were settled with the author in the Phase B synthesis; the two judgment
calls delegated to this change (the disposition of the credential-to-team
resolution id and of the admission-record-privacy constraint lead) are
resolved and recorded in `design.md`, and no contradiction or gap
requiring a human decision surfaced while re-authoring from the legacy
text.
