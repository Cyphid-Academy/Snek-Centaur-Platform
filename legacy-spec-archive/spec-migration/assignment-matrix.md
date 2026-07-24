> **ARCHIVED (2026-07-24)** — planning record, superseded by the completed identifier map.

# Final-Migration Assignment Matrix

**Status: DRAFT — Phase B synthesis awaiting the carving decision.** Nothing
here is binding; binding sources remain `openspec/specs/` and
`legacy-spec-archive/spec/` per identifier. This matrix was produced from a
whole-corpus atlas pass (seven parallel module inventories, 2026-07-24)
covering every undisposed legacy id: module 02's 28 parked ids and all 497
ids of modules 03–08. It is the input to the carving checkpoint: once the
author settles the open questions below, each capability's migration change
authors from its rows (parked drafts and legacy text binding, as ever).

## Assignment vocabulary

- `<capability>` — the id's substance is re-authored at intent grain in that
  user-story capability.
- `global-invariants` — cross-cutting rule, no user-story owner (admission
  test in the gi Purpose); authored by the dedicated
  `extend-global-invariants` change. `gi-dedupe` marks ids whose substance
  is already covered by an existing gi requirement — they retire with a map
  entry targeting it, possibly extending it.
- `code-mechanism` — mechanism, not behaviour: stays in code, rationale in
  the owning change's design.md; the id retires with a note-only map entry.
- `drop(reason)` — obsolete/superseded/meta; retires note-only, reason
  recorded.
- `alt:` — second choice where genuinely torn; `dedupe:` — collapse with
  the named ids into one requirement; `seam:` — the other half of the story
  lives elsewhere (informational for the authoring change).

## Summary

| Capability | ids assigned (approx) | Drawn from |
|---|---|---|
| identity-and-authorization | 59 | 02,03,04,05,06,08 |
| team-management (NEW) | 14 | 02,03,05,08 |
| team-server-management | 25 | 02,03,05,08 |
| game-configuration | 17 | 02,05,08 |
| game-lifecycle | 34 | 02,03,04,05,06,08 |
| rooms-and-matchmaking | 16 | 05,08 |
| live-game-observation | 41 | 02,03,04,05,06,08 |
| operator-control | 33 | 02,03,04,06,07,08 |
| turn-pacing | 26 | 04,06,07,08 |
| bot-framework | 37 | 07 |
| bot-configuration | 33 | 06,07,08 |
| decision-transparency | 12 | 06,07,08 |
| replay-and-audit | 57 | 02,03,04,05,06,07,08 |
| accounts-and-profiles | 27 | 05,08 |
| tournaments | 9 | 03,05 |
| platform-integrations (NEW) | 21 | 03,05,08 |
| global-invariants (extend) | 21 | 03,04,05,06,07,08 |
| code-mechanism | ~25 | all |
| drop | 5 | 03,04,08 |

Counts are pre-dedupe (a collapsed cluster still retires every constituent
id). Re-authoring at intent grain will compress these substantially — the
module-01 pilot compressed ~100 ids into 30 requirements.

## Open questions (the carving checkpoint)

1. **Mint `team-management`?** The roster/captaincy/coach/archive cluster
   (05-REQ-008/011/012/013/015a/068a, 03-REQ-046, 08-REQ-023b–f) has no
   vocabulary owner; scouts for modules 03 and 05 independently proposed
   it. Recommendation: **yes** — "the captain runs the team" is a workflow
   distinct from "the team runs its server". Alternative: fold into
   identity-and-authorization + accounts-and-profiles.
2. **Mint `platform-integrations`?** API keys (03-REQ-033–036,
   05-REQ-045–048/051/052, 08-REQ-095a–d), the HTTP API surface
   (05-REQ-049/050), and webhooks (05-REQ-053–058) form one integrator
   story ("an admin automates the platform from outside").
   Recommendation: **yes**. Alternative: keys → accounts-and-profiles,
   webhooks → game-lifecycle, API surface scattered per owning story.
3. **`bot-framework` name.** Working name held from the map. Substance
   after carving: the heuristic authoring contract (Drive/Preference
   vocabulary, scalar discipline, safety rails) plus the decision engine's
   observable behaviour (stateMap, worst-case scoring, softmax). Confirm
   name or rename (candidates: `bot-decision-engine`,
   `heuristic-authoring`).
4. **Staged-moves model.** Module 04 is unambiguous and postdates module
   02: staged moves are an **append-only log retained for the game's
   lifetime**, effective move = latest per snake, nothing cleared at
   resolution (04-REQ-025/027). Recommendation: re-author operator-control
   on the append-only model; 02-REQ-011/012 retire onto it with
   last-write-wins as *effective-move* semantics (the parked ledger already
   records this as author intent). 04-REQ-052's "block staged-move reads"
   re-authors as own-team-only (the Design's staged_moves_view grants
   own-team history).
5. **Global-invariants ownership.** All gi additions/modifications are
   authored by one dedicated `extend-global-invariants` change (satisfies
   the one-owner-per-requirement train precondition; gi requirements have
   no story owner by definition). Confirm.
6. **Full train vs. partial.** This matrix disposes every remaining id, so
   the train can flip all modules to Migrated. The four capabilities least
   needed for near-term implementation (tournaments, rooms-and-matchmaking,
   accounts-and-profiles, platform-integrations) could instead be parked
   with prospective homes to trim authoring/review load. Recommendation:
   **migrate all** — parked ledgers are bookkeeping debt, and the atlas
   work is already paid.
7. **03-REQ-067** (documented trust trade-off: a malicious server can
   exfiltrate data its users can read). Not a testable behaviour.
   Recommendation: carry as Purpose prose in team-server-management's
   trust-model paragraph + a note-only map entry, not a requirement.
8. **Dependency DAG.** Approve the proposed DAG and archive order in
   `capability-map.md` (authoring changes declare only the dependencies
   they actually cite; the DAG is the ceiling).

## Module 02 — parked residue (28 ids)

| id | intent | assignment | notes |
|---|---|---|---|
| 02-REQ-003 | One transient STDB instance per started game; none pre-launch | game-lifecycle | dedupe:02-REQ-019/020/021 cluster |
| 02-REQ-005 | Captain unilaterally nominates server domain; mid-game freeze | team-server-management | |
| 02-REQ-006 | Joining team must have nominated server; no pure-human teams | team-server-management | |
| 02-REQ-009 | Real-time committed-state sync without per-turn polling | live-game-observation | dedupe:04-REQ-053 |
| 02-REQ-010 | Invisible snakes filtered at data layer (RLS) | live-game-observation | dedupe:04-REQ-047; principle half already gi/security-enforced-outside-the-library |
| 02-REQ-011 | Staged moves last-write-wins per snake within turn | operator-control | re-author as effective-move semantics over append-only log (Q4) |
| 02-REQ-012 | Staged moves consumed/cleared at resolution | operator-control | SUPERSEDED by 04-REQ-025 append-only model (Q4); retires onto it |
| 02-REQ-013 | Full per-turn record retained in-instance, self-sufficient | replay-and-audit | dedupe:04-REQ-004..012 cluster |
| 02-REQ-014 | No per-turn external posting; replay export once at end | replay-and-audit | dedupe:04-REQ-012/061 |
| 02-REQ-016 | Convex hosts all identity/credential infrastructure | identity-and-authorization | |
| 02-REQ-018 | One operator per snake, one snake per operator | operator-control | dedupe:06-REQ-019/020 |
| 02-REQ-019 | Convex orchestrates provisioning at launch, teardown after end | game-lifecycle | |
| 02-REQ-020 | Fresh instance per game, uniform across creation paths | game-lifecycle | |
| 02-REQ-021 | Instance lifetime bounded to game; teardown after replay persisted | game-lifecycle | ledger double-listing resolved: one id, one home |
| 02-REQ-022 | Convex persists complete game log before teardown | game-lifecycle | seam:replay-and-audit owns record sufficiency |
| 02-REQ-022a | Terminal state learned via pushed notification, no live subscription | game-lifecycle | dedupe:04-REQ-061a,05-REQ-038 |
| 02-REQ-029 | Healthcheck endpoint for availability reporting | team-server-management | |
| 02-REQ-038 | Operators connect directly to STDB: observe + stage | operator-control | |
| 02-REQ-039 | Operators separately connect to Convex for Centaur/selection state | operator-control | |
| 02-REQ-040 | Operator interface served by team's nominated server | operator-control | seam:team-server-management hosting |
| 02-REQ-041 | Spectators connect read-only via spectator token | live-game-observation | ledger filed under operator-control; moved (pure spectator story) |
| 02-REQ-043 | Team management page limited to identity/nomination/membership | team-management | seam:server-nomination half team-server-management |
| 02-REQ-050 | Config mutable pre-launch, frozen at launch; param split with STDB | game-configuration | |
| 02-REQ-051 | Successor auto-created unstarted+mutable, no instance | game-lifecycle | dedupe:05-REQ-039 |
| 02-REQ-052 | Team↔server many-to-many over time; one per game | team-server-management | |
| 02-REQ-059 | Web app scope: platform-level plus team-internal | team-server-management | dedupe:08-REQ-001 |
| 02-REQ-064 | Single unified replay viewer | replay-and-audit | ledger filed under team-server-management; moved per capability-map |
| 02-REQ-065 | Finished games' full record readable by all authenticated users | replay-and-audit | |

02 review items carrying scenarios: 02-REVIEW-003 (instance tied to launch)
→ game-lifecycle; 02-REVIEW-005 (WebSocket binding) → operator-control;
02-REVIEW-006 (retrieval deferred) → game-lifecycle; 02-REVIEW-007
(spectator intersection semantics) → live-game-observation; 02-REVIEW-008
(walkover straight to finished) → game-lifecycle.

## Module 03 — auth and identity (62 ids)

| id | intent | assignment | notes |
|---|---|---|---|
| 03-REQ-001 | Three identity kinds: human, Centaur Team, derived game-participant | identity-and-authorization | |
| 03-REQ-002 | Human identity = Google account, identified by email | identity-and-authorization | |
| 03-REQ-003 | Team is persistent competitive unit; server domain is config, not identity | identity-and-authorization | |
| 03-REQ-004 | Game-participant identities: per-game connections, derived roles | identity-and-authorization | |
| 03-REQ-005 | Identity kinds always distinguishable | global-invariants | constrains every code path across runtimes |
| 03-REQ-006 | No anonymous participants in state-mutating roles | global-invariants | |
| 03-REQ-007 | Google OAuth via Convex; persistent session | identity-and-authorization | |
| 03-REQ-008 | Email canonical; same email merges; provider change forks | identity-and-authorization | dedupe:05-REQ-005 |
| 03-REQ-009 | No passwords or shared secrets stored for humans | identity-and-authorization | |
| 03-REQ-010 | Auth required for user-scoped affordances except public views | identity-and-authorization | dedupe:08-REQ-002 |
| 03-REQ-012 | No shared secret at nomination; secrets only via invitations | team-server-management | |
| 03-REQ-016 | Credential non-transferable across teams | identity-and-authorization | dedupe:03-REQ-057 |
| 03-REQ-017 | Convex resolves credential to team; exposes kind to functions | identity-and-authorization | alt:code-mechanism |
| 03-REQ-019 | STDB admits only Convex-issued signed JWT (OIDC) | identity-and-authorization | |
| 03-REQ-020 | Token carries game audience, role/team subject, expiry | identity-and-authorization | primitive names are mechanism (03-REVIEW-001) |
| 03-REQ-021 | Validation at connect only; expiry never disconnects | identity-and-authorization | |
| 03-REQ-022 | Convex serves OIDC discovery + JWKS | identity-and-authorization | dedupe:05-REQ-034a (one cross-runtime contract) |
| 03-REQ-023 | client_connected rejects bad signature/audience/expiry/unregistered | identity-and-authorization | dedupe:04-REQ-018/022 |
| 03-REQ-024 | Operator tokens require current membership in target game | identity-and-authorization | |
| 03-REQ-025 | Bot tokens require valid game credential for registered team | identity-and-authorization | |
| 03-REQ-026 | Spectator tokens for any authenticated human; no staging | identity-and-authorization | seam:live-game-observation consumes |
| 03-REQ-026a | Coach tokens team-bound read-only | identity-and-authorization | seam:live-game-observation (mirrors 03-REQ-026 treatment) |
| 03-REQ-027 | Tokens 2h; refresh without re-auth; teardown is boundary | identity-and-authorization | |
| 03-REQ-028 | Team connection stages for any team snake | operator-control | |
| 03-REQ-029 | No cross-team state access; spectators see no private state | global-invariants | gi-dedupe:team-granularity-authorization; extend if needed |
| 03-REQ-030 | STDB never authoritative for operator↔snake mapping | global-invariants | gi-dedupe:team-granularity-authorization |
| 03-REQ-031 | Invisibility filter on every connection; spectators as opponents | live-game-observation | dedupe:04-REQ-047,02-REQ-010 |
| 03-REQ-032 | stagedBy holds Agent value; STDB never interprets it | replay-and-audit | |
| 03-REQ-033 | HTTP API bearer keys; admin-created, revocable | platform-integrations | Q2; fallback accounts-and-profiles |
| 03-REQ-034 | Keys stored hashed; plaintext shown once | platform-integrations | dedupe:05-REQ-046 |
| 03-REQ-035 | Key bound to creating admin; global admin scope | platform-integrations | dedupe:05-REQ-047 |
| 03-REQ-036 | Keys cannot create identities or do OAuth-requiring actions | platform-integrations | dedupe:05-REQ-048 |
| 03-REQ-037 | Convex sole issuer of all cross-runtime credentials | identity-and-authorization | dedupe:03-REQ-019,05-REQ-035 |
| 03-REQ-038 | STDB team identifiers map to exactly one Convex team per game | global-invariants | alt:code-mechanism |
| 03-REQ-039 | Roster snapshot at init binds authorization whole game | identity-and-authorization | seam:05-REQ-029 storage in game-lifecycle |
| 03-REQ-040 | Signing material maintained without external key infrastructure | code-mechanism | |
| 03-REQ-041 | Separate signing material per credential type (compromise independence) | identity-and-authorization | deliberate invariant (03-REVIEW-007); Convex-only, fails gi no-owner prong |
| 03-REQ-043 | Credentials only to intended holders; private keys never leave Convex | global-invariants | |
| 03-REQ-044 | Agent resolved at connect; attribution retained across reconnects | replay-and-audit | dedupe:04-REQ-020/021 |
| 03-REQ-045 | Persisted record carries Agent values, never raw Identities | replay-and-audit | dedupe:05-REQ-042 |
| 03-REQ-046 | Roster edits rejected while team's game playing | team-management | Q1; dedupe:05-REQ-013 |
| 03-REQ-047 | Snapshot append-only; post-game edits never erase attribution | replay-and-audit | dedupe:05-REQ-007 half |
| 03-REQ-048 | Convex authenticates to STDB for provision/init/notify/retrieve | game-lifecycle | |
| 03-REQ-049 | Servers have no platform identity; credentials team+game scoped | team-server-management | gi-dedupe:ephemeral-game-credentials overlap — check |
| 03-REQ-050 | At start Convex invites each team's nominated server | team-server-management | |
| 03-REQ-051 | Invitation via POST to well-known endpoint | team-server-management | |
| 03-REQ-052 | DNS is sufficient proof of domain ownership | team-server-management | |
| 03-REQ-053 | Invitation carries per-team game credential | team-server-management | |
| 03-REQ-054 | Server must accept to proceed; reference impl auto-accepts | team-server-management | |
| 03-REQ-055 | Custom servers may reject; whitelist config, default open | team-server-management | |
| 03-REQ-056 | Refusal: non-tournament aborts; tournament forfeit/walkover/no-contest | game-lifecycle | seam:tournaments owns forfeit scoring (05-REQ-027a) |
| 03-REQ-057 | Credential scoped to one team and one game | identity-and-authorization | dedupe:03-REQ-016 |
| 03-REQ-058 | Credential lifetime bounded to game | identity-and-authorization | |
| 03-REQ-059 | Credential grants team-scoped writes + bot token requests only | identity-and-authorization | |
| 03-REQ-060 | Admin is platform-level role | identity-and-authorization | dedupe:05-REQ-065 |
| 03-REQ-061 | Admins browse all teams | identity-and-authorization | dedupe:05-REQ-066 |
| 03-REQ-062 | Admins see all games across teams | identity-and-authorization | dedupe:05-REQ-066 |
| 03-REQ-063 | Admins watch any replay; implicit coach everywhere | identity-and-authorization | dedupe:05-REQ-066 |
| 03-REQ-064 | Admin designation mechanism deferred | code-mechanism | dedupe:05-REQ-068 |
| 03-REQ-065 | Read access by Google identity only, never server visited | global-invariants | |
| 03-REQ-066 | Every server serves same UI/data; server is open-source client | team-server-management | owns the forkable-reference-app story |
| 03-REQ-067 | Documented trust trade-off (malicious server exfiltration) | drop(Purpose-prose in team-server-management, Q7) | |

03 review items carrying scenarios: 03-REVIEW-002 (Google specifically) →
identity-and-authorization; 03-REVIEW-003 (email fork keeps history) →
identity-and-authorization; 03-REVIEW-004 (expiry never disconnects) →
identity-and-authorization; 03-REVIEW-005 (connect-time Agent resolution)
→ replay-and-audit; 03-REVIEW-006 (mid-game roster edits hard-rejected) →
team-management; 03-REVIEW-008 (healthchecks unauthenticated/minimal) →
team-server-management; 03-REVIEW-009 (spectator eligibility deferred to
app policy) → live-game-observation; 03-REVIEW-012 (forfeit branches:
walkover 1.0 / no-contest) → tournaments.

Constraint-mining leads (03 Design): invitations resolve before
initialize_game, restricted roster (game-lifecycle); 30s invitation
timeout, concurrent sends, one POST per team, HTTPS-only
(team-server-management); credential requests re-check game is playing
(identity-and-authorization); init-before-connections, clock starts after
init (game-lifecycle); reject-before-touching-state on admission
(identity-and-authorization); attribution never deleted on disconnect
(replay-and-audit); admin extends read only (identity-and-authorization);
key validation re-checks admin, revoked keys retained for audit
(platform-integrations); game-end callback tokens Design-only
(game-lifecycle).

## Module 04 — SpacetimeDB engine (73 ids)

| id | intent | assignment | notes |
|---|---|---|---|
| 04-REQ-001 | Module-boundary meta: runtime realises 01 under 02 constraints | drop(module-boundary meta obsoleted by carving) | |
| 04-REQ-002 | Runtime holds no platform-wide state; single-game scope | global-invariants | |
| 04-REQ-003 | No gameplay mutation from unadmitted connections | identity-and-authorization | |
| 04-REQ-004 | Every past turn queryable directly, no re-execution | replay-and-audit | |
| 04-REQ-005 | Historical record append-only (destroyedTurn sole exception) | replay-and-audit | dedupe:04-REQ-059/066 |
| 04-REQ-006 | Per-turn snapshot of each snake's full state | replay-and-audit | |
| 04-REQ-007 | Item lifetimes tracked by spawn/destroy turn | replay-and-audit | |
| 04-REQ-008 | Board layout written once at init | replay-and-audit | |
| 04-REQ-009 | Per-turn record of budgets and declaration kind | replay-and-audit | seam:turn-pacing semantics |
| 04-REQ-010 | Per-turn wall-clock timestamps recorded | replay-and-audit | |
| 04-REQ-011 | All turn events retained, attributed, order preserved | replay-and-audit | |
| 04-REQ-012 | Record sufficient for replay without other runtimes | replay-and-audit | dedupe:02-REQ-013/014 |
| 04-REQ-013 | Privileged once-only init with precomputed state/params/roster/seed | game-lifecycle | |
| 04-REQ-014 | Successful init leaves turn-0 state fully written | game-lifecycle | |
| 04-REQ-015 | Post-init runtime ready for connections/staging/declarations | game-lifecycle | |
| 04-REQ-016 | Reject re-init; reject pre-init ops; disconnect pre-init clients | game-lifecycle | |
| 04-REQ-017 | No board generation in runtime; validate payload, reject sync | game-lifecycle | seam:game-configuration surfaces infeasibility |
| 04-REQ-018 | client_connected validates JWT claims at application level | identity-and-authorization | dedupe:03-REQ-023 |
| 04-REQ-019 | Validate aud/sub/roster; derive role; coach filtered read-only | identity-and-authorization | |
| 04-REQ-020 | Attribution record per admitted connection, lifetime retention | replay-and-audit | dedupe:03-REQ-044,04-REQ-021 (legacy 020 cites 044) |
| 04-REQ-021 | Attribution survives disconnect/reconnect | replay-and-audit | |
| 04-REQ-022 | Disconnect on failed claim validation; no attribution written | identity-and-authorization | |
| 04-REQ-023 | OIDC JWT is the only admission mechanism | identity-and-authorization | dedupe:03-REQ-019 |
| 04-REQ-024 | Move staging; only owning team's participants | operator-control | |
| 04-REQ-025 | Staged moves append-only; latest per snake wins; never cleared | operator-control | Q4 — supersedes 02-REQ-011/012 wording |
| 04-REQ-026 | Each staged move records Agent, time, turn permanently | replay-and-audit | |
| 04-REQ-027 | Staged-move log enables sub-turn reconstruction | replay-and-audit | |
| 04-REQ-028 | No legality validation at staging | operator-control | |
| 04-REQ-029 | Cannot stage for other team's snake | operator-control | gi-dedupe:team-granularity-authorization |
| 04-REQ-030 | Chess-timer semantics implemented in-runtime | turn-pacing | cites game-engine clock rules |
| 04-REQ-031 | Declare-turn-over: stops clock, credits, idempotent | turn-pacing | |
| 04-REQ-032 | Clock expiry auto-declares, marked distinctly | turn-pacing | |
| 04-REQ-033 | Resolution triggered exactly once when all teams declared | turn-pacing | |
| 04-REQ-034 | Teams with no alive snakes auto-declared | turn-pacing | |
| 04-REQ-035 | Budget bookkeeping conforms to game-engine rules | turn-pacing | |
| 04-REQ-036 | Resolution executes shared engine; no parallel variant | global-invariants | gi-dedupe:single shared engine (mint-global-invariants) |
| 04-REQ-037 | Resolution one atomic transaction; no intermediate state | live-game-observation | dedupe:04-REQ-056/067 |
| 04-REQ-038 | Resolution step sequence | code-mechanism | |
| 04-REQ-039 | stagedBy is connect-time Agent carried untouched | replay-and-audit | |
| 04-REQ-040 | Movement stagedBy nullable = fallback move | replay-and-audit | |
| 04-REQ-041 | No late ops reordered into committed turn | turn-pacing | |
| 04-REQ-042 | After commit next turn begins: budgets, clocks, ops | turn-pacing | |
| 04-REQ-043 | Closed 10-kind turn-event enumeration | replay-and-audit | seam:live animation consumers |
| 04-REQ-044 | Events self-sufficient for visualisation | replay-and-audit | |
| 04-REQ-045 | Events are a set; canonical order derived | replay-and-audit | |
| 04-REQ-046 | No events implying outside-ruleset mechanics | drop(subsumed by 04-REQ-043 closed enumeration) | |
| 04-REQ-047 | Data-layer filtering of invisible opponent rows | live-game-observation | dedupe:02-REQ-010,03-REQ-031 |
| 04-REQ-048 | Filtering applies to historical queries (scrub-safe) | live-game-observation | |
| 04-REQ-049 | Only snake's own state hidden; board effects visible | live-game-observation | |
| 04-REQ-050 | Allies see invisible snake with visible=false | live-game-observation | |
| 04-REQ-051 | Visibility transitions exactly at turn boundaries | live-game-observation | |
| 04-REQ-052 | Server-side filtering; staged-move reads own-team-only | live-game-observation | split: invisibility half here; staged-move read policy operator-control; attribution-metadata blocking identity-and-authorization (Design §2.9.1) |
| 04-REQ-053 | Subscriptions deliver turn progression incrementally | live-game-observation | dedupe:02-REQ-009 |
| 04-REQ-054 | Subscription patterns: live, scrub, animation, catch-up | live-game-observation | |
| 04-REQ-055 | Subscription deliveries visibility-filtered like queries | live-game-observation | |
| 04-REQ-056 | Turn commit delivered as single logical update | live-game-observation | dedupe:04-REQ-037 |
| 04-REQ-057 | Any past turn reconstructible within authorised visibility | live-game-observation | |
| 04-REQ-058 | Reconstruction needs no game-logic re-execution | live-game-observation | |
| 04-REQ-059 | Past queries stable as turns progress | replay-and-audit | dedupe:04-REQ-005 |
| 04-REQ-060 | Game ends at win-detect commit; later ops rejected | game-lifecycle | |
| 04-REQ-061 | Complete record bundled to Convex at game end | replay-and-audit | |
| 04-REQ-061a | Runtime notifies Convex via registered callback | game-lifecycle | dedupe:02-REQ-022a,05-REQ-038 |
| 04-REQ-062 | Replay export authenticated as Convex platform only | replay-and-audit | |
| 04-REQ-063 | No teardown until export confirmed retrieved | game-lifecycle | |
| 04-REQ-064 | Export bypasses visibility filtering; full record | replay-and-audit | |
| 04-REQ-065 | No spontaneous transmission during gameplay | global-invariants | |
| 04-REQ-066 | Never modify committed historical records | replay-and-audit | dedupe:04-REQ-005 |
| 04-REQ-067 | No pre-commit delivery to subscribers | live-game-observation | dedupe:04-REQ-037 |
| 04-REQ-068 | No external system consulted during gameplay | global-invariants | |
| 04-REQ-069 | Deterministic given seeds/config/staged sequence | replay-and-audit | dedupe-check vs game-engine/determinism |
| 04-REQ-070 | Privileges from JWT only; spectator/coach reducers rejected | identity-and-authorization | |
| 04-REQ-071 | Per-turn scoreboard rows, true alive set, sole aggregate channel | live-game-observation | |
| 04-REQ-072 | Host warm-up: suspended→ready ≤10s, light auth, idempotent | game-lifecycle | NOT team-server-management (different warm-up) |

04 review items carrying scenarios: 04-REVIEW-002 (null stagedBy fallback)
→ replay-and-audit; 04-REVIEW-003 (hazard-damage event dedup) →
replay-and-audit; 04-REVIEW-004 (same-phase ordering) → replay-and-audit;
04-REVIEW-006 (zero grace window) → game-lifecycle; 04-REVIEW-007
(unbounded retention) → replay-and-audit; 04-REVIEW-009 (delivery order
unguaranteed) → live-game-observation; 04-REVIEW-011 (connect-time Agent)
→ replay-and-audit (with the 03-REQ-044 cluster); 04-REVIEW-012 (turn-0 fully public) →
live-game-observation; 04-REVIEW-013 (seed hidden live, exported post) →
replay-and-audit; 04-REVIEW-014 (no final-submission barrier) →
operator-control; 04-REVIEW-020 (scoreboard covers invisible, zero-filled
eliminated) → live-game-observation; 04-REVIEW-021 (normalised as-if-ended
live score) → live-game-observation; 04-REVIEW-023 (budget+clock invariant
every instant) → turn-pacing.

Constraint-mining leads (04 Design): effective move scoped to current turn,
never carries over (operator-control); clients subscribe only to views,
never raw tables (live-game-observation); own-team staged history readable,
cross-team never (operator-control); turn-0 clock starts at init completion
(turn-pacing); scoreboard written in same transaction as snapshots
(live-game-observation); canonical event order derived, never stored
(replay-and-audit); callback token pre-signed, no crypto in WASM
(game-lifecycle); notification may be lost after 3 retries — stale-game
polling is required fallback (game-lifecycle); replayData null on error
outcomes (replay-and-audit); gameSeed must always be forwarded
(game-lifecycle); permissions table invisible to clients
(identity-and-authorization); no self-teardown — only Convex tears down
after 2xx (game-lifecycle).

## Module 05 — Convex platform (79 ids)

| id | intent | assignment | notes |
|---|---|---|---|
| 05-REQ-001 | Convex owns platform state; Centaur-subsystem state separate | code-mechanism | |
| 05-REQ-002 | Convex never mirrors live STDB state; replay import sole exception | global-invariants | |
| 05-REQ-003 | Platform and Centaur schemas share deployment without collisions | code-mechanism | |
| 05-REQ-004 | Persistent user record per Google identity | accounts-and-profiles | |
| 05-REQ-005 | Record created on first OAuth; canonical email immutable | accounts-and-profiles | dedupe:03-REQ-008 |
| 05-REQ-006 | User record anchors authorization/membership/keys/admin/attribution | identity-and-authorization | |
| 05-REQ-007 | Never delete/merge user records; attribution stays | accounts-and-profiles | dedupe:03-REQ-047 half |
| 05-REQ-008 | Team record: name, colour, captain, nullable domain | team-management | Q1; domain field seam:team-server-management |
| 05-REQ-009 | Healthcheck status recorded on-demand, no polling | team-server-management | |
| 05-REQ-011 | Membership records; every member Operator; captain structural | team-management | |
| 05-REQ-012 | Captain manages members/captaincy/boot; freeze-gated | team-management | |
| 05-REQ-013 | Reject roster mutation while playing; tournament-wide | team-management | dedupe:03-REQ-046 |
| 05-REQ-014 | Captain sets domain; validated at start; frozen playing | team-server-management | |
| 05-REQ-015 | Captain may clear domain; null bars participation | team-server-management | |
| 05-REQ-015a | Teams never deleted; archive/unarchive, history preserved | team-management | |
| 05-REQ-016 | Room record: name, owner, current game, teams, archived | rooms-and-matchmaking | |
| 05-REQ-017 | Owner has admin control; ownerless room open control | rooms-and-matchmaking | |
| 05-REQ-018 | Abdication irreversible; ownership never reassigned | rooms-and-matchmaking | |
| 05-REQ-019 | Room creation: creator owner, eager default game | rooms-and-matchmaking | seam:game-lifecycle successor story |
| 05-REQ-020 | ≥2 enrolled teams before start | rooms-and-matchmaking | |
| 05-REQ-021 | Rooms persist forever; archive-only | rooms-and-matchmaking | |
| 05-REQ-021a | Archived room: no new/started games; unarchive | rooms-and-matchmaking | |
| 05-REQ-022 | Convex sole truth for game config; config on game | game-configuration | |
| 05-REQ-023 | Closed parameter set; out-of-range rejected | game-configuration | |
| 05-REQ-024 | Config editable not-started; frozen at playing | game-configuration | dedupe:02-REQ-050 |
| 05-REQ-025 | Zero-sentinel disable; gated values persisted but ignored | game-configuration | |
| 05-REQ-026 | Config excludes bot/heuristic parameters | game-configuration | boundary with bot-configuration |
| 05-REQ-027 | Game record fields incl. outcome, forfeits | game-lifecycle | |
| 05-REQ-027a | forfeitedTeamIds; forfeit = loss 0, distinguishable | tournaments | |
| 05-REQ-028 | Convex sole status authority; closed transitions | game-lifecycle | |
| 05-REQ-029 | Append-only per-game roster snapshot seeds admission | game-lifecycle | seam:identity-and-authorization binding (03-REQ-039) |
| 05-REQ-030 | Snapshot + team records gate token issuance | identity-and-authorization | |
| 05-REQ-031 | Start by admin actor when all ready; captain-only ready | rooms-and-matchmaking | |
| 05-REQ-032 | Seven-step start orchestration | game-lifecycle | step detail largely code-mechanism |
| 05-REQ-032a | Orchestration authenticated; callback registration, token unstored | game-lifecycle | |
| 05-REQ-032b | Board preview; lock captures a specific board for launch | game-configuration | author ruling: lock-capture model (Design §2.4) is intent; persist-on-regeneration text was stale |
| 05-REQ-032c | BoardGenerationFailure surfaced naming constraint | game-configuration | |
| 05-REQ-032d | Config split: orchestration vs runtime subtree | game-configuration | |
| 05-REQ-033 | No instance without record; no record without intended instance | game-lifecycle | orphan invariant of the provision bracket; fails gi no-owner prong |
| 05-REQ-034 | Platform RSA keypair signs STDB tokens | identity-and-authorization | mechanism detail code-level |
| 05-REQ-034a | OIDC discovery/JWKS; no secret exchange | identity-and-authorization | dedupe:03-REQ-022 |
| 05-REQ-035 | Convex sole token issuer; refuses for finished games | identity-and-authorization | |
| 05-REQ-036 | Start-time healthcheck failure: manual aborts, tournament ignores | game-lifecycle | start-orchestration branching (parallels 03-REQ-056); seam:tournaments,team-server-management |
| 05-REQ-037 | Teardown immediately after replay storage confirmed | game-lifecycle | |
| 05-REQ-038 | Game-end callback: outcome, replay, finish, teardown | game-lifecycle | dedupe:04-REQ-061a,02-REQ-022a |
| 05-REQ-039 | Non-tournament finish auto-creates successor | game-lifecycle | dedupe:02-REQ-051 |
| 05-REQ-040 | Persist complete record before teardown | replay-and-audit | |
| 05-REQ-041 | Replay + action log reconstruct full history | replay-and-audit | |
| 05-REQ-042 | Defensive check: Agent-form attributions only | replay-and-audit | dedupe:03-REQ-045 |
| 05-REQ-043 | No persistence before terminal state signalled | replay-and-audit | |
| 05-REQ-044 | Replay survives teardown; viewing never consults STDB | replay-and-audit | |
| 05-REQ-045 | API bearer-key auth; reject invalid/revoked/non-admin | platform-integrations | Q2 |
| 05-REQ-046 | Key record hash-only, label, creator, timestamps | platform-integrations | |
| 05-REQ-047 | Valid key = global admin-level access | platform-integrations | |
| 05-REQ-048 | API never creates identities/OAuth/tokens/Centaur state | platform-integrations | |
| 05-REQ-049 | API endpoint families: teams, rooms, games, webhooks | platform-integrations | resolves scout dispute |
| 05-REQ-050 | API mutations obey same invariants as frontend | platform-integrations | API/frontend parity is the integrator story; phrase generically (no roster-freeze citation) |
| 05-REQ-051 | Key creation; plaintext disclosed exactly once | platform-integrations | |
| 05-REQ-052 | Key revocation immediate | platform-integrations | |
| 05-REQ-053 | Webhook subscriptions: URL, events, scope, owning key | platform-integrations | |
| 05-REQ-054 | game_start webhook on playing transition | platform-integrations | |
| 05-REQ-055 | game_end webhook on finished transition | platform-integrations | |
| 05-REQ-056 | At-least-once delivery, backoff, dedup via stable id | platform-integrations | |
| 05-REQ-057 | Delivery never blocks lifecycle/persistence/teardown | platform-integrations | gi flag noted; keep local, cite game-lifecycle |
| 05-REQ-058 | Webhooks auto-revoked with owning key | platform-integrations | |
| 05-REQ-059 | Tournament: N rounds, fresh instance each | tournaments | |
| 05-REQ-060 | Rounds chain with interlude | tournaments | |
| 05-REQ-061 | First round at scheduledStartTime, never earlier | tournaments | |
| 05-REQ-062 | Rounds inherit config minus tournament meta-params | tournaments | |
| 05-REQ-063 | No auto-create after final round | tournaments | |
| 05-REQ-064 | Roster freeze spans whole tournament | tournaments | dedupe:05-REQ-013 extension |
| 05-REQ-065 | Platform admin role on user record | identity-and-authorization | dedupe:03-REQ-060 |
| 05-REQ-066 | Admins read all; implicit coach everywhere | identity-and-authorization | dedupe:03-REQ-061..063 |
| 05-REQ-067 | Captain-designated coaches: read-only live visibility | live-game-observation | author abstractly (team-private live state) to fit DAG ceiling; Captain-designation half joins 05-REQ-068a in team-management |
| 05-REQ-068 | Admin-designation mechanism unspecified | code-mechanism | dedupe:03-REQ-064 |
| 05-REQ-068a | Coaches on team record, distinct from roster | team-management | |
| 05-REQ-068b | Coach access adds nothing for finished games | live-game-observation | |
| 05-REQ-073 | WASM module in Convex file storage, build-pipeline uploaded | code-mechanism | |
| 05-REQ-074 | Best-effort warm-up on config creation; never blocks | game-lifecycle | |

05 review items carrying scenarios: 05-REVIEW-002 (room archive preserves)
→ rooms-and-matchmaking; 05-REVIEW-003 (freeze spans interludes) →
tournaments; 05-REVIEW-005 (no game_created event) →
platform-integrations; 05-REVIEW-007 (ready flags cleared on auto-create)
→ rooms-and-matchmaking; 05-REVIEW-008 (one live editable game per room)
→ game-configuration; 05-REVIEW-009 (unhealthy server: manual blocked,
tournament forfeits) → game-lifecycle; 05-REVIEW-011 (team
archive-only, blocked mid-play) → team-management; 05-REVIEW-012 (2h
credential, dead at finish) → identity-and-authorization; 05-REVIEW-013
(10s invitation window) → game-lifecycle; 05-REVIEW-014 (timekeeper
eliminated; tempo per-operator) → team-management; 05-REVIEW-015 (replay
bundled in notification, immediate teardown) → game-lifecycle;
05-REVIEW-016 (init deferred until invitations; walkover transition) →
tournaments; 05-REVIEW-018 (walkover 1.0 par, forfeiters 0) →
tournaments; 05-REVIEW-019 (one-shot warm-up, cold-start fallback) →
game-lifecycle.

Constraint-mining leads (05 Design): config validator mirrors engine
GameConfig field-for-field with drift guard (game-configuration); email
uniqueness query-then-guard (accounts-and-profiles); UserDoc omits email —
project away at query boundary (accounts-and-profiles); rosterSnapshot
email-free (accounts-and-profiles); coach sub-claim distinguishes from
operator (live-game-observation); all token endpoints refuse finished games
(identity-and-authorization); callback JWT-validated, never persisted
(game-lifecycle); post-provisioning failure tears down instance — orphan
prevention (game-lifecycle); auto-create atomic with room.currentGameId
(game-lifecycle); one active WASM module, atomic switch (code-mechanism);
tournament rounds auto-start, freeze anchored to in_progress (tournaments);
webhook idempotency key stability (platform-integrations).

## Module 06 — Centaur state (49 ids)

| id | intent | assignment | notes |
|---|---|---|---|
| 06-REQ-001 | Subsystem owns bot-side state except game-authoritative/platform records | global-invariants | |
| 06-REQ-002 | All Centaur state in Convex, never SpacetimeDB | global-invariants | |
| 06-REQ-003 | Subsystem holds no game-outcome-authoritative state | global-invariants | |
| 06-REQ-004 | Team-scoped vs game-scoped state partition | code-mechanism | intent halves land in bot-configuration/replay-and-audit |
| 06-REQ-005 | Per-team heuristic defaults persist; server replacement inherits | bot-configuration | |
| 06-REQ-006 | Preference defaults: active flag + weight | bot-configuration | |
| 06-REQ-007 | Drive defaults: weight, nickname, pinned ordering | bot-configuration | |
| 06-REQ-008 | Captain-only CRUD on heuristic defaults | bot-configuration | |
| 06-REQ-009 | Default edits never retroactive on in-progress games | bot-configuration | |
| 06-REQ-010 | Only Captain writes defaults, data-layer enforced | bot-configuration | |
| 06-REQ-011 | Team bot params: temperature + three timing defaults + pins | bot-configuration | split note: timing fields serve turn-pacing |
| 06-REQ-012 | Only Captain writes bot params | bot-configuration | |
| 06-REQ-013 | Per-snake portfolio state incl. overrides | bot-configuration | |
| 06-REQ-014 | Game-start init: default-active Preferences, no Drives | bot-configuration | seam:game-lifecycle invokes |
| 06-REQ-015 | Portfolio mutations: Drives, weights, activation, temperature | bot-configuration | |
| 06-REQ-016 | Portfolio persists across turns; deselection resets nothing | bot-configuration | |
| 06-REQ-017 | Effective config = defaults overlaid with overrides | bot-configuration | dedupe:07-REQ-016 |
| 06-REQ-018 | Per-snake selection record: operator + manual flag | operator-control | |
| 06-REQ-019 | At most one operator per snake | operator-control | dedupe:02-REQ-018,06-REQ-020 |
| 06-REQ-020 | At most one snake per operator | operator-control | dedupe:06-REQ-019 |
| 06-REQ-021 | Invariant-violating mutations rejected server-side | operator-control | |
| 06-REQ-022 | Taking held snake requires explicit displacement | operator-control | |
| 06-REQ-023 | Displacement atomic across both records | operator-control | |
| 06-REQ-024 | Selection restricted to owning team members | operator-control | |
| 06-REQ-025 | Manual toggle selector-only; auto-set on staging | operator-control | |
| 06-REQ-025a | Game end clears selections; replay rebuilds from log | operator-control | seam:game-lifecycle end bracket |
| 06-REQ-026 | Persist per-snake computed display state | decision-transparency | |
| 06-REQ-027 | Owning server sole writer via game credential | decision-transparency | dedupe:07-REQ-004; re-author as "team's hosting server is sole writer" (credential mechanics outside ceiling) |
| 06-REQ-028 | Updates are full snapshots, independently interpretable | decision-transparency | |
| 06-REQ-029 | No rate limit; bot framework owns cadence | decision-transparency | |
| 06-REQ-030 | All mutations via function contract, no direct writes | code-mechanism | |
| 06-REQ-031 | Every mutation authenticates and enforces authorization | identity-and-authorization | |
| 06-REQ-032 | Read scoping: live team/coach/admin-only; finished public | live-game-observation | split: replay half replay-and-audit; team-config-access half bot-configuration |
| 06-REQ-033 | Action log at sub-turn clock resolution | replay-and-audit | |
| 06-REQ-034 | Entry fields: game, turn, actor, timestamp | replay-and-audit | |
| 06-REQ-035 | Log + STDB reconstructs full team experience | replay-and-audit | stale "operator mode" bullet — do not carry |
| 06-REQ-036 | Logged event categories incl. tempo, boots | replay-and-audit | |
| 06-REQ-037 | Mutations log transactionally; dropped entry = no mutation | replay-and-audit | gi flag noted; keep local |
| 06-REQ-038 | Log never reconstructs authoritative game state | replay-and-audit | gi-dedupe:authority placement |
| 06-REQ-039 | Entries immutable, append-only | replay-and-audit | |
| 06-REQ-040 | Game-scoped state retained past teardown | replay-and-audit | |
| 06-REQ-040a | Per-game per-team live params from defaults | turn-pacing | split: temperature belongs bot-configuration |
| 06-REQ-040b | Per-operator tempo durable; boot = stateless disconnect | turn-pacing | boot half seam:operator-control |
| 06-REQ-041 | Team-scoped state persists team lifetime | bot-configuration | |
| 06-REQ-042 | Fresh games start with zero game-scoped state | game-lifecycle | re-author generically ("no pre-existing Centaur state") — avoid enumerating downstream concepts |
| 06-REQ-043 | Server subscribes; real-time observation | code-mechanism | |
| 06-REQ-044 | Operators mutate Centaur state directly, never via server | global-invariants | |
| 06-REQ-045 | STDB never reads/writes Centaur state | global-invariants | |
| 06-REQ-046 | No mutation writes STDB-owned state | global-invariants | dedupe:06-REQ-045 |

06 review items carrying scenarios: 06-REVIEW-001 (server replacement
inherits defaults) → bot-configuration; 06-REVIEW-002 (cross-team denied;
admin implicit coach) → live-game-observation; 06-REVIEW-003 (each actor
writes own entries transactionally) → replay-and-audit; 06-REVIEW-004
(dropped entry = failed mutation; move_staged in STDB only) →
replay-and-audit; 06-REVIEW-005 (temperature override survives) →
bot-configuration; 06-REVIEW-006 (terminal selection cleared; replay from
log) → replay-and-audit; 06-REVIEW-008 (live record over log-derivation;
mode superseded by tempo) → turn-pacing.

Constraint-mining leads (06 Design): uniqueness is query-then-guard under
OCC, silently violable (global-invariants); one-snake guard exempts null
operator rows (operator-control); selectSnake auto-deselects previous with
log entry (operator-control); toggleManualMode ordering vs stage_move race
(operator-control); insertMissingHeuristicConfig insert-only
(bot-configuration); unrecognised heuristicIds ignored, team-cleanable
(bot-configuration); init idempotent (game-lifecycle); tempo no-op writes
still log (turn-pacing); turn_submitted distinct from declare_turn_over
(turn-pacing); init snakeIds match board generation (game-lifecycle);
weight_changed carries full before/after (replay-and-audit); boot writes no
persistent state (operator-control).

## Module 07 — bot framework (69 ids)

| id | intent | assignment | notes |
|---|---|---|---|
| 07-REQ-001 | Library inside server process sharing state access | bot-framework | |
| 07-REQ-002 | Depth-1 lookahead is binding MVP scope | bot-framework | |
| 07-REQ-003 | Per-snake stateMap direction→worst-case, continuously updated | bot-framework | |
| 07-REQ-004 | Framework sole writer of computed display state | decision-transparency | dedupe:06-REQ-027 |
| 07-REQ-005 | Never writes authoritative state; staged moves only channel | bot-framework | gi flag noted |
| 07-REQ-006 | Drive<T> and Preference author abstractions | bot-framework | |
| 07-REQ-007 | Drive operations enumerated | bot-framework | |
| 07-REQ-008 | Preference: targetless [−1,1] function | bot-framework | |
| 07-REQ-009 | All scalars [−1,1]; importance via weights only | bot-framework | |
| 07-REQ-009a | Validate/clamp/substitute author scalars | bot-framework | |
| 07-REQ-009b | Structured violation logging, per-turn dedup | bot-framework | |
| 07-REQ-010 | Satisfied Drive terminal reward, retired at turn close | bot-framework | |
| 07-REQ-011 | Goal/Fear author-level only | bot-framework | |
| 07-REQ-012 | No algebraic assumptions beyond range | bot-framework | |
| 07-REQ-013 | Portfolio definition: active heuristics, weights, targets, temperature | bot-framework | cycle-break: author temperature as opaque portfolio scalar; derivation (07-REQ-056) stays bot-configuration |
| 07-REQ-014 | Portfolios initialised from game-start defaults | bot-configuration | |
| 07-REQ-015 | Operator mutations recompute live; never clear cache | bot-configuration | |
| 07-REQ-016 | Effective config = default overlaid by portfolio | bot-configuration | dedupe:06-REQ-017 |
| 07-REQ-017 | Targets always concrete; unresolved never maintained | bot-configuration | |
| 07-REQ-018 | Never modifies team defaults | bot-configuration | |
| 07-REQ-019 | Candidate directions; lethal retained last-resort | bot-framework | |
| 07-REQ-020 | Exactly three reactive inputs | bot-framework | |
| 07-REQ-021 | Branch activation semantics; toggling never re-simulates | bot-framework | split: activation predicate is observable (07-REQ-035 ranges over it); no-re-simulation half stays mechanism |
| 07-REQ-022 | Weight changes rescore only | bot-configuration | live-edit guarantee |
| 07-REQ-023 | Cache cleared only on turn change; reconnect-safe | bot-framework | |
| 07-REQ-024 | Append-only simulated-world cache via shared engine | code-mechanism | |
| 07-REQ-025 | Cached worlds store normalised outputs | code-mechanism | |
| 07-REQ-026 | Weights applied at scoring time | code-mechanism | |
| 07-REQ-027 | Lattice structure definition | code-mechanism | |
| 07-REQ-028 | Per-(snake,direction) priority weights | code-mechanism | |
| 07-REQ-029 | Anytime traversal by descending priority | code-mechanism | |
| 07-REQ-030 | Dijkstra-like traversal, no revisits | code-mechanism | |
| 07-REQ-031 | Priority changes reorder uncomputed only | code-mechanism | |
| 07-REQ-032 | Uninteresting foreign snakes frozen, timestamped | bot-framework | |
| 07-REQ-033 | Teammates count as foreign snakes | bot-framework | |
| 07-REQ-034 | Commitment semantics per mode | bot-framework | |
| 07-REQ-035 | stateMap = worst-case weighted score | bot-framework | |
| 07-REQ-036 | Weighted score composition; min aggregation; dirty flag | bot-framework | |
| 07-REQ-037 | Scoring never simulates | bot-configuration | live-editing story |
| 07-REQ-038 | Higher stateMap better; softmax favours higher | bot-framework | |
| 07-REQ-039 | Dirty flag triggers full snapshot | decision-transparency | |
| 07-REQ-040 | Compute tiers by attention; round-robin | bot-framework | seam:operator selection drives tier 2 |
| 07-REQ-041 | Round-robin/breadth-first details | code-mechanism | |
| 07-REQ-042 | Reactive rescoring from cache | code-mechanism | |
| 07-REQ-043 | Newly active points enqueued | code-mechanism | |
| 07-REQ-044 | Scheduled submission pass: sample, stage, clear dirty | turn-pacing | |
| 07-REQ-045 | Final flush at dynamic deadline | turn-pacing | |
| 07-REQ-045a | Captain manual submit suppresses final flush | turn-pacing | |
| 07-REQ-046 | Manual-mode snakes never framework-staged | operator-control | |
| 07-REQ-047 | Framework-staged moves attributed to bot identity | replay-and-audit | |
| 07-REQ-048 | Softmax sampling with effective temperature | bot-framework | temperature as opaque scalar (see 07-REQ-013 note) |
| 07-REQ-049 | Undefined entries excluded; fallback lastDirection/random | bot-framework | |
| 07-REQ-050 | Temperature calibration contract (low=deterministic) | bot-configuration | |
| 07-REQ-051 | Selection promotes tier; deselection demotes | bot-framework | seam:operator-control selection state drives it |
| 07-REQ-052 | Promotion re-evaluates, rescores, snapshots | bot-framework | |
| 07-REQ-053 | Promotion never stages | bot-framework | |
| 07-REQ-054 | Operator-staged move survives promotion | bot-framework | |
| 07-REQ-055 | Temperature sources: team default + override | bot-configuration | dedupe:06-REQ-011/013 fields |
| 07-REQ-056 | Effective temperature reactive, no invalidation | bot-configuration | |
| 07-REQ-057 | Persistent state in Centaur state only; scratch in-memory | bot-framework | gi flag noted |
| 07-REQ-058 | Subscribes to game-scoped state for reactivity | bot-framework | |
| 07-REQ-059 | Never mutates state for operators | bot-framework | |
| 07-REQ-060 | Reads board from STDB subscription; never caches in Convex | bot-framework | |
| 07-REQ-061 | No access to other teams' STDB or masked state | global-invariants | |
| 07-REQ-062 | Staged moves logged in STDB only, not action log | replay-and-audit | dedupe:06-REVIEW-004 |
| 07-REQ-063 | Every snapshot gets action-log entry | replay-and-audit | |
| 07-REQ-064 | Never logs operator-originated events | replay-and-audit | |
| 07-REQ-065 | Simulated boards carry per-snake turn timestamps | bot-framework | |
| 07-REQ-066 | Consumers compensate frozen snakes via timestamp | bot-framework | seam:decision-transparency rendering |

07 review items carrying scenarios: 07-REVIEW-002 (out-of-interest teammate
move adds no dimension) → bot-framework; 07-REVIEW-003 (temporal head-start
compensation) → bot-framework; 07-REVIEW-005 (deadline formula; suppress vs
flush) → turn-pacing; 07-REVIEW-006 (partial stateMap sampling) →
bot-framework; 07-REVIEW-007 (retirement anchors authoritative board) →
bot-framework; 07-REVIEW-008 (same-turn reconnect keeps cache) →
bot-framework; 07-REVIEW-009 (staged moves solely in STDB) →
operator-control; 07-REVIEW-012 (interval/threshold are team-tunable
params) → bot-configuration; 07-REVIEW-013 (deterministic worst-case
tie-break) → decision-transparency; 07-REVIEW-014 (annotations excised;
violations server-log-only) → decision-transparency.

Constraint-mining leads (07 Design): author exceptions never crash worker
(bot-framework); insert-only heuristic config, registry∩config
intersection, unresolvable targets omitted-not-deleted
(bot-configuration); dirty flag cleared only on stage ack; final-pass timer
re-arms when budget shrinks; declareTurnOver observed via STDB only
(turn-pacing); selection reaches framework only via Convex subscription
(operator-control); frontend never recomputes, absent cells render absent,
snapshots full replacements, deterministic tie-break
(decision-transparency); frozen snakes via wrapper composition, engine
untouched (bot-framework).

## Module 08 — Snek Centaur Server frontend (165 ids)

Most 08 authorization requirements are UI mirrors of authority living in
05/06 contracts; the authoring changes re-author them as "the UI reflects
X" or dedupe them against the enforcement requirement, never double-owning
enforcement.

| id | intent | assignment | notes |
|---|---|---|---|
| 08-REQ-001 | One unified web app, no separate platform app | team-server-management | dedupe:02-REQ-059 |
| 08-REQ-002 | Auth before functionality beyond sign-in/public | identity-and-authorization | dedupe:03-REQ-010 |
| 08-REQ-003 | Client talks to server subscriptions, Convex, STDB | code-mechanism | |
| 08-REQ-004 | One server hosts multiple teams; view split | team-server-management | |
| 08-REQ-005 | Well-known invite endpoint receives credentials | team-server-management | |
| 08-REQ-006 | Google OAuth only; no own credential store | identity-and-authorization | dedupe:03-REQ-007/009 |
| 08-REQ-007 | Identity resolved to user record; actions attributed | identity-and-authorization | |
| 08-REQ-008 | Captain-gated affordances react without reload | bot-configuration | UI-mirror |
| 08-REQ-009 | Never self-issue STDB tokens | identity-and-authorization | |
| 08-REQ-009a | Never store/display credential plaintext (one API-key exception) | identity-and-authorization | seam:platform-integrations disclosure |
| 08-REQ-009b | Sign-out terminates session, revokes client tokens | identity-and-authorization | |
| 08-REQ-009c | Admin affordances per role, effective without reload | identity-and-authorization | UI-mirror |
| 08-REQ-010 | Persistent global navigation | code-mechanism | |
| 08-REQ-010a | Home view: teams, rooms, in-progress games | accounts-and-profiles | |
| 08-REQ-011 | Active game prominent for member operators | operator-control | |
| 08-REQ-012 | No live page without playing game; explanatory empty state | operator-control | |
| 08-REQ-013 | Replay viewer via history/direct link | code-mechanism | |
| 08-REQ-014 | Heuristic config page lists registered heuristics | bot-configuration | |
| 08-REQ-015 | Edit Preference flag + weight | bot-configuration | |
| 08-REQ-016 | Edit Drive weight, nickname, pinning | bot-configuration | |
| 08-REQ-017 | Team-default mutations Captain-only via contract | bot-configuration | UI-mirror of 06-REQ-008 |
| 08-REQ-018 | Communicate future-games-only effect | bot-configuration | |
| 08-REQ-019 | Page mutates only team defaults | bot-configuration | |
| 08-REQ-020 | Bot params page: temperature + time allocation | bot-configuration | |
| 08-REQ-021 | Param mutations Captain-only | bot-configuration | UI-mirror |
| 08-REQ-022 | Params effective next game, snapshotted | bot-configuration | |
| 08-REQ-023 | No game-config params on bot page | bot-configuration | |
| 08-REQ-023a | Teams browser lists all teams | accounts-and-profiles | |
| 08-REQ-023b | Team Management shows identity/members/coaches/domain/health | team-management | seam:server-nomination/health half team-server-management |
| 08-REQ-023c | Any user creates team; creator Captain | team-management | Q1 |
| 08-REQ-023d | Captain-only team mutations | team-management | UI-mirror |
| 08-REQ-023e | Freeze: affordances visibly disabled with explanation | team-management | |
| 08-REQ-023f | No bot/operator config on Team Management | team-server-management | |
| 08-REQ-024 | Team game history listing, eligibility, ordering | replay-and-audit | |
| 08-REQ-024a | Room Browser listing | rooms-and-matchmaking | |
| 08-REQ-024b | Filter/search by name | rooms-and-matchmaking | |
| 08-REQ-024c | Room creation; creator owner | rooms-and-matchmaking | |
| 08-REQ-024d | Rooms link to lobbies | rooms-and-matchmaking | |
| 08-REQ-025 | Listing shows result, normalised score, aggregateLength | replay-and-audit | |
| 08-REQ-026 | Listing opens team-perspective replay | replay-and-audit | |
| 08-REQ-027 | No unrelated-team game listings | replay-and-audit | |
| 08-REQ-027a | Lobby shows owner/config/teams/readiness | rooms-and-matchmaking | |
| 08-REQ-027b | Lobby visible to all; non-participants read-only | rooms-and-matchmaking | |
| 08-REQ-027c | Administrative actor: edit/invite/remove/abdicate/start | rooms-and-matchmaking | |
| 08-REQ-027d | Client range enforcement UX-only; Convex authoritative | game-configuration | |
| 08-REQ-027d1 | Board-size widget presets + custom stepper | game-configuration | |
| 08-REQ-027e | Conditional params visually gated | game-configuration | |
| 08-REQ-027f | Captain-only ready toggling | rooms-and-matchmaking | UI-mirror |
| 08-REQ-027g | Lobby healthcheck ping affordance | team-server-management | |
| 08-REQ-027h | Start enabled only ≥2 ready teams; explained | rooms-and-matchmaking | |
| 08-REQ-027i | Board Preview from Convex; no client generation | game-configuration | |
| 08-REQ-027j | Lock-in flag; regeneration persistence | game-configuration | |
| 08-REQ-027k | Preview never affects playing game | game-configuration | |
| 08-REQ-027l | Lobby links to spectating when playing | live-game-observation | |
| 08-REQ-028 | Live interface defaults snakes to automatic | operator-control | |
| 08-REQ-029 | Selection is view-only, not manual mode | operator-control | |
| 08-REQ-030 | Manual entered by checkbox/direction; exit by uncheck | operator-control | |
| 08-REQ-031 | UI adds no scheduling logic | operator-control | |
| 08-REQ-032 | Header: turn, clock, budget, latency, presence, controls | turn-pacing | |
| 08-REQ-033 | Clock precision, warning, stable indicator | turn-pacing | |
| 08-REQ-034 | (removed; number reserved) | drop(removed per 08-REVIEW-011) | |
| 08-REQ-035 | Presence with stable per-operator colours | operator-control | |
| 08-REQ-036 | Client-measured latency indicator | operator-control | |
| 08-REQ-037 | Board renders grid/terrain/items/snakes | operator-control | shared renderer; design.md core |
| 08-REQ-038 | Effect outlines; shimmer own-team only | live-game-observation | |
| 08-REQ-039 | Selection glow in operator colours | operator-control | |
| 08-REQ-040 | Candidate cells coloured by stateMap | decision-transparency | |
| 08-REQ-041 | Staged-move marker live | operator-control | |
| 08-REQ-042 | Click-select, Escape, displacement confirm | operator-control | |
| 08-REQ-043 | No candidates for unselected snakes | operator-control | |
| 08-REQ-044 | Direction buttons score-labelled; lethal disabled-but-selectable | operator-control | |
| 08-REQ-045 | Direction pick stages, sets manual, triggers preview | operator-control | |
| 08-REQ-046 | Staged moves changeable until turn over | operator-control | |
| 08-REQ-047 | Manual checkbox reflects flag; locks staged move | operator-control | |
| 08-REQ-048 | Worst-case world translucent overlay | decision-transparency | |
| 08-REQ-049 | (MVP deferral: annotations excised) | drop(documented MVP deferral, 08-REVIEW-023) | |
| 08-REQ-050 | Preview updates reactively on snapshots | decision-transparency | |
| 08-REQ-051 | No preview without direction+computed state | decision-transparency | |
| 08-REQ-052 | Drive dropdown pinned-first ordering | bot-configuration | |
| 08-REQ-052a | Coach mode: full live UI read-only | live-game-observation | |
| 08-REQ-052b | Coach mode makes no writes | live-game-observation | |
| 08-REQ-052c | Coach inspection client-local | live-game-observation | |
| 08-REQ-052d | Inspection visibly distinct from selection | live-game-observation | |
| 08-REQ-053 | Targeting mode highlights eligible targets | bot-configuration | |
| 08-REQ-054 | Tab cycles targets deterministically | bot-configuration | |
| 08-REQ-055 | Target click adds Drive at default weight | bot-configuration | |
| 08-REQ-056 | Active Drives listed, editable, removable | bot-configuration | |
| 08-REQ-057 | Overrides persist across turns/deselection | bot-configuration | dedupe:06-REQ-016 |
| 08-REQ-058 | No unregistered Drive affordance | bot-configuration | |
| 08-REQ-059 | Per-direction breakdown table | decision-transparency | |
| 08-REQ-060 | Breakdown updates on snapshots/switches | decision-transparency | |
| 08-REQ-061 | Per-operator tempo toggle, persisted, reactive | turn-pacing | |
| 08-REQ-062 | Unanimous-flow passive precondition; bypasses | turn-pacing | |
| 08-REQ-063 | Tempo toggleable anytime; clock runs regardless | turn-pacing | |
| 08-REQ-064 | (Re)connect sets tempo flow — only automatic write | turn-pacing | |
| 08-REQ-064a | Coaches/admins excluded from quorum | turn-pacing | |
| 08-REQ-065 | Captain controls: submit override, boot | turn-pacing | |
| 08-REQ-066 | Captain submit keyboard-bindable | turn-pacing | |
| 08-REQ-067 | Non-Captains see no controls; server rejects | turn-pacing | UI-mirror |
| 08-REQ-068 | Tempo/boot/submit emit timestamped log events | replay-and-audit | |
| 08-REQ-068a | Boot = forced disconnect, no lockout | operator-control | seam:turn-pacing quorum |
| 08-REQ-069 | Unified viewer: board-level + team-perspective | replay-and-audit | |
| 08-REQ-070 | Board-level uses persisted replay only | replay-and-audit | |
| 08-REQ-070a | Turn-granularity rendering, normalised scoreboard | replay-and-audit | |
| 08-REQ-070b | Per-turn event log matching closed enumeration | replay-and-audit | |
| 08-REQ-071 | Team-perspective reuses live UI read-only | replay-and-audit | |
| 08-REQ-071a | Team-perspective participants-only | replay-and-audit | |
| 08-REQ-072 | Unified timeline reconstructs any position | replay-and-audit | |
| 08-REQ-072a | Mode toggle Per-Turn/Timeline | replay-and-audit | |
| 08-REQ-072b | Per-Turn scrub semantics | replay-and-audit | |
| 08-REQ-072c | Timeline wall-clock scrub semantics | replay-and-audit | |
| 08-REQ-072d | Keyboard scrub bindings | replay-and-audit | |
| 08-REQ-073 | Historical selection shadows in original colours | replay-and-audit | |
| 08-REQ-074 | Inspection client-local: no writes/shadow/displacement | replay-and-audit | |
| 08-REQ-075 | Inspect any team snake at any moment | replay-and-audit | |
| 08-REQ-075a | Replay reveals nothing beyond RLS-visible view | replay-and-audit | |
| 08-REQ-075b | Board-level shows no action-log Centaur data | replay-and-audit | |
| 08-REQ-075c | Direct-link URL to replay | replay-and-audit | |
| 08-REQ-076 | Uniform data-source abstraction live/replay | code-mechanism | fork-stability contract |
| 08-REQ-077 | Components mode-agnostic; abstraction enforces read-only | code-mechanism | |
| 08-REQ-078 | Replay data source has no mutation surface | replay-and-audit | |
| 08-REQ-079 | Forkable reference repo; invariants enforced externally | team-server-management | |
| 08-REQ-080 | Spectating available for any playing game | live-game-observation | |
| 08-REQ-080a | No customisation relied on for security | global-invariants | dedupe-check vs gi/security-enforced-outside-the-library |
| 08-REQ-081 | Spectator obtains Convex-issued token on entry | live-game-observation | |
| 08-REQ-081a | Live interface from playing until finished | operator-control | |
| 08-REQ-082 | Spectator subscribes to current-state view | live-game-observation | |
| 08-REQ-082a | On finish: terminal state, scores, replay link | operator-control | |
| 08-REQ-083 | Honour server-side filter; never infer hidden | live-game-observation | |
| 08-REQ-083a | Surface subscription loss; never fabricate | global-invariants | |
| 08-REQ-084 | Scoreboard solely from server aggregate view | live-game-observation | |
| 08-REQ-084a | App persists no authoritative state | global-invariants | |
| 08-REQ-084b | Never compute aggregates client-side | live-game-observation | dedupe:08-REQ-084 |
| 08-REQ-085 | Display turn, budgets, declared status | live-game-observation | |
| 08-REQ-086 | Spectating exposes zero mutating affordances | live-game-observation | |
| 08-REQ-087 | Timeline scrubber; full history up-front | live-game-observation | |
| 08-REQ-088 | Scrubbed view visibly not-live | live-game-observation | |
| 08-REQ-089 | Release subscription/token on exit | live-game-observation | |
| 08-REQ-090 | Player Profile for every user | accounts-and-profiles | |
| 08-REQ-091 | Profile: name, memberships, history; never email | accounts-and-profiles | |
| 08-REQ-091a | No query/view exposes any email ever | accounts-and-profiles | constrains 05 query layer |
| 08-REQ-092 | Aggregate stats consistent with listing | accounts-and-profiles | |
| 08-REQ-093 | Historical attribution via snapshots | accounts-and-profiles | |
| 08-REQ-094 | Team Profile, authenticated-only | accounts-and-profiles | |
| 08-REQ-094a | Leaderboard closed criteria set | accounts-and-profiles | |
| 08-REQ-094b | Criterion switching + time window | accounts-and-profiles | |
| 08-REQ-094c | Room-scoped ranking option | accounts-and-profiles | |
| 08-REQ-094d | Ranked teams link to profiles | accounts-and-profiles | |
| 08-REQ-094e | Archived teams in default leaderboard | accounts-and-profiles | |
| 08-REQ-094f | Leaderboard authenticated-only | accounts-and-profiles | |
| 08-REQ-095 | Team profile contents | accounts-and-profiles | |
| 08-REQ-095a | API key view: create/revoke/list | platform-integrations | Q2 |
| 08-REQ-095b | Plaintext shown once with copy | platform-integrations | |
| 08-REQ-095c | Plaintext never after disclosure | platform-integrations | dedupe:08-REQ-009a |
| 08-REQ-095d | Communicate key scope bound | platform-integrations | |
| 08-REQ-096 | Team aggregate stats server-side | accounts-and-profiles | |
| 08-REQ-096a | Admin sees all; coach entry everywhere | identity-and-authorization | UI-mirror |
| 08-REQ-096b | Admin strictly read-only over game state | identity-and-authorization | |
| 08-REQ-097 | Head-to-head via snapshots, archive-stable | accounts-and-profiles | |
| 08-REQ-098 | Team Profile no mutating affordances | accounts-and-profiles | |
| 08-REQ-100 | Rejections surfaced; never swallowed | global-invariants | |
| 08-REQ-101 | Affordance enablement from Convex state | global-invariants | |
| 08-REQ-102 | Show snapshotted params, never room defaults | game-configuration | |
| 08-REQ-103 | Views resilient to archived teams | global-invariants | alt:accounts-and-profiles |
| 08-REQ-104 | Every mutation via Convex under same invariants | global-invariants | dedupe:05-REQ-050 |

08 review items carrying scenarios: 08-REVIEW-001 (defaults Captain-only,
game overrides any-member) → bot-configuration; 08-REVIEW-002 (launch
snapshot) → bot-configuration; 08-REVIEW-003 (direct link grants any
finished replay) → replay-and-audit; 08-REVIEW-008 (concurrent inspectors
never conflict) → replay-and-audit; 08-REVIEW-011 (zero active operators
defers; Captain bypasses) → turn-pacing; 08-REVIEW-013 (readiness
read-only for non-Captains) → rooms-and-matchmaking; 08-REVIEW-014 (no
client board generation) → game-configuration; 08-REVIEW-015 (unlocked
regeneration hidden) → game-configuration; 08-REVIEW-016 (email hidden
even self-view) → accounts-and-profiles; 08-REVIEW-017 (archived teams in
leaderboard) → accounts-and-profiles; 08-REVIEW-018 (invisible counted,
never inferable) → live-game-observation; 08-REVIEW-019 (up-front history
subscription) → live-game-observation; 08-REVIEW-020 (home lists own-team
only) → rooms-and-matchmaking; 08-REVIEW-021 (stale heuristic rows greyed,
deletable) → bot-configuration; 08-REVIEW-024 (boot = disconnect, rejoin
in flow) → turn-pacing.

Constraint-mining leads (08 Design): replay/coach bindings structurally
mutation-free (replay-and-audit); tokens in component memory only, never
storage/URL (identity-and-authorization); operator colour deterministic in
(gameId,userId) (operator-control); invite endpoint signature check,
hosted-team check, idempotency (team-server-management); credential handed
in-process to bot session manager (team-server-management); presence proves
connectedness only, tempo read from Convex (turn-pacing); decision table
renders purely from published outputs (decision-transparency); dropdown =
config ∩ registry (bot-configuration); lazy insert on Captain page visit
(bot-configuration); hosted-teams-only routes vs cross-server deep links
(team-server-management); selectSnake/setManualMode separate, stageMove
atomic manual (operator-control); fork-stable surface enumeration
(team-server-management).

## Cross-module dedupe clusters (author once, retire many)

- Append-only history: 04-REQ-005/059/066 (+06-REQ-039 for the action log)
- Atomic turn delivery: 04-REQ-037/056/067 (+02-REQ-008 already retired)
- Invisibility filtering: 02-REQ-010, 03-REQ-031, 04-REQ-047 (one rule,
  scenarios for spectators/allies/history)
- Selection exclusivity: 02-REQ-018, 06-REQ-019/020
- Game-end notification: 02-REQ-022a, 04-REQ-061a, 05-REQ-038
- Successor auto-creation: 02-REQ-051, 05-REQ-039
- Roster freeze: 03-REQ-046, 05-REQ-013 (tournament extension 05-REQ-064)
- Admin role: 03-REQ-060..063, 05-REQ-065/066, 08-REQ-096a/096b
- API-key hygiene: 03-REQ-034, 05-REQ-046/051, 08-REQ-095b/095c/009a
- Credential scoping: 03-REQ-016/057
- Record sufficiency: 02-REQ-013/014, 04-REQ-012
- Effective config overlay: 06-REQ-017, 07-REQ-016
- No-client-aggregation: 08-REQ-084/084b with 04-REQ-071

## Known contradictions resolved by this matrix

1. Staged moves: append-only log (04) supersedes clear-on-resolve (02) —
   Q4.
2. 04-REQ-052 total staged-move read block vs Design own-team view:
   re-author own-team-only.
3. 05-REQ-032b preview persistence: AUTHOR-SETTLED (2026-07-24, after a
   forensic review of 08-REVIEW-015): a single current-preview value on
   the game record is overwritten per regeneration and broadcast to all
   clients (no archive of candidates — the original decision's intent);
   the lock is a boolean designating that platform-held value (never
   client-supplied board data), auto-clearing on board-affecting edits;
   an unlocked launch generates fresh from current parameters and a new
   seed, hidden until gameplay delivery.
4. 06-REQ-035 "operator mode" bullet: superseded by per-operator tempo; do
   not carry.
5. 02-REQ-064 unified viewer: replay-and-audit (capability-map) overrides
   the parked ledger's team-server-management heading.
6. Stale Design HTTP-API "role" param on add-member: eliminated by
   05-REVIEW-014; ignore.
