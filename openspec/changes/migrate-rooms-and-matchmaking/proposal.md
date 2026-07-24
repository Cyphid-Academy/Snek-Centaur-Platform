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
**game-lifecycle, game-configuration, team-management** (the DAG ceiling
for this capability, all three actually cited).

Deliberate boundaries:

- **The room is a dumb container; the game holds the state.** Rooms
  carry no configuration and no readiness of their own — both live on
  the current game record (game-configuration/config-lives-on-the-game),
  and the eager initial game exists precisely to hold them. The eager
  creation authored here is the sibling of game-lifecycle's successor
  auto-creation: together they maintain "a room always has a current
  game", with the successor's atomic currency install owned there.
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
- **UI mirrors folded.** The browser and lobby ids are authored once as
  discovery/lobby substance; the affordance-gating mirrors (08-REQ-027c
  exclusivity, 08-REQ-027f captain-only toggle, 08-REQ-027h disabled
  start explains itself) fold into the owning requirements as scenarios
  — enforcement authored once, server-side.

## What Changes

- **New capability `rooms-and-matchmaking`** (mint delta, ADDED-only, 9
  requirements): the persistent room record; room creation with the
  eager initial game; the administrative-actor model with irreversible
  abdication; team enrolment as a set with the archived-team rejection;
  captain-only per-game readiness cleared by succession; the two-team
  unanimous-readiness start gate checked authoritatively at initiation;
  archive-in-place-of-deletion for rooms; the Room Browser as the sole
  platform-wide discovery surface; the read-only-for-outsiders Room
  Lobby.
- **Retirements**: this change's legacy absorptions are recorded in the
  identifier map (completed with the corpus retirement in this PR); the
  migration planning artifacts are archived under
  `legacy-spec-archive/spec-migration/`.

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
