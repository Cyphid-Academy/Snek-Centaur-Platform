# mint-application-shell — Tasks

## 1. Pre-implementation & seam gates

- [ ] 1.1 Review this change's artifacts with the author immediately before implementation begins, and refine this task breakdown then; resolve Q-A (the capability's name) and Q-B (whether `visual-tester` is bound) first, since both are cheap now and expensive after the fold
- [ ] 1.2 Seam gate — capabilities that must be implemented or agreed first, and which archive before this change: `game-engine` (the domain values the board rendering consumes) and `global-invariants` (the truthfulness and confinement rules the binding rests on). Nothing else: this capability is deliberately upstream of every capability that owns a view
- [ ] 1.3 Confirm the runtime home this plan assumes: every requirement here is realised in the one web application the servers serve, with no Convex, SpacetimeDB or hosting-server code in scope — where the application is served from is `centaur-server-runtime`'s, and what any surface shows is the story capability's

## 2. The application

- [ ] 2.1 Stand up the one application: routes for both platform-wide and team-internal concerns in a single build, with no second application anywhere in the repository and no surface reachable only from a platform-operated deployment (`application-shell/unified-web-application`, `application-shell/unified-web-application#no-second-application`)
- [ ] 2.2 Build the navigation shell — the routing structure, the authenticated frame, the team and game context resolution — as **mechanism**, and record its conventions in the app's `AGENTS.md`. No requirement mandates its shape; what is binding is that every surface lives inside this one application
- [ ] 2.3 Verify the serving-server independence: the built application reads its platform endpoint from configuration and holds no per-deployment branch, so the same build is what every server serves (`application-shell/unified-web-application#same-data-any-server`)

## 3. The mounting contract

- [ ] 3.1 Define the mounting contract every surface is written to: mode and per-affordance parameters supplied at mount, and no access to session, actor, or role from inside a surface. Add a lint or type-level guard that a surface module cannot import the identity context at all, so the rule is structural rather than remembered (`application-shell/surface-mounting-contract`, `#the-host-states-what-is-offered`)
- [ ] 3.2 Test one surface mounted three ways — live, read-only, and over a reconstructed past moment — asserting the rendered output differs only in the affordances the host stated and that the surface holds no mode-aware branch (`application-shell/surface-mounting-contract#one-surface-every-mode`)
- [ ] 3.3 Test that a write of a withheld kind reaching the owning runtime anyway is judged by that runtime's own rules, unchanged by how the surface was mounted (`application-shell/surface-mounting-contract#hiding-is-not-enforcing`)

## 4. The state binding

- [ ] 4.1 Build the binding: one interface through which a surface obtains state, with implementations over the live platform deployment, over a game instance's filtered subscription, over a persisted record, and over a fixture — mutation present on the first two and **absent from the type** on the others (`application-shell/one-state-binding`, `#absence-not-refusal`)
- [ ] 4.2 Test that the same surface renders live state and reconstructed state with no source-aware branch, using a surface written before the reconstruction path existed (`application-shell/one-state-binding#a-surface-does-not-know-its-source`)
- [ ] 4.3 Surface connection loss and recovery in the binding, and test that a surface cannot present a stale cache as live state because it never holds one (`application-shell/one-state-binding#loss-is-the-bindings-to-report`)

## 5. Board rendering

- [ ] 5.1 Build the one board rendering component over the engine's own domain values — terrain, snakes, items, hazards, fertile tiles — with an overlay slot for surface-specific marks, and no rendering rule reachable except through it (`application-shell/one-board-rendering`, `#composition-not-replacement`)
- [ ] 5.2 Test one board rendered from three sources — a live subscription, a configuration preview, and a persisted replay — asserting identical output for identical state (`application-shell/one-board-rendering#one-board-everywhere`)
- [ ] 5.3 **Seam:** agree with the author whether `apps/visual-tester` adopts this component. The requirement does not bind it (Q-B); adopting it is a plan decision and, if taken, retires the app-local renderer

## 6. Spec hygiene and verification

- [ ] 6.1 Add `// spec:` citations across the shell as it is built, and `// design:` references where this change's rationale warrants them (why read-only-ness is a binding property, why a surface cannot see the session)
- [ ] 6.2 Run `pnpm spec:check` and the full battery (`pnpm lint`, `pnpm typecheck`, `pnpm test`)
- [ ] 6.3 Verification specific to this change: the three-mode mounting test, the two-source rendering test, the withheld-affordance test, and the import guard proving a surface cannot reach the identity context

## Archive

- [ ] 7.1 On explicit author instruction, `pnpm spec:fold mint-application-shell` then `openspec archive --skip-specs -y mint-application-shell` at the tail of the PR that completes the implementation (fold enforces capability-dependency order: this change archives before `mint-centaur-server-runtime`, `migrate-game-configuration`, and every capability owning a view)
- [ ] 7.2 Add `application-shell` to `openspec/config.yaml`'s context capability list
- [ ] 7.3 Run `pnpm spec:check` after archiving
