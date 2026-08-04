# Agent Context — packages/stdb

This package is `@cyphid/snek-stdb`: the SpacetimeDB TypeScript module. It is the authoritative executor of Team Snek game logic within the SpacetimeDB runtime.

## Spec scope

- **Module 04** (`legacy-spec-archive/spec/04-stdb-engine.md`) — reducers, schema, RLS, chess timer, subscription queries.
- **Module 01 / `game-engine` capability** (`openspec/specs/game-engine/spec.md`) — consumed via `@cyphid/snek-engine`.
- **Module 02** (`legacy-spec-archive/spec/02-platform-architecture.md`) — lifecycle and identity context.
- **Module 03** (`legacy-spec-archive/spec/03-auth-and-identity.md`) — OIDC/JWT validation, RLS identity model. Superseded for admission by the `identity-and-authorization` capability, which is binding for connect-time validation, admission records and role-bound privileges.

## What goes here

- SpacetimeDB table schemas (static tables, turn-keyed append-only tables, mutable working tables).
- Reducer implementations: `initialize_game`, `register`, `stage_move`, `declare_turn_over`, `resolve_turn`.
- Row-level security rules for snake invisibility.
- Chess timer implementation.
- Subscription query patterns and client query helpers.

## What does NOT go here

- Any Convex imports.
- Business logic that is already in `@cyphid/snek-engine` — import, don't duplicate.

## Implementation notes

Before implementing, read `legacy-spec-archive/spec/04-stdb-engine.md` in full. The SpacetimeDB SDK for TypeScript is distinct from normal Node/Bun TypeScript — reducers run inside the STDB runtime and cannot use arbitrary Node APIs.

Concretely: `spacetime build` bundles the module *and everything it imports from `node_modules`* into one `bundle.js` with rolldown, and the host runs that in a V8 isolate. So npm dependencies are inlined and work (the shared engine, including its BLAKE3 dependency, runs unmodified inside a reducer — no shim, no vendored copy), but there are no Node builtins: no `fs`, no `process`, no `node:` imports anywhere in the import graph.

**The package has two halves, on purpose.**

- `src/` is an ordinary workspace package in the strict composite build. It re-exports the engine's types and holds, in time, the row codecs mapping the engine's `GameState` to and from table rows. Anything that can be checked under the workspace's real settings belongs here. It deliberately holds **no** hand-written table of reducer or table names: a string literal is not a reference, so such a table drifts silently on a rename. Real bindings come from `spacetime generate` when a caller needs to address the instance over the wire.
- `spacetimedb/` is the module project that `spacetime build` owns. Its `tsconfig.json` is SpacetimeDB's, not the workspace's, and it is excluded from `tsc -b`. It is a separate pnpm workspace member (declared in `pnpm-workspace.yaml`) so `spacetimedb` and the engine are installed into it — without that, the bundle fails with `Module not found`.

**The module may export nothing but tables and reducers.** The host walks a
published module's exports and refuses the whole module — at publish, with
`exporting something that is not a spacetime export` — on meeting one it does
not recognise. So a constant a reducer needs is a constant `src/` exports and
the module imports (`GAME_BINDING_KEY` is the one there is). Nothing in the
workspace's own build catches this: `tsc` and `spacetime build` both accept it,
and only publishing into a real host says otherwise, which is what the
end-to-end harness is for.

Keep reducer bodies thin and push anything worth checking into `src/`. The module project's tsconfig is looser than the workspace's, so logic left in `spacetimedb/` is logic checked less carefully.

**What is here now is a skeleton plus admission.** The module publishes `module_info` and `ping`, which together prove the toolchain end to end — build, publish, call, and the shared engine running unmodified inside the isolate — and the connect-time admission path described below. The gameplay tables and the four real reducers (`initialize_game`, `stage_move`, `declare_turn_over`, `resolve_turn`) land with `migrate-game-lifecycle`, `migrate-operator-control` and `migrate-turn-pacing`. Do not add them ahead of those changes: a reducer body is where the rules end up, and a table is a schema the instance then agrees to.

### Why admission exists here while the gameplay tables do not

`migrate-identity-and-authorization` landed the whole connect-time path — `onConnect`, the private `admitted_connection` table, and the three seed tables (`game_binding`, `participant_team`, `roster_member`) it validates against. That is not a violation of the carve-out above but the line the carve-out actually draws: **admission is not gameplay.** Who may connect is settled before any rule applies, it is stated in full by `identity-and-authorization` rather than by a change still to be written, and an instance without it is an instance with no access control at all — the one gap that cannot be left open while waiting for its neighbour.

Three consequences to preserve:

- **The seed tables are schema without a writer.** `initialize_game` fills them and belongs to `migrate-game-lifecycle`; do not write it here. Until it exists the tables are empty, no token's audience matches, and the instance admits no one — the safe direction for the gap to fail in.
- **They carry only the fields admission reads.** A game id, the participating team ids, and the roster snapshot's member-to-team mapping. They are not the lifecycle or roster tables in miniature; the change that owns those grows them.
- **`admitted_connection` is private and stays private.** It is declared without `public: true` and no row-level-security rule grants it, which is the mechanism behind `identity-and-authorization/admission-records-private`: a client reaches a private table only through an RLS rule, so granting nothing is the guarantee. Adding an RLS rule that mentions this table would silently revoke it.

The decision itself is pure and lives in `src/admission.ts`, not in the reducer body — deliberately, because `admission-validation#reject-before-touching-state` requires a refused connection to leave no trace, and code that cannot write cannot leave one. Signature verification is the host's: SpacetimeDB validates the JWT against the issuer material it holds from startup and surfaces the claims as `ctx.senderAuth.jwt`, so the module needs no crypto library (`jose` is not a dependency here and must not become one).

**One instance, one game.** No table is keyed by game id: `global-invariants/spacetimedb-instance-isolation` makes the database itself the game. A reducer that throws aborts its transaction — that is the intended failure mode for turn resolution, and the message surfaces in `spacetime logs`, not in the CLI's response.

`pnpm codegen` remains a no-op: client bindings (`spacetime generate`) are only worth generating once something consumes them.

## Key files

- `spacetimedb/src/index.ts` — tables and reducers (the module itself)
- `src/admission.ts` — the pure admission decision, and `actingTeam`, the question every future gameplay reducer must ask before it writes
- `src/index.ts` — engine re-exports, and constants the published module itself imports
- `legacy-spec-archive/spec/04-stdb-engine.md` — binding source of truth
- `docs/external-setup.md` → *Local development* — how to run and drive it
