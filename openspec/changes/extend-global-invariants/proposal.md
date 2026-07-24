# Extend global-invariants

## Why

The final spec-migration train disposes every remaining legacy id (modules
03–08). Scattered through those modules is a stratum of cross-cutting rules
that no user-story capability owns — authority placement between runtimes,
the game instance's hermetic seal, the team information boundary, identity
and credential discipline, and the obligation of every client surface to
defer to server-held truth. These pass the admission test in the
`global-invariants` Purpose (each constrains implementers of two or more
capabilities or runtimes, has no user-story owner, and is falsifiable) and
therefore belong in `global-invariants`, alongside the ten requirements
minted when the capability was created from module 02.

## What Changes

- **`global-invariants` gains nine requirements and two extensions.** The
  additions are organised by five clusters (the section structure of
  `design.md`): state ownership and authority placement
  (`state-confined-to-owning-runtime`, `centaur-state-boundary`,
  `transactional-invariant-enforcement`), game-instance hermeticity
  (`game-instance-hermeticity`), cross-team information security
  (`bot-compute-view-confinement`, plus MODIFIED
  `team-granularity-authorization` and
  `security-enforced-outside-the-library`), identity and credential
  discipline (`authenticated-unambiguous-identity`,
  `credential-confinement`), and client truthfulness
  (`one-contract-many-surfaces`, `client-truthfulness`).
- **27 legacy ids retire onto this capability**, recorded in the
  identifier map under this change's name. Four of them are map-entry-only
  retirements onto existing requirements whose text already carries their
  substance; two more retire onto existing requirements that this change
  extends; the rest retire onto the nine new requirements.
- **No other capability is touched.** The seams noted in the disposition
  work (e.g. the invisibility-filter mechanics, API/frontend parity as an
  integrator story, the trust-model Purpose prose) are owned by their
  respective train changes.

## Carving rationale

Per the carving checkpoint (assignment-matrix Q5, confirmed by the author):
**all `global-invariants` additions and modifications in the train are
authored by this one change.** The train's concurrency guard requires each
requirement to be touched by exactly one open change; `global-invariants`
requirements have no user-story owner by definition, so without a single
nominated owner every train change would have a claim on them. This change
is that owner: any train change that needs a cross-cutting rule cites the
identifiers minted or extended here (legal while all changes are open,
because the reference lint overlays every open change's deltas).

One id crosses a change boundary by author decision: the documented
malicious-server trust trade-off retires here onto
`security-enforced-outside-the-library` (map note records the
accepted-exfiltration residue as rationale, not behaviour), while the
corresponding trust-model prose lands in team-server-management's Purpose —
authored by that change, not this one.

## Capabilities

### Modified: global-invariants

Nine ADDED requirements; two MODIFIED (`team-granularity-authorization`
gains the observation-side sentence and a spectator scenario;
`security-enforced-outside-the-library` is broadened from "never the Server
library" to "never any client's presentation" and gains a forked-app
scenario). Dependencies unchanged: game-engine only.

## Disposition of the 27 legacy ids

The legacy requirements and review items this change absorbs are recorded
in the identifier map under this change's name. Two existing invariants
were extended rather than duplicated, and four absorptions retire
map-entry-only onto existing requirements whose text already carries their
substance.

The `transactional-invariant-enforcement` requirement mints the one
constraint-mining lead the atlas routed to `global-invariants` (uniqueness
and exclusivity guards are application-side and silently violable if run
outside the mutation's transaction); with gi ownership bound to this
change, minting it anywhere else in the train is barred, so it lands here.

## Impact

- `openspec/changes/extend-global-invariants/specs/global-invariants/spec.md`
  — the delta (9 ADDED, 2 MODIFIED).
- **Retirements**: this change's legacy absorptions are recorded in the
  identifier map (completed with the corpus retirement in this PR); the
  migration planning artifacts are archived under
  `legacy-spec-archive/spec-migration/`.
- No code changes.
