## Why

Fourth change of the final spec-migration train. The "team acquires and
runs its Snek Centaur Server" story — nominating a server domain, the
hosting relationship, the game-start invitation flow that hands the server
its team's credential, the healthcheck, and the forkable reference
application — has no vocabulary owner today: its substance is scattered
across module 02 (nomination, the healthcheck endpoint, the many-to-many
hosting relationship, the unified app's scope), module 03 (the invitation
flow and the no-secret-at-nomination rule), module 05 (nomination
mechanics and healthcheck recording), and module 08 (the invitation
endpoint, multi-team hosting in the app, the forkable repository).
Re-authoring it as one capability puts the whole workflow in one readable
place and retires 23 legacy ids plus one review item.

## Carving decision

Mint **`team-server-management`** exactly as drawn in the capability map
and assignment matrix (author-approved with the capability set and DAG).
The legacy requirements and review items this change absorbs are recorded
in the identifier map under this change's name (08-REQ-001 retires as a
dedupe of 02-REQ-059). Declared dependencies:
**identity-and-authorization and team-management** (the DAG ceiling for
this capability).

Deliberate boundaries:

- **Refusal consequences are not authored here.** The invitation
  requirements cover delivery, credential carriage, the accept/reject
  surface, and whitelisting; what a rejection or timeout means for the
  game (abort vs forfeit vs walkover) is the game-lifecycle story's, per
  the author decision routing legacy 03-REQ-056 there.
- **Start-time healthcheck branching is not authored here.** The
  healthcheck requirement covers the endpoint contract and availability
  reporting only; how a game start reacts to an unhealthy server (legacy
  05-REQ-036 and its review item) is likewise the lifecycle story's.
- **Nomination gate mechanics are cited, not re-owned.** The open sibling
  mint `team-management` already authors the captain-only gate over the
  nomination field (team-management/captain-authority) and its mid-game
  freeze (team-management/roster-freeze); this capability authors
  nomination *semantics* — unilateral, secretless, validity implicit,
  clearable, required to play — and cites those gates.
- **The trust trade-off is Purpose prose, not a requirement.** Legacy
  03-REQ-067 (a malicious server can exfiltrate what its visitors can
  legitimately read; the platform accepts this) is not falsifiable
  behaviour. Its enforceable half was retired onto the global-invariants
  enforcement-model requirement by the train's extend-global-invariants
  change; the user-facing trust statement lands here as the Purpose's
  trust-model paragraph, per the author-resolved matrix question.
- **08-REQ-023f retires onto the sibling's view requirement.** Its
  substance (the Team Management view exposes no bot/heuristic/operator
  configuration) is fully authored by the open sibling's
  team-management/team-management-view; this change retires the id as a
  dedupe map entry targeting that requirement rather than double-owning
  the scope rule.
- **The static-host residue is not re-authored.** Module 02's parked
  plain-text residue (outside games the server is a static host; visitor
  data flows through visitors' own connections) is already carried by the
  existing global-invariants ephemeral-credentials requirement, and the
  binding 02-REQ-059 text does not itself state it; the unified-app
  requirement here stays to the binding scope-and-sameness substance.

## What Changes

- **New capability `team-server-management`** (mint delta, ADDED-only, 11
  requirements): captain nomination semantics, the nomination-to-play
  gate (no pure-human teams), servers' lack of platform identity, the
  many-to-many shared-hosting relationship with hosted-team-scoped
  surfaces, game-invitation delivery (HTTPS-only, one POST per team,
  concurrent, bounded thirty-second window, DNS-as-ownership-proof),
  credential carriage (invitations as the sole secret channel), the
  accept/reject surface with the reference implementation's default-open
  whitelist, the receiving endpoint's discipline (signature check,
  hosted-team check, idempotency, in-process in-memory credential
  custody), the unauthenticated minimal healthcheck with on-demand
  recording, the single unified web application every server serves, and
  the forkable reference app with its enumerated fork-stable
  compatibility surface.
- **UI mirrors folded**: the lobby healthcheck-ping affordance
  (08-REQ-027g) becomes the #member-triggered-check scenario of the
  healthcheck requirement, phrased surface-generically so this capability
  never names downstream room vocabulary.
- **Retirements**: this change's legacy absorptions are recorded in the
  identifier map (completed with the corpus retirement in this PR); the
  migration planning artifacts are archived under
  `legacy-spec-archive/spec-migration/`. 03-REQ-067 gains no entry here —
  its map entry is authored by extend-global-invariants; this change only
  lands its Purpose prose.

## Impact

- New: `openspec/changes/migrate-team-server-management/specs/team-server-management/spec.md`
  (folded to `openspec/specs/team-server-management/spec.md` at archive).
- `openspec/config.yaml` context capability list gains
  `team-server-management` (at archive).
- Code citations: nomination mutations, the invitation sender and
  endpoint, the healthcheck action and endpoint, and the reference-app
  packaging gain `// spec: team-server-management/...` citations when the
  implementation lands.

## Open Questions

1. **Whitelist criteria: does "by player email" survive the email-free
   data flow?**
   - **Context**: the binding legacy text (03-REQ-055) specifies the
     reference implementation's whitelist as "by player email or Centaur
     Team ID". But the legacy corpus elsewhere converged on an email-free
     data flow to servers: the invitation's roster snapshot deliberately
     carries operator user ids, not emails, and the module 08/05 line is
     that no query or view ever exposes an email. A server therefore has
     no platform-supplied email data to match a whitelist entry against —
     the email criterion appears unimplementable as written without
     re-introducing email disclosure to servers.
   - **Question**: should the whitelist's matchable keys be authored
     abstractly (specific criteria are reference-implementation
     mechanism), restricted to team identity only, or kept verbatim
     (email + team id) with an explicit email-disclosure carve-out in the
     invitation payload?
   - **Options**: (A) abstract — the requirement states a whitelist
     restricting "which teams it will host", default open; the matchable
     identifier set is code-level, resolvable then against whatever the
     payload carries. (B) team-id only — narrow the binding text on the
     grounds the email half is dead under the email-free flow. (C) keep
     email — requires the invitation payload to carry roster emails,
     contradicting the email-free roster decision routed to
     accounts-and-profiles.
   - The delta is currently authored per option A (the conservative
     reading that neither invents an email channel nor silently deletes
     the legacy criterion); a human decision is required before archive.
   - **Decision (author, 2026-07-24)**: Option B — team identity only. The email criterion is dead under the email-free data flow; invitation-acceptance now states the whitelist is keyed by team identity.
