## Why

Seventh change of the final spec-migration train. The "players form
rooms, enrol teams, declare readiness, and get into games" story has no
vocabulary owner today: the room record, ownership, abdication, the
readiness check, the two-team start gate, and archive-only semantics live
in module 05 (§5.4, §5.6), while the Room Browser and Room Lobby that
players actually experience live in module 08 (§8.6, §8.8). Re-authoring
it as one capability puts the whole matchmaking workflow in one readable
place and retires 17 legacy ids.

## Carving decision

Mint **`rooms-and-matchmaking`** exactly as drawn in the capability map
and assignment matrix (author-approved with the capability set and DAG).
The legacy requirements and review items this change absorbs are
recorded in the identifier map under this change's name. Declared dependencies:
**game-lifecycle, game-configuration, team-management** as drawn in the
DAG, plus **global-invariants** — every one of them actually cited. The
list is an affordance extended whenever a citation is warranted, not a
budget: global-invariants is declared here because several of this
capability's guarantees depend on cross-cutting invariants staying true
(see design.md, "Where this capability leans on the global invariants").

Deliberate boundaries:

- **The room is a dumb container; the game holds the state.** Rooms
  carry no configuration and no readiness of their own — both live on
  the current game record (game-configuration/config-lives-on-the-game),
  and the eager initial game exists precisely to hold them. The eager
  creation authored here is the sibling of game-lifecycle's successor
  auto-creation: together they maintain "a room always has a current
  game", with the successor's atomic currency install owned there.
- **A room is configuring or playing, and the mode is the room's own
  fact.** The room owns that state machine — it leaves configuring when a
  launch of its current game begins and configures again once its current
  game is one awaiting launch — and owns the *enrolment* half of the
  freeze the mode implies. The configuration half is
  game-configuration/launch-freeze, cited rather than restated; naming the
  mode is what stops its four consequences (enrolment, configuration,
  archival, the start gate) from being read as four unrelated rules.
- **The room's gate here, the launch's gates there.** This capability
  owns the matchmaking gate — at least two enrolled teams, every
  enrolled team ready, administrative actor initiates. Everything after
  initiation (config freeze, health gates, invitations, abort, walkover)
  is game-lifecycle's launch story; the start requirement cites
  game-lifecycle/launch-orchestration and launch-gates as the enforcing
  sibling rather than restating any of it.
- **"Administrative actor" is the room's actor, never the platform
  admin.** The legacy start requirement's "administrative actor" is the
  role defined by the ownership model (owner, or anyone when ownerless);
  this capability defines it and does not touch the platform admin role.
- **Teams are enrolled by the room, and consent through readiness.**
  Enrolment is a unilateral act of the administrative actor (the legacy
  design's direct add/remove; the word "invite" in the legacy lobby text
  names the affordance, not an acceptance protocol). The team's consent
  gate is its captain's readiness declaration.
- **A governing competition format is named abstractly, never by
  vocabulary this capability cannot reach.** Rooms sit upstream of every
  competition format, so the three clauses that make a format-governed
  room work — a format may create one, the acts it reserves are refused
  to users while it governs, and its starts do not consult the readiness
  gate — say "a competition format" and nothing more specific, exactly
  as game-lifecycle's launch gates already do for a schedule-bound
  format's override.
- **UI mirrors folded.** The browser and lobby ids are authored once as
  discovery/lobby substance; the affordance-gating mirrors (08-REQ-027c
  exclusivity, 08-REQ-027f captain-only toggle, 08-REQ-027h disabled
  start explains itself) fold into the owning requirements as scenarios
  — enforcement authored once, server-side.

## What Changes

- **New capability `rooms-and-matchmaking`** (mint delta, ADDED-only, 10
  requirements): the persistent room record; room creation with the
  eager initial game; the administrative-actor model with irreversible
  abdication, and the acts a governing competition format reserves; the
  room's two modes — configuring its next game or playing its current one
  — with enrolment closed for as long as it plays; team
  enrolment as a set with the archived-team rejection and the withdrawal
  archiving a team performs on every room it is enrolled in; captain-only
  per-game readiness cleared by succession; the two-team
  unanimous-readiness start gate — checked authoritatively at
  initiation and exempting
  a schedule-bound format's starts; archive-in-place-of-deletion for
  rooms, barred while a format governs; the Room Browser as the sole
  platform-wide discovery surface; the read-only-for-outsiders Room
  Lobby.
- **Retirements**: this change's legacy absorptions are recorded in the
  identifier map (completed with the corpus retirement in this PR); the
  migration planning artifacts are archived under
  `docs/spec-migration/`.

## Impact

- New: `openspec/changes/migrate-rooms-and-matchmaking/specs/rooms-and-matchmaking/spec.md`
  (folded to `openspec/specs/rooms-and-matchmaking/spec.md` at archive).
- `openspec/config.yaml` context capability list gains
  `rooms-and-matchmaking` (at archive).
- Code citations: room/enrolment/readiness/start mutations and the
  browser/lobby views gain `// spec: rooms-and-matchmaking/...`
  citations when the implementation lands.

## Open Questions

1. **Archival while the current game is playing.**
   - **Context**: the binding legacy text forbids creating or starting
     games in an archived room but is silent on whether a room can be
     archived while its current game is `playing`. If it can, the
     finish of that game collides with the open sibling delta
     game-lifecycle/successor-auto-creation, which requires a successor
     (atomically installed as current) for every finished
     non-competition game — creating a game in an archived room, which
     the legacy text forbids.
   - **Question**: is mid-play archival rejected, or permitted with an
     archived-room exception carved into successor auto-creation?
   - **Options**: (A) reject archival while the current game is playing
     — rooms are archived between games only; no game ever finishes
     into an archived room, the succession invariant holds untouched,
     and unarchival always resumes with a ready-to-configure current
     game. Parallels team-management's archive-blocked-while-frozen.
     (B) permit mid-play archival and amend the sibling's
     successor-auto-creation with an archived-room carve-out (a
     cross-change edit needing that change's author attention), leaving
     the archived room without a current game to resume into.
   - The delta is authored per option A
     (rooms-and-matchmaking/room-archival#archive-blocked-mid-play), the
     minimal reading that keeps both changes coherent; a human decision
     is required before archive.
   - **Decision (author, 2026-07-24)**: Option A confirmed. Mid-play archival stays rejected; the delta stands as authored.

2. **Admin archive/unarchive vs the read-only admin role.**
   - **Context**: the binding legacy text lists, as actors authorized to
     unarchive a room, "the owner, or any authenticated user if the room
     has no owner, or an admin". The open sibling mint
     identity-and-authorization/platform-admin-role re-authors the
     platform admin as extending read access only. For an ownerless room
     the parenthetical is redundant (anyone may act), but for an owned
     room it grants an admin a mutation over another user's room — the
     same collision migrate-team-management has already recorded as its
     Open Question 1 (admin unarchive of teams).
   - **Question**: does the platform admin retain archive/unarchive
     power over owned rooms, as an exception to the read-only admin
     stance, or does the read-only re-authoring supersede the
     parenthetical?
   - **Options**: (A) administrative-actor-only — the read-only admin
     role supersedes; the delta as authored states this, and the map
     entry for 05-REQ-021a notes the dropped parenthetical. (B) keep
     admin archive/unarchive — add an explicit admin scenario to
     rooms-and-matchmaking/room-archival and carve the exception into
     the sibling's platform-admin-role requirement.
   - The delta is authored per option A. Whichever way this resolves, it
     should resolve **consistently** with migrate-team-management's Open
     Question 1 — the two are one policy decision.
   - **Decision (author, 2026-07-24)**: Room archival stays with the room's administrative actor only. Under the re-authored admin model (read-only toward live-game runtime state; platform-state powers granted expressly), the sole admin power expressly granted in this train is team unarchive; the legacy 'or an admin' parenthetical for rooms is dropped, a future express grant if room recovery proves needed.

3. **The start gate and a schedule-bound format's rounds were jointly
   unsatisfiable.**
   - **Context**: the gate as first authored admitted only the room's
     administrative actor and required unanimous readiness, while a
     schedule-bound competition format's rounds are started by the
     platform with no readiness declared — and such a round *is* the
     room's current game. Every round after a format's first was
     therefore forbidden by one requirement and required by another.
   - **Decision (author)**: non-tournament games require unanimous
     readiness; schedule-bound games begin strictly as scheduled. The
     gate is re-authored as governing user-initiated starts, with an
     abstractly phrased exemption for a schedule-bound competition
     format governing the room, matching how the launch gates already
     phrase their own override. See design.md, "A room may be governed
     by a competition format, named abstractly".

4. **Room archival during a format's interlude.**
   - **Context**: archival was barred only while the current game was
     `playing`. A competition format leaves its room holding a
     not-started game between contests, so a room could be archived
     mid-event, after which no game may be created or started in it and
     the remaining schedule is stranded.
   - **Decision (author)**: generalise the bar — archival is refused
     while a competition format governs the room, not merely while a
     game is being played. Authored in
     rooms-and-matchmaking/room-archival and its
     #archive-blocked-mid-play scenario.

5. **"All enrolled teams are not archived" at start time was owned by
   nothing.**
   - **Context**: enrolment rejects an archived team, but nothing
     re-checked a team archived after it was enrolled — the roster
     freeze does not hold on a not-started game and the launch gates
     cover only server health and invitations.
   - **Superseded decision (delegated; taken 2026-07-24)**: the
     precondition landed on this gate — the start was rejected while any
     enrolled team was archived
     (`game-start-gate#archived-enrolled-team-blocks-the-start`).
   - **Decision (author, 2026-07-28)**: that shape is rejected as more
     complicated than it needs to be, and replaced by two simpler rules.
     (a) Archiving a team is **prohibited** while the team is enrolled in
     an active tournament or an active game — which needed **no new
     authoring**: `team-management/archive-not-delete` already permits
     archiving only while the roster is not frozen,
     `team-management/roster-freeze` already freezes a competitively
     engaged team over an interval enclosing engagements may lengthen, and
     `tournaments/tournament-roster-freeze` is already exactly such an
     enclosing engagement. (b) Archiving a team **reactively withdraws**
     it from the enrolled set of every room it is enrolled in, in the
     archival's own transaction — the genuinely new rule, authored on
     `rooms-and-matchmaking/team-enrolment` with
     `#archiving-withdraws-the-team-from-every-room` and
     `#the-withdrawal-clears-a-standing-board-too`. With withdrawal on the
     archive side, no start can observe an archived enrolled team, so the
     gate's archived-team condition, its
     `#archived-enrolled-team-blocks-the-start` scenario, and
     `team-management/archive-not-delete` in the gate's declared
     dependencies are all removed. The withdrawal deliberately covers
     **every** room rather than only rooms whose current game has not
     launched, because a room whose game is launched still reaches a
     future start through successor auto-creation. Reasoning in design.md,
     "Archival withdraws the team; the start gate says nothing about
     archival".
   - **Follow-up decision (author, 2026-07-28, second pass)**: the author
     **rejected the premise of the worked example** above — "a team
     enrolled after a room's game launched" must simply be impossible,
     because a room is either in game-config mode or game-play mode, and
     after a game launches no configuration and no roster change is
     possible until that game completes and the room returns to config
     mode. Three consequences, all applied here: (a) the two modes are
     authored as `rooms-and-matchmaking/room-mode` (see Q9); (b) the
     prohibition on archiving a competitively engaged team is made
     explicit as `team-management/archive-not-delete#archived-and-playing-is-unreachable`
     — a scenario pinning the unreachable state, with no second definition
     of engagement and no second copy of the freeze predicate; (c) the
     withdrawal keeps its unqualified "every room in which it is enrolled"
     form, now justified as the *simpler* statement (no qualifier to state
     or keep true) rather than as the *wider* one, since the case that
     motivated the width is no longer reachable. Its one remaining
     discriminating case is an override-seated launch that left an
     enrolled team unseated — which is also why `room-mode` admits the
     archival withdrawal as the single enrolment change a playing room
     accepts. Reasoning in design.md, "A room is configuring or playing,
     and the mode is a requirement", and the revised
     "Unqualified … because that is the simpler statement" passage.

6. **Who maps the room's actors onto the configuration component's
   affordance kinds.**
   - **Context**: the sibling `migrate-game-configuration` re-carved its
     capability so the configuration surface is a standalone,
     permission-free component: it names three affordance kinds of its
     own (inspection, parameter editing, board designation), takes one
     mount-time parameter per kind, derives no actor, and treats
     offering a kind as presentation rather than authorisation
     (game-configuration/self-contained-configuration-surface,
     game-configuration/host-selected-affordances). That leaves the
     mount-time parameters unsupplied by anybody: the component knows
     nothing about owners, ownerless rooms, or administrative actors,
     and the room lobby was still authored as merely *displaying*
     parameter values.
   - **Decision (author delegated; taken here)**: the room owns the
     mapping, because the room is where the actor vocabulary lives.
     rooms-and-matchmaking/room-lobby is re-worded to *mount* the
     component against the current game and to state the mapping —
     inspection to everyone who can see the room, parameter editing and
     board designation to the room's administrative actor — with an
     explicit note that withholding a kind is presentation only, the
     authoritative rejection living with the mutation that handles the
     write. `game-configuration/host-selected-affordances` joins the
     requirement's declared dependencies and a new scenario
     (#the-lobby-supplies-the-actor-mapping) pins that the two mountings
     differ in nothing else. Reasoning in design.md, "The lobby mounts
     the configuration component and owns the actor mapping".

7. **An enrolment change invalidates a standing board.**
   - **Context**: the sibling's widened board requirements make the
     roster an input to board generation, so a change to the number of
     players or the composition of teams clears the lock and regenerates
     the preview (game-configuration/board-preview#roster-change-regenerates,
     game-configuration/board-preview-lock-in#roster-change-clears-the-lock).
     Enrolment is the room-side event that changes the roster of a
     not-yet-launched game, and rooms-and-matchmaking/team-enrolment was
     silent on it — the sibling states the rule, nothing states that an
     enrolment write triggers it.
   - **Decision (author delegated; taken here)**: state the consequence
     on the enrolment requirement, and state it as *same transaction*.
     An enrolment change on the room's not-yet-launched current game
     clears any standing board designation and regenerates the preview
     in the transaction that commits the enrolment.
     `game-configuration/board-preview-lock-in` joins the requirement's
     declared dependencies (the capability is already declared in the
     Purpose) and a new scenario
     (#enrolment-change-clears-a-standing-board) pins the absence of a
     window. Reasoning in design.md, "An enrolment change clears the
     board in the same transaction".

8. **The engine declares no bounds a consumer can read.**
   - **Context**: game-configuration/parameter-bounds-sourcing now
     requires every bound that capability enforces and every bound its
     editing surface presents to be *read from* the engine rather than
     restated. The engine cannot supply that today — the bounds live as
     line comments on the two configuration interfaces and as a
     `CONFIG_RANGES` table in the engine's test-support module that is
     documented as not part of the public API and is not re-exported.
   - **Decision (author delegated; taken here)**: the engine gains a
     public, reflectable configuration-bounds descriptor (path, kind,
     min, max, default, disable sentinel per parameter), with
     `CONFIG_RANGES` re-derived from it so exactly one table exists.
     Planned in `revise-game-engine-contract`'s tasks.md, section 8, with **no
     spec delta**: game-engine/configuration-parameters already carries
     the numbers and already delegates enforcement to the surfaces, so
     this is a change to the shape of the engine's public surface, not
     to its behaviour. Nothing in this change's own delta depends on it;
     it is recorded here because this change's lobby is one of the
     surfaces that will read it.

9. **A room's two modes were implicit, and everything downstream was
   re-deriving them.**
   - **Context**: the corpus bound the *configuration* half of "a launched
     game's setting is settled" (`game-configuration/launch-freeze`) and
     said nothing at all about the *enrolment* half. Nothing anywhere
     closed a room's enrolled set while a game was under way in it, so a
     team could be enrolled into a playing room, would not be a participant
     of that room's game, would therefore not be competitively engaged,
     would therefore be archivable — and would land in the successor's
     enrolled set as an archived team. The author named that class of edge
     explicitly and refused to own it: "I never want to deal with the edge
     of a team being an active participant of a game while simultaneously
     being archived."
   - **Decision (author, 2026-07-28)**: a room is in **exactly one of two
     modes** — configuring its next game, or playing its current one — and
     while it plays, neither configuration nor enrolment is possible.
     Authored as its own requirement, `rooms-and-matchmaking/room-mode`,
     rather than as clauses on enrolment and the start gate: the mode is a
     room-level state machine whose four consequences (enrolment closed,
     configuration frozen, archival barred, the start gate as the
     transition) are one fact, and a named mode is what a future reader and
     a future requirement can cite. The requirement adds only what is
     missing — the enrolment half and the name — and cites the launch
     freeze for the configuration half instead of restating it. The mode
     boundary is drawn at the **start** of launch orchestration, not at the
     commit to `playing`, so the orchestration window is not itself an
     enrolment hole; an aborted launch leaves the game awaiting launch and
     so returns the room to configuring, with no extra rule.
     `rooms-and-matchmaking/room-archival` and
     `rooms-and-matchmaking/game-start-gate` are reworded in the mode's
     vocabulary (archival only while the room is configuring; initiation is
     where the room stops configuring), and
     `rooms-and-matchmaking/team-enrolment#removal-never-reaches-a-launched-game`
     is reworded around the one enrolment change that can still land while
     a room plays — the archival-driven withdrawal — since an actor's
     mid-play removal is no longer a reachable act. Reasoning in design.md,
     "A room is configuring or playing, and the mode is a requirement".
