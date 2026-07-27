# Agent Context — packages/centaur-server-lib

This package is `@cyphid/snek-centaur-server-lib`: the bot framework and server library that teams use to build their Centaur Server implementation.

## Spec scope

- **Module 07** (`legacy-spec-archive/spec/07-bot-framework.md`) — Drive/Preference types, portfolio model, game tree cache, Dijkstra traversal, anytime submission, softmax decision, compute scheduling.
- **Module 02** (`legacy-spec-archive/spec/02-platform-architecture.md`) — `02-REQ-030` establishes the Centaur Server as a framework teams must use.
- **Module 03** (`legacy-spec-archive/spec/03-auth-and-identity.md`) — game credential usage, per-team bot admission tickets.
- **Module 08** (`legacy-spec-archive/spec/08-centaur-server-app.md`) — invitation endpoint contract, published key document, healthcheck contract.

## What goes here

- `Drive<T>` and `Preference` abstract types with their full interface contracts.
- `Portfolio` model with weights.
- `defineBot(definition): BotRunner` — the entry point for teams.
- `GameInvitationHandler` — answers the platform's credential-free wake ping from the whitelist alone.
- Signing-key generation, persistence and publication — automatic on first boot, no operator action.
- `TeamWhitelist` — this server's half of two-sided consent; asking for a team's session is the act of admission.
- Per-team, per-game platform credentials, held separately per hosted team and renewed ahead of expiry.
- `HealthcheckResponse` type and endpoint.
- Typed Convex component clients (`createPlatformClient`, `createCentaurStateClient`).
- Anytime submission pipeline (round-robin, dirty flags, 100ms interval).
- Game tree cache structure and Dijkstra-on-lattice traversal.

## Published as a GitHub-tagged package

This library is published via GitHub tags for external consumers who fork the `cyphid/snek-centaur-server` mirror. The `package.json` has `publishConfig.access: public` so adding `npm publish` to the release flow is a one-line upgrade path. External consumers currently use `github:cyphid/snek-centaur-server-lib#v0.x.y`.

## Key files

- `src/index.ts` — all exports
- `legacy-spec-archive/spec/07-bot-framework.md` — binding source of truth
- `legacy-spec-archive/spec/02-platform-architecture.md` § Centaur Servers
- `legacy-spec-archive/spec/03-auth-and-identity.md` § Game credentials
