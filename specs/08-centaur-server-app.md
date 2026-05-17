# Module 08: Snek Centaur Server Frontend

## Requirements

### 8.1 Scope and Runtime Placement

**08-REQ-001**: This module shall define the behavioural requirements of the web application served by a Snek Centaur Server ([02-REQ-004], [02-REQ-030]). The application is the single human-facing interface for the Snek Centaur Platform, encompassing both team-internal competitive operation (heuristic configuration, bot parameters, live gameplay, team replay) and platform-wide cross-team concerns (team management, room management, game spectating, platform replay, profiles, leaderboards, API key management). There is no separate "Game Platform" web application.

**08-REQ-002**: The application shall be served by the Snek Centaur Server runtime. It shall require authentication before exposing any functionality beyond a sign-in control and public, non-user-specific information (e.g., the public leaderboard per §8.19).

**08-REQ-003**: The application shall execute as a browser client that communicates with (a) the Snek Centaur Server runtime for real-time subscriptions to in-memory bot-framework state it does not read directly from Convex, (b) the Convex deployment for reads and mutations against Centaur state ([06]) and platform-wide state ([05]) per [02-REQ-039], and (c) a game's SpacetimeDB instance via OIDC-validated access token per [02-REQ-038] when a game is live or being spectated.

**08-REQ-004**: A single Snek Centaur Server may host multiple Centaur Teams. The application shall present team-scoped views (heuristic configuration, bot parameters, live gameplay, team replay) in the context of a specific hosted Centaur Team, and shall present platform-wide views (room browsing, profiles, leaderboard) independent of any specific team.

**08-REQ-005**: The application shall expose a well-known HTTP endpoint at `/.well-known/snek-game-invite` that receives game invitation payloads from Convex at game start per [05-REQ-032b]. The endpoint shall accept the invitation on behalf of the invited Centaur Team, receive the per-Centaur-Team game credentials, and use those credentials for all subsequent bot-participant interactions with the game's SpacetimeDB instance.

---

### 8.2 Authentication and Authorization

**08-REQ-006**: The application shall require Google OAuth authentication of the human using the same human identity type defined in [03]. It shall not maintain its own independent credential store. Unauthenticated requests to any page of the application other than those exempted by [08-REQ-002] shall be refused.

**08-REQ-007**: After authentication, the application shall resolve the authenticated identity to a user record per [05-REQ-004] and [05-REQ-005]. All subsequent UI actions shall be attributed to that user record for the duration of the session.

**08-REQ-008**: The application shall gate affordances that are restricted to the Captain role — in particular the Captain-only control affordances of §8.14 and the Captain-only affordances of §8.4 (heuristic configuration) and §8.5 (bot parameters) — on the authenticated human's current Captain status as read from [05] via [06]. Captain status changes observed through subscription shall take effect in the UI without requiring the operator to reload the page.

**08-REQ-009** *(negative)*: The application shall never issue a SpacetimeDB access token on its own. Access tokens for a game are obtained through the Convex-mediated issuance path of [05-REQ-035] and presented to SpacetimeDB by the browser.

**08-REQ-009a** *(negative)*: The application shall not store, display, or transmit the plaintext of any SpacetimeDB access token, API key, or other credential material except during the single creation-time disclosure of an API key plaintext per [05-REQ-051] and [03-REQ-034].

**08-REQ-009b**: The application shall provide a sign-out control that terminates the user's session on the client and revokes any client-held session tokens. After sign-out, the UI shall return to the unauthenticated state.

**08-REQ-009c**: When the authenticated human holds the platform admin role ([05-REQ-065]), the application shall expose admin-specific affordances as defined in §8.21. Admin status shall be evaluated from the user record and shall take effect without page reload.

---

### 8.3 Navigation and Page Structure

**08-REQ-010**: The application shall provide a persistent global navigation surface from which the authenticated user can reach each of the following top-level destinations: the home view (§8.3a), the Rooms browser (§8.6), the Teams browser (§8.5a), the user's own Player Profile (§8.18), the global Leaderboard (§8.19), and API Key Management (§8.20). Team-scoped navigation targets (heuristic configuration, bot parameters, game history, live operator interface) shall be accessible within the context of a specific hosted Centaur Team.

**08-REQ-011**: When any hosted Centaur Team of which the user is a member has a game in the `playing` status ([05-REQ-027]), the navigation surface shall make the live operator interface for that team prominent such that an operator arriving at the application is not required to search the navigation to find the active game.

**08-REQ-012**: The application shall not present a page for live gameplay when the relevant Centaur Team has no game in the `playing` status. Attempts to navigate to the live interface under those conditions shall be refused with an explanatory empty state.

**08-REQ-013**: Navigating into the replay viewer shall occur from the game history page (§8.10) or from a direct link (§8.17c). The replay viewer shall not appear as a standalone top-level navigation target.

---

### 8.3a Home View

**08-REQ-010a**: The application shall present, as the authenticated user's home view, at minimum: the list of Centaur Teams of which the user is a current member (per [05-REQ-011]), the list of rooms the user has recently visited, and the list of games currently in progress (status `playing` per [05-REQ-028]) in which any of the user's Centaur Teams are participating. Each listed item shall link directly to its corresponding detailed view.

---

### 8.4 Heuristic Configuration Page

**08-REQ-014**: The heuristic configuration page shall be scoped to a specific hosted Centaur Team. It shall display every Drive type and every Preference registered with that Centaur Team's Snek Centaur Server, sourced from the team's heuristic default configuration ([06-REQ-005]) via [06-REQ-032]'s read surface.

**08-REQ-015**: For each registered Preference, the page shall display and allow editing of: (a) whether the Preference is active on new snakes by default and (b) its default portfolio weight ([06-REQ-006]).

**08-REQ-016**: For each registered Drive type, the page shall display and allow editing of: (a) its default portfolio weight when added to a snake, (b) its `nickname` for UI display, and (c) pinning status in the Drive dropdown presented during Drive management ([06-REQ-007], §8.13). The Captain may reorder the `pinnedHeuristics` array and assign nicknames to Drives from this page. *(Amended per 08-REVIEW-005 resolution: ordinal position replaced with nickname and pinning controls.)*

**08-REQ-017**: Mutations to team-scoped heuristic defaults initiated from this page shall be routed through the Centaur state function contract surface ([06-REQ-030]) and shall be rejected by that surface if the authenticated caller is not the Captain of the owning Centaur Team ([06-REQ-008], [06-REQ-031]). The application shall surface any such rejection to the operator. Non-Captain team members may view the heuristic configuration page in read-only mode. *(Amended per 08-REVIEW-001 resolution: team-scoped heuristic default mutations are Captain-only.)*

**08-REQ-018**: The page shall make explicit to the operator that edits affect defaults for future games only and shall not retroactively affect any game currently in progress ([06-REQ-009]). The concrete UI affordance by which this is communicated is a design-phase decision.

**08-REQ-019** *(negative)*: The heuristic configuration page shall not permit mutations to any per-snake or per-game state. It operates exclusively on team-scoped heuristic defaults. Only the Captain may edit these defaults; other team members see a read-only view. *(Amended per 08-REVIEW-001 resolution: Captain-only for team-scoped default mutations.)*

---

### 8.5 Bot Parameters Page

**08-REQ-020**: The bot parameters page shall be scoped to a specific hosted Centaur Team. It shall display and allow editing of the team's bot parameter record ([06-REQ-011]), comprising at minimum the softmax global temperature and the **automatic submission time allocation** — the team-level turn deadline parameter used by the bot framework's submission process per [07-REQ-044] / [07-REQ-045]. *(Amended per 08-REVIEW-011 resolution.)*

**08-REQ-021**: Mutations initiated from this page shall be routed through the Centaur state function contract surface ([06-REQ-030]) and rejected if the caller is not the Captain of the owning Centaur Team ([06-REQ-012], [06-REQ-031]). Non-Captain team members may view the bot parameters page in read-only mode. *(Amended per 08-REVIEW-001 resolution: Captain-only for bot parameter mutations.)*

**08-REQ-022**: The page shall make clear to the operator that all `global_centaur_params` values — the softmax temperature and the automatic submission time allocation — take effect on the next game the team enters, not on any game currently in progress. At game start, these defaults are copied into game-scoped state per [06-REQ-040a] and are thereafter independent of the team defaults. *(Amended per 08-REVIEW-002 and 08-REVIEW-011 resolutions.)*

**08-REQ-023** *(negative)*: The bot parameters page shall not expose any parameter that is a game-configuration parameter owned by [05-REQ-023]. Game-configuration parameters are set in the room lobby (§8.8).

---

### 8.5a Teams Browser

**08-REQ-023a**: The application shall provide a Teams browser that lists all Centaur Teams known to the platform per [05-REQ-008], with at minimum the team's name, display colour, and current Captain. Each listed team shall link to that team's public profile (§8.18a).

---

### 8.5b Team Management

**08-REQ-023b**: The application shall provide a Team Management view accessible to every current member of a Centaur Team. The view shall display at minimum the team's name, display colour, current Captain, current members with their roles, the team's designated coaches per [05-REQ-067], and the nominated server domain together with its latest health status per [05-REQ-009] and [02-REQ-029].

**08-REQ-023c**: The application shall permit any authenticated user to create a new Centaur Team per [05-REQ-008]. On creation, the creating user shall become the team's Captain per [05-REQ-011].

**08-REQ-023d**: The Team Management view shall expose, exclusively to the team's current Captain, affordances to mutate team identity (name, display colour), to set or update the team's nominated server domain (`nominatedServerDomain` per [05-REQ-014]), to add or remove human members (per [05-REQ-012]), to add or remove coaches per [05-REQ-067] (via the `addCoach` / `removeCoach` mutations), and to transfer the Captain role to another current member (per [05-REQ-012]).

**08-REQ-023e**: The Team Management view shall, while a team is participating in any game whose status is `playing`, visibly disable the mutating affordances of [08-REQ-023d] that are frozen by [05-REQ-013], and shall explain to the user that the affordance is temporarily unavailable due to a game in progress.

**08-REQ-023f** *(negative)*: The Team Management view shall not expose any affordance for configuring bot parameters, Drive portfolios, heuristic defaults or overrides, snake operator assignment, or any other Centaur-subsystem state. These are the exclusive domain of the team-scoped operator pages (§8.4, §8.5). The view may display a navigation link directing the user to those pages.

---

### 8.6 Room Browser and Creation

**08-REQ-024a**: The application shall provide a Room Browser that lists every room persisted by [05-REQ-016], with at minimum: the room name, the room's optional owner (per [05-REQ-017]), the number of Centaur Teams currently enrolled, and whether the room has a game currently in status `playing` per [05-REQ-028].

**08-REQ-024b**: The Room Browser shall support filtering and searching the listed rooms by room name. Any additional filter criteria shall be a design decision; requirements level mandates only name-based search.

**08-REQ-024c**: The Room Browser shall expose an affordance by which any authenticated user may create a new room per [05-REQ-019]. Room creation shall require at minimum a room name; the creating user shall become the room's owner. The UI shall treat the resulting room creation as a mutation against Convex per [08-REQ-100].

**08-REQ-024d**: Every listed room in the Room Browser shall link directly to the Room Lobby view (§8.8) for that room.

---

### 8.7 Game History Page

**08-REQ-024**: The game history page shall be scoped to a specific hosted Centaur Team. It shall list completed games in which the authenticated human was either (a) a member of the owning team at the time of the game (per the game's participating-team snapshot of [05-REQ-029]) or (b) a current member of the owning team, in reverse chronological order.

**08-REQ-025**: Each listing shall display at minimum: room name, date, opponent teams, the team's result (win/loss/draw), and final scores ([05-REQ-038]). The normalised score per [01-REQ-053] shall be the headline score value, with par `1.0` as the visual reference; the per-team `aggregateLength` (Σ alive body lengths) shall be shown as a secondary stat. Non-integer score values shall be displayed (the score is real-valued). Listing data shall be sourced from [05]'s read surface.

**08-REQ-026**: Selecting a listing shall open the replay viewer (§8.15) for that game. The replay viewer entry point from the game history page shall default to the team-perspective sub-turn view.

**08-REQ-027** *(negative)*: The game history page shall not expose games for teams the authenticated human has no relationship with. A user has a relationship with a team's game if they were a member of that team at the time of the game (per the participating-team snapshot) or are a current member of that team.

---

### 8.8 Room Lobby

**08-REQ-027a**: The application shall provide a Room Lobby view for every room listed in the Room Browser. The Room Lobby view shall display at minimum: the room's current owner (or the no-owner state per [05-REQ-017]), the room's current game-configuration parameter values per [05-REQ-023], the set of Centaur Teams currently enrolled in the room per [05-REQ-016], and the readiness state of each enrolled team.

**08-REQ-027b**: The Room Lobby view shall be accessible to every authenticated user. Users who are neither the room owner nor members of an enrolled team shall see the lobby in a read-only form and shall have no mutating affordance.

**08-REQ-027c**: The Room Lobby view shall expose, exclusively to the administrative actor for the room defined by [05-REQ-017] (the owner, or any authenticated user when there is no owner), affordances to edit every game-configuration parameter of [05-REQ-023] within its defined range, to invite or remove Centaur Teams from enrolment, to abdicate ownership per [05-REQ-018], and to start the game per [05-REQ-031].

**08-REQ-027d**: The Room Lobby view's parameter-editing affordance shall enforce each parameter's type and range by refusing to submit values outside the acceptable range per [05-REQ-023], providing inline feedback to the user before any mutation is dispatched. This client-side enforcement shall be treated as a user-experience affordance only; the authoritative enforcement remains with Convex per [05-REQ-023].

**08-REQ-027d1**: The board-size parameter shall be presented as a bespoke widget rather than a plain number input: a preset dropdown offering four named options plus a Custom option, where selecting Custom reveals an integer stepper with `min = 7`, `max = 32`, `step = 1`. The persisted and transmitted value is always the raw integer `boardSize`; on load the widget auto-derives its displayed selection by matching the stored integer against the four preset values (displaying the matching preset label if the integer matches one, otherwise displaying Custom with the integer pre-filled in the stepper). The authoritative validator for the `boardSize` range is [05-REQ-023]; this widget is a client-side user-experience affordance governed by [08-REQ-027d]. See resolved **01-REVIEW-018**.

**08-REQ-027e**: The Room Lobby view's parameter-editing affordance shall honour the conditional-parameter semantics of [05-REQ-025]: parameters whose meaning is conditional on a gating parameter shall be visually gated on that parameter and, when gating parameters are off, shall not block the user from persisting the dependent value but shall communicate that the dependent value is currently inactive.

**08-REQ-027f**: The Room Lobby view shall expose, exclusively to the Captain of an enrolled Centaur Team, affordances to mark that team ready and to unmark that team ready, consistent with the Captain-only ready-check semantics of [05-REQ-031]. To other team members, the readiness state shall be visible as a read-only indicator with no mutating affordance. *(Amended per 08-REVIEW-013 resolution: ready/unready is Captain-only, matching the upstream Captain-only authorization fixed by 05-REVIEW-007.)*

**08-REQ-027g**: The Room Lobby view shall expose, exclusively to members of an enrolled Centaur Team, an affordance to ping the team's nominated Snek Centaur Server's healthcheck per [02-REQ-029] and [05-REQ-009], surfacing the result to the lobby view.

**08-REQ-027h**: The Room Lobby view shall enable the game-start affordance of [08-REQ-027c] only when the room has at least two enrolled Centaur Teams per [05-REQ-020] and every enrolled team has been marked ready. When the affordance is disabled, the view shall communicate to the administrative actor which precondition is currently unmet.

**08-REQ-027i**: The Room Lobby view shall provide a **Board Preview** affordance that renders a miniature visualisation of the board geometry — including the placement of fertile tiles, hazards, and snake starting territories — derived from the not-yet-started game's current game-configuration parameter values. The preview shall be generated by the Convex board-generation preview mutation defined by [05-REQ-032b], which re-runs `generateBoardAndInitialState()` from the shared engine codebase ([02-REQ-035]) inside Convex on each parameter edit and persists the result onto the not-yet-started game's configuration document. The web client shall receive the regenerated preview reactively via Convex's reactive query model and shall render it directly; the application shall not run any board-generation algorithm client-side. The regeneration cadence (e.g., debouncing of rapid parameter edits) is a design-level concern. *(Amended per 08-REVIEW-014 resolution: Convex's preview mutation is the sole authority for board generation; ratifies the upstream config-on-game architecture of [05-REQ-022] and [05-REQ-032b].)*

**08-REQ-027j**: The Board Preview shall expose an affordance by which the administrative actor may **lock in** the currently-displayed preview as the starting layout for the next launch of this game. The lock-in semantics are: (a) every preview generation by [05-REQ-032b] writes the resulting starting state onto the not-yet-started game record's configuration document, regardless of lock-in status; (b) a separate `boardPreviewLocked: boolean` flag on the same game record indicates whether [05-REQ-032] step 2 will reuse the persisted starting state (true) or regenerate from a fresh seed at game-launch initiation (false); (c) when unlocked, the regenerated starting state is not surfaced to any configuration-mode UI — it becomes visible only when delivered to operators by SpacetimeDB once the game enters `playing` status. The Room Lobby view shall expose toggle affordances to set and clear the `boardPreviewLocked` flag via the Convex mutations defined by [05-REQ-032b]. *(Amended per 08-REVIEW-015 resolution: lock-in is a flag on the game record, persistence is unconditional on every regeneration.)*

**08-REQ-027k** *(negative)*: The Board Preview shall not stage, commit, or otherwise affect any currently-playing game in the room. Board Preview affects only the next game-launch initiation of the not-yet-started game record being configured, consistent with the immutable-parameter-snapshot rule of [05-REQ-024].

**08-REQ-027l**: The Room Lobby view shall, when the room has a game whose status is `playing`, provide a direct link from the lobby to the Live Spectating view of that game per §8.16.

---

### 8.9 Live Operator Interface — Principles

**08-REQ-028**: The live operator interface shall be scoped to a specific hosted Centaur Team that has a game in the `playing` status. It shall default to AI control of all owned snakes. On entry to the interface for a fresh game, every owned snake shall be in automatic mode (`manualMode = false` in its selection record, [06-REQ-018]) and the bot framework shall be staging moves for it per [07-REQ-044].

**08-REQ-029**: Selecting a snake in the interface shall not, by itself, place that snake in manual mode. Selection is a view-only operation that makes the snake the subject of the move interface, Drive management, decision breakdown, and worst-case world preview, but does not remove the snake from the automatic submission pipeline of [07].

**08-REQ-030**: Manual mode for a snake shall be entered exclusively by (a) the currently selecting operator checking the manual checkbox of §8.13 or (b) the currently selecting operator selecting a concrete direction via the move interface, which auto-sets the manual flag as a side effect per [06-REQ-025]. Exiting manual mode shall occur exclusively by that operator unchecking the manual checkbox, returning the snake to automatic mode immediately such that [07]'s submission pipeline resumes staging for it on its next scheduled pass.

**08-REQ-031**: The interface shall reflect [07]'s compute scheduling principle that compute follows attention: automatic-mode snakes receive continuous scheduled compute, currently-selected manual-mode snakes receive high-priority compute, and unselected manual-mode snakes receive compute last ([07-REQ-040]). This requirement is behavioural on [07]; the UI shall not add extra scheduling logic of its own.

---

### 8.10 Live Operator Interface — Header

**08-REQ-032**: The header of the live operator interface shall display at minimum: the current turn number, the team clock countdown, the team's remaining time budget, the measured network latency to the team's SpacetimeDB instance, a Convex-hosted presence display of the team's other **active operators** (per 08-REQ-062) along with each active operator's current tempo per [06-REQ-040b] (per §8.12), and — conditionally, per §8.14 — the Captain control affordances (turn-submit and operator-boot per 08-REQ-065 / 08-REQ-068a). *(Amended per 08-REVIEW-011 resolution. Amended per 08-REVIEW-024 resolution.)*

**08-REQ-033**: The team clock countdown shall be presented with sufficient precision to convey imminent deadline: the concrete presentation of seconds-to-one-decimal and a warning state below a sub-one-second threshold is the informal spec's proposal and is the minimum required resolution. When the team's turn has been declared over ([01-REQ-039]) the countdown shall be replaced by a "turn submitted" indicator and shall not flicker back to a countdown while the other team(s) finish their declarations.

**08-REQ-034** *(removed per 08-REVIEW-011 resolution; number reserved for stable cross-references)*: Coordination state is rendered as per-operator tempo in the operator presence display per [08-REQ-032] and [06-REQ-040b]. *(Reworded per 08-REVIEW-024 resolution.)*

**08-REQ-035**: The presence display shall show each other currently-connected operator on the team by their display name and a per-operator colour that is stable within the game's lifetime and is the same colour used for that operator's selection shadow on the board (§8.13). Presence state shall be sourced from a Convex-hosted presence mechanism; the design phase should use the `@convex-dev/presence` library. *(Amended per 08-REVIEW-004 resolution: presence is Convex-hosted.)*

**08-REQ-036**: The network latency indicator shall be a client-measured round-trip time against the team's SpacetimeDB subscription and shall not require any new Convex or Centaur-state field to support it. The exact measurement methodology is a design-phase decision.

---

### 8.11 Live Operator Interface — Board Display, Selection, and Move Interface

**08-REQ-037**: The board display shall render the full current board with: grid lines; all terrain types ([01]) including hazard cells and fertile tiles; all items currently on the board (food, invulnerability potions, invisibility potions); all currently-alive snakes with team colour fill, a per-snake letter designation rendered at the head, and the snake's current length rendered at the neck segment.

**08-REQ-038**: The board display shall render snake effect states ([01]) such that an invulnerability level greater than zero is indicated by a distinctive (e.g. blue) outline on the snake and an invulnerability level less than zero by a distinctive (e.g. red) outline, and such that invisibility is indicated by a translucent/shimmer rendering visible to members of the owning team only ([04]'s RLS visibility rules; [01]'s invisibility semantics). The interface shall not reveal invisibility states of snakes belonging to other teams.

**08-REQ-039**: The board display shall render the current selection state ([06-REQ-018]) as a per-snake selection glow in the colour of the operator who holds the selection. Multiple concurrent selections on distinct snakes by distinct operators shall each render in their respective operators' colours.

**08-REQ-040**: The board display shall render, for the currently-selected owned snake, per-direction move candidate highlighting on the four adjacent cells where each candidate cell is coloured by the bot's current stateMap score for that direction (highest score to lowest using a monotone colour ramp). If no stateMap entry is currently defined for a candidate direction ([07-REQ-049]), that candidate shall be rendered in a distinct neutral state that is visually distinguishable from any score value.

**08-REQ-041**: The board display shall render the currently-staged move for each owned snake with a distinctive marker (e.g. purple border) on the destination cell. The marker shall update without page reload as the staged move changes, whether the change originated from the bot's submission pipeline ([07-REQ-044]) or from an operator action on any connected client.

**08-REQ-042**: Snake selection shall be initiated by clicking the body of an owned snake whose selection the caller is eligible to take per [06-REQ-024]. Selection shall be terminated by pressing Escape or by selecting a different snake. Selecting a snake currently selected by a different operator shall present a displacement confirmation that, upon explicit operator confirmation, issues a selection mutation with the displacement flag set ([06-REQ-022]). Without confirmation, the current selection shall remain with its existing holder.

**08-REQ-043** *(negative)*: The application shall not display, construct, or allow interaction with a direction-candidate for a snake the operator does not currently hold a selection on. All move-staging and Drive-management affordances are gated on the caller being the current selector of the snake being acted on ([06-REQ-025]).

**08-REQ-044**: The move interface shall provide four direction buttons (Up, Down, Left, Right), each labelled with that direction's current stateMap score ([07-REQ-035]) and coloured consistently with the board display's candidate highlighting. Each direction button shall be pre-set to reflect the currently-staged direction for the selected snake (whether staged by the bot or by a human), and direction buttons whose direction is immediately lethal ([01-REQ-044a], [01-REQ-044b]) shall be visibly disabled but shall remain selectable as last-resort candidates per [07-REQ-019].

**08-REQ-045**: Selecting a direction — via click on a direction button or via the keyboard arrow keys while the board has focus — shall simultaneously (a) stage that direction in SpacetimeDB via the staged-move mechanism ([02-REQ-011]) as an operator-originated move, (b) auto-set the snake's manual-mode flag to true per [06-REQ-025], and (c) trigger the worst-case world preview of §8.11a for that direction.

**08-REQ-046**: Staged moves shall be freely changeable at any moment before the team's turn is declared over ([01-REQ-039]); the interface shall not expose a separate "commit" action. The operator shall be made aware by affordance design that each direction selection temporarily stages that direction, so that exploring a direction is not distinguishable to the game engine from committing to it until the turn ends.

**08-REQ-047**: The manual checkbox shall be displayed whenever an owned snake is selected, shall reflect the current value of the snake's manual-mode flag ([06-REQ-018]), and shall be editable by the current selector only. Checking the box shall set the flag to true without staging a new move (the currently-staged move, bot or human, is locked). Unchecking the box shall set the flag to false, at which point [07]'s automatic submission pipeline resumes staging for the snake.

---

### 8.11a Live Operator Interface — Worst-Case World Preview

**08-REQ-048**: When an owned snake is selected and a direction is selected (whether via direction button or arrow key), the board display shall additionally render the worst-case simulated world for that (snake, direction) pair, as read from the computed display state of [06-REQ-026]. Current positions of all snakes shall remain rendered solidly and the worst-case simulated positions shall be rendered as translucent overlays.

**08-REQ-049**: Worst-case-world annotations (the Voronoi-style territory overlay the informal spec references, and any other team-configured per-direction annotations rendered against the worst-case world rather than against the current board) are **out of scope for the MVP operator UI**. The framework no longer publishes an annotations payload on `SnakeBotStateSnapshot.worstCaseWorlds` ([07] §3.4), so this design pass renders no per-direction annotations layer; the worst-case world preview itself (08-REQ-048) and the per-direction decision breakdown table (08-REQ-059) are not affected and consume the surviving substrate from [07] §3.4 (per-direction `worstCaseWorlds` including `perSnakeTurnTimestamp`, and per-direction `heuristicOutputs`). *(Amended per 08-REVIEW-023 resolution.)*

**08-REQ-050**: The worst-case world preview shall update reactively as the bot framework writes new computed display state snapshots ([07-REQ-039]), so that an operator who leaves a direction selected while compute proceeds sees the worst-case world evolve in place.

**08-REQ-051**: When no direction is selected, or when no computed display state exists yet for the selected snake, the worst-case world preview shall not render and the board shall show only the current board state.

---

### 8.11b Live Operator Interface — Decision Breakdown Table

**08-REQ-059**: The interface shall render, for the currently-selected owned snake, a per-direction decision breakdown table showing one row per heuristic (Drive or Preference) active on that snake. Each row shall display at minimum: the heuristic's name, its raw normalised output in the worst-case world ([06-REQ-026]'s `heuristicOutputs` field), its current portfolio weight, its weighted contribution to the direction's score, and its relative impact on the direction's total score.

**08-REQ-060**: The decision breakdown shall update reactively as computed display state snapshots are written by the framework and as the operator switches which direction is selected.

---

### 8.12 Live Operator Interface — Per-Operator Tempo and Turn Submission

*(See resolved 08-REVIEW-011 and 08-REVIEW-024.)*

**08-REQ-061**: The live operator interface shall expose a per-operator **tempo toggle** for each authenticated operator currently connected to the team's game session. The toggle is a binary enum — `flow` or `thinking` — owned exclusively by the operator who toggles it, persisted in [06]'s `operator_tempo` table per [06-REQ-040b], and reactive across all connected team members via the subscription of [06-REQ-043]. The two values name the operator's mental stance toward pacing: `flow` ("I am comfortable with the bot's automatic submission cadence") and `thinking` ("I need the team to slow time so I can think hard about this decision"). Each operator may toggle their own tempo freely at any moment in the game; no other operator (and no Captain) may toggle a given operator's tempo on their behalf. *(See resolved 08-REVIEW-024.)*

**08-REQ-062**: The team's **active operators** are the set of currently-connected member operators of the Centaur Team for the game's session — i.e., those whose connection to the team's game session is live. Coaches and admins acting via implicit-coach permission (per [08-REQ-052a] / [08-REQ-052b]) are not member operators and are therefore not active operators. An operator that the network code detects as disconnected leaves the active set; an operator the Captain boots (per 08-REQ-068a) leaves the active set by the same mechanism (boot severs their connection identically to a network disconnect, per 08-REQ-068a). On (re)connect they rejoin the active set. **Unanimous operator flow — every active operator's tempo is `flow`** — is the **necessary precondition** for the Snek Centaur Server's automatic turn submission process ([07-REQ-044] / [07-REQ-045]) to call SpacetimeDB's `declare_turn_over` reducer ([04] §2.5). The rules governing when (within the window where this precondition holds) the automatic submission process declares the turn over are defined in [07-REQ-044] / [07-REQ-045]. This precondition is **passive**: its becoming true does not trigger any positive flush, immediate-submit, or out-of-band declaration; it merely permits the automatic submission process to finalise according to its own rules. If the team has zero active operators, the precondition is unsatisfied and declaration via this path is deferred until at least one operator joins the active set and is in `flow`. **Tempo is durable across turns**: the arrival of a new turn does not modify any operator's tempo, and so an operator who was in `flow` at the end of turn N remains in `flow` at the start of turn N+1 with no client or server action required. An operator toggles to `thinking` only when they want to pause the automatic submission pipeline to think hard on a strategically significant turn, and back to `flow` when they're ready to let routine play resume. The Captain's manual turn-submit affordance ([08-REQ-065]) is an **independent override** path that bypasses this precondition entirely — it immediately calls `declare_turn_over` regardless of any active operator's tempo and triggers the flush-suppression behaviour of [07-REQ-045a]. Expiry of the team's chess clock ([01-REQ-039]) similarly bypasses this precondition. *(See resolved 08-REVIEW-011 and 08-REVIEW-024.)*

**08-REQ-063**: An operator's tempo shall remain editable throughout the game — toggling from `flow` to `thinking` is permitted at any time and shall immediately rescind that operator's contribution to the unanimity condition of [08-REQ-062]; toggling from `thinking` back to `flow` is permitted at any time and shall immediately restore that operator's contribution. Operator interactions — selection, Drive edits, manual overrides, move staging — shall remain possible regardless of tempo. The team's per-turn clock and time budget continue to run per [01-REQ-037] and [01-REQ-038] independently of tempo; expiry of the team's clock declares the turn over via [01-REQ-039] regardless of any operator's tempo. *(See resolved 08-REVIEW-024.)*

**08-REQ-064**: An operator that joins the active set — whether by first-ever connect, by reconnect after a network drop, or by reconnect after being booted by the Captain — shall start in tempo `flow`. The operator's client shall call `setOperatorTempo({ tempo: "flow" })` as part of its (re)connect sequence; this is the only automatic write to tempo. Tempo otherwise persists across turns untouched — no per-turn reset occurs; an operator toggles to `thinking` only when they want to pause the automatic submission pipeline to think hard on a strategically significant turn. *(See resolved 08-REVIEW-024.)*

**08-REQ-064a**: Coaches (per [05-REQ-067]) and admins acting via implicit-coach permission (per [05-REQ-066]) shall have **no tempo** — they are read-only observers of the team's session per [08-REQ-052a] and [08-REQ-052b]. Their connections shall not be counted in the unanimity condition of [08-REQ-062], and their UI shall not expose a tempo toggle. The presence display of [08-REQ-032] shall visually distinguish a coach/admin observer from a member operator. *(See resolved 08-REVIEW-011 and 08-REVIEW-024.)*

---

### 8.13 Live Operator Interface — Drive Management

**08-REQ-052**: The move interface for a selected snake shall expose a control by which the current selector can add a Drive to that snake. Adding shall present a dropdown of registered Drive types ordered by the pinned-heuristics-then-lexicographic scheme: pinned heuristics (from the `pinnedHeuristics` array in `global_centaur_params`) appear first in pinned order; remaining heuristics are ordered lexicographically by `nickname`, with `heuristicId` as tiebreaker ([06-REQ-007]). *(Amended per 08-REVIEW-005 resolution: dropdownOrder replaced with pinned-heuristics + lexicographic fallback.)*

**08-REQ-052a**: The application shall provide a **coach mode** entry point into the live operator interface for any in-progress game involving a Centaur Team for which the authenticated user is a designated coach per [05-REQ-067] or for which the user holds implicit coach permission as an admin per [05-REQ-066]. Coach mode shall render the same live operator interface as a member of that team would see — the full board display, selection state, Drive portfolios, heuristic decompositions, action log, header, and Captain controls panel — but every mutating affordance (selection mutation, snake selection acquisition, Drive add/remove, portfolio weight adjustment, per-operator tempo toggle, turn submission, team ready check (game start), and any Captain-only control including operator-boot per 08-REQ-068a) shall be disabled and visibly indicated as read-only. The coach connection to the team's filtered SpacetimeDB views shall be obtained via the coach SpacetimeDB token issuance path defined in [05] §3.4 and authorised per [05-REQ-067]. The coach mode entry point shall be reachable from the game's Live Spectating view (§8.16) and from the Team Profile (§8.18a) when an in-progress game is in flight.

**08-REQ-052b** *(negative)*: Coach mode shall not expose any affordance that would cause a write to Convex or to SpacetimeDB on behalf of the team being coached. Any UI control that would, in member mode, dispatch such a write shall be either hidden or rendered disabled in coach mode.

**08-REQ-052c**: Coach mode (08-REQ-052a) shall expose an **inspection** affordance with semantics identical to the replay-mode inspection affordance specified in the amended 08-REQ-074. Specifically: a coach client may at any time inspect any snake on the team being coached; the inspection is purely client-local; the inspection shall never write any Convex or SpacetimeDB state; the inspection shall never produce a selection shadow on the board; the inspection shall never displace or otherwise interact with any operator's selection; and each coach client may have at most one inspected snake at a time, held only in that client's local UI state. Coach inspection shall coexist with the live operator selection shadows produced by the team's connected operators per [08-REQ-039]: the coach simultaneously sees the team's operators' real selection shadows on the board and the coach's own client-local inspection state in their portfolio / stateMap / worst-case world / decision breakdown / per-direction candidate highlight panels. The coach's read scope is already established by [05-REQ-067] (and, for admin coaches, [05-REQ-066] / [05-REQ-067]); this requirement adds no new Convex mutation, no new SpacetimeDB write path, and no new authorisation rule. *(Resolved per 08-REVIEW-008.)*

**08-REQ-052d** *(negative)*: Coach inspection (08-REQ-052c) shall not be exposed through any affordance whose visual or interaction grammar could be confused with operator selection. In particular, the click-to-select gesture used by team members per [08-REQ-042] shall be replaced or visibly differentiated in coach mode (for example, by a distinct cursor, a distinct hover treatment, a distinct activation gesture such as click-with-modifier or right-click, and/or a distinct on-board indicator that is plainly not a selection shadow), so that a coach can never mistake an inspection action for a selection action and so that other observers cannot mistake the coach's inspection state for an operator's selection. *(Resolved per 08-REVIEW-008.)*

**08-REQ-053**: Selecting a Drive type from the dropdown shall activate the targeting mode appropriate to that Drive type's target type:
- **Snake targeting**: the board enters a mode in which only those snakes for which the Drive's target-eligibility predicate ([07-REQ-007]) returns true are highlighted as clickable; ineligible snakes are visually dimmed; clicking an eligible snake confirms it as the Drive's target.
- **Cell targeting**: the board enters a mode in which only those cells for which the Drive's target-eligibility predicate returns true are highlighted as clickable; ineligible cells are visually dimmed; clicking an eligible cell confirms it as the Drive's target.

**08-REQ-054**: In either targeting mode, pressing Tab shall cycle the highlighted candidate target through eligible targets in a fully deterministic order: primary sort by A*-distance from the selected snake's head, nearest first; secondary sort (for candidates at equal A*-distance) by clockwise angle in board coordinates from the selected snake's current head direction, starting at 0° (straight ahead) and increasing clockwise through 360°; tertiary sort (for candidates that remain tied after the first two keys) by target identity — for snake targets the snake id ascending, and for cell targets the cell coordinates in row-major order (row ascending, then column ascending). Pressing Escape shall cancel targeting without adding the Drive and shall not alter the snake's selection state. *(Resolved per 08-REVIEW-006.)*

**08-REQ-055**: Confirmation of a target shall cause the Drive to be added to the snake's portfolio at that Drive type's default weight via [06-REQ-015]. No additional operator confirmation beyond the target click shall be required.

**08-REQ-056**: Active Drives on the selected snake shall be listed in the snake's control panel, each showing the Drive type, the target, the current portfolio weight, an editable weight control, and a remove affordance. Weight edits and removals shall take effect immediately via [06-REQ-015]; the framework shall react per [07-REQ-015].

**08-REQ-057**: Drive assignments, weight overrides, activation overrides, and the per-snake temperature override shall persist across turns and across deselection, per [06-REQ-016]. The interface shall not reset any of these fields as a side effect of selection changes or turn transitions.

**08-REQ-058** *(negative)*: The application shall not provide an affordance to add Drives whose types are not registered in the team's heuristic default configuration ([06-REQ-005]). Drive type registration is a code-level concern of the Centaur Team's Snek Centaur Server library usage, not a runtime UI affordance.

---

### 8.14 Captain Controls

**08-REQ-065**: When the authenticated human is the Captain of the Centaur Team ([05-REQ-011]), the header of the live operator interface shall expose two Captain control affordances: a **turn-submit** action that immediately declares the team's turn over ([01-REQ-039]) regardless of the per-operator tempo (§8.12) of any other operator, submitting all currently-staged moves; and an **operator boot** affordance per 08-REQ-068a. *(See resolved 08-REVIEW-011 and 08-REVIEW-024.)*

**08-REQ-066**: The Captain's turn-submit affordance shall additionally be bindable to a keyboard shortcut so the Captain can operate it without pointer input. The specific key binding is a design-phase decision.

**08-REQ-067** *(negative)*: Operators who are not the Captain shall not see either Captain control affordance (turn-submit or operator boot), and any attempt to invoke them — including via keyboard shortcut — shall be rejected by [06]'s function contract surface per [06-REQ-031] even if it reaches the mutation layer. The per-operator tempo toggle of [08-REQ-061] is *not* a Captain-only affordance — every member operator owns their own tempo regardless of role. *(See resolved 08-REVIEW-024.)*

**08-REQ-068**: Per-operator tempo toggles shall produce an `operator_tempo_changed` entry in the action log ([06-REQ-036]) per [06-REQ-040b]. Captain operator-boot actions shall produce an `operator_booted` entry in the action log per [06-REQ-040b]. Turn submissions issued by the Captain shall produce the team-side turn-submission event category of [06-REQ-036]. The tempo and boot event categories carry the action log's standard wall-clock `timestamp` ([06-REQ-034]) and are recorded as **time-based events** — not turn-keyed — so the team-perspective replay viewer (§8.15) can reconstruct the active-operator set and per-operator tempo at any scrubbed `t` regardless of turn boundaries. *(See resolved 08-REVIEW-024.)*

**08-REQ-068a**: The Captain shall have a **boot** affordance, exposed alongside each active operator's entry in the presence display (08-REQ-032 / §2.8), with which the Captain may evict that operator from the team's game session. Activation dispatches [06]'s `bootOperator({ gameId, operatorUserId })` mutation per [06-REQ-040b]. **Boot acts identically to a network disconnect**: the booted operator's game-session connection is severed on the server side just as though they went offline, and they leave the active operator set. The booted operator's UI transitions to a read-only "you have been removed from this game session by your Captain" state on the next reactive update. Boot does not write any persistent "is booted" state on the operator — there is no sticky lockout. A booted operator may reconnect at any time and, on reconnect, rejoins the active set in tempo `flow` per 08-REQ-064; the Captain may boot again if necessary. Boot is intended as a nuclear option for an operator who is unresponsive (asleep at the keyboard, AFK, network black hole) and is therefore expected not to immediately reconnect in practice. The boot affordance shall not be visible to non-Captain operators and any attempt to invoke it by a non-Captain caller shall be rejected by [06]'s function contract surface per [06-REQ-031]. *(See resolved 08-REVIEW-024.)*

---

### 8.15 Unified Replay Viewer

**08-REQ-069**: The application shall provide a **unified Replay Viewer** for any game whose status is `finished` ([05-REQ-027]) and for which a persisted replay exists per [05-REQ-040]. The Replay Viewer shall combine two viewing modes into a single interface:
- **Board-level replay** (turn granularity): displays board state, snake positions, items, hazards, scoreboard, and turn events. Available for all games to all authenticated users.
- **Team-perspective replay** (sub-turn granularity): displays the full team experience including operator selections, Drive states, stateMaps, worst-case worlds, decision breakdowns, and staged-move attribution. Available only for games in which the viewer participated as a team member, scoped to that team's data.

**08-REQ-070**: The board-level replay mode shall source all displayed data from the persisted replay of [05-REQ-040] and shall never consult a SpacetimeDB game instance, consistent with [05-REQ-044]. The replay viewer shall therefore remain functional for replay viewing after the source game's SpacetimeDB instance has been torn down per [05-REQ-037].

**08-REQ-070a**: The board-level replay mode shall render board state at turn granularity: the cell layout, snake positions and bodies, items, hazards, fertile tiles, and per-team scoreboard shall be shown for the currently-selected turn. The per-team scoreboard shall display the normalised `teamScore` (per [01-REQ-053]) as the headline score value for each team, with par `1.0` as the visual reference; the `aggregateLength` (Σ alive body lengths) shall appear as a secondary stat alongside it. Non-integer score values shall be rendered (scores are real-valued). The rendering shall be visually consistent with the Live Spectating view (§8.16) such that familiarity with the live view carries over to the replay view. The board-level mode obtains its scrubbing affordance from the unified timeline control specified by [08-REQ-072] / [08-REQ-072a]–[08-REQ-072d].

**08-REQ-070b**: The board-level replay mode shall display a per-turn **event log** listing the turn events of the currently-selected turn as produced by turn resolution — at minimum death events (with cause), food-eaten events, potion-collection events, severing events, spawn events, and effect-application / effect-cancellation events. The set of event types shall match the closed enumeration defined by [01] and [04].

**08-REQ-071**: The team-perspective replay mode shall present the same UI components as the live operator interface (§§8.9–8.13), rendered in a read-only mode in which all mutating affordances — move staging, Drive add/remove/edit, manual-mode toggling, per-operator tempo toggling, Captain operator-boot, turn submission — are disabled, while all state-inspection affordances — snake **inspection** (the client-local non-mutating affordance per [08-REQ-074], not the operator-control selection mechanic of [06] which is unavailable in replay), direction preview, worst-case world preview, decision breakdown table — remain fully functional. The team-perspective mode obtains its scrubbing affordance from the unified timeline control specified by [08-REQ-072] / [08-REQ-072a]–[08-REQ-072d].

**08-REQ-071a**: The team-perspective replay mode shall be available exclusively for games in which the logged-in human participated as a team member.

**08-REQ-072**: The replay viewer shall expose a single **unified timeline control** that governs scrubbing for both the board-level and the team-perspective replay modes. The timeline control shall provide play, pause, a scrubber, a playback-speed control, and a **mode toggle** between Per-Turn mode and Timeline mode (per [08-REQ-072a]). The semantics of the scrubber, the speed-control set, the rendering of turn boundaries, and the keyboard navigation differ between the two modes per [08-REQ-072b], [08-REQ-072c], and [08-REQ-072d]. At any scrubber position `t` the viewer shall display the reconstructed game state at that position: the board-level mode renders the public board state, while the team-perspective mode additionally renders which snake each operator had selected at that moment, each snake's manual-mode flag, each snake's active Drives and their targets and weights, each snake's per-direction stateMap and worst-case world and heuristic outputs, the active-operator set and per-operator tempo at that moment (reconstructed from the team's connection events together with the time-stamped `operator_tempo_changed` and `operator_booted` action-log events per 08-REQ-068; boot events are recorded but produce the same departure-from-active-set effect as connection-loss events), the staged moves for each snake and the identity that staged them, and temperature overrides in effect. This reconstruction is the union of [05-REQ-040]'s persisted replay and [06-REQ-035]'s action log. *(Amended per 08-REVIEW-010 resolution: per-mode scrubbing semantics introduced; the prior single-set `{0.5×, 1×, 2×, 4×}` pin is superseded.)*

**08-REQ-072a**: The timeline control shall expose a **mode toggle** with two settings: **Per-Turn mode** and **Timeline mode**. The chosen mode and the chosen speed-within-mode shall be persisted in client-local UI state and restored on subsequent navigation within the same browser session; they shall not be persisted to Convex. The default mode on first entry to the replay viewer shall be Per-Turn mode. *(Added per 08-REVIEW-010 resolution.)*

**08-REQ-072b**: In **Per-Turn mode**, the scrubber shall display turns as equidistant tick marks (one tick per turn). Scrubbing shall snap to the **end of each turn** (the centaur-state state-of-the-world that operators saw at the moment they were declaring submissions); no intra-turn positions shall be addressable. Playback shall advance one turn per tick at the configured rate. The supported playback-speed set shall be **{0.25, 0.5, 1, 2, 4, 8} turns/second**. *(Added per 08-REVIEW-010 resolution.)*

**08-REQ-072c**: In **Timeline mode**, the scrubber's horizontal axis shall represent wall-clock time of the original game from game start (left) to game end (right). Turn boundaries shall be rendered along the timeline as **turn-marker glyphs** at the actual clock time at which each turn was declared over; spacing between markers shall reflect the variable real wall-clock duration of each turn under the chess-clock mechanism (markers shall not be equidistant). Scrubbing shall be continuous along clock time. Playback shall advance at a scalar multiple of real time. The supported playback-speed set shall be **{0.25×, 0.5×, 1×, 2×, 4×, 8×}**. The speed-control widget shall render the current mode's unit in its label (e.g., "2 turns/s" in Per-Turn mode and "2× speed" in Timeline mode). *(Added per 08-REVIEW-010 resolution.)*

**08-REQ-072d**: Keyboard navigation in the unified timeline control shall be as follows. In **Timeline mode**: `Left`/`Right` (no modifier) seek ±1 second of clock time; `Shift+Left`/`Shift+Right` seek ±200 ms; `Ctrl+Left`/`Ctrl+Right` (interpreted as `Cmd+Left`/`Cmd+Right` on macOS) snap to the previous/next turn-marker keyframe. In **Per-Turn mode**: `Left`/`Right` advance one turn backward/forward; modifier-key bindings in Per-Turn mode are deferred to Phase-2 design. *(Added per 08-REVIEW-010 resolution.)*

**08-REQ-073**: Historical operator selections shall be rendered during team-perspective replay as coloured shadows on the appropriate snakes using the same per-operator colours used in live play. An operator who was not connected at a given historical moment shall not produce a shadow for that moment.

**08-REQ-074**: The replay viewer shall permit the logged-in human to **inspect** a snake at the scrubbed timestamp. Inspection is a purely client-local affordance, distinct from the operator-control **selection** affordance owned by [06] ([06-REQ-018] through [06-REQ-024]): each viewer client may have at most one inspected snake at a time; inspection state is held only in the viewer's client-local UI state; inspection shall never write any Convex or SpacetimeDB state; inspection shall never produce a selection shadow on the board; and inspection shall never displace or otherwise interact with any operator's selection. Historical operator selection shadows reconstructed from the action log per [08-REQ-073] shall continue to be displayed alongside the inspecting client's local inspection state, unaffected by the viewer's choice of inspected snake. *(Resolved per 08-REVIEW-008.)*

**08-REQ-075**: The replay viewer shall permit **inspection** of any snake on the viewed team at any scrubbed moment regardless of which operator (if any) had that snake selected at that moment in the original game.

**08-REQ-075a** *(negative)*: The team-perspective replay shall not display, reconstruct, or expose any state belonging to opposing teams beyond what was visible through [04]'s RLS rules to the owning team at the original time of play. In particular, any opposing snake that was invisible to the owning team at a given historical moment shall remain invisible in replay at that moment.

**08-REQ-075b**: The board-level replay mode shall not reconstruct or display any data that depends on the Centaur-subsystem action log of [06]. In particular, the board-level mode shall not display which operator had selected which snake at any moment, nor any per-operator coloured shadows, nor any stateMap / worst-case-world / heuristic breakdown data.

**08-REQ-075c**: The replay viewer shall expose a **direct link** affordance that produces a URL identifying the specific game being viewed, such that another authenticated user opening the URL is taken directly to that game's replay viewer.

---

### 8.16 Live Spectating

**08-REQ-080**: The application shall provide a **Live Spectating** view for any game whose status is `playing` per [05-REQ-028]. The view shall be accessible to every authenticated user without requiring membership in any participating Centaur Team.

**08-REQ-081**: Entry to the Live Spectating view shall cause the UI to obtain a **spectator SpacetimeDB access token** for the target SpacetimeDB game instance, issued by Convex per [03-REQ-026], [05-REQ-035], and the spectator-token provisions of [03]. The UI shall present this token to the runtime when establishing its subscription connection per [04-REQ-018].

**08-REQ-082**: The Live Spectating view shall subscribe to the SpacetimeDB game instance's state using subscription patterns that satisfy [04-REQ-054]'s support for a current-state view with incremental updates. The UI shall render board state, snake states, items, hazards, fertile tiles, and turn events as delivered by the subscription, in real time.

**08-REQ-083**: The Live Spectating view's rendering shall honour the invisibility semantics of [04-REQ-047] without any client-side workaround: a snake whose `visible` field is `false` shall not be displayed to a spectator connection, consistent with the server-side filter. The UI shall not attempt to infer or reconstruct invisible-snake state from any channel.

**08-REQ-084**: The Live Spectating view shall display a **scoreboard** per participating team. The scoreboard shall be sourced exclusively from a dedicated SpacetimeDB scoreboard view that publishes per-team aggregate quantities (team score, alive-snake count, aggregate length) computed server-side over the true alive-snake set — including any contributions from snakes whose `visible` field is `false` per [04-REQ-047] — and that exposes only those aggregates to spectator subscriptions. The client shall render the aggregates exactly as delivered by the view and shall not attempt to compute or correct them from any other channel. The scoreboard shall update live in response to subscription deliveries. *(Amended per 08-REVIEW-018 resolution: scoreboard is a server-side aggregate view, not client-aggregated from per-snake data, so invisibility cannot leak through omitted contributions.)*

**08-REQ-084b** *(negative)*: The application shall not compute team-level aggregate quantities (team scores, total alive-snake length, alive-snake counts, win-condition state, or any analogous aggregate) by aggregating raw per-snake subscription data on the client. All such aggregates are delivered by purpose-built SpacetimeDB views that compute them server-side over the true game state, so that the visibility-filter posture of [04-REQ-047] is not undermined by client-side reconstruction. *(Added per 08-REVIEW-018 resolution.)*

**08-REQ-085**: The Live Spectating view shall display the current turn number and, per participating team, the team's current remaining chess-timer budget and whether the team has declared its turn over for the current turn, consistent with the per-team time-budget data supplied by [04]'s subscription interface.

**08-REQ-086** *(negative)*: The Live Spectating view shall not expose any affordance that stages moves, selects snakes, toggles per-operator tempo, boots operators, or otherwise mutates game-runtime or Centaur-runtime state. Spectator access tokens per [03-REQ-026] do not authorise any such mutation and the UI shall not attempt any.

**08-REQ-087**: The Live Spectating view shall provide a **timeline scrubber** that permits the spectator to navigate to any previously completed turn of the current game and view the reconstructed board, snake, item, scoreboard, and event-log state at that turn, using the historical query capability of [04-REQ-057]. On entry to the Live Spectating view, the UI shall subscribe to the game's full historical state up-front (per [04-REQ-054]'s mid-game-join subscription pattern), accepting bounded entry latency proportional to game length; games are bounded to at most a few hundred turns and the worst-case entry latency on long games is acceptable. Scrubbing backward shall not interrupt the incoming live subscription; returning to the live head shall resume live rendering. *(Amended per 08-REVIEW-019 resolution: up-front full-history subscription on entry, no lazy-fetch state machine.)*

**08-REQ-088**: While the spectator is scrubbed to a historical turn, the Live Spectating view shall visibly communicate to the user that the display is not live, and shall provide a one-action affordance to return to the live head.

**08-REQ-089**: The Live Spectating view shall release its subscription and discard its spectator access token when the user navigates away from the view or when the game transitions to `finished` per [05-REQ-028].

---

### 8.17 Data Source Abstraction

**08-REQ-076**: The application shall implement a data-source abstraction under which the UI components of §§8.9–8.13 read board state, turn number, staged moves, chess-timer state, and computed display state through a uniform interface that the live mode binds to the current game's SpacetimeDB subscription and the current team's Centaur state subscription ([06-REQ-043]), and that the replay mode binds to the persisted replay and action log read from Convex ([05-REQ-040], [06-REQ-035]). This data-source abstraction is exported by `@snek-centaur/server-lib` and serves as the primary stable interface between the library and the operator web application, regardless of how teams modify the UI in their fork of the reference implementation repository ([02-REQ-032a]). *(Amended per 08-REVIEW-022 resolution: canonical package name aligned with [02].)*

**08-REQ-077**: A UI component of the live operator interface shall not be required to distinguish whether it is rendering live or replayed state. Read-only enforcement in replay mode shall be accomplished by the data-source abstraction refusing mutation operations, not by each UI component implementing a read-only branch of its own.

**08-REQ-078** *(negative)*: The data-source abstraction shall not expose a mutation surface at all in replay mode. Attempts to invoke a mutation through a replay-mode data source shall fail without side effect.

---

### 8.17a Source Ownership and Customisation

**08-REQ-079**: The application shall be delivered in the Snek Centaur Server reference implementation repository ([02-REQ-032a]), not as part of the Centaur Server library itself. Teams obtain the application by forking the reference repository and customise it by modifying their fork directly — full source ownership, not a bounded extension point. Teams may modify, replace, or extend any Svelte component, add pages, change layouts, or restructure the UI as they see fit. No customisation shall relax any of the invariants stated in this module or in [06]; correctness is enforced externally by Convex function contracts ([06]) and security enforcement points ([02-REQ-033]).

**08-REQ-080a** *(negative)*: No customisation of the application shall be relied upon for any security or correctness invariant, per [02-REQ-033]. All invariants that constrain Centaur-state mutations shall remain enforced by [06]'s function contract surface regardless of what a team's forked application chooses to present or hide.

---

### 8.18 Player Profile

**08-REQ-090**: The application shall provide a **Player Profile** view for every user record per [05-REQ-004]. Each authenticated user shall have direct access to their own Player Profile via the global navigation of [08-REQ-010]. Access to other users' profiles shall be permitted at minimum via links from team member listings and game history. All Player Profile views are accessible only to authenticated users per [08-REQ-006]; there is no unauthenticated/public profile surface. *(Amended per 08-REVIEW-016 resolution.)*

**08-REQ-091**: The Player Profile view shall display at minimum the user's OAuth-provided display name, current and historical Centaur Team memberships, and a chronological **game history** listing every game in which the user was either a member of a participating team at the time (per the game's participating-team snapshot of [05-REQ-029]) or is a current member of one of those teams, together with each game's room, date, the participating teams, the final result (win/loss/draw), and the final scores per [05-REQ-038]. The Player Profile shall not display the user's email address to any viewer, including the user themselves on their own profile (the email is owned by the OAuth provider and any change must be made there). *(Amended per 08-REVIEW-016 resolution: email removed from displayed identity.)*

**08-REQ-091a** *(negative)*: No application view shall expose any user's email address to any other user, nor to the user themselves. Email addresses are stored in Convex solely for OAuth identity matching and admin operations and shall not be returned by any user-scoped Convex query (player profile, team-member listing, team management, game-history attribution, leaderboard, or any other user-facing surface). *(Added per 08-REVIEW-016 resolution. Downstream impact: [05]'s query layer must enforce this — no [05] user-scoped query may include the email field in its returned shape.)*

**08-REQ-092**: The Player Profile view shall display aggregate statistics derived from the user's game history: at minimum, games played, win rate, and average team score. These statistics shall be computed from the same data that populates the game history listing and shall therefore be consistent with it.

**08-REQ-093**: The Player Profile view shall resolve historical team attributions using the participating-team snapshot of [05-REQ-029] rather than the current team record, so that a historical game continues to show the team the user was playing for at the time even if the user has since changed teams or the team has been archived per [05-REQ-015a]. *(Amended per 08-REVIEW-017 resolution: archive-only semantics for Centaur Teams.)*

---

### 8.18a Team Profile

**08-REQ-094**: The application shall provide a **Team Profile** view for every Centaur Team per [05-REQ-008]. The Team Profile shall be accessible to every authenticated user; access is gated by the platform-wide authentication requirement of [08-REQ-006] and there is no unauthenticated/public team profile surface. *(Amended per 08-REVIEW-016 resolution.)*

**08-REQ-095**: The Team Profile view shall display at minimum the team's name, display colour, current Captain, current members per [05-REQ-011], the team's nominated server domain and its latest health status per [05-REQ-009], and a chronological game history listing every game in which the team participated, with each game's room, date, opposing teams, final result, and final scores. The game history shall include all games in which the team participated, visible to any authenticated user.

**08-REQ-096**: The Team Profile view shall display aggregate statistics derived from the team's game history: at minimum, games played, win rate, average score, and head-to-head records against each other team the team has ever played against.

**08-REQ-097**: The Team Profile view shall resolve historical opponent attributions using the participating-team snapshots of [05-REQ-029] so that head-to-head records remain stable even if an opposing team has since been archived per [05-REQ-015a]. *(Amended per 08-REVIEW-017 resolution: archive-only semantics for Centaur Teams.)*

**08-REQ-098** *(negative)*: The Team Profile view shall not expose any mutating affordance over team state. Mutation of team state is the exclusive responsibility of the Team Management view (§8.5b), which enforces the Captain-only scope of [08-REQ-023d] and the mid-game freeze of [08-REQ-023e].

---

### 8.19 Leaderboard

**08-REQ-094a**: The application shall provide a global **Leaderboard** view that ranks Centaur Teams by one of a closed set of criteria. The closed set shall be at minimum: win rate (with a minimum games-played qualifying threshold), total wins, and average score.

**08-REQ-094b**: The Leaderboard view shall permit the user to switch between the criteria of [08-REQ-094a] and to filter results by time window from a closed set including at minimum: all time, last 30 days, and last 7 days.

**08-REQ-094c**: The Leaderboard view shall permit optional restriction of the ranking to games played within a specific room. When a room restriction is applied, the ranking shall consider only games whose room matches.

**08-REQ-094d**: The Leaderboard view shall link each ranked team directly to that team's Team Profile view per §8.18a.

**08-REQ-094e**: The Leaderboard view shall resolve historical attributions using the participating-team snapshots of [05-REQ-029], so that a team's ranking continues to reflect games it played under its historical identity even if the team has since been archived per [05-REQ-015a]. Archived teams shall continue to appear in the default leaderboard view under their archived identity, consistent with the archive-only semantics of [05-REQ-015a] (which is a live-state hide-from-listings action and not a historical-state rewrite, paralleling [05-REQ-021a] for room archiving). *(Amended per 08-REVIEW-017 resolution: deletion is not a thing in this platform; archived teams remain in leaderboards by default.)*

**08-REQ-094f** *(negative)*: The Leaderboard view shall not be accessible in a way that exposes team or player data to unauthenticated visitors. Leaderboard access is subject to the authentication requirement of [08-REQ-006]. *(Amended per 08-REVIEW-016 resolution: deferral removed; authentication requirement is positively pinned.)*

---

### 8.20 API Key Management

**08-REQ-095a**: The application shall provide an **API Key Management** view accessible to every authenticated user, through which the user may create new API keys per [05-REQ-051] and revoke API keys they previously created per [05-REQ-052]. The view shall list the user's active and revoked API keys with at minimum each key's human-chosen label, creation timestamp, and revocation timestamp where applicable.

**08-REQ-095b**: When an API key is created via the API Key Management view, the UI shall display the key's plaintext exactly once, at the moment of creation, consistent with [05-REQ-046] and [03-REQ-034]. After that single display, the UI shall never present the plaintext again. The UI shall provide an explicit affordance for the user to copy the plaintext to their clipboard before dismissing the creation dialog.

**08-REQ-095c** *(negative)*: The API Key Management view shall never display, store, or transmit API key plaintext except during the single creation-time disclosure of [08-REQ-095b]. Subsequent views of the key shall show only its label and metadata per [08-REQ-095a].

**08-REQ-095d**: The API Key Management view shall visibly communicate to the user that an API key's authorization scope is bounded by the user's own current authorization scope per [05-REQ-047], so that the user understands that losing team roles or membership will correspondingly reduce what actions their API keys can perform (subject to 05-REVIEW-004).

---

### 8.21 Admin Experience

**08-REQ-096a**: When the authenticated user holds the platform admin role ([05-REQ-065]), the application shall expose the following additional capabilities:

- **Team visibility**: The admin shall be able to view all Centaur Teams, their members, roles, and nominated server domains, regardless of membership ([05-REQ-066]).
- **Game visibility**: The admin shall be able to view all games (active and completed), including those in rooms or involving teams the admin is not a member of ([05-REQ-066]).
- **Replay access**: The admin shall be able to view the team-perspective replay (sub-turn within-turn actions) for any team in any game, regardless of team membership ([05-REQ-066]). For finished games this access is shared with all authenticated users; the admin distinction is meaningful for live-game cross-team visibility, where the admin holds implicit coach permission for every team per [05-REQ-067].
- **Live coach access**: The admin shall be able to enter the live operator interface of any in-progress game in any team's read-only coach mode ([08-REQ-052a]) without being explicitly designated as a coach of that team.

**08-REQ-096b** *(negative)*: The admin experience shall be read-only with respect to game state and Centaur-subsystem state. Admin users shall not be able to stage moves, edit Drive portfolios, toggle per-operator tempo, boot operators, or otherwise act as operators for teams they do not belong to. Admin visibility is observational, not operational.

---

### 8.22 Lifecycle and Session Boundaries

**08-REQ-081a**: The application's live operator interface shall become available on the team's navigation for a given game at the moment that game transitions to `playing` ([05-REQ-028]) and shall remain available until that game transitions to `finished`.

**08-REQ-082a**: On a game transitioning to `finished`, the live operator interface shall be replaced for connected operators by a terminal state indicator that surfaces the final scores ([05-REQ-038]) and a link to open the same game in the replay viewer. The terminal state shall not offer any mutating affordances.

**08-REQ-083a**: When the application loses its subscription to either SpacetimeDB or Convex, it shall surface the loss to the operator and shall not fabricate missing state from stale caches. On recovery, the application shall resubscribe and resume rendering from fresh state.

**08-REQ-084a** *(negative)*: The application shall not persist any authoritative state of its own across sessions. All operator-visible state is derived from [04], [05], or [06] on each session, consistent with [07-REQ-057]'s posture for the framework.

---

### 8.23 Cross-Cutting UI Invariants

**08-REQ-100**: The application shall surface Convex-side invariant rejections to the user as explicit, user-legible feedback at the point of the rejected action. The UI shall not silently swallow rejection errors.

**08-REQ-101**: The application shall treat any affordance whose authoritative enablement is governed by a Convex-side invariant (for example, mid-game roster freeze, minimum team count, ready-check gate) as an affordance whose *enabled* state in the UI must be derivable from Convex-held state, not from client-held optimism. Where this derivation is not yet possible because the invariant lives only in Convex mutation handlers, the UI shall still dispatch the mutation and surface the result per [08-REQ-100].

**08-REQ-102**: The application shall honour the distinction between the immutable parameter snapshot bound to a game ([05-REQ-024]) and the current parameter defaults held on a room. In particular, viewing a game's configuration — whether the game is `playing`, `finished`, or referenced from replay or history — shall show the game's snapshotted parameters, not the room's current defaults, even if the two differ.

**08-REQ-103**: The application shall be resilient to a Centaur Team being archived per [05-REQ-015a]: views that reference historical teams (game histories, leaderboards, profiles) shall continue to render using the participating-team snapshot, and views that reference a currently-live team that has been archived shall present the archived state to the user explicitly rather than failing or showing broken references. *(Amended per 08-REVIEW-017 resolution: archive-only semantics for Centaur Teams.)*

**08-REQ-104**: Every mutating action taken by the application shall be dispatched against the platform Convex runtime of [05] and shall be subject to the same invariants as the equivalent HTTP API call, including the mid-game roster freeze of [05-REQ-013]. The UI shall not attempt to bypass or work around any Convex-side invariant; where an action is disallowed by Convex, the UI shall surface the rejection to the user.

---

## Design

### 2.1 Application Topology, Tech Stack, and Repository Layout

The application is a SvelteKit project running under the Node.js adapter inside the Snek Centaur Server's single Node process, co-resident with the bot framework runtime ([07] §2.1). Co-residency is required because the `/.well-known/snek-game-invite` endpoint (08-REQ-005) hands the received per-Centaur-Team game credential directly to the in-process bot framework session manager (08-REQ-003, 08-REQ-005); a separate process boundary would require an out-of-band channel that the architecture explicitly avoids. *(See [02] §2.16a; consistent with 02-REQ-030 / 02-REQ-032a.)*

**Stack**:
- **Framework**: Svelte 5 + SvelteKit (Node adapter).
- **Component library**: shadcn-svelte (used for primitives only; all interaction logic lives in application components, keeping the surface forks may safely replace minimal).
- **Convex client**: `convex-svelte` for reactive queries and mutations against [05]'s and [06]'s function contract surfaces.
- **SpacetimeDB client**: the SpacetimeDB browser TypeScript client (08-REQ-003), used for live game subscriptions and live spectating.
- **Presence**: `@convex-dev/presence` for operator presence and per-operator tempo visibility (08-REQ-035, 08-REVIEW-004).
- **Heuristic registry**: build-time import of `HEURISTIC_REGISTRY` from `@team-snek/heuristics` ([07] §2.3, [02] §2.16a), satisfying 08-REVIEW-021's drift-elimination property at the build-artifact level.
- **Library dependency**: a published library package providing the data-source abstraction and other library APIs (§2.4 below). This module's source canonicalises the package name to `@snek-centaur/server-lib` consistent with [02] §2.13 / §2.16a.

**Repository topology**: the application is delivered as a separate forkable reference implementation repository per 02-REQ-032a / 08-REQ-079, **not** a workspace package within the platform monorepo. Teams obtain it by forking; their fork installs `@snek-centaur/server-lib`, `@snek-centaur/engine`, and `@team-snek/heuristics` from the published registry. The reference repository's directory layout follows SvelteKit conventions:

```
src/
  app.html
  app.d.ts
  hooks.server.ts                      # Convex Auth session hooks
  routes/                              # see §2.2 routing topology
  lib/
    server/                            # server-only modules (invitation endpoint, healthcheck)
      invitation.ts                    # /.well-known/snek-game-invite handler (§2.6)
      bot-session-manager.ts           # in-process handoff to @snek-centaur/server-lib
    components/                        # board renderer, header, decision table, etc.
    data-source/                       # consumers of @snek-centaur/server-lib's data-source API
    presence/                          # @convex-dev/presence integration (§2.5)
    colour/                            # per-operator stable-colour function (§3.3)
static/
  .well-known/                         # served as static assets if not generated at request time
```

Forks are expected to modify this layout freely (08-REQ-079, 08-REQ-080a). The load-bearing contract teams must not break is the data-source abstraction surface (§2.4 / §3.2) and the invitation endpoint contract (§2.6 / §3.1).

---

### 2.2 Routing and Layout Hierarchy

The route topology partitions surfaces by which authority gates them (08-REQ-002, 08-REQ-006, 08-REQ-009c, 08-REQ-010, 08-REQ-013):

```
/                                       # home view (§8.3a) — auth required
/sign-in                                # sign-in page (08-REQ-002)
/sign-out                               # sign-out endpoint (08-REQ-009b)

/leaderboard                            # global leaderboard (§8.19) — auth required (08-REQ-094f)
/teams                                  # teams browser (§8.5a) — auth required
/teams/[teamId]                         # team profile (§8.18a) — auth required
/teams/[teamId]/manage                  # team management (§8.5b) — member-gated, Captain affordances inside
/teams/[teamId]/heuristic-config        # heuristic config (§8.4) — member-gated; Captain edits, others read-only
/teams/[teamId]/bot-params              # bot parameters (§8.5) — member-gated; Captain edits, others read-only
/teams/[teamId]/games                   # game history for the team (§8.7) — member of team or platform admin
/teams/[teamId]/live                    # live operator interface for the team's current playing game (§§8.9–8.14)

/rooms                                  # room browser (§8.6) — auth required
/rooms/[roomId]                         # room lobby (§8.8) — auth required; affordances scoped per role

/games/[gameId]/spectate                # live spectating view (§8.16) — auth required
/games/[gameId]/replay                  # unified replay viewer (§8.15) — auth required
/games/[gameId]/coach/[teamId]          # coach mode for a designated team (§8.16/§2.16) — coach or admin

/users/[userId]                         # player profile (§8.18) — auth required

/api-keys                               # API key management (§8.20) — auth required, scoped to caller

/admin                                  # admin landing (§8.21) — admin-only
```

**Layout hierarchy**: a single root layout enforces authentication via a `+layout.server.ts` load function that resolves the OAuth session against Convex and exposes the `user` record (08-REQ-007, 08-REQ-006); on absence it redirects unauthenticated callers to `/sign-in` for every non-exempt route (the exempt set is `/sign-in`, `/sign-out`, and the static asset surface; per 08-REVIEW-016 there is no public surface beyond the sign-in page). `/teams/[teamId]/...` is wrapped in a team-scoped layout that resolves the `team` record (and the caller's role on it: Captain | member | coach | admin | none) from Convex; child pages render gated affordances by branching on this role rather than by re-querying. `/games/[gameId]/...` is wrapped in a game-scoped layout that resolves the `game` record and its `participatingTeams` snapshot from Convex.

**Cross-server reachability**. The application is served by *one* Snek Centaur Server, which hosts a known set of Centaur Teams (08-REQ-004). The team-scoped routes whose semantics require this server's bot-framework process — heuristic config, bot params, the live operator interface, the team game history — are accessible only when `[teamId]` is one of this server's hosted teams (08-REQ-012, 08-REQ-028); navigating to such a route for a non-hosted team is refused by the team-scoped layout's load function with an explanatory empty state, consistent with 08-REQ-012. All other team-scoped routes (team profile, team management view, coach mode) are cross-server: any Snek Centaur Server's frontend renders them for any team. Cross-server deep-links are produced in the home view's "live games" section (08-REQ-010a) and in the team profile's "in-progress" indicators by resolving the team's `nominatedServerDomain` ([05-REQ-014]) and emitting an absolute URL to that server's `/teams/[teamId]/live` route. The receiving server handles auth on its own (the user is authenticated against Convex globally).

**Refusal semantics for `/teams/[teamId]/live`** (08-REQ-012): the load function checks `game.status === "playing"` for the team's current game; if no `playing` game exists it returns an empty-state component that explains "no game in progress" and links back to the team's home. This is a positive component, not an HTTP 404, so the navigation surface remains coherent.

---

### 2.3 Authentication and Session Management

**OAuth and user record**. Sign-in flows through Convex Auth's Google OAuth provider per [03] §3.14. The SvelteKit `hooks.server.ts` adapts Convex Auth's session cookie into a server-side session that exposes the user record per [05]'s `User` exported interface to every load function (08-REQ-006, 08-REQ-007). The user record carries the human's display name and the platform-admin flag; per 08-REQ-091a / 08-REVIEW-016 it does **not** include the email field on any client-visible projection.

**Captain status reactivity**. Captain status is read from `centaur_teams.captainUserId` ([05]) via a Convex reactive query subscribed by the team-scoped layout. When the Captain reactively changes mid-session — e.g., a Captain transfer from the Team Management view (08-REQ-023d), or the user being removed from the team — every gated affordance re-renders without page reload (08-REQ-008). Implementation pattern: a Svelte 5 `$derived` rune over the layout's reactive `team` value yields a `role: "captain" | "member" | "coach" | "admin" | "none"` value that descendant components read; affordances bind their `disabled`/visibility to this `$derived` value rather than to a load-time snapshot.

**Admin role**. The platform admin role per [05-REQ-065] is exposed on the user record as a boolean. Admin-only affordances (§8.21) bind to it through the same `$derived` reactivity (08-REQ-009c) so an admin role granted or revoked during the session takes effect immediately.

**Sign-out**. The `/sign-out` endpoint clears Convex Auth's session cookie and any client-held SpacetimeDB access tokens (08-REQ-009b), then redirects to `/sign-in`. SpacetimeDB sockets opened during the session are closed by the live-mode data source teardown (§2.4).

**Token issuance and storage discipline** (08-REQ-009 / 009a). The application never mints a SpacetimeDB access token of its own: every token is obtained through the Convex-mediated issuance path of [05-REQ-035] / [03] §3.17 by calling Convex actions and receiving the JWT in the response payload. Tokens are held in component-local memory only for the lifetime of the subscription that uses them — never persisted to localStorage, sessionStorage, IndexedDB, or cookies, and never reflected back into the URL or any UI surface. API key plaintext is shown exactly once at creation time (08-REQ-095b) via a modal that holds the plaintext in a closure with no logging side effect; dismissing the modal discards the plaintext.

---

### 2.4 Data-Source Abstraction (Centaur-Lib API)

The data-source abstraction (08-REQ-076 / 077 / 078) is the load-bearing contract between `@snek-centaur/server-lib` and the forked operator UI. Its design choice is the single most consequential one in this module because it determines what teams' forks may safely modify and what they must accept as fixed.

**Shape**. The abstraction is an interface (TypeScript type plus factory functions) the library exports; UI components consume it through Svelte 5 context injection rather than as a global rune store. Three factories produce three concrete bindings of the same interface:

- `createLiveDataSource({ gameId, centaurTeamId, gameCredential })` — binds reads to the SpacetimeDB game subscription and the Convex Centaur-state subscription ([06-REQ-043]); binds mutations through Convex's `[06]` function contract surface ([06-REQ-030]) and through SpacetimeDB's `stage_move` reducer ([04] §2.4).
- `createReplayDataSource({ gameId })` — binds reads to the persisted replay ([05-REQ-040]) and the action log ([06-REQ-035]); the mutation surface is **absent** (not present at the type level — replay-mode UI cannot accidentally call a mutation because no mutation function exists on the returned object). This satisfies 08-REQ-078's negative requirement structurally rather than at runtime.
- `createCoachDataSource({ gameId, centaurTeamId, coachToken })` — binds reads to the coached team's filtered SpacetimeDB views via the coach SpacetimeDB token issued per [05] §3.4 ([05-REQ-067]) and to the same Convex Centaur-state subscription a member would see; the mutation surface is **absent**, so coach-mode UI cannot mutate (08-REQ-052b).

The interface is structured as a set of *read* signals — Svelte 5 readable runes (specifically `$state` snapshots or `$derived` projections produced inside the factory) wrapping reactive subscriptions — and a *mutations* object whose presence depends on the binding (`live` only). UI components depend on the interface, not on which binding produced it (08-REQ-077): a single `<BoardDisplay>` component renders identically in live, replay, and coach mode by reading from `dataSource.boardState`, `dataSource.snakes`, `dataSource.selections`, etc.; whether those signals are sourced from a live SpacetimeDB subscription or from a reconstructed historical slice is invisible to the component.

**Why context injection rather than a global store**. Two replay viewers may be open in two browser tabs viewing different games simultaneously, and a single tab may host both a coach-mode panel and a replay panel. A global store would force a singleton binding that conflicts with this; per-component-tree context injection lets each panel host its own data source. Live-mode bindings are per-tab in practice (the application surfaces only one live game at a time per team), but the same context-injection pattern keeps the call shape uniform.

**Inspection state**. Inspection state (08-REQ-052c, 08-REQ-074) is **not** part of the data-source abstraction, because it is purely client-local UI state with no Convex or SpacetimeDB write path (08-REVIEW-008). Each panel's `<InspectionProvider>` Svelte context owns a `inspectedSnakeId: SnakeId | null` rune; the data-source abstraction is unaware of inspection. This keeps the abstraction's contract identical between member, coach, and replay use sites — only the inspection provider varies.

**Mutation routing**. Live-mode mutations are dispatched as Convex mutations against [06]'s function contract surface (08-REQ-104), which is the ultimate authority for invariants (08-REQ-080a). The data source surfaces the mutation result (success or rejection) to the caller; UI components use this result to drive the user-feedback path of §2.18 (08-REQ-100). Move staging is dispatched directly to SpacetimeDB's `stage_move` reducer through the SpacetimeDB client, since [04] is the authoritative source for staged-move state.

**Replay-mode reconstruction**. The replay binding's read signals are `$derived` projections over a scrubbed-position cursor (`scrubberPositionRune: number`) of two underlying datasets: the persisted board-level replay ([05-REQ-040]) and, for team-perspective replay (08-REQ-071), the action log ([06-REQ-035]) for the viewer's team. Per-Turn-mode and Timeline-mode scrubbing both feed the same cursor; the cursor's units differ (turn index vs ms since game start) but the projection logic is identical. The action-log reconstruction yields, at any cursor position, the per-snake portfolio state, the team's active-operator set and each active operator's tempo (reconstructed from the team's connection events together with the time-stamped `operator_tempo_changed` and `operator_booted` events; tempo is durable across turns so the "last-written" tempo value remains in effect until the next event, and boot events appear in this stream as the manual analogue of a connection-loss event), per-snake selection state, and the per-snake `SnakeBotStateSnapshot` ([07] §3.4) that was current at the most recent prior write of each — i.e., it is a "scrubbed view of last-written state" rather than a continuous interpolation. This matches the replay reconstruction obligation of 08-REQ-072 and uses the action-log event union of [06-REQ-036] as the reconstruction substrate.

---

### 2.5 State Management and Cross-Cutting Reactivity

**Svelte 5 runes posture**. All UI reactivity uses Svelte 5 runes (`$state`, `$derived`, `$effect`). Reactive Convex queries are wrapped by `convex-svelte`'s `useQuery` analogue, which exposes a rune; reactive SpacetimeDB subscriptions are wrapped by a thin adapter that exposes a `$state`-backed rune updated by the SpacetimeDB client's table-row delta callbacks. This places every reactive input on the same uniform rune substrate so `$derived` compositions span Convex, SpacetimeDB, and presence sources without special-casing.

**Convex reactive query integration**. Each load function in the team-scoped, game-scoped, and platform-scoped layouts opens the Convex queries it needs and threads them down via context (the data source for game-scoped state; named layout context entries for cross-cutting state such as `currentUser`, `team`, `role`, `participatingTeams`). Mutations dispatch through `convex-svelte`'s mutation API and return a `Promise<Result>` whose rejection branch feeds §2.18's user-feedback path.

**SpacetimeDB subscription integration**. The live-mode data source opens one SpacetimeDB connection per (team, game) via the SpacetimeDB browser client, authenticated with the per-Centaur-Team game credential issued per [05] §3.4 / [03] §3.17. The connection subscribes to the queries described by [04] §2.12 for a member operator. The spectating data source opens a second SpacetimeDB connection authenticated with a spectator access token (08-REQ-081); subscriptions follow [04] §2.12's spectator pattern. Coach mode opens a third connection via the coach SpacetimeDB token path of [05] §3.4. Each connection is owned by its respective data source and torn down on data-source disposal (08-REQ-089, 08-REQ-082a, 08-REQ-083a).

**Network latency measurement** (08-REQ-036). The latency indicator measures end-to-end round-trip time against the SpacetimeDB subscription channel by issuing periodic lightweight heartbeat reads (subscribing to a singleton row whose updates are timestamped server-side) and computing `now() - lastUpdateTimestamp` debounced to the most recent N samples. This avoids requiring a new RTT-specific reducer or Convex field. The exact sampling interval (a few seconds) is a design discretion not visible in any contract.

**Presence integration via `@convex-dev/presence`** (08-REQ-035, 08-REVIEW-004). Each team's live session installs an `@convex-dev/presence` channel keyed `team:${centaurTeamId}:game:${gameId}` and joined by every connected operator (member, coach, admin) on entry to the live operator interface or coach view. The per-presence-record shape (extending `@convex-dev/presence`'s base shape) is:

```typescript
interface OperatorPresenceRecord {
  userId: string                 // resolves to a User record per [05]
  role: "member" | "coach" | "admin"
  displayName: string            // OAuth display name; never email
  colour: string                 // hex; per-operator stable colour for the game's lifetime (§3.3)
  currentSelectionSnakeId: string | null   // mirrors [06]'s snake_operator_state for header presence
  // Per-operator tempo is read from [06] §2.1.5 / 06-REQ-040b directly,
  // not duplicated into presence — the presence record only proves connectedness.
}
```

Presence delivers connectedness (which is exactly the active-operator set definition of 08-REQ-062 restricted to member operators); tempo is read from [06]'s `operator_tempo` table per [06-REQ-040b] (08-REQ-061). The header presence display (08-REQ-032) joins these two sources reactively: a `$derived` rune over both produces the per-operator presentation showing each active operator's display name, colour, current tempo, and (Captain-only view) operator-boot affordance. The `role` field is what enables the visual distinction of coach/admin from member operators (08-REQ-064a).

**Per-operator stable-colour assignment**. The colour is assigned deterministically from `(gameId, userId)` so the same operator gets the same colour across reloads of the same game and across all clients viewing that game (08-REQ-035, 08-REQ-039, 08-REQ-073). The function takes both inputs and returns a hex colour from a fixed accessibility-screened palette of 16 hues, hashed to balance distribution. Specified as the exported `assignOperatorColour(gameId, userId)` in §3.3.

---

### 2.6 Game Invitation Endpoint

**Route**. SvelteKit `+server.ts` at `src/routes/.well-known/snek-game-invite/+server.ts` exposes a `POST` handler (08-REQ-005). The path is required to be exactly `/.well-known/snek-game-invite` because [05] §3.4 invitation orchestration calls this URL on the team's `nominatedServerDomain`.

**Request validation**. The handler validates the inbound JSON payload against [03]'s game-credential format (the per-Centaur-Team game credential JWT issued by Convex Auth's customJwt provider per [03] §3.15 and the invitation envelope per [03] §3.16). Validation steps:
1. Verify the envelope's signature against Convex's published JWT verification key per [03] §3.17.
2. Parse the `centaurTeamId` and `gameId` claims.
3. Verify the `centaurTeamId` is one of the teams hosted by this Snek Centaur Server (matched against a server-config-time list of hosted team IDs). Unknown teams return HTTP 403.
4. Verify the invitation has not already been accepted for this `(centaurTeamId, gameId)` pair (idempotence guard against duplicate Convex deliveries).

**Optional whitelist**. Server operators may configure an additional allowlist of acceptable inviting Convex deployment fingerprints (defence-in-depth in case Convex's signing key is misconfigured); this is a server-config concern, not a requirement, and absent the allowlist any signature-valid invitation from the platform's Convex deployment is accepted.

**Acceptance and handoff**. On successful validation the handler:
1. Persists the `(centaurTeamId, gameId, gameCredential, expiresAt)` record to a server-local store (in-memory, cleared on game end). Persistence is required so subsequent SvelteKit requests from this team's operators can read the credential.
2. Calls into the in-process `@snek-centaur/server-lib` bot-framework session manager via `startGameSession({ centaurTeamId, gameId, gameCredential, registry: HEURISTIC_REGISTRY, ... })` per [07] §3.3 to boot the team's bot-framework session. The session manager is co-resident in this Node process, so the call is a direct function invocation; no IPC.
3. Returns HTTP 200 with the response body shape defined in §3.1.

**Failure modes**. Invalid signature → 401. Unknown team → 403. Duplicate invitation for an already-accepted game → 200 with `alreadyAccepted: true`. Bot-framework boot failure → 500 with a diagnostic body. The endpoint never reveals server-internal state in error messages beyond the failure category.

---

### 2.7 Live Operator Interface — Board Renderer and Gestures

**Renderer choice**. The board is rendered with **SVG** as the primary substrate, with a single underlying HTML5 `<canvas>` layer used only for grid lines and base terrain rendering when the cell count exceeds a threshold. Rationale: SVG yields per-cell DOM nodes that bind cleanly to Svelte's reactivity and to per-cell event handlers (click-to-select 08-REQ-042, click-to-target 08-REQ-053, hover affordances), and the typical board size (≤ a few hundred cells) is well within SVG performance limits. The canvas fallback for large boards keeps the rendering complexity bounded without changing the gesture layer (gestures hit-test against an invisible SVG overlay regardless of which substrate paints the base layer). A pure-canvas approach was considered and rejected because hit-testing for click-to-select would require manual pick-region maintenance and would lose the accessibility tree.

**Layered rendering** (08-REQ-037 through 08-REQ-041, 08-REQ-048 through 08-REQ-051):
- **Layer 0 — terrain**: grid lines, hazard cells, fertile tiles. Static within a turn; re-renders only on board mutations.
- **Layer 1 — items**: food, invulnerability potions, invisibility potions. Re-renders on subscription deliveries.
- **Layer 2 — snakes**: alive snakes by team colour, head letter designation, neck-segment length label, effect outlines (invulnerability blue / negative-invulnerability red per 08-REQ-038), invisibility shimmer (own team only per 08-REQ-038's RLS posture). Re-renders on subscription deliveries.
- **Layer 3 — selection shadows**: per-operator coloured glows on selected snakes (08-REQ-039), driven by [06]'s selection record subscription joined to the per-operator stable-colour function (§3.3).
- **Layer 4 — staged-move markers**: distinctive border on the destination cell of each owned snake's staged move (08-REQ-041). Updates reactively as staged moves change in [04].
- **Layer 5 — candidate highlights**: per-direction stateMap-coloured overlay on the four cells adjacent to the currently-selected owned snake's head (08-REQ-040). Coloured by stateMap score on a monotone ramp; "no entry yet" cells render in a distinct neutral state (08-REQ-040, [07-REQ-049]).
- **Layer 6 — worst-case overlay**: when a direction is selected on an owned snake, this layer renders the worst-case simulated world for that (snake, direction) pair as translucent overlays (08-REQ-048), with the per-snake turn timestamp from `worstCaseWorlds[direction].perSnakeTurnTimestamp` ([07] §3.4) driving the frozen-foreign visual treatment per [07] §3.7. Per-direction annotations (08-REQ-049) are out of scope for the MVP per the 08-REVIEW-023 resolution; this layer renders the simulated `state` only. Hidden when no direction is selected (08-REQ-051).
- **Layer 7 — inspection overlays**: client-local inspection state (replay viewer 08-REQ-074 / coach mode 08-REQ-052c) drives the worst-case-world / candidate-highlight / decision-table panels for the inspected snake **without** producing any layer-3 selection shadow (08-REQ-052c, 08-REQ-074). In coach mode the inspected snake is decorated with a visually distinct indicator (e.g., a dashed magenta ring) explicitly differentiated from selection shadows (08-REQ-052d).

**Click-to-select gesture** (08-REQ-042). Click on a snake body cell whose snake the caller is eligible to select per [06-REQ-024] dispatches `selectSnake` to [06]. If the snake is currently selected by another operator, the gesture instead opens a displacement-confirmation modal; on explicit confirmation the modal dispatches `selectSnake` with the displacement flag set per [06-REQ-022]. Without confirmation no mutation issues. Pressing `Escape` while a snake is selected dispatches `deselectSnake`. Selecting a different eligible snake dispatches `selectSnake` for the new target (which implicitly releases the prior selection per [06]'s "at most one selected snake per operator" invariant [06-REQ-019]). Click-and-drag and double-click are unbound on snake cells in member mode.

**Coach inspection gesture** (08-REQ-052c, 08-REQ-052d). In coach mode the click gesture on a snake body is **not** click-to-select; it is `Shift+Click` (or alternatively `right-click` opening a context menu with "Inspect" as the only entry), with cursor and hover treatment visibly distinct from member mode. A plain click on a snake in coach mode does nothing, so a coach can never accidentally trigger a (no-op) selection-style action that a viewer might misread as an attempt to take control of the team's snake. Pressing `Escape` clears inspection. The coach's inspection visual indicator (layer 7 above) cannot be confused with an operator's selection shadow because the rendering is structurally different (dashed magenta ring vs solid coloured glow) and is rendered only on the coach's own client (08-REQ-052c — inspection is purely client-local).

---

### 2.8 Live Operator Interface — Header

**Header layout** (08-REQ-032, 08-REQ-033, 08-REQ-035, 08-REQ-036, amended per 08-REVIEW-011):

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Turn N  │  Clock 12.3s  │  Budget 4m17s  │  Net 28ms  │  ●●●○○  │ [Submit] │
└──────────────────────────────────────────────────────────────────────────────┘
   ↑          ↑                ↑                ↑           ↑          ↑
   turn       team clock       remaining        net         presence   Captain
   number     (sub-second)     time budget      latency     + ready    only
```

**Turn number** (08-REQ-032). Read from SpacetimeDB's current-turn subscription field per [04]'s exported subscription pattern.

**Team clock countdown** (08-REQ-033). Sub-second precision: `seconds.tenths` format (e.g., `12.3s`). Below a configurable threshold (default 1.0 s) the rendering enters a warning state (red colour, slightly larger). When the team's turn has been declared over per [01-REQ-039] — observed via SpacetimeDB's `turnEndTime` field collapsing or the dedicated turn-over signal exposed by [04] §2.5 — the countdown is replaced by a static "turn submitted" indicator until the next turn begins; it does not flicker back to a live countdown while other teams declare (08-REQ-033). The animation uses `requestAnimationFrame`-driven local interpolation between authoritative SpacetimeDB updates so the rendered countdown advances smoothly without requiring per-tick subscription deliveries.

**Remaining time budget**. Read from SpacetimeDB's per-team time-budget field per [04]; rendered as `m:ss` because budgets are minutes-scale.

**Network latency** (08-REQ-036). Computed per §2.5; rendered as `Net Nms` with a colour ramp degrading at higher values.

**Presence display** (08-REQ-032, 08-REQ-035, 08-REQ-064a, 08-REQ-068a). Shows each *other* active operator (the local user's own presence is implicit and is conveyed by their own per-operator tempo toggle and their own selection state on the board). For each entry:
- A coloured dot of the operator's per-operator stable colour (§3.3).
- The operator's display name on hover or always-visible per design discretion.
- A tempo indicator next to the dot: filled circle (●) for `flow`, hourglass glyph (⧖) for `thinking`. The local user's own tempo is rendered separately as the toggle of §2.10.
- A role badge for coaches (`C`) and admins (`A`) per 08-REQ-064a; member operators get no badge. Coach/admin entries render no tempo indicator (they have no tempo per 08-REQ-064a) and a slightly different visual styling so a viewer can never mistake an admin's connectedness for a member's quorum contribution.
- **Captain-only**: a small inline "Boot" affordance on each active-operator entry that dispatches `bootOperator({ gameId, operatorUserId })` per 08-REQ-068a, with a confirmation step ("Remove `<name>` from this game session? Their connection will be severed just like a network disconnect; they can reconnect if they become available.") to prevent accidental activation. The affordance is invisible to non-Captain viewers (08-REQ-067). There is no "revoke boot" affordance because boot writes no persistent state — a booted operator simply rejoins the active set on reconnect (08-REQ-064 / 08-REQ-068a).

**Captain control affordances** (08-REQ-032, §2.10). Shown only when `role === "captain"`; rendered in a right-aligned cluster with: (1) a "Submit Turn" button with keyboard binding (08-REQ-066) to `Ctrl+Enter` (or `Cmd+Enter` on macOS) — a chord chosen because it cannot be triggered accidentally during direction-key play (the four arrow keys are reserved for move staging per 08-REQ-045); and (2) the per-operator boot affordances inline in the presence display per 08-REQ-068a (no separate keyboard binding, because boot is a nuclear option that should require a deliberate pointer gesture).

---

### 2.9 Live Operator Interface — Drive Management and Decision UX

**Drive dropdown** (08-REQ-052, 08-REVIEW-021). The dropdown's options are computed as `heuristic_config ∩ HEURISTIC_REGISTRY` filtered to `heuristicType === "drive"`, then ordered:
1. Pinned heuristics in the order specified by `global_centaur_params.pinnedHeuristics`.
2. Remaining heuristics lexicographically by `nickname`.
3. Tiebreaker by `heuristicId`.

The intersection is computed at render time from the live `heuristic_config` Convex query and the build-time `HEURISTIC_REGISTRY` import. Drive entries that are in the registry but not yet in `heuristic_config` are not visible in the dropdown until the lazy-insert of §2.11 runs on a Captain visit to the global centaur params page; conversely, stale `heuristic_config` rows whose IDs are no longer in the registry are not visible in the dropdown (they are visible only on the global centaur params page where the Captain can see and delete them per §2.11).

**Eligibility filtering for targeting** (08-REQ-053). After the operator selects a Drive type, the board enters targeting mode for that Drive's `targetType` ([07] §3.1). Eligibility is computed by calling the Drive's `targetEligibility(candidate, self, board)` predicate ([07] §3.2) over every candidate snake or cell. Eligible candidates are rendered with a highlight; ineligible candidates are dimmed. Clicking an eligible candidate confirms; clicking an ineligible one is a no-op; pressing `Escape` cancels targeting without altering selection state (08-REQ-054).

**Tab cycle** (08-REQ-054). Pressing `Tab` while in targeting mode advances the highlighted candidate through the eligible set in the deterministic three-key order specified by 08-REQ-054:
1. **Primary**: A*-distance from the selected snake's head, ascending. A* runs on the current pre-turn board against passable cells; cell candidates use their own coordinates, snake candidates use their head coordinates.
2. **Secondary**: clockwise angle in board coordinates from the snake's current head direction, starting at 0° (straight ahead) and increasing through 360°.
3. **Tertiary**: target identity. For snake targets: snake id ascending. For cell targets: row-major (row ascending, then column ascending).

Computed once at targeting-mode entry from a snapshot of the eligible set + board state and cached for the duration of targeting; if the eligible set or board changes during targeting (e.g., a foreign turn declaration mid-targeting) the cycle is invalidated and recomputed. `Shift+Tab` cycles in reverse using the same key order.

**Confirmation and weight** (08-REQ-055). Confirming a target dispatches `addDriveToSnake({ snakeId, heuristicId, target, weight: defaultWeight })` per [06-REQ-015] using the registry's `defaultWeight` if the team's `heuristic_config` has not overridden it (precedence: `heuristic_config.weight` if present, else `HEURISTIC_REGISTRY` entry's `defaultWeight`).

**Active Drive list** (08-REQ-056). Displayed in the snake's control panel as a list of cards; each card binds to a single `snake_drives` row ([06]) and exposes weight edit (range 0..1, step 0.01), activation toggle, and remove. Edits dispatch [06-REQ-015]'s mutation; the framework reacts per [07-REQ-015] without any client-side coordination required.

**Decision breakdown table** (08-REQ-059, 08-REQ-060). Renders one row per heuristic active on the selected snake with columns: name, raw output (from `SnakeBotStateSnapshot.heuristicOutputs[direction][heuristicId]` per [07] §3.4), portfolio weight (from `snake_drives` / `heuristic_config`), weighted contribution (`output × weight`), and relative impact (the contribution divided by the direction's total score). Updates reactively on every `SnakeBotStateSnapshot` write and on operator switches between selected directions. Per [07] §3.7 DOWNSTREAM IMPACT no-recompute rule, the table renders **purely** from the framework's published `heuristicOutputs` snapshot — no client-side re-evaluation, no interpolation, no carry-over from a prior turn's snapshot. Missing `(direction, heuristicId)` entries render as `—`.

**Worst-case world preview** (08-REQ-048, 08-REQ-050, 08-REQ-051). When a direction is selected for an owned snake, the worst-case overlay (layer 6, §2.7) reads `SnakeBotStateSnapshot.worstCaseWorlds[direction]` per [07] §3.4 and renders the `state` field as a translucent overlay. The per-snake turn-timestamp field on `SimulatedWorldSnapshot` per [07] §3.4 is used to mark snakes whose `perSnakeTurnTimestamp[snakeId] < simulatedTurn` as visually frozen (e.g., a small "held in place" badge or a slightly desaturated rendering), per [07] §3.7's recommendation to surface this distinction. Per the 08-REVIEW-023 resolution, per-direction annotations (08-REQ-049) are out of scope for the MVP and this preview renders no annotations layer. Updates to the simulated `state` and to the per-snake turn timestamps are driven entirely by the reactive snapshot subscription (08-REQ-050).

---

### 2.10 Per-Operator Tempo and Captain Controls

**Tempo toggle UI** (08-REQ-061, 08-REQ-063). The local operator's tempo toggle is a prominent control adjacent to the header presence display, rendered as a two-state switch with explicit labels (`In Flow` / `Thinking…`). `Flow` is the value that allows the team's unanimity precondition to hold; toggling to `Thinking…` is the explicit "I need the team to slow time so I can think hard about this decision" signal that pauses the automatic submission pipeline for the team. Toggling back to `In Flow` rejoins the unanimity. Toggling dispatches the `setOperatorTempo({ gameId, tempo })` mutation per [06-REQ-040b]. **The toggle is durable across turns** (08-REQ-063, 08-REQ-064): the arrival of a new turn does *not* visually reset the toggle, and the underlying `operator_tempo` subscription per [06-REQ-043] reflects the operator's last-set value indefinitely. The underlying mutation is idempotent so duplicate toggles are harmless. *(See resolved 08-REVIEW-024.)*

**Tempo initialisation and (re)connect behaviour** (08-REQ-064). The client shall call `setOperatorTempo({ tempo: "flow" })` as part of its (re)connect sequence — both on first-ever join in a game and on every reconnect after a disconnection (whether by network drop or by Captain boot). This is the only automatic write to tempo. The mutation is idempotent on existing rows; for a first-join, it creates the lazy row in `operator_tempo` with `tempo = flow`. This makes the "joins the active set in flow" rule of 08-REQ-064 uniform and removes any distinction between disconnect-recovery and boot-recovery — both produce identical effects.

**All-flow quorum visualisation** (08-REQ-062). The header presence display's per-operator tempo indicators collectively visualise the unanimity quorum: when every active operator (excluding coaches/admins per 08-REQ-064a, who are not member operators and therefore not in the active set) shows `●` (in flow), the Captain control area additionally shows a small "All Flowing — automatic submission armed" indicator. This is a pure visualisation; the actual gating semantics live in [07-REQ-044] / [07-REQ-045] and the flush in [04]'s `declare_turn_over`.

**Coach/admin and inactive-operator exclusion from quorum** (08-REQ-062, 08-REQ-064a). The presence display's role badges (`C`/`A` per §2.8) implicitly exclude coach/admin entries from the quorum visualisation: their entries render no tempo indicator at all, so a viewer counting "● vs ⧖" naturally ignores them. The underlying `operator_tempo` table per [06] also has no row for coaches/admins because they never call `setOperatorTempo`. Operators not in the active set (disconnected by network drop or by Captain boot — boot acts as a forced disconnect per 08-REQ-068a) do not appear in the presence display at all, and are likewise naturally excluded from the visualised quorum, consistent with their exclusion from the unanimity precondition per 08-REQ-062.

**Captain turn-submit affordance** (08-REQ-065, 08-REQ-066, 08-REQ-067). Visible in the header only when `role === "captain"`. Clicking the button (or pressing the keyboard binding) calls SpacetimeDB's `declare_turn_over` reducer ([04] §2.5) directly; per [07] §3.7's flush-suppression coordination note, the bot framework observes the resulting turn transition through its existing SpacetimeDB subscription and applies 07-REQ-045a's flush suppression on its own — no out-of-band channel from the UI to the framework is opened. Non-Captain operators do not see the affordance and cannot reach the underlying reducer through the UI; even if they construct a synthetic call, [06]'s function contract surface rejects per [06-REQ-031] (08-REQ-067).

**Captain operator-boot affordance** (08-REQ-068a, 08-REQ-067). Visible in the header presence display only when `role === "captain"`, as an inline per-entry "Boot" affordance per §2.8. Activation dispatches `bootOperator({ gameId, operatorUserId })` per [06-REQ-040b]. The mutation severs the booted operator's game-session connection on the server side identically to a network disconnect; the booted operator's client observes the connection loss, transitions its UI to the read-only "you have been removed from this game session by your Captain" state, and the rest of the team observes them depart the presence channel exactly as they would observe any other disconnect. Boot writes no persistent state — a booted operator may reconnect at any time and rejoins the active set in `flow` per 08-REQ-064. There is no "revoke boot" affordance because there is no persisted boot to revoke. Non-Captain operators do not see the boot affordance and cannot reach the underlying mutation through the UI; even if they construct a synthetic call, [06]'s function contract surface rejects per [06-REQ-031] (08-REQ-067).

**Action-log emission** (08-REQ-068). `setOperatorTempo` writes the `operator_tempo_changed` action-log entry per [06-REQ-040b]. `bootOperator` writes the `operator_booted` action-log entry per [06-REQ-040b]. `declare_turn_over` writes the team-side turn-submission entry per [06-REQ-036]. The tempo and boot event types inherit the action-log's wall-clock `timestamp` field ([06-REQ-034]), which makes them time-based events suitable for the team-perspective replay viewer's scrubber-position reconstruction (§2.14, 08-REQ-072) regardless of turn boundaries. No additional client-side action-log writes are issued from the header.

---

### 2.11 Heuristic Configuration Page

**Page scope** (08-REQ-014). Reads `heuristic_config` for the team via [06-REQ-032]; intersects with `HEURISTIC_REGISTRY` to classify each row as **active** (in both), **stale** (in `heuristic_config` only), or **registry-only** (in registry only). All three classes are surfaced on this page (in contrast to the in-game Drive dropdown of §2.9, which surfaces only active rows).

**Lazy-insert on Captain visits** (08-REVIEW-021). When a user with `role === "captain"` loads this page, the page's `+page.svelte` invokes `insertMissingHeuristicConfig({ centaurTeamId, registrations: getRegisteredHeuristics(HEURISTIC_REGISTRY) })` per [07] §3.7 / [06]'s exported mutation. The mutation is insert-only and never overwrites; previously-Captain-edited values are preserved. The returned `inserted` list is surfaced as a non-blocking toast ("3 new heuristics added to your configuration with their default weights") so the Captain knows the registry has expanded. Non-Captain visitors do not invoke the mutation (they have no Convex auth scope to do so per [06]'s function contract) and see only the current state.

**Edit affordances for Captains** (08-REQ-015, 08-REQ-016, 08-REQ-017). For each registered Preference: an `Active by default` toggle and a `Default weight` numeric input, dispatching to [06]'s `heuristic_config` mutation surface. For each registered Drive type: a `Default weight` numeric input, a `Nickname` text input, and a `Pin` toggle. Pinning is implemented as a Captain-only mutation that updates `global_centaur_params.pinnedHeuristics` per [06-REQ-011] / [06-REQ-007], with adjacent reorder-up/reorder-down arrows on each pinned entry to permute the array. Non-Captain team members see all controls in a disabled state (08-REQ-017, 08-REQ-019).

**Stale entry display** (08-REVIEW-021). Stale entries (in `heuristic_config` but not in the current `HEURISTIC_REGISTRY`) are shown in a distinct visual style (greyed out with an icon and tooltip "no longer registered by this server") and offered a `Delete` affordance that calls [06]'s `deleteHeuristicConfig({ centaurTeamId, heuristicId })` mutation. Deletion is Captain-only per [06]'s function contract.

**"Defaults for future games only" affordance** (08-REQ-018). A persistent banner at the top of the page reads "Edits affect your team's defaults for the **next** game only. Games currently in progress are unaffected." A second-level explanatory tooltip on hover expands to detail the snapshot semantics of [06-REQ-009] / [06-REQ-040a].

---

### 2.12 Bot Parameters Page

**Page scope** (08-REQ-020, amended per 08-REVIEW-011). Reads `global_centaur_params` for the team via [06-REQ-032]. Captain-editable fields per [06-REQ-011]:
- `softmaxTemperature` (slider with numeric input, range per [06]).
- `automaticTimeAllocationMs` (numeric input in milliseconds).
- `defaultScheduledSubmissionIntervalMs` (numeric input in milliseconds, default 100; per [07] §3.5 / [07-REVIEW-012]).
- `defaultImminentThresholdMs` (numeric input in milliseconds, default 50; per [07] §3.5 / [07-REVIEW-012]).
- `pinnedHeuristics` is *not* edited here; it is edited from the heuristic configuration page (§2.11).

The page does **not** expose `defaultOperatorMode` or `turn0AutomaticTimeAllocationMs` (excised per 08-REVIEW-011) and does **not** expose any room/game-config parameter (08-REQ-023).

**Edit gating** (08-REQ-021). Captain-only via [06]'s function contract; non-Captain visitors see read-only values. The same "next game only" banner as §2.11 (08-REQ-022) explains that values are snapshotted into game-scoped state at game start per [06-REQ-040a].

---

### 2.13 Room Browser, Room Creation, and Room Lobby

**Room browser** (08-REQ-024a, 08-REQ-024b, 08-REQ-024c, 08-REQ-024d). Reads from [05]'s rooms query surface. Renders a paginated list with name search; each row links to `/rooms/[roomId]`. The "Create Room" affordance dispatches [05]'s room-creation mutation; on success the user is redirected to the new room's lobby and is its owner per [05-REQ-017] / [05-REQ-019].

**Room lobby** (§8.8). A single page with three logical regions:
1. **Configuration region**: parameter editors for every game-config parameter of [05-REQ-023]. Each editor uses a type-appropriate widget (number with min/max, boolean toggle) and enforces ranges client-side per 08-REQ-027d. The board-size parameter uses the bespoke preset-dropdown-plus-custom widget specified in 08-REQ-027d1: a dropdown with four named presets and a Custom option (revealing an integer stepper with `min = 7`, `max = 32`, `step = 1`). Preset table: Small = 11, Medium = 13, Large = 17, Giant = 21. On load, the widget auto-derives its displayed selection by matching the stored `boardSize` integer against the four preset values (displaying the matching preset label, or Custom with the stored integer pre-filled in the stepper). Conditional parameters (08-REQ-027e) are visually nested under their gating parameter and remain editable when the gate is off, but render with a "currently inactive" badge. Parameter edits dispatch [05]'s configuration mutation per [05-REQ-022] / [05-REQ-032b], which both persists the new value and triggers Convex board regeneration (see board preview region). Edits are debounced (default 300 ms) to bound regeneration cadence under rapid editing; this debounce is purely a UX concern and does not relax 08-REQ-027d's authoritative-enforcement-via-Convex posture.
2. **Board preview region** (08-REQ-027i, 08-REQ-027j, 08-REQ-027k, 08-REVIEW-014, 08-REVIEW-015). Subscribes to the not-yet-started game record's `boardPreview` field via Convex's reactive query; renders the field as a miniature SVG board reusing the same renderer as §2.7 in a constrained viewport. The application performs **no** board generation client-side — every preview rendered here is the output of Convex's preview mutation per [05-REQ-032b]. A `Lock In` toggle binds to `boardPreviewLocked` on the game record per 08-REQ-027j and dispatches [05]'s mutation to set/clear the flag. When locked, the preview is annotated visually ("This layout will be used at game start"); when unlocked, the preview annotation reads "Preview only — game start will regenerate from a fresh seed" and the preview continues to update reactively as parameters change.
3. **Enrolment and readiness region** (08-REQ-027a, 08-REQ-027f, 08-REQ-027g, 08-REQ-027h). Displays each enrolled team with its readiness indicator. For each enrolled team where the local user is the Captain, a `Mark Ready`/`Unmark Ready` toggle is shown per 08-REQ-027f / 08-REVIEW-013 (Captain-only); other team members see the indicator read-only. A `Ping Server` button per 08-REQ-027g dispatches a [05]-mediated healthcheck against the team's nominated server and renders the result inline. The "Start Game" button is gated per 08-REQ-027h on `(enrolledTeams.length >= 2) && (every enrolledTeams.ready === true)`; when disabled, the button's tooltip explains which precondition is unmet. Clicking dispatches [05]'s game-start mutation per [05-REQ-031].

**Live spectating link** (08-REQ-027l). When the room has a game in `playing` status, the lobby displays a "Spectate Live" link to `/games/[gameId]/spectate`.

---

### 2.14 Live Spectating

**Entry and token acquisition** (08-REQ-080, 08-REQ-081). On entry to `/games/[gameId]/spectate`, the page calls a Convex action (per [05-REQ-035] / [03] §3.17 spectator path) that returns a spectator SpacetimeDB access token. The token is held in component-local memory only (08-REQ-009a) and used to open the SpacetimeDB connection per [04-REQ-018].

**Subscriptions** (08-REQ-082, 08-REQ-083, 08-REQ-084, 08-REQ-084b, 08-REQ-085, 08-REVIEW-018, 08-REVIEW-019). The spectator subscribes to:
- The current-state subscription per [04] §2.12 spectator pattern (board, snakes filtered by `visible`, items, hazards, fertile tiles, turn events).
- The full historical state up-front per [04-REQ-054]'s mid-game-join pattern (08-REQ-087, 08-REVIEW-019), accepting bounded entry latency proportional to game length. Games are bounded to a few hundred turns; up-front delivery is acceptable per the explicit user tolerance.
- The dedicated `scoreboard_view` per game per [04] §2.9 (resolved by [04]-REVIEW-020 / [04-REQ-071]), which publishes `(turn, centaurTeamId, teamScore, aliveSnakeCount, aggregateLength)` computed server-side over the true alive-snake set including invisible snakes. Subscribed with `WHERE turn = currentTurn` for the live view per [04] §2.12.1, and over the full table for the historical scrubber per [04] §2.12.4.

**Rendering**. The board renderer of §2.7 is reused with the spectator data source (no selection layer, no candidate-highlight layer, no worst-case overlay). Invisibility is honoured purely by the absence of subscription deliveries (08-REQ-083); the application does not attempt to infer hidden state. The scoreboard renders the `scoreboard_view` aggregates verbatim with no client-side aggregation (08-REQ-084, 08-REQ-084b). The header displays the per-team chess-timer state and per-team turn-declared status from [04]'s subscription (08-REQ-085).

**Timeline scrubber** (08-REQ-087, 08-REQ-088). A single timeline control along the bottom of the view permits navigation to any previously completed turn. Scrubbing backward switches the rendering to the historical reconstructed state at the chosen turn while keeping the live subscription open in the background; the view shows a prominent "Viewing Turn N — not live" banner with a "Return to Live" button (08-REQ-088). Returning to the live head dismisses the banner and resumes live rendering.

**Spectator-to-coach-mode entry** (08-REQ-052a). When the local user is a designated coach (per [05-REQ-067]) or admin (per [05-REQ-066]) for a participating team, the spectator view displays a per-team "Enter Coach Mode" link to `/games/[gameId]/coach/[teamId]`. The link is hidden for users with no coach scope on any participating team.

**Negative surface** (08-REQ-086). The spectator view contains no mutating affordance — no selection, no move staging, no tempo toggle, no Captain control (turn-submit or boot). The spectator data source has no mutation surface (analogous to the replay binding's structural prevention).

**Teardown** (08-REQ-089). Navigating away or observing `game.status === "finished"` releases the SpacetimeDB subscription and discards the spectator access token.

---

### 2.15 Unified Replay Viewer

**Mode selection** (08-REQ-069, 08-REQ-070, 08-REQ-071, 08-REQ-071a). The viewer's data source is selected on entry by the URL: `/games/[gameId]/replay` opens in board-level mode by default; `/games/[gameId]/replay?mode=team` opens in team-perspective mode if the viewer participated as a team member of one of the participating teams. Both modes share the unified timeline control (§2.15.1 below) and the data-source abstraction's replay binding (§2.4). Board-level mode binds with `participatingTeam: null`, scoping the action-log reconstruction to none (board-level mode renders no Centaur-subsystem state per 08-REQ-075b). Team-perspective mode binds with `participatingTeam: teamId`, scoping action-log reconstruction to that team only (08-REQ-075a's RLS-honouring posture is preserved by the action log's own team-scoping).

**Component reuse** (08-REQ-071, 08-REQ-077). Team-perspective mode reuses the same `<BoardDisplay>`, `<DriveManagementPanel>`, `<DecisionBreakdownTable>`, `<WorstCaseWorldPreview>`, and `<HeaderPresence>` components as the live operator interface; the data-source binding of §2.4 makes their mutating affordances structurally absent in replay mode (no mutation surface exists), so each component renders read-only without per-component branching. Inspection is wired in per the inspection provider of §2.4 (08-REQ-074, 08-REQ-075).

**Board-level rendering** (08-REQ-070, 08-REQ-070a, 08-REQ-070b). Board-level mode renders the public board state at the scrubbed turn (cells, snakes, items, hazards, fertile tiles, scoreboard) plus the per-turn event log. Visual consistency with the live spectating view is preserved by reusing the renderer of §2.7. Per 08-REQ-070, no SpacetimeDB consultation occurs — all data is sourced from the persisted replay of [05-REQ-040].

**Historical selection shadows** (08-REQ-073). Team-perspective mode renders the operator selection state at the scrubbed timestamp as per-operator coloured shadows on the appropriate snakes, reconstructed from the action log. Operators not connected at the scrubbed moment produce no shadow.

**Direct link** (08-REQ-075c). The viewer exposes a "Copy Link" affordance that produces the absolute URL `/games/[gameId]/replay` (or `?mode=team` if the viewer is in team-perspective mode); clicking the link from another authenticated user lands them in the viewer for the same game.

#### 2.15.1 Unified Timeline Control

**Per [08-REVIEW-010]**. The timeline control exposes a Per-Turn / Timeline mode toggle and per-mode scrubbing semantics, keyboard navigation, turn-marker rendering, and playback-speed sets per 08-REQ-072 through 08-REQ-072d.

**State**. The control owns three pieces of client-local UI state:
- `mode: "per-turn" | "timeline"` (default `per-turn` per 08-REQ-072a).
- `speedPerTurn: 0.25 | 0.5 | 1 | 2 | 4 | 8` (turns per second).
- `speedTimeline: 0.25 | 0.5 | 1 | 2 | 4 | 8` (× real time).

All three are persisted in `sessionStorage` (per 08-REQ-072a — client-local, not Convex) and restored on subsequent navigation within the same session.

**Per-Turn mode rendering** (08-REQ-072b). The scrubber is rendered as N equidistant tick marks where N is the total turn count. Scrubbing snaps to the nearest tick (the end of each turn). Playback advances the cursor by one turn per tick at the configured rate. The speed widget label reads "N turns/s".

**Timeline mode rendering** (08-REQ-072c). The scrubber's horizontal axis is wall-clock time from `gameStartTime` to `gameEndTime` (sourced from the persisted replay metadata per [05-REQ-040]). Turn boundaries are rendered as turn-marker glyphs at their actual `turnDeclaredAt` clock positions (read from the replay's per-turn metadata) — explicitly non-equidistant, reflecting variable chess-clock duration. Scrubbing is continuous along clock time. Playback advances at the chosen scalar multiple of real time. The speed widget label reads "N× speed".

**Keyboard navigation** (08-REQ-072d). Bound on `keydown` while the viewer has focus:
- Timeline mode: `Left`/`Right` → ±1000 ms; `Shift+Left`/`Shift+Right` → ±200 ms; `Ctrl+Left`/`Ctrl+Right` (interpreted as `Cmd` on macOS) → snap to previous/next turn-marker.
- Per-Turn mode: `Left`/`Right` → ±1 turn. Modifier-key bindings in Per-Turn mode are deferred per 08-REQ-072d (not bound in the reference implementation; forks may bind freely).

`Space` toggles play/pause in both modes.

---

### 2.16 Coach Mode

**Entry points** (08-REQ-052a). `/games/[gameId]/coach/[teamId]` is reached from:
- The Live Spectating view's "Enter Coach Mode" link (§2.14).
- The Team Profile view's in-progress game indicator when the user is a designated coach or admin.

The route's load function verifies the user holds a coach scope on `[teamId]` per [05-REQ-067] (or implicit-coach permission per [05-REQ-066]); if not, the route refuses with a 403-equivalent empty state.

**Token acquisition**. The coach data source per §2.4 is constructed via `createCoachDataSource({ gameId, centaurTeamId, coachToken })`, where `coachToken` is obtained via the coach SpacetimeDB token issuance path of [05] §3.4 ([05-REQ-067]).

**Cross-server applicability**. Because coach mode reads only via [05]'s coach token issuance (which any Snek Centaur Server's frontend can request given a valid coach scope) and via [05]/[06] subscriptions (which are not server-pinned), coach mode is **cross-server**: any frontend served by any Snek Centaur Server in the platform can render coach mode for any team the user has coach scope on, regardless of which server hosts the team's bot framework. This contrasts with the member live operator interface (08-REQ-028, §2.2 cross-server reachability), which requires the team to be hosted by *this* server because the bot framework's per-team session is co-resident.

**Rendering**. The coach view renders the same component tree as the live operator interface (board display, header, Drive management panel, decision breakdown table, worst-case world preview, presence display, action log). All mutating affordances are structurally absent because the coach data source exposes no mutation surface (08-REQ-052b); inspection replaces selection per the inspection provider (08-REQ-052c, §2.7's coach inspection gesture). Operator selection shadows produced by team members remain visible (08-REQ-052c). The presence display includes the coach with role badge `C` (or `A` for admins) per §2.8.

---

### 2.17 Platform Pages

**Home view** (08-REQ-010a). A single page composed of three sections: (1) "My Teams" listing the user's current Centaur Team memberships per [05-REQ-011]; (2) "Recent Rooms" listing the most recently visited rooms (sourced from a small Convex side-table or, equivalently, from a client-local `localStorage` history that is non-authoritative — design discretion picks `localStorage` because it requires no schema addition and the recency list is purely a UX convenience); (3) "Games in Progress" listing every game with `status === "playing"` in which any of the user's Centaur Teams is participating, with each entry deep-linking to `/teams/[teamId]/live` on the team's nominated server (cross-server URL per §2.2).

**Teams browser** (08-REQ-023a). Lists every team per [05-REQ-008] with name, display colour swatch, and current Captain display name; each row links to `/teams/[teamId]`.

**Team Management** (08-REQ-023b through 08-REQ-023f). The view splits affordances by role: every member sees identity, members list, coaches list, server health; the Captain additionally sees mutating affordances for name, colour, server domain, member add/remove, coach add/remove (calls [05]'s `addCoach` / `removeCoach` per 08-REQ-023d), and Captain transfer. All mutating affordances render disabled with explanatory text while the team's `[05]` mid-game freeze is in effect (08-REQ-023e), driven by a reactive query against [05]'s game-status subscription. The view exposes no bot/heuristic affordances (08-REQ-023f) but links to `/teams/[teamId]/heuristic-config` and `/teams/[teamId]/bot-params`.

**Player Profile** (08-REQ-090, 08-REQ-091, 08-REQ-091a, 08-REQ-092, 08-REQ-093, 08-REVIEW-016). Renders display name, current and historical team memberships, game history per the historical-or-current rule (08-REQ-091), aggregate stats. The page never references the user's email at any visibility — neither for the viewing user nor the profile owner (08-REQ-091a). Historical attributions resolve via the participating-team snapshot per [05-REQ-029], so an archived team continues to render under its historical identity (08-REQ-093, 08-REQ-103).

**Team Profile** (08-REQ-094 through 08-REQ-098). Renders identity, members, server health, full game history, aggregate stats, head-to-head records. Game history includes every game the team participated in (cross-team-public per 08-REQ-095). Historical opponent attributions resolve via participating-team snapshots (08-REQ-097). The view is purely informational — no mutating affordances (08-REQ-098) — and links to `/teams/[teamId]/manage` for users with the appropriate scope.

**Leaderboard** (08-REQ-094a through 08-REQ-094f). Renders a ranked list per a chosen criterion × time-window × optional room filter, with archived teams retained under their historical identity (08-REQ-094e). Each entry links to its Team Profile (08-REQ-094d). Authentication is required (08-REQ-094f); no email is exposed (08-REQ-091a).

**API Key Management** (08-REQ-095a through 08-REQ-095d). Lists the user's active and revoked keys with label, creation timestamp, and revocation timestamp. The "Create API Key" action opens a modal that, on Convex acknowledgement of [05-REQ-051]'s creation, displays the plaintext exactly once with a "Copy to clipboard" button; dismissing the modal discards the plaintext (08-REQ-095b, 08-REQ-095c). A persistent informational banner explains that the key's authorisation scope is bounded by the user's own current scope per [05-REQ-047] (08-REQ-095d).

**Admin experience** (§8.21, 08-REQ-096a, 08-REQ-096b, 08-REQ-009c). When `user.role === "admin"`:
- The Teams browser lists all teams regardless of membership ([05-REQ-066]).
- The home view's "Games in Progress" expands to include all platform games (admin discretion).
- Replay viewer and coach-mode entry points are unconditionally available for any team in any game.
- An `/admin` landing page links to admin-only utility views (e.g., a system healthcheck dashboard).

The admin experience is read-only with respect to game state and Centaur-subsystem state (08-REQ-096b); admin actions never include staging moves or editing Centaur state for teams the admin is not a member of.

---

### 2.18 Error Handling and Invariant Rejection Display

**Convex rejection feedback path** (08-REQ-100). Every mutation dispatched through the data source returns a `Promise<Result>` whose rejection branch carries the Convex-side error code and message. The application maintains a singleton toast bus (Svelte 5 store) that surfaces user-legible error messages anchored to the affordance that triggered them. Rejections are translated through a `convexErrorToHumanMessage(error)` helper that maps known Convex error codes to user-legible English strings; unknown errors render the raw Convex message verbatim with a "report issue" affordance. The UI never silently swallows a rejection.

**Affordance enablement derivation** (08-REQ-101). Every affordance whose enablement is governed by a Convex-side invariant computes its `disabled` state from a Svelte 5 `$derived` rune over the relevant Convex reactive subscription. Examples: the room lobby's "Start Game" button is `$derived` from enrolled-teams count and per-team readiness; the Team Management view's mutating affordances are `$derived` from the team's mid-game-freeze status; the heuristic config page's Captain affordances are `$derived` from the role rune of §2.3. Where derivation is impossible (the invariant lives only inside a Convex mutation handler), the UI dispatches the mutation and routes the result through the §2.18 feedback path per 08-REQ-101's fallback clause.

**Parameter snapshot vs defaults display** (08-REQ-102). Every view that surfaces a game's configuration reads the configuration from the game record's snapshot per [05-REQ-024], not from the room's current defaults. Room and game configuration views are explicitly distinct components in the codebase (`<RoomConfigEditor>` vs `<GameConfigViewer>`) so the two values cannot accidentally be confused at render sites.

**Subscription loss surfacing** (08-REQ-083a). Each data source observes its underlying subscription's connection state and, on loss, emits a `subscriptionLost` event that the surrounding UI surfaces as a banner ("Connection lost, attempting to reconnect…"). Stale state is not fabricated; the affected components render their last-known values dimmed with a "stale" indicator, or render a placeholder if no value has ever been received. On recovery, the subscription resubscribes and the UI returns to fresh rendering.

---

### 2.19 Lifecycle and Session Boundaries

**Live operator interface availability** (08-REQ-081a, 08-REQ-082a). The team-scoped layout's reactive query against `game.status` drives the `/teams/[teamId]/live` route's lifecycle: on the transition to `playing` the live operator interface mounts; on the transition to `finished` the interface unmounts and is replaced by a terminal state component showing final scores per [05-REQ-038] and a link to `/games/[gameId]/replay`. Mid-session lifecycle is purely reactive — no manual page navigation is required for either transition.

**No client-side authoritative state** (08-REQ-084a). The application persists no authoritative state to client storage: `sessionStorage` holds only the timeline-control mode/speed preferences (§2.15.1), and `localStorage` holds only the home view's recent-rooms list (a UX convenience, non-authoritative). All operator-visible state derives from [04], [05], or [06] on every session, consistent with [07-REQ-057]'s posture for the framework.

---

### 2.20 Requirement Coverage Addendum

The following design elements are short, citation-bearing notes for requirements whose substantive design is implicit in the architectural choices of §§2.1–2.19 or upstream-module exported interfaces but which warrant an explicit citation for traceability.

- **Application scope** (08-REQ-001). The entire Design and Exported Interfaces sections of this module describe the unified human-facing web application of the Snek Centaur Platform; there is no separate "Game Platform" web application. §2.1's stack and topology, §2.2's routing topology covering both team-internal and platform-wide surfaces, and §3.6's library-surface table jointly satisfy the scope claim.
- **Live-game prominence on navigation surface** (08-REQ-011). The home view's "Games in Progress" section (§2.17) lists every game with `status === "playing"` in which any of the user's Centaur Teams is participating, deep-linking to `/teams/[teamId]/live` on the team's nominated server. Additionally, the global header's primary navigation surface renders a persistent badge ("Live: 〈team name〉") for any hosted team currently in a `playing` game, derived reactively from the same Convex subscription, so an operator returning to the application lands on the live surface in one click without navigating into the team page first.
- **Team creation affordance** (08-REQ-023c). The `/teams` browser (§2.17) exposes a primary "Create Team" button visible to every authenticated user; clicking dispatches [05]'s team-creation mutation per [05-REQ-008] / [05-REQ-011] and, on success, redirects the creator (now Captain per the same mutation) to the new team's `/teams/[teamId]/manage` view.
- **Team game history view** (08-REQ-024, 08-REQ-025, 08-REQ-026, 08-REQ-027). The `/teams/[teamId]/games` route (§2.2) renders a reverse-chronological list of completed games filtered to the (a)/(b) eligibility set of 08-REQ-024 against the participating-team snapshot of [05-REQ-029]. Each row shows room name, date, opponent teams, the team's result, and final scores per [05-REQ-038] (08-REQ-025). Selecting a row navigates to `/games/[gameId]/replay?mode=team` defaulting to the team-perspective sub-turn view (08-REQ-026). The route's load function applies the negative gate of 08-REQ-027 by computing the eligibility set in the Convex query, so unrelated teams' games are never returned to the client.
- **Room lobby read-only access for non-enrolled viewers** (08-REQ-027b). The room lobby route (§2.13) is reachable by every authenticated user; its layout binds every mutating affordance's `disabled` state to `$derived(role !== "owner" && !memberOfEnrolledTeam)`. Non-eligible viewers see the full lobby state — configuration, board preview, enrolled teams, readiness — but no editable widget.
- **Owner/administrative-actor lobby affordances** (08-REQ-027c). The room lobby's owner-only affordance set is rendered when the layout-derived `isAdministrativeActor` flag is true, where the flag mirrors [05-REQ-017]'s definition (the room owner, or any authenticated user when no owner exists per [05-REQ-018]). Affordances exposed: every game-configuration parameter editor of [05-REQ-023] within its declared range (§2.13's configuration region), invite/remove enrolment controls, abdicate-ownership control per [05-REQ-018], and "Start Game" per 08-REQ-027h / [05-REQ-031].
- **Selection vs manual mode** (08-REQ-029). Per §2.7's click-to-select gesture, the `selectSnake` mutation modifies only the selection record in [06]; it does not write `manual=true` to the snake's `snake_drives` / Centaur state. The data-source abstraction's `selectSnake` mutation (§3.2) and `setManualMode` mutation are deliberately separate so this property holds at the type level.
- **Manual-mode entry/exit invariants** (08-REQ-030). The data-source abstraction (§3.2) exposes both `setManualMode({ manual: true | false })` and `stageMove({ direction })`; the live binding's `stageMove` implementation in `@snek-centaur/server-lib` performs an atomic `setManualMode(true) ⊕ stageMove` per [06-REQ-025]'s side-effect requirement. Unchecking the manual checkbox dispatches `setManualMode({ manual: false })` and the framework's automatic submission pipeline resumes per [07-REQ-040]. The UI never invents a third manual-mode entry path.
- **No client-side scheduler logic** (08-REQ-031). The data-source abstraction publishes no compute-scheduling control surface; component code consumes published `SnakeBotStateSnapshot` values reactively and adds no scheduler hint of its own. Compute scheduling lives entirely in [07-REQ-040]'s framework-side priority pipeline.
- **08-REQ-034 reservation note**. 08-REQ-034 is reserved per its own text (removed during 08-REVIEW-011 resolution); the design surface that satisfies the requirement's behavioural intent is the per-operator tempo design of §2.10, which renders coordination state as per-operator presence per [08-REQ-032] and [06-REQ-040b]. No additional design element is needed.
- **Direction-candidate gating on selector ownership** (08-REQ-043). The Drive management panel and move interface (§§2.7, 2.9) bind their root visibility to a `$derived` rune over `dataSource.snakeOperatorStates` filtered to `selectedBy === currentUserId`; non-selecting viewers see no candidate-direction interaction surface at all. Clicks on layer 5 candidate highlights are bound only when this derivation is truthy, structurally satisfying the negative requirement.
- **Move interface direction buttons** (08-REQ-044). The move interface renders four direction buttons (Up, Down, Left, Right), each labelled with its direction's stateMap score read from `SnakeBotStateSnapshot.stateMap[direction]` per [07] §3.4 / [07-REQ-035] and coloured to match the layer-5 candidate highlight monotone ramp of §2.7. The currently-staged direction is rendered with an additional "staged" visual treatment by reading from `dataSource.stagedMoves`. Immediately-lethal directions per [01-REQ-044a] / [01-REQ-044b] are visually disabled (greyed) yet remain selectable as last-resort candidates per [07-REQ-019]; the data source's `stageMove` mutation does not refuse these directions.
- **No separate commit affordance** (08-REQ-046). The move interface emits a `stageMove` mutation on each direction-button click; there is no "commit" button, no two-phase submit. The user-visible affordance design uses tense-shifted labels ("Stage Up" rather than "Commit Up") and a small banner under the four buttons ("Each click immediately stages — there is no separate commit step. Your turn ends when your team's Captain submits or the clock runs out.") to satisfy the awareness clause of 08-REQ-046.
- **Manual checkbox** (08-REQ-047). The owned-snake control panel renders the `Manual` checkbox whenever the data source's `selectedBy === currentUserId` derivation is truthy. Its checked state binds to `snake_drives.manual` per [06-REQ-018] via the data source. Toggling on dispatches `setManualMode({ manual: true })` only — without an accompanying `stageMove`, so the currently-staged direction (whether bot-staged or human-staged) is preserved per the requirement's lock clause. Toggling off dispatches `setManualMode({ manual: false })`, returning the snake to the framework's submission pipeline.
- **Persistence of Drive overrides across selection changes** (08-REQ-057). The Drive management panel reads from [06]'s `snake_drives` rows, which persist independent of selection per [06-REQ-016]. The UI never issues a destructive write on selection change; switching selected snake mounts a new `<DriveManagementPanel>` against the new snake's rows, leaving the prior snake's rows untouched. Per-snake temperature override (where applicable per [06]) is persisted to [06] in the same manner.
- **Negative: no UI affordance for unregistered Drives** (08-REQ-058). The Drive dropdown's source set (§2.9) is the intersection `heuristic_config ∩ HEURISTIC_REGISTRY`; the UI never offers an "add new Drive type" affordance and never accepts free-form `heuristicId` input. New Drive types enter the system only via code-level expansion of the team's `@team-snek/heuristics` source per [06-REQ-005] and the lazy-insert path of §2.11.
- **Leaderboard time-window and room filters** (08-REQ-094b, 08-REQ-094c). The Leaderboard view (§2.17) exposes (a) a criterion selector binding to the criteria set of [08-REQ-094a], (b) a time-window selector with the closed set `{all time, last 30 days, last 7 days}`, and (c) an optional room-filter typeahead bound to [05]'s rooms query. Each selection re-issues the leaderboard's Convex query with the corresponding parameters; the ranking computation lives Convex-side.
- **Team Profile aggregate statistics** (08-REQ-096). The Team Profile view (§2.17) renders aggregate statistics derived from the team's full game history: games played, win rate, average score, and head-to-head records against every opponent team the team has ever played. Aggregates are computed Convex-side (no client aggregation, mirroring the discipline of 08-REQ-084b / 08-REVIEW-018) and surfaced on the profile alongside the per-game history.

---

## Exported Interfaces

Module 08 has no downstream module per the dependency graph (Module 09 is absorbed into 08). The exported interfaces enumerated here are nonetheless load-bearing for fork authors and for the upstream contracts the application participates in (the invitation envelope from [05] / [03], the lazy-insert payload to [06] / [07]).

### 3.1 Game Invitation Endpoint Contract

Motivated by 08-REQ-005. The endpoint is the platform's load-bearing contact point between Convex (which sends invitations) and the Snek Centaur Server (which accepts them).

```typescript
// POST /.well-known/snek-game-invite
// Content-Type: application/json

export interface SnekGameInviteRequest {
  // The full invitation envelope as defined by [03] §3.16.
  // Carries the per-Centaur-Team game credential JWT (issued by Convex Auth's
  // customJwt provider per [03] §3.15), the targeted (centaurTeamId, gameId),
  // and the SpacetimeDB instance coordinates.
  readonly envelope: GameStartInvitationEnvelope     // [03] exported type
}

export interface SnekGameInviteResponse {
  readonly accepted: true
  readonly alreadyAccepted: boolean                  // true iff this (team, game) was previously accepted
  readonly serverInstance: {
    readonly serverDomain: string                    // echoes back this server's nominatedServerDomain
    readonly hostedTeamCount: number                 // operational visibility for [05]
  }
}

// Failure responses use HTTP status codes 401 (signature invalid),
// 403 (team not hosted by this server), 500 (bot framework boot failed).
// All failure bodies are { error: string, code: string }.
```

### 3.2 Data-Source Abstraction

Motivated by 08-REQ-076, 08-REQ-077, 08-REQ-078. This is the load-bearing surface between `@snek-centaur/server-lib` and the forked operator UI; replay-mode and coach-mode bindings structurally lack a mutation surface so component code cannot accidentally mutate (08-REQ-078, 08-REQ-052b).

```typescript
import type {
  GameState, SnakeId, Direction, Cell,
} from "@snek-centaur/engine"
import type {
  SnakeBotStateSnapshot,
} from "@team-snek/bot-framework"
import type {
  ActionLogEntry, SnakeOperatorState,
  HeuristicConfigRow, GameCentaurStateView,
  OperatorReadyState,
} from "@snek-centaur/server-lib"      // re-exports [06]'s exported view types

// ───────────────────────────────────────────────────────────────────────────
// Reactive read signals — common to all three bindings.
// Each property is a Svelte 5 readable rune (subscribe to the rune in a
// component's reactive context to read its current value).
// ───────────────────────────────────────────────────────────────────────────

export interface ReadSignals {
  readonly gameId: string
  readonly currentTurn: () => number                                   // [04]
  readonly boardState: () => GameState                                 // [04] / [05] reconstructed
  readonly stagedMoves: () => ReadonlyMap<SnakeId, Direction>          // [04]
  readonly chessTimer: () => {
    readonly perTeamRemainingMs: ReadonlyMap<string /* teamId */, number>
    readonly currentTurnEndAtMs: number | null
  }
  readonly snakeOperatorStates: () => ReadonlyArray<SnakeOperatorState>  // [06] §2.1.2
  readonly snakeBotStates: () => ReadonlyMap<SnakeId, SnakeBotStateSnapshot>  // [06] §2.1.3 / [07] §3.4
  readonly heuristicConfig: () => ReadonlyArray<HeuristicConfigRow>    // [06] §2.1.4
  readonly gameCentaurState: () => GameCentaurStateView                // [06] §2.1.5
  readonly operatorReadyStates: () => ReadonlyArray<OperatorReadyState> // [06] §2.1.5 / 06-REQ-040b
  readonly actionLog: () => ReadonlyArray<ActionLogEntry>              // [06] §2.1.6
  // Connection health is observable so §2.18 can surface subscription loss.
  readonly connectionState: () => "connected" | "reconnecting" | "lost"
}

// ───────────────────────────────────────────────────────────────────────────
// Mutation surface — present only on the live binding.
// ───────────────────────────────────────────────────────────────────────────

export interface LiveMutations {
  selectSnake(args: { snakeId: SnakeId; displace?: boolean }): Promise<MutationResult>
  deselectSnake(args: { snakeId: SnakeId }): Promise<MutationResult>
  setManualMode(args: { snakeId: SnakeId; manual: boolean }): Promise<MutationResult>
  stageMove(args: { snakeId: SnakeId; direction: Direction }): Promise<MutationResult>
  addDriveToSnake(args: {
    snakeId: SnakeId; heuristicId: string;
    target: { kind: "snake"; snakeId: SnakeId } | { kind: "cell"; cell: Cell };
    weight: number;
  }): Promise<MutationResult>
  removeDriveFromSnake(args: { snakeId: SnakeId; driveId: string }): Promise<MutationResult>
  updateDriveWeight(args: { driveId: string; weight: number }): Promise<MutationResult>
  setOperatorTempo(args: { tempo: "thinking" | "flow" }): Promise<MutationResult>
  bootOperator(args: { operatorUserId: Id<"users"> }): Promise<MutationResult>   // Captain-only per 08-REQ-068a; severs target's session connection.
  declareTurnOver(): Promise<MutationResult>          // Captain-only enforced by [06]/[04]
}

export type MutationResult =
  | { ok: true }
  | { ok: false; code: string; message: string }     // surfaced via §2.18

// ───────────────────────────────────────────────────────────────────────────
// Bindings.
// ───────────────────────────────────────────────────────────────────────────

export interface LiveDataSource extends ReadSignals {
  readonly mode: "live"
  readonly mutations: LiveMutations
  dispose(): Promise<void>
}

export interface ReplayDataSource extends ReadSignals {
  readonly mode: "replay"
  readonly scrubber: ReplayScrubberControl              // §3.2.1 below
  // No `mutations` field — structurally prevents replay-mode mutation (08-REQ-078).
  dispose(): Promise<void>
}

export interface CoachDataSource extends ReadSignals {
  readonly mode: "coach"
  readonly coachedTeamId: string
  // No `mutations` field — structurally prevents coach-mode mutation (08-REQ-052b).
  dispose(): Promise<void>
}

export type DataSource = LiveDataSource | ReplayDataSource | CoachDataSource

// Factories produced by @snek-centaur/server-lib.
export function createLiveDataSource(args: {
  gameId: string
  centaurTeamId: string
  gameCredential: string                              // per-Centaur-Team game credential JWT
}): Promise<LiveDataSource>

export function createReplayDataSource(args: {
  gameId: string
  participatingTeamId: string | null                  // null → board-level mode (08-REQ-070b)
}): Promise<ReplayDataSource>

export function createCoachDataSource(args: {
  gameId: string
  centaurTeamId: string                               // the team being coached
  coachToken: string                                  // [05] §3.4 coach SpacetimeDB token
}): Promise<CoachDataSource>
```

#### 3.2.1 Replay Scrubber Control

Motivated by 08-REQ-072, 08-REQ-072a, 08-REQ-072b, 08-REQ-072c, 08-REQ-072d.

```typescript
export interface ReplayScrubberControl {
  readonly mode: () => "per-turn" | "timeline"
  setMode(mode: "per-turn" | "timeline"): void

  // Cursor units differ by mode: turn index in per-turn mode, ms-since-game-start
  // in timeline mode. The data source projects the same underlying state at the
  // cursor position regardless of mode.
  readonly cursor: () => number
  setCursor(value: number): void

  readonly playing: () => boolean
  play(): void
  pause(): void

  readonly speedPerTurn: () => 0.25 | 0.5 | 1 | 2 | 4 | 8
  setSpeedPerTurn(value: 0.25 | 0.5 | 1 | 2 | 4 | 8): void

  readonly speedTimeline: () => 0.25 | 0.5 | 1 | 2 | 4 | 8
  setSpeedTimeline(value: 0.25 | 0.5 | 1 | 2 | 4 | 8): void

  // Turn marker positions for timeline-mode rendering.
  readonly turnMarkers: () => ReadonlyArray<{ readonly turn: number; readonly atMs: number }>

  // Game bounds (timeline mode renders this as the scrubber axis).
  readonly gameStartMs: number
  readonly gameEndMs: number
  readonly turnCount: number
}
```

### 3.3 Per-Operator Stable-Colour Function

Motivated by 08-REQ-035, 08-REQ-039, 08-REQ-073. Used by the header presence display, the board's selection-shadow layer, the action log's per-operator attribution, and the replay viewer's reconstructed selection shadows. Colour must be stable for `(gameId, userId)` across all clients viewing the same game so coloured affordances are recognisable across browsers and reloads.

```typescript
// Returns one of 16 accessibility-screened hex colours, deterministically
// from (gameId, userId). Distribution is balanced via a hash-mix.
export function assignOperatorColour(gameId: string, userId: string): string

// The palette is exported for test/forks; forks may swap palettes provided
// the function remains deterministic in (gameId, userId).
export const OPERATOR_COLOUR_PALETTE: ReadonlyArray<string>     // length 16
```

### 3.4 Presence Channel Shape

Motivated by 08-REQ-032, 08-REQ-035, 08-REQ-064a. Specifies the per-presence-record shape installed in the `@convex-dev/presence` channel keyed `team:${centaurTeamId}:game:${gameId}`. Joined to [06]'s `operator_tempo` rows reactively.

```typescript
export interface OperatorPresenceRecord {
  readonly userId: string                          // resolves to a User per [05]
  readonly role: "member" | "coach" | "admin"      // 08-REQ-064a quorum exclusion
  readonly displayName: string                     // OAuth display name only (08-REQ-091a)
  readonly colour: string                          // assignOperatorColour(gameId, userId)
  readonly currentSelectionSnakeId: string | null  // mirrors [06]'s snake_operator_state
}

export const presenceChannelKey = (centaurTeamId: string, gameId: string): string =>
  `team:${centaurTeamId}:game:${gameId}`
```

### 3.5 Lazy-Insert Invocation Contract

Motivated by 08-REVIEW-021 and [07] §3.7's DOWNSTREAM IMPACT note. The application invokes [06]'s `insertMissingHeuristicConfig` mutation on every Captain visit to the global centaur params page (§2.11), supplying the registry projection produced by [07]'s `getRegisteredHeuristics`.

```typescript
import { getRegisteredHeuristics } from "@team-snek/heuristics"
import { HEURISTIC_REGISTRY } from "@team-snek/heuristics"

// Invocation signature consumed by [06]'s function contract:
//   insertMissingHeuristicConfig({
//     centaurTeamId,
//     registrations: getRegisteredHeuristics(HEURISTIC_REGISTRY),
//   }): Promise<{ inserted: ReadonlyArray<string /* heuristicId */> }>
//
// Caller authorisation: the Captain's Convex auth credential. Non-Captain
// page visits do not invoke this mutation (08-REQ-017's Captain-only edit rule
// applies symmetrically to inserts).
//
// Idempotence: the mutation is insert-only and never overwrites existing rows.
// Per-team behaviour: invoked at most once per page visit; the returned
// `inserted` list is surfaced to the Captain as a non-blocking toast.
```

### 3.6 Centaur-Lib Library Surface Summary

Motivated by 08-REQ-076, 08-REQ-079, 08-REQ-080a. This is the consolidated list of types and functions a fork must depend on from `@snek-centaur/server-lib`. Forks may freely modify Svelte components, layouts, routes, and styling; they must not modify or replace the items below if they intend to preserve compatibility with the platform.

| Symbol | Source | Purpose |
|---|---|---|
| `createLiveDataSource`, `createReplayDataSource`, `createCoachDataSource` | §3.2 | Data-source bindings |
| `LiveDataSource`, `ReplayDataSource`, `CoachDataSource`, `DataSource` | §3.2 | Type-level binding contract |
| `ReadSignals`, `LiveMutations`, `MutationResult` | §3.2 | Reactive surface and mutation result |
| `ReplayScrubberControl` | §3.2.1 | Unified timeline control state |
| `assignOperatorColour`, `OPERATOR_COLOUR_PALETTE` | §3.3 | Per-operator stable colour |
| `OperatorPresenceRecord`, `presenceChannelKey` | §3.4 | Presence channel shape |
| `SnekGameInviteRequest`, `SnekGameInviteResponse` | §3.1 | Invitation endpoint contract |
| `convexErrorToHumanMessage` | §2.18 | Convex rejection translation helper |
| `startGameSession` (re-exported from [07] §3.3) | [07] | In-process bot framework boot from invitation handler |

### 3.7 DOWNSTREAM IMPACT Notes

None. Module 08 is a leaf in the dependency graph (Module 09 is absorbed into 08 as a redirect stub). The constraints this module's design imposes on its upstream dependencies are already recorded as DOWNSTREAM IMPACT items in those upstream modules' Phase 2 sections — notably [04]'s `scoreboard_view` per `04-REVIEW-020` (consumed by §2.14) and [06]/[07]'s `insertMissingHeuristicConfig` mutation (consumed by §2.11 and §3.5).

---


## REVIEW Items

All REVIEW items for this module (all resolved) have been migrated to [`08-centaur-server-app.review.md`](08-centaur-server-app.review.md).
