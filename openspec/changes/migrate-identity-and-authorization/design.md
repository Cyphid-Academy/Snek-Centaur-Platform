# Design — migrate-identity-and-authorization

## Context

This change mints the train's first user-story capability from ~59 legacy
ids across modules 02, 03, 04, 05, 06, and 08 (module 03 is the core).
Legacy text was binding throughout; the assignment matrix supplied routing
only. The decisions below record how the substance was compressed to 22
requirements at intent grain and why the boundaries fall where they do.

## Decisions

### Root of the DAG: no dependencies, deliberately

The capability declares **Depends on: none**. Its spec speaks of games,
teams, snakes, and instances as vocabulary but cites no other capability's
requirements — not even game-engine's. This is what lets every other
user-story capability (team-management, game-lifecycle, live-game
observation, operator control, replay) cite identity requirements without
cycles. *If reversed* — e.g. citing game-lifecycle for "the game is
playing" or team-management for coach designation — the DAG inverts:
downstream capabilities could no longer cite identity requirements without
a cycle, and the train's archive order collapses. Where this spec needs a
downstream concept it names the observable fact ("a game currently being
played", "a designated coach of a participating team") without citing the
capability that governs it.

### Crypto-neutrality: primitives are mechanism

Upholding the legacy corpus's own resolved position (its review record
decided requirements stay neutral on cryptographic constructions), no
requirement names JWT, OIDC, JWKS, RSA/RS256, Ed25519, HMAC, claim names,
endpoint URLs, or key-storage locations. The behavioural substance those
primitives served is what is required: tokens are *signed*; verification
material is *published at stable well-known addresses*; validation needs
*no per-instance secret*; signing material per credential type is
*independent under compromise*. Concretely: the legacy OIDC-discovery pair
became `verification-without-shared-secrets`; the claim schema became
`game-token-contents` (game binding, role+identity subject, expiry); the
"platform-wide RSA key pair" id retires onto the same requirement with its
key-management detail left to code. The signing-material-maintenance id
(no external key infrastructure at game time) is retired note-only as
mechanism — its observable residue is already covered by
issuance/validation requirements. *If reversed* (naming primitives in
spec), swapping a scheme — say a validator gaining native public-key
support, or rotating signature algorithms — would falsely read as a
behavioural spec change, and the spec would compete with code as the
source of truth for mechanism. The two concrete numbers kept (two-hour
token lifetime; the exactly-once plaintext disclosure) are behavioural
commitments the legacy reviews affirmed deliberately, not primitives.

### Trust and identity model: Google + canonical email, forks over migration

Two legacy review decisions are carried as binding requirement text:
**Google specifically** (not "a federated provider") because Google-account
emails are stable identifiers in systems beyond this platform — scenario
`#google-account-specifically` exists precisely so provider-neutral drift
is visible as a violation; and **email as canonical identity** with
merge-on-same-email and fork-on-email-change semantics — the fork keeps
all history on the old identity with no migration path
(`#email-fork-keeps-history`). *If reversed* (subject-canonical identity,
or account migration): external systems keyed on email desynchronize from
the platform's notion of "who", and historical attribution gains a
mutable indirection it was designed never to have. The accepted trade-off
(a human losing email access cannot move their identity without operator
intervention) is restated here so a future account-recovery feature knows
to revisit this decision deliberately.

The runtime trust model the requirements encode: **Convex is the sole
credential issuer and sole authorization decider** (`sole-credential-issuer`,
`mutation-authorization`, `live-game-issuance`); **a game instance trusts
only validated tokens and only at connect time** (`admission-validation`,
`connect-time-validation`, `role-bound-privileges`); **servers and clients
are custodians, never authorities** (`client-credential-custody`,
`game-credential-scope`). Platform-side distinctions (captaincy, admin)
deliberately do not travel into game instances — the token's role is the
whole in-game privilege story.

### Dedupe clusters: one requirement per behaviour

- **Credential scoping** (two module-03 ids stating scope and
  non-transferability, plus the credential-grants id and the
  credential-resolution id) → `game-credential-scope`. One requirement
  states scope, non-transferability, the exactly-two grants, and
  game-bounded lifetime.
- **Sole issuer** (module 03's sole-issuer and token-admission ids,
  module 05's sole-issuer id, module 02's credential-infrastructure id,
  module 08's never-self-issue id, module 04's only-admission-mechanism
  id) → `sole-credential-issuer`; the refuse-finished half of module 05's
  id lands as `live-game-issuance#no-tokens-for-finished-games`.
- **Verification-material discovery** (modules 03 and 05 stating the same
  cross-runtime contract) → `verification-without-shared-secrets`.
- **Admission validation** (module 03's rejection criteria + module 04's
  callback trio) → `admission-validation`, with the module-04 "no
  attribution written on rejection" as `#reject-before-touching-state`.
- **Admin role** (four module-03 ids, two module-05 ids, module 08's
  admin-experience pair and reload-freshness id) → `platform-admin-role`,
  one requirement whose text carries both the read breadth and the
  read-only bound, rather than a separate negative requirement — the
  bound is what makes the role safe, so it belongs in the same read.

*If any cluster is reversed* into per-module restatements, the halves can
drift independently — exactly the failure mode the user-story carving
exists to end.

- **Judgment call — credential-to-team resolution id**: the matrix offered
  `alt:code-mechanism`. Resolved: retire it onto `game-credential-scope`
  (resolution of a credential to its team is the observable precondition
  of scope enforcement) while treating the identity-kind-exposure helper
  shape (`resolveIdentity` and friends) as mechanism.

### Boundary rulings (seams)

- **Coach tokens** are issued here (mirroring spectator tokens; the
  admin-as-implicit-coach rule lives in `platform-admin-role` and
  `coach-tokens` jointly). What a coach connection experiences — the
  filtered live view, the client-side inspection UX — belongs to the
  live-observation story; coach *designation* (who appoints coaches, where
  they are recorded) belongs to the team-management story. This spec
  therefore says only "a designated coach of a participating team".
- **Roster snapshot**: this capability owns the *binding* — authorization
  is answered from the initialization snapshot for the whole game
  (`roster-snapshot-binding`, plus token gating in
  `participant-token-eligibility`). Snapshot creation/storage belongs to
  the game-lifecycle story; the roster mutation-freeze (edits rejected
  while playing, and its hard-reject review scenario) belongs to
  team-management. The binding is stated so it holds *even if* a team
  record were somehow mutated — it does not presume the freeze.
- **Spectator eligibility policy** beyond authentication was legacy-deferred
  to the application layer; the routed review item for it belongs to the
  live-observation story. `spectator-tokens` states the issuance floor
  (any authenticated human) and nothing more.
- **Cross-cutting rules** routed to `global-invariants` (identity-kind
  distinguishability, no anonymous mutators, credential-transmission
  custody, access-follows-identity, team-granularity authorization) are
  not restated here; `mutation-authorization` is kept because the legacy
  id it re-authors is a Convex-contract rule with a single owner — this
  capability — not a two-runtime invariant.

### Admin designation mechanism stays mechanism

Both legacy ids deferring *how* admins are designated (env-var list vs
database flag) retire note-only; `platform-admin-role` states the
designation is platform-level on the user record and takes effect without
reload, which is the entire observable contract. *If reversed* (specifying
the mechanism), the spec would freeze an operational choice the legacy
corpus explicitly left open.

## Constraint-mining (mandatory final step)

Each routed lead was judged: does a design decision's quality depend on an
invariant a future implementer could silently violate?

1. **Credential requests re-check the game is playing** — *minted*:
   `live-game-issuance` (with `#credential-dead-at-finish`). The two-hour
   expiry is safe *only because* liveness is re-checked per request; an
   implementer who trusts the expiry alone silently opens a post-game
   access window. What breaks if violated: a leaked or retained credential
   keeps working after the game it was scoped to has finished.
2. **Reject-before-touching-state admission** — *minted*: scenario
   `admission-validation#reject-before-touching-state`. Attribution and
   admission records are trustworthy *only because* failed admissions
   write nothing. What breaks: phantom attribution rows from rejected
   connections poison the game's historical record.
3. **Admin extends read only** — *minted*: `platform-admin-role` text +
   `#no-write-path-into-live-games`. The role is grantable casually *only
   because* it cannot act. What breaks: admin becomes an operational
   super-user and every game a member of the admin list watches is
   competitively compromised.
4. **Tokens refuse finished games** — *minted*:
   `live-game-issuance#no-tokens-for-finished-games` (uniform across all
   four roles). What breaks: token issuance against finished games
   re-opens exactly the access that instance teardown is supposed to end.
5. **Token custody in memory only** — *minted*:
   `client-credential-custody#memory-only`. Connect-time-only validation
   is acceptable *only because* tokens are short-lived and never at rest;
   a token cached in browser storage or a URL outlives the threat model.
   What breaks: leaked storage/history yields replayable two-hour access.
6. **Admission records invisible to clients** (module-04 design lead) —
   *minted*: `admission-records-private`. Team-granularity privacy and
   attribution integrity depend on the connection-to-identity mapping
   never being a client-readable surface. What breaks: any client could
   enumerate who is connected for which team — metadata the invisibility
   and role model deliberately withhold.

No further lead survived judgment: the remaining legacy design content
(claim schemas, key formats, callback step orderings, helper signatures)
is mechanism whose violation is caught by the minted behavioural
requirements above.
