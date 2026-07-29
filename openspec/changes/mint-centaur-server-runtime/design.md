# mint-centaur-server-runtime — Design

## Context

`team-server-management` was carved as a user story and is a good one. What
this change removes from it is the part that never was a story: seven
requirements stated about an artifact, which happen to sit in the story
capability because that is where the artifact was first discussed.

The affected code is `packages/centaur-server-lib` (a stub) and
`apps/centaur-server-reference` (a landing page and three route files).
Nothing here refactors shipped behaviour; the cost is in open change folders,
which are ADDED-only and freely editable, plus eleven `// spec:` citations.

## Decisions

### 1. The seam is "a server that operates no team"

Prong (b)'s counterfactual is the whole guard, and it was chosen because it is
decidable without taste. A requirement either still says something about a
deployment that has just booted, been named by nobody, and admitted nobody, or
it does not.

It admits: key publication (published *before* any team names it — that is the
point of `#first-boot-needs-no-operator`), the administration API and its
issuer ceilings, the library's tenant separation (a property of the library's
shape, stated whether or not two teams are hosted), the reference-heuristics
policy, the absence of identity state, the liveness endpoint, and the fork
surface.

It rejects, in order of how tempting they are:

| Requirement | Why it fails |
|---|---|
| `bot-framework/embedded-team-player` | Runs in this exact process — and needs a live game. The first thing an "it's on the server" argument would pull in, and prong (b) answers it without discussion |
| `team-server-management/invitation-acceptance` | Needs a game and a team; it is also one half of a two-party protocol whose other half is `game-invitations` |
| `team-server-management/whitelist-admission` | Needs a team relationship (Q-A) |
| `team-server-management/reference-server-home` | Needs a team with no infrastructure (Q-B) |
| `decision-transparency/hosting-server-sole-writer` | Names the server, but the obligation is Convex's: it is an enforcement rule at the record, not a promise the server makes |

**What breaks if reversed** (admit anything that runs on a server): the
capability becomes modules 07 and 08 merged, the bot framework and the whole
operator interface with it, and the migration's decomposition is undone at the
largest of the three runtimes.

### 2. The healthcheck split is forced, not chosen

`server-healthcheck` says the server exposes an endpoint *and* the platform
records a status *and* the team's management surface displays it.
`global-invariants/runtime-ownership` forbids a behaviour split so that two
runtimes each hold partial authority over it; a single requirement binding two
runtimes is what that invariant exists to prevent, and
`mint-game-runtime` split `replay-and-audit/append-only-history` on exactly
this ground.

The split is also what keeps the change cheap. Had the requirement moved
whole, `centaur-server-runtime` would have had to declare `team-management`
(depth 3) for the management-surface clause, landing at depth 4 and pushing
`team-server-management` to 5 and every capability behind it one level deeper
— measured, not guessed: it costs the corpus a fold level. Splitting costs
nothing.

The retained half keeps the slug `server-healthcheck`, so
`game-lifecycle/launch-gates`, `team-management`'s and `accounts-and-profiles`'
citations of the platform-side behaviour keep resolving with no edit.

**What breaks if reversed** (move it whole): one requirement owns behaviour in
two runtimes, and the corpus pays a fold level for it.

### 3. `forkable-reference-app` moves; `unified-web-application` does not

They both say "the application", which is the seam's one genuine difficulty.
They are different subjects. `unified-web-application` says there is exactly
one application and every server serves it — a fact about the client, consumed
by every capability that puts a surface in it, and therefore
`application-shell`'s. `forkable-reference-app` says the *repository* is
forkable and enumerates the compatibility surface a fork must preserve — a
fact about the deployment, consumed by fork authors and by the platform, and
therefore this capability's.

That the two live in one SvelteKit app is not an objection: capability
boundaries and package boundaries are orthogonal in this corpus, and three
capabilities already share `packages/stdb` after the `game-runtime` carve.

**What breaks if reversed** (keep them together, wherever): either every
capability owning a view inherits a dependency on key publication and
administrative issuers, or fork authors have to read a capability about
navigation and rendering to find their compatibility surface.

### 4. The published library surface is a requirement; the mirror workflow is not

Q33's fork/mirror deliverable splits along the falsifiability line the same way
the SpacetimeDB toolchain did in `mint-game-runtime`. What a fork author would
be harmed by losing is not the workflow file: it is the promise that a pinned
version keeps working and that a removal arrives as a version bump rather than
as teams silently ceasing to be operated. That is
`published-library-surface`. The subtree split, the tag scheme and the
dependency rewrite are mechanism, and they get tasks in a plan that folds
before `team-server-management` — the first capability whose implementation
needs a fork to exist.

**What breaks if reversed** (mandate the workflow in the spec): the corpus
carries a fact about a CI file that goes stale, and the promise a fork
actually relies on stays unstated.

### 5. The edge points to `application-shell`

`forkable-reference-app` names the application it delivers, so the server
declares the application rather than the reverse. The application needs no
identifier from the server: *every server serves the same one* rests on
`global-invariants/access-follows-identity`, which it already declares. The
mirror option — the application declaring the server — would put every
capability owning a view behind the server artifact in fold order, which is
backwards from implementation reality: you can build the application before
anything serves it.

**What breaks if reversed:** `application-shell` moves from depth 2 to depth 4
and drags every view capability with it.

## Constraint-mining

- Decision 1 → no new invariant; the guard is the counterfactual in prong (b).
- Decision 2 → the invariant is that liveness says nothing about whom a server
  will operate, so nobody builds a readiness check on it. Minted as
  `centaur-server-runtime/healthcheck-endpoint#liveness-is-not-readiness-to-play`.
  The unauthenticated-and-minimal scenario travels with the endpoint.
- Decision 4 → three invariants, all in `published-library-surface`: that a
  fork's build reaches nothing a fork author does not have
  (`#a-fork-builds-without-the-monorepo` — the failure mode is a workspace
  dependency surviving the split, which is exactly what the mirror rewrite
  exists to prevent); that a published version does not move under a fork that
  did not ask (`#pinned-forks-do-not-drift`); and that a removal is a version
  rather than a surprise (`#a-removal-is-a-version-not-a-surprise` — the harm
  case is discovering it when your teams stop being operated, which is
  `forkable-reference-app#surface-changes-are-platform-changes` applied to the
  half of the surface that is code).
- Decision 5 → no new invariant; the fix is structural.
- One invariant was considered and **deliberately not minted**: that a hostile
  server cannot widen anyone's authority. That is already
  `global-invariants/security-enforced-outside-the-library`, and restating it
  here would be the duplication the DRY rule forbids.

## Risks / Trade-offs

- **"This is module 08 again."** Mitigated by prong (b), which keeps the bot
  framework, the operator interface, the invitation protocol and the hosting
  relationship out — and by the fact that everything this capability admits is
  true of a server nobody has named.
- **`team-server-management` loses seven of seventeen requirements.** It stays
  a coherent story at ten, and its Purpose reads better for it: it is now
  about acquiring and running a server rather than about that plus what a
  server is.
- **Eleven code citations move.** All in stub files. Note that
  `packages/centaur-server-lib/dist/` is gitignored but *is* scanned by the
  reference lint, so a stale local build fails it until rebuilt — a trap worth
  writing down.
- **One edit lands in a folder another agent holds.**
  `migrate-bot-framework/tasks.md` carries one linted citation of
  `forkable-reference-app`. One line, but it needs coordinating.

## Alternatives considered

- **Leave everything in `team-server-management`.** Rejected: the fork/mirror
  deliverable stays unowned, and the capability keeps describing two different
  kinds of thing under one Purpose.
- **Merge with `application-shell`.** The obvious move, since they are one
  repository and one deployable. Rejected on meaning, not on cost — merging
  internalises the edge between them and moves no capability's fold depth. What
  it costs is the admission test: the two counterfactuals (*a surface not yet
  designed*, *a server operating no team*) have no common generalisation except
  "it is in the server repository", which is module 08. See Decision 3 and
  `mint-application-shell`'s alternatives.
- **Name it `centaur-server`.** Rejected: the `-runtime` suffix is what ties it
  to `global-invariants`' three-runtime taxonomy, in which Snek Centaur Servers
  are one of the three, and what distinguishes it from the story capability.
- **A narrower `server-compatibility-surface` capability holding only the fork
  contract.** Rejected: it would own what a fork must preserve but not the
  behaviours being preserved, so key publication and the healthcheck endpoint
  would stay in a story capability while the contract naming them lived
  elsewhere.
