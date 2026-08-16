# Agent Context — packages/platform-auth

This package is `@cyphid/snek-platform-auth`: the shared credential
vocabulary for the `identity-and-authorization` capability. It is the one
declaration of what a game token's subject means, what shape a capability
claim takes, and what audience names which resource — read by every
runtime that mints or admits on the platform's credentials (Convex mints,
a game instance admits, servers and clients hold), so drift between
minting and admission is impossible by construction.

## Spec scope

- **`identity-and-authorization`** (`openspec/changes/migrate-identity-and-authorization/specs/identity-and-authorization/spec.md`
  while the change is open, then `openspec/specs/identity-and-authorization/spec.md`
  once archived) — specifically identity-kinds, capability-claim-structure,
  game-token-contents, audience-bound-tokens, spectator-tokens,
  role-bound-privileges, game-credential-scope.

## What goes here

- The closed identity-kind and game-role enumerations.
- The game-token subject codec (encode/decode, role/team-binding readers).
- The capability claim's structure, its vocabulary, and its claim/acting-
  principal claim names.
- Audience naming and parsing.

Zero runtime dependencies, deliberately: every runtime (Convex, SpacetimeDB,
Centaur Servers, the web client) can depend on this package without pulling
in anything else, and nothing here can drift by inheriting a dependency's
behaviour.

## What does NOT go here

- **Issuance** — deciding *whether* a caller may obtain a credential
  (roster checks, ceiling checks, liveness checks). That is Convex policy
  code in `convex-host`/`convex-snek-platform`.
- **Admission decisions that read runtime state** — the pure admission
  *core* that combines this package's codec with seeded per-instance state
  lives in `packages/stdb/src/admission.ts`; wiring it into reducers is the
  `mint-game-runtime` change's job.
- **Storage** — no persistence of any kind.
- **Network** — no HTTP, no fetch, nothing that talks to Convex or a game
  instance.
- **Crypto** — no signing, no verification, no key material. This package
  describes what a credential's structured contents *mean*; it never
  produces or checks a signature. That is Better Auth (signing/publication)
  and each runtime's own token validation (signature verification).

## Key files

- `src/principal.ts` — `PersistentPrincipalKind`, `GameRole`.
- `src/game-subject.ts` — the game-token subject codec and its role/team
  helpers.
- `src/capabilities.ts` — the capability claim's structure, vocabulary, and
  claim names.
- `src/audience.ts` — audience naming and parsing.
