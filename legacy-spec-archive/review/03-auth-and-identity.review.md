# Module 03 — Auth and Identity: Decision Log

Resolved REVIEW items from [`specs/03-auth-and-identity.md`](../03-auth-and-identity.md). See [`SPEC-INSTRUCTIONS.md`](../../SPEC-INSTRUCTIONS.md) for the item format and resolution process.

---


### 03-REVIEW-001: "JWT" and "HMAC" as implementation artifacts — **RESOLVED**

**Type**: Ambiguity
**Phase**: Requirements
**Context**: The instructions prohibit requirements from referencing "implementation artifacts (table names, reducer names, specific libraries)". The informal spec §3 uses the terms JWT, HMAC, JWKS, and RSA explicitly, and Module 02's related requirements are silent on whether these terms cross the line into implementation detail. The current draft treats JWT/HMAC/JWKS/RSA as domain-level concepts only when they are required to state an invariant (e.g., "a cryptographically signed admission ticket" instead of "a JWT"), and avoids naming them in requirements. This introduces some awkwardness — e.g., 03-REQ-041 hints at RSA/HMAC distinction via parenthetical guidance but does not name the schemes.
**Question**: Should requirements be permitted to name specific cryptographic constructions (JWT, HMAC, RSA, JWKS), or should all such naming be deferred to Design?
**Options**:
- A: Keep requirements construction-neutral; move all naming to Design. (Current draft.)
- B: Permit specific cryptographic constructions in requirements on the basis that interoperability between Convex's customJwt provider and SpacetimeDB's validator forces particular choices — these are effectively architectural commitments, not library choices.
**Informal spec reference**: §3 throughout.

**Decision**: A. Keep requirements neutral with respect to cryptographic primitives.
**Rationale**: Specific cryptographic constructions are design-phase concerns; requirements should only assert the invariants (signed, verifiable, bounded-lifetime, independence-of-compromise) that those constructions serve. This preserves flexibility to swap primitives if, for example, a future SpacetimeDB validator gains native public-key verification. If future reviewers find 03-REQ-041's parenthetical guidance drifts toward being load-bearing, that guidance should be demoted rather than hardened.
**Affected requirements/design elements**: None — the current draft already conformed to option A. 03-REQ-041's parenthetical scheme hints remain as non-normative guidance toward Design.

---

### 03-REVIEW-002: "Google OAuth" vs "federated identity provider" — **RESOLVED**

**Type**: Ambiguity
**Phase**: Requirements
**Context**: The informal spec names Google specifically and repeatedly ("Google OAuth", "Google OAuth accounts"). The current draft generalizes this to "a federated identity provider integrated with Convex" to keep requirements provider-neutral. This may be over-generalization: if the platform is deliberately committing to Google as the sole provider (e.g., to keep the email address the canonical identity), that is a domain-level commitment, not an implementation detail.
**Question**: Is Google specifically mandated, or is Google an implementation choice and the requirement is "some federated identity provider that yields a canonical email"?
**Options**:
- A: Name Google OAuth as the provider in requirements.
- B: Generalize to "federated identity provider" and cover the Google choice in Design. (Current draft.)
**Informal spec reference**: §3, "Human Authentication".

**Decision**: A. Google OAuth is a binding requirement, not an implementation choice.
**Rationale**: The platform operator (Chris) has out-of-scope reasons for committing to Google specifically — notably, email addresses from Google accounts are used as stable identifiers across other systems beyond this spec. Generalizing to "federated identity provider" would understate the commitment and invite a future change that silently broke those out-of-scope integrations. If the platform ever genuinely needs to support additional providers, the right path is to revise these requirements deliberately rather than to discover the breakage through drift.
**Affected requirements/design elements**: 03-REQ-002, 03-REQ-007, 03-REQ-009, 03-REQ-027, 03-REQ-036 — all references to "federated identity provider" replaced with "Google" or "Google OAuth".

---

### 03-REVIEW-003: Email-as-identity stability — **RESOLVED**

**Type**: Gap
**Phase**: Requirements
**Context**: 03-REQ-008 asserts that the email address identifies a human, and that two provider subjects with the same email are distinct humans. The informal spec says humans are "Identified by email address" (§3) and team membership is "authorized email addresses" (§3). But email addresses can be reassigned at providers (rare with Google Workspace, non-trivial with personal Google accounts), and a provider-issued subject is the standard stable identifier in OAuth/OIDC. The current draft privileges the subject as "uniquely identifies" while still using email for team membership lookups, which has a latent inconsistency: a human whose email changes at the provider would retain their subject but lose team memberships.
**Question**: Is the canonical human identity the email address (simple, matches the informal spec literally) or the provider subject (robust to email change, closer to OIDC practice)? If the former, what should happen when a provider's email for a subject changes?
**Options**:
- A: Email is canonical; subject is auxiliary. Email changes at the provider create a new human identity.
- B: Subject is canonical; email is a display attribute that can change. Team membership is looked up by subject, not email.
- C: Email and subject are both canonical and are required to match a prior (subject, email) binding at authentication time; mismatches force re-linking.
**Informal spec reference**: §3, "Identity Model".

**Decision**: A. Email is canonical; the OAuth subject is not an identity element on this platform.
**Rationale**: The email address is used as a stable identifier across systems outside the scope of this spec, so privileging any other attribute would desynchronize those systems from the platform's view of who a human is. An email change at Google is treated as the arrival of a distinct human, and historical state (team memberships, action log entries, replays) stays attached to the original email. This has the consequence that a human who loses access to their email cannot "move" their platform identity without operator intervention; that is an accepted trade-off. If a future rule change introduces platform-internal account recovery, revisit this decision because the mechanism for recovery will need somewhere stable to anchor on.
**Affected requirements/design elements**: 03-REQ-002 (removed provider-subject as unique identifier; email is the sole identifier), 03-REQ-008 (rewritten to state the merge rule for same-email authentications and the fork rule for email changes).

---

### 03-REVIEW-004: Admission ticket lifetime — **RESOLVED**

**Type**: Gap
**Phase**: Requirements
**Context**: 03-REQ-027 requires admission ticket lifetimes to be "bounded" and "short enough that a leaked ticket ceases to grant access within a time window commensurate with the expected duration of a game phase." The informal spec says "short expiry" for Centaur Server JWTs (§3) but does not specify lifetimes for admission tickets. Making this testable requires a concrete bound, but choosing one requires knowledge of typical game durations (which depend on turn timeout configuration in [01]) and a threat model for ticket leakage.
**Question**: What are the specific maximum lifetimes for (a) game credentials, (b) human admission tickets, (c) bot admission tickets, (d) spectator admission tickets? And is it acceptable for the requirement to specify an order-of-magnitude bound (e.g., "at most one hour") rather than a hard number?
**Options**:
- A: Leave the requirement qualitative and resolve the numeric bound in Design.
- B: Specify concrete bounds at the requirements level, pending human input on numbers.
**Informal spec reference**: §3, "Centaur Server Authentication (Challenge-Callback)".

**Decision**: B with concrete numbers. SpacetimeDB access tokens of every role expire **2 hours** after issuance. Per-Centaur-Team game credentials have lifetimes bounded to the game (they expire when the game ends). Access token validation is also clarified as connection-time-only (no periodic re-validation of established connections).
**Rationale**: The primary security boundary against post-game token use is the ephemeral SpacetimeDB instance's teardown ([02-REQ-021]) — once the instance is torn down, the token has nothing to authenticate against, so token expiry is not the mechanism that ends access after a game. Token expiry serves as defense-in-depth: if a token is leaked during a long-running game, the 2-hour window bounds the exposure. A 2-hour lifetime is generous enough that reconnection during even unusually long games does not require a token refresh, while still providing a meaningful bound against leaked tokens. The earlier 15-minute rationale (3× nominal game duration) is superseded — it was grounded in the assumption that token expiry was the primary access-termination mechanism, which it is not; instance teardown is.
**Affected requirements/design elements**: 03-REQ-021 (clarified as connection-time-only validation with connection-persists semantics), 03-REQ-027 (access token lifetime set to 2 hours with defense-in-depth rationale), 03-REQ-058 (game credential lifetime bounded to game).

---

### 03-REVIEW-005: `stagedBy` attribution granularity for human participants — **RESOLVED**

**Type**: Ambiguity
**Phase**: Requirements
**Context**: The informal spec Section 14 mentions `stagedBy` capture in the `snake_moved` event. 03-REQ-032 asserts that `stagedBy` records enough information to distinguish a bot participant from a human and, for humans, recover the email. However, the SpacetimeDB identity associated with a human participant connection is derived from an admission ticket that carries the email, and it is not yet resolved whether the SpacetimeDB authoritative record should be (a) the connection's SpacetimeDB Identity (opaque, per-connection, does not persist across reconnections), (b) the email extracted from the admission ticket (persistent, globally meaningful), or (c) both. The informal spec is silent on this specific question. Module [02]'s 02-REQ-030 establishes that SpacetimeDB "has no concept of which human within a team is acting on which snake," which is in tension with recording human email in `stagedBy`.
**Question**: Should `stagedBy` for human participants carry the email address (which gives SpacetimeDB some "concept of which human"), or only a team+connection-level marker with the detailed attribution living in Convex's `centaur_action_log` ([06])? Is 02-REQ-030 violated if the email appears in `stagedBy`?
**Options**:
- A: Record email in `stagedBy`; reconcile with 02-REQ-030 on the grounds that SpacetimeDB merely transcribes the admission ticket and does not interpret it.
- B: Record only team+role in `stagedBy`; detailed per-human attribution lives only in Convex's action log.
- C: Record a stable human identifier (not email) in `stagedBy`.
**Informal spec reference**: §14, "Turn Event Schema"; §3 "SpacetimeDB Admission Tickets"; §11 (centaur_action_log).

**Decision**: A, with a refinement that resolves the tension with 02-REQ-030. Within SpacetimeDB's working state, `stagedBy` holds only an opaque SpacetimeDB connection Identity; SpacetimeDB does not read or branch on it. The mapping from Identity back to email (for humans) or Centaur Team reference (for bot participants) lives in the `centaur_team_permissions` table, which is populated from admission-ticket contents on each `register` call and retained for the lifetime of the game. Resolution from Identity to email/Centaur Team reference happens at a single boundary: serialization of the game record to Convex at game end.
**Rationale**: This preserves the letter and spirit of 02-REQ-030 — SpacetimeDB's runtime logic has no concept of "which human" during gameplay; it just records opaque Identities. The act of interpretation is isolated to the moment the game record crosses the boundary into Convex, where email-based attribution is meaningful. Retaining the `centaur_team_permissions` mapping across reconnections is necessary because an old `stagedBy` Identity from turn 10 may refer to a connection that was closed and replaced by minute 4, and the game-end serialization still needs to resolve it. Raw Identities must not appear in the persisted game record, so that downstream consumers (replay viewer, action log cross-referencing) have uniform shapes to work against.
**Affected requirements/design elements**: 03-REQ-032 rewritten to state the opaque-Identity semantics within SpacetimeDB and the no-interpretation constraint. Added 03-REQ-044 (SpacetimeDB maintains the mapping in `centaur_team_permissions` for the game's duration, including across reconnections). Added 03-REQ-045 (Convex-side serialization resolves `stagedBy` to email or Centaur Team reference; persisted records contain no raw Identities).

**Superseding amendment (per 04-REVIEW-011 resolution)**: The original decision above — that `stagedBy` holds an opaque Identity within STDB and resolution happens at game-end serialization — has been superseded. The resolution boundary has shifted: the SpacetimeDB connection Identity is now resolved to an `Agent` value (per [01-REVIEW-011]) **at connection time** (in the `client_connected` callback), using JWT `sub` claim contents available at that moment. As a result, `stagedBy` fields stored in STDB already carry `Agent | null`, not opaque Identities, and no serialization-time mapping pass is needed. 03-REQ-032, 03-REQ-044, and 03-REQ-045 have been updated to reflect this shift. The spirit of the original decision is preserved — SpacetimeDB's turn-resolution logic still does not interpret or branch on the attribution value — but the Identity→Agent translation now occurs at the connection boundary rather than the serialization boundary.

---

### 03-REVIEW-006: Membership changes mid-game — **RESOLVED**

**Type**: Ambiguity
**Phase**: Requirements
**Context**: 03-REQ-039 states that game authorization state is snapshot at initialization time and not retroactively changed by later membership edits. The informal spec does not address the case where a human is removed from a team mid-game or added to one during a game. This is a policy question with implications for admission-ticket issuance: if a human is removed from team T at turn 30, does their previously obtained admission ticket still work until expiry, or is the `centaur_team_permissions` snapshot in SpacetimeDB the binding source?
**Question**: Which source of team membership governs mid-game admission:
- the snapshot seeded into SpacetimeDB at `initialize_game` time, or
- the live Convex team record at the moment Convex issues an admission ticket, or
- both (live for ticket issuance, snapshot for ticket validation)?
**Options**:
- A: Snapshot is binding for the whole game; mid-game membership changes have no effect. (Current draft.)
- B: Live Convex state is binding at ticket-issuance time; the SpacetimeDB snapshot mirrors the snapshot-at-init only as a default, and Convex can push updates.
- C: Both checks apply and the stricter wins.
**Informal spec reference**: §3 (admission tickets); §9.2 (team management).

**Decision**: A, strengthened: team membership is not merely snapshot-and-ignored, it is explicitly frozen at game start and cannot be mutated in Convex while the game is in progress. Convex rejects roster edits for participating teams while the game is in the `playing` state. The snapshot is treated as append-only historical fact for post-game attribution.
**Rationale**: Forbidding the mutation entirely at the source is cleaner than snapshot-plus-ignore. Under the snapshot-plus-ignore reading, the UI would permit a captain to remove a member during a game, but the removal would silently have no effect on the running game — a confusing user experience and an attractive surface for bugs where live vs snapshot state diverges. Hard-blocking the mutation surfaces the freeze to the captain immediately and keeps Convex and SpacetimeDB's views of team membership in lockstep for the game's duration. Historical attribution (e.g., a removed player's moves in a completed game) is preserved via [03-REQ-045] and [03-REQ-047].
**Affected requirements/design elements**: 03-REQ-039 strengthened (snapshot is binding for the full game). Added 03-REQ-046 (Convex must reject roster mutations while a participating team has a game in the `playing` state). Added 03-REQ-047 (the snapshot is treated as an append-only historical fact; post-game roster edits do not erase historical attribution).

**Sub-question surfaced but not resolved here**: The decision frames "in progress" as `games.status = "playing"`. Between tournament rounds (informal spec §9.4 step 4), a tournament's outer lifecycle is active but no individual round is in the `playing` state. As written, roster mutations would be permitted between rounds of a tournament. If tournaments should freeze rosters across the whole event rather than per-round, a new REVIEW item should be opened against Module [05] or Module [08] where tournament mode lifecycle is owned. Flagging here rather than silently deciding.

---

### 03-REVIEW-007: Asymmetric signing for two different validation contexts — **RESOLVED**

**Type**: Proposed Addition
**Phase**: Requirements
**Context**: 03-REQ-041 elevates the implementation pattern described in the informal spec — separate signing material for game credentials (Ed25519, so Convex Auth can validate them) and for SpacetimeDB access tokens (RS256, validated via OIDC) — to a requirements-level invariant about independence of compromise. This is a proposed addition, not explicit in the informal spec. The justification is defense-in-depth: if either scheme is broken, the other continues to function.
**Question**: Is the independence-of-compromise invariant an intended architectural commitment, or is it an inference from an implementation choice that should not be locked in at the requirements level?
**Options**:
- A: Keep as a requirement — architectural invariant worth preserving. (Current draft.)
- B: Drop from Requirements; describe the scheme choice in Design only.
**Informal spec reference**: §3, "Centaur Server Authentication" and "SpacetimeDB Admission Tickets".

**Decision**: A. Independence of compromise between the game credential signing scheme (Ed25519) and the SpacetimeDB access token signing scheme (RS256) is an intended architectural invariant.
**Rationale**: Elevating this to a requirement means a future design change that (for example) unified the two signing paths under a single key would be visible as a requirements violation rather than slipping in as an implementation simplification. The inconvenience of carrying this as a requirement is small; the cost of losing defense-in-depth silently is large.
**Affected requirements/design elements**: None — current 03-REQ-041 conforms.

---

### 03-REVIEW-008: Convex as sole issuer (03-REQ-037) vs healthcheck/library extension surface — **RESOLVED**

**Type**: Ambiguity
**Phase**: Requirements
**Context**: 03-REQ-037 asserts Convex is the sole issuer of all credentials. But 02-REQ-029 requires Snek Centaur Servers to expose a healthcheck endpoint the platform calls. If that healthcheck requires no authentication, 03-REQ-037 is consistent; if it requires a credential, something must issue it. The current draft assumes healthchecks are unauthenticated on the basis that they only need to verify reachability.
**Question**: Are Snek Centaur Server healthcheck calls authenticated, and if so, by what credential?
**Options**:
- A: Unauthenticated; they verify only reachability. (Current draft assumption.)
- B: Authenticated with a dedicated shared secret at registration time (contradicts 03-REQ-012).
- C: Authenticated with a Convex-issued token delivered via a different mechanism.
**Informal spec reference**: §2, "Centaur Servers"; §3.

**Decision**: A. Snek Centaur Server healthcheck calls are unauthenticated; they verify only reachability.
**Rationale**: Healthchecks answer a single question — "is the server reachable and responsive?" — which needs no identity binding. Keeping them unauthenticated preserves 03-REQ-037 (Convex remains sole issuer of all credentials) and 03-REQ-012 (no shared secret at nomination) without special-casing. The attack surface is minimal: a healthcheck endpoint that only returns liveness information leaks no team state. If a future change extends the healthcheck payload to include sensitive information, revisit this decision because the threat model would change.
**Affected requirements/design elements**: None — current draft conforms. Flagged guidance for Phase 2 Design: the healthcheck response payload should be minimal and contain no team-scoped state.

---

### 03-REVIEW-009: Spectator eligibility and rate-limiting — **RESOLVED**

**Type**: Gap
**Phase**: Requirements
**Context**: 03-REQ-026 permits any authenticated operator to obtain a spectator SpacetimeDB access token, deferring eligibility rules to [08]. The informal spec §8.5 says "Any authenticated user can spectate a game in progress" but does not address private games, room-level visibility settings, or abuse (a single operator requesting thousands of spectator tokens). This may be adequately covered by [08]; flagging to ensure it is not silently dropped between modules.
**Question**: Does any spectator access restriction belong in [03] (e.g., per-operator rate limit on access token issuance), or is all of it [08]'s concern?
**Options**:
- A: All spectator-access policy lives in [08]; [03] only defines the token mechanism. (Current draft.)
- B: [03] owns at least a rate-limit or abuse-prevention requirement on access token issuance.
**Informal spec reference**: §8.5; §3.

**Decision**: A. Module [03] defines only the spectator token mechanism; all spectator eligibility policy (private games, room visibility, rate-limiting, abuse prevention) belongs to [08] or to whichever later module owns the feature.
**Rationale**: Keeping [03] narrowly scoped to identity and credential mechanics makes its boundary clean and avoids duplicating policy. If [08]'s Phase 1 author encounters this and needs [03] to carry a rate-limit requirement, that can be negotiated as a cross-module requirement change at that point — this decision is not load-bearing against such a change. The risk being accepted here is that [08]'s author might assume spectator rate-limiting is handled upstream in [03] and silently drop it; to mitigate, a cross-reference note should be carried forward.
**Affected requirements/design elements**: None — current 03-REQ-026 conforms. Cross-module reminder: when [08] Phase 1 begins, verify that spectator eligibility rules (visibility, rate-limiting, abuse prevention) are explicitly captured there. If [08]'s author needs [03] to participate in any of that, a new REVIEW item should be raised against this module.

---

### 03-REVIEW-010: Convex-to-SpacetimeDB authentication mechanism — **RESOLVED** (Option B)

**Type**: Gap
**Phase**: Design
**Context**: 03-REQ-048 requires Convex to authenticate to SpacetimeDB for provisioning, teardown, initialization, notification subscription, and record retrieval. Section 3.22 previously deferred the exact protocol to implementation time, depending on the SpacetimeDB hosting platform's affordances.

**Partial resolution history**: The introduction of Convex-as-OIDC-issuer (Section 3.17) resolved the **client-facing** authentication mechanism — all game participants (operators, bots, spectators) authenticate to SpacetimeDB via RS256-signed JWTs validated through OIDC discovery. However, **Convex's own authentication to SpacetimeDB** for privileged management operations remained open.

**Decision**: B — commit to the self-hosted SpacetimeDB platform with Convex self-issued JWT authentication for management operations. Section 3.22 has been updated to specify this mechanism fully.

**Rationale**:
- The platform uses **self-hosted SpacetimeDB** rather than SpacetimeDB maincloud. This decision is warranted independently by: (a) Australian hosting locality requirement (data sovereignty), (b) cost minimization (eliminating per-instance hosting fees), and (c) automation-friendly authentication — maincloud requires GitHub OAuth for management API access, which is incompatible with unattended automated provisioning from a Convex runtime.
- Self-hosted SpacetimeDB exposes an HTTP management API that accepts externally-issued JWTs for authentication. Convex issues RS256-signed JWTs using its existing `SPACETIMEDB_SIGNING_KEY` (or a dedicated management key pair) and presents them to the management API for all privileged operations.
- This eliminates the "defer to implementation time" hedge in Section 3.22: the authentication mechanism is now fully specified at design time, consistent with the platform's commitment to principled, automatable provisioning.

**Affected design elements**: 03-REQ-048 and Section 3.22 updated.
**Informal spec reference**: §3, §10.

---

### 03-REVIEW-012: Tournament forfeit-on-invitation-refusal — **RESOLVED**

**Type**: Behavioural correction
**Phase**: Requirements
**Context**: The original 03-REQ-056 treated any Centaur Server rejecting a game invitation, or failing to respond within the timeout, as a hard failure of the entire game launch — the game returned to `not-started` and no team got to play. This is undesirable in tournament play, where one team's server failure should not stall the whole bracket. Task #61 was opened to convert refusals into forfeits.

**Question**: Should forfeit-on-refusal replace the all-or-nothing launch model entirely, or only for tournament games?

**Decision**: Differentiated by game type. Non-tournament games retain the original all-or-nothing semantics (any refusal aborts the launch and returns the game to `not-started` with an error). Tournament games adopt forfeit-on-refusal: a server that rejects or times out forfeits its team for the round; the round proceeds with the accepting teams only when ≥ 2 accept, transitions directly to `finished` as a walkover when exactly 1 accepts (sole acceptor wins by default), or transitions directly to `finished` as a no-contest when 0 accept. In all tournament branches the forfeiting teams' snakes never spawn (the snake roster passed to `initialize_game` is restricted to accepting teams), and the forfeit is recorded on the game record (`forfeitedTeamIds`) for scoring, ranking, leaderboard, and replay surfaces. A forfeit is recorded as a loss with score 0, distinguishable from a played loss by the team's presence in `forfeitedTeamIds`.

**Rationale**: For human-scheduled games the all-or-nothing model is fine — the administrative actor can simply re-launch once the failing server is back. For tournament games the schedule is externally fixed and the round must resolve in bounded time regardless of any one team's server health, mirroring competitive esports forfeit conventions. The new `not-started → finished` transition for tournament walkover/no-contest cases is added as an additional permitted state-machine transition in [05-REQ-028]; it preserves tournament round chaining (which fires off the `finished` transition) without needing to first pass through `playing` for a game that will not have any play.

**Affected requirements/design elements**: 03-REQ-056 rewritten to encode the differentiated semantics. §3.16 "Timeout and failure handling" prose rewritten to describe the tournament partitioning and the ordering constraint (invitations must resolve before `initialize_game` is called). 05-REQ-027 amended to add `forfeitedTeamIds` to the game record. 05-REQ-027a added describing the field and the scoring/ranking treatment of forfeits. 05-REQ-028 amended to permit `not-started → finished` for tournament walkover/no-contest cases. 05-REQ-032 rewritten with deferred-init ordering (step 4 prepares the payload, step 5 sends invitations, step 5a partitions tournament outcomes, step 6 calls `initialize_game` with the restricted roster). §2.3.1 game-start orchestration steps 5–9 rewritten with the same ordering and the tournament branching. 05-REVIEW-016 added documenting the §2.3.1 design changes. Module 02 §2.14 step list and the lifecycle diagram updated to reflect "invitations resolved" rather than "invitations accepted" and to add the tournament walkover transition. 02-REVIEW-008 added documenting the lifecycle diagram amendment. README amended in the Centaur Servers bullet to reflect the new behaviour.

---

### 03-REVIEW-011: `UserId` and `CentaurTeamId` as Convex record `_id`s — **RESOLVED**

**Type**: Gap
**Phase**: Design
**Context**: Section 3.13 previously specified that each human user is assigned a monotonically increasing `userId: UserId` (a numeric branded type) allocated via a counter document at user creation time, and that each Centaur Team is assigned a separate `centaurId: CentaurId` (also monotonically increasing integer) allocated at team creation time. Module 01 defined both as `number & { readonly __brand: ... }`. This introduced counter-document serialization points and a redundant identifier field on the `CentaurTeamIdentityFields` interface (since the `centaur_teams._id` already uniquely identified the team). Additionally, the branded type was named `CentaurId` rather than `CentaurTeamId`, creating a discrepancy between the type name and the entity it identifies (a Centaur Team, not a Centaur in isolation).

**Decision**: Use Convex record `_id`s directly as `UserId` and `CentaurTeamId`, and rename the branded type from `CentaurId` to `CentaurTeamId` to match the entity it identifies. The `CentaurTeamId` type is the single team identifier across all modules — it is always the Convex `centaur_teams._id` string.

- `UserId` is the Convex `users._id` (type `Id<'users'>`), cast to `string & { readonly __brand: 'UserId' }`.
- `CentaurTeamId` is the Convex `centaur_teams._id` (type `Id<'centaur_teams'>`), cast to `string & { readonly __brand: 'CentaurTeamId' }`.
- Both branded types are string-based (not numeric) in Module 01.
- The counter-document allocation scheme is eliminated entirely.
- The separate `centaurId` field on `CentaurTeamIdentityFields` is eliminated — `_id` IS the `centaurTeamId`.
- The `Agent` discriminated union variant is renamed from `kind: 'centaur'` to `kind: 'centaur_team'` with field `centaurTeamId: CentaurTeamId`, reflecting that this agent represents the Centaur Team acting collectively (its bot submitting a move from the Centaur Server, incorporating the team's human and AI heuristics). The `kind: 'operator'` variant carries field `operatorUserId: UserId`, representing an individual human member acting as a sub-agent of their Centaur Team.

**Rationale**: Counter-document allocation introduces unnecessary write serialization for both user creation and team creation. Convex `_id` values are already globally unique, opaque, and assigned atomically — they satisfy every property that motivated the counter scheme (unique, stable, compact enough for `sub` claim strings). Using `_id` directly eliminates indirection, removes the need for a separate denormalized field, and simplifies downstream code. Renaming `CentaurId` → `CentaurTeamId` eliminates ambiguity: the identifier always refers to a Centaur Team, and the `Agent` variant `kind: 'centaur_team'` makes explicit that the attribution is at the team level (contrasted with `kind: 'operator'`, which attributes at the individual level).

**Affected requirements and design elements**:
- Module 01 (`specs/01-game-rules.md`): `CentaurId` renamed to `CentaurTeamId`; both branded types changed from `number & {...}` to `string & {...}`; `Agent` variant changed from `{kind: 'centaur', centaurId}` to `{kind: 'centaur_team', centaurTeamId}`. Resolved 01-REVIEW-011 decision text updated.
- Module 03 (`specs/03-auth-and-identity.md`): Section 3.13 (`HumanIdentityFields`, `CentaurTeamIdentityFields`, `PlatformIdentity`), Section 3.15 (`GameCredentialClaims`, claim descriptions), Section 3.16 (`GameInvitationPayload`, roster description), Section 3.17 (`sub` claim examples, token flavor table), Section 3.18 (Agent derivation prose), Section 3.22 (team identity consistency), Sections 4.1–4.4 and 4.7 (exported type interfaces, `parseSubClaim` and `deriveAgentFromSubClaim` signatures and descriptions) — all updated.
- Module 02 (`specs/02-platform-architecture.md`): `CentaurId` re-export renamed; `CentaurTeamId` remains. Sub-claim examples updated.
- Module 04 (`specs/04-stdb-engine.md`): `Agent` value descriptions in 04-REQ-020 and 04-REVIEW-011 updated to use `{kind: 'centaur_team', centaurTeamId}`.

**Informal spec reference**: §3, "Identity Model".
