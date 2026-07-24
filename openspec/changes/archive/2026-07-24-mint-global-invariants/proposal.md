## Why

Legacy module 02 ("Platform Architecture") is the most cross-cutting module
in the numeric-era corpus. Re-authoring it exposed a carving problem bigger
than the module: the legacy modules were carved by **runtime/artifact**
(implementation sequencing), which saws user-facing workflows along
implementation seams — a single story like "the game finishes" or "an
operator takes a snake" is scattered across modules because several
runtimes touch it. Module 02's migration is therefore also the pivot to
**capability-at-a-time carving by user-story locality**, with module 02
itself contributing exactly one capability now: the cross-cutting
invariants no user story owns.

## What Changes

- **Migration plan pivots to capability carving by user story.** The
  prospective capability set lives in `docs/spec-migration/capability-map.md`
  (draft; each mint remains a carving decision with the author). Legacy
  bindingness becomes **per identifier**: an id retires when it gains an
  identifier-map entry; otherwise it stays binding in its legacy module
  file — so modules can migrate partially, and a module's cutover row flips
  to Migrated only when its last id is disposed. The reference lint already
  works per id (map entries are the tombstone source); module 02 therefore
  does **not** join the lint's whole-module retired set.
- **New capability: `global-invariants`** (10 requirements, ADDED-only,
  depends only on `game-engine`). Admission test, written into its Purpose:
  a requirement belongs iff it constrains implementers of two or more other
  capabilities or runtimes, no single user-story capability owns it, and it
  is falsifiable. It replaces the earlier, broader `platform-architecture`
  draft, whose application-level content is instead **parked**.
- **Parked requirements.** Module-02 requirements owned by prospective
  user-story capabilities are parked in
  `docs/spec-migration/module-02-parked.md`: still binding in the legacy
  file, prospective home recorded, drafted requirement text preserved. The
  migration audit learns to read parked ledgers, so every module-02 id is
  still accounted for (mapped or parked), and parked ids cannot be silently
  dropped.
- **Capability rename inside the change.** `game-rules` is renamed to
  `game-engine` via a `## RENAMES CAPABILITY` delta (the capability-rename
  tooling in PR #17): `specs/game-rules/` stays until the fold moves it at
  archive, code and the other capabilities' specs are swept to the new name
  in the Implement phase (resolving via the open-change overlay), and
  `game-engine/runtime-portability` is added by the same delta. The
  named-identifier lineage map records the rename so identifiers in
  archived changes remain traceable.
- **Redundant requirements omitted, not dropped.** Legacy ids whose
  substance a later capability's own data-layer/mechanism rules already
  state get note-only tombstones carrying a machine-readable `pendingRehome`
  marker naming the module that owns their substance; the audit fails if
  that module's ids are later disposed with the marker still pending.

## Capabilities

### New: global-invariants

The cross-cutting invariants of the platform: runtime ownership, the single
Convex deployment, SpacetimeDB instance isolation, authoritative turn
resolution, the one shared engine, team-granularity authorization, security
enforcement outside the Server library, the Server trust boundary,
ephemeral game credentials, and access-follows-identity. Depends on
`game-engine`.

## Disposition of the 60 legacy ids

Buckets: **own** (becomes / folds into a `global-invariants` requirement),
**park** (owned by a prospective user-story capability → parked ledger,
still binding in the legacy file), **omit** (substance owned by a later
module's own rules → note-only tombstone with `pendingRehome`), **design**
(rationale-only, recorded in `design.md`).

| Requirement(s) | Bucket | Home / note |
|---|---|---|
| 001 | own | runtime-ownership |
| 002, 015 | own | single-convex-deployment |
| 004 | own | spacetimedb-instance-isolation |
| 007, 008 | own | authoritative-turn-resolution (cites game-engine) |
| 034, 035, 036, 037 | own | one-shared-engine (cites game-engine) |
| 017 | own | team-granularity-authorization |
| 031ʳ, 033 | own | security-enforced-outside-the-library |
| 053, 054, 023 | own | server-trust-boundary |
| 055ᶜ, 056ᶜ, 057 | own | ephemeral-game-credentials |
| 058, 060, 061ᵃ, 062 | own | access-follows-identity |
| 003, 019, 020, 021, 022, 022a, 051 | park | → game-lifecycle |
| 050 | park | → game-configuration |
| 016 | park | → identity-and-authorization |
| 009, 010 | park | → live-game-observation |
| 011, 012, 018, 038, 039, 040, 041 | park | → operator-control |
| 013, 014, 065 | park | → replay-and-audit |
| 005, 006, 052, 029, 055ʰ, 043, 059, 064 | park | → team-server-management |
| (new, constraint-mined) | park | extensible-centaur-state-slots → decision-transparency |
| 024, 027 | omit | → centaur-state (06) |
| 025, 026 | omit | → bot-framework (07) |
| 028, 032a | omit | → centaur-server-app (08) |
| 030 | omit | → 08 (library) / 07 / 03 |
| 032, 056ᵇ | omit | → bot-framework (07) |
| 061ˡⁱᶜ, 063 | design | licensing stance / malicious-server trust trade-off — in design.md |

ᶜ the no-credentials-at-rest / credential-scoping halves of 055 and 056.
ʰ the static-web-host residue of 055. ᵇ the bot-compute half of 056. ᵃ the
"no privileged deployment / independent deployments" half of 061. ʳ the
"security holds regardless of library use" residue of 031 (its
support-policy half is not migrated). ˡⁱᶜ the open-source licensing
statement.

## Impact

- New: `openspec/specs/global-invariants/spec.md` (folded at archive; 10
  requirements).
- New: `docs/spec-migration/` — staging README, prospective capability map,
  module-02 parked ledger (28 parked ids + one constraint-mined draft).
- `legacy-spec-archive/maps/identifier-map.json`: module-02 entries for
  owned/omitted/design ids only (parked ids deliberately get none — that is
  what keeps them citable and binding).
- New `openspec/maps/identifier-lineage.json`: records the `game-rules →
  game-engine` capability rename.
- `scripts/spec-migration/audit-module.mjs`: reverse-citation check,
  `pendingRehome` enforcement, and parked-ledger support (an id must be
  mapped or parked; parked ids are exempt from stale-code-reference
  flagging).
- Migration-plan documents updated for capability-at-a-time carving:
  `openspec/README.md` (cutover semantics), `docs/openspec-migration.md`
  (§6 plan revision), `openspec/config.yaml` migration note.
- Code citations converted from owned `02-REQ-*` ids to named identifiers;
  `packages/convex-snek-platform` `GameStatus` terminal literal
  `ended → finished`.
- Cutover row for module 02 flips to **Partial** at archive (not Migrated —
  parked ids remain binding); `global-invariants` added to the config
  context capability list (at archive). Module 02 is NOT added to the
  lint's `MIGRATED_MODULES`.

## Open Questions

All resolved with the author during design (recorded in `design.md`): the
capability-at-a-time pivot and its user-story carving grain, the
`global-invariants` membership and name, per-identifier partial
bindingness, the parked-ledger mechanism, the `finished` terminal term, and
the design-rationale treatment of 061-licensing and 063. One reconciliation
is deliberately deferred and recorded on the parked entry: staged-move
last-write-wins/consume-and-clear vs the append-only staged-moves log
(resolved when `operator-control` is authored).
