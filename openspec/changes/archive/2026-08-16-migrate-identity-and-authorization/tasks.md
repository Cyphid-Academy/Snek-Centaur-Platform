# migrate-identity-and-authorization — Tasks

The task breakdown was refined at implementation start, under the author's
standing instruction for this branch to proceed without per-step review.
Instance-side enforcement is deliberately split: this change lands the pure
admission decision core, and wiring it into reducers belongs to the change
that builds the game runtime, which cites these requirements and archives
after this one. Roster-snapshot creation and coach designation likewise
stay with the lifecycle and team-management stories; this change reads the
snapshot's authorization-relevant fields.

## 1. Shared credential vocabulary and the admission decision core

- [x] 1.1 `packages/platform-auth` — the one declaration every runtime
      shares: principal kinds and game roles as closed unions
      (`identity-and-authorization/identity-kinds`), the game-token subject
      codec with role and durable-id bindings
      (`identity-and-authorization/game-token-contents`,
      `global-invariants/durable-identity-references#derived-identities-inherit-durability`),
      the structured capability claim with object entries
      (`identity-and-authorization/capability-claim-structure`), the
      audience vocabulary (`identity-and-authorization/audience-bound-tokens`),
      and the two-entry game-credential claim as data
      (`identity-and-authorization/game-credential-scope`)
- [x] 1.2 `packages/stdb/src/admission.ts` — the pure admission decision
      core: audience first, then signature, expiry bounding connection
      establishment only, subject decode, and team registration against the
      seeded roster, with a closed rejection enum and nothing written on
      rejection by construction
      (`identity-and-authorization/admission-validation`,
      `identity-and-authorization/connect-time-validation`,
      `identity-and-authorization/role-bound-privileges`)

## 2. The platform's authorization server

- [x] 2.1 Better Auth installed in local mode under the host's Convex
      directory — the component's schema generated and committed, the
      client created in local mode, offline codegen wired
      (`identity-and-authorization/sole-credential-issuer`)
- [x] 2.2 Google as the only human authentication path, no password
      surface, account linking off so the provider's immutable subject is
      the sole linkage key
      (`identity-and-authorization/google-sign-in`,
      `identity-and-authorization/linked-provider-credentials`)
- [x] 2.3 Session lifetime a deployment configuration with the four-hour
      floor enforced at construction; fifteen-minute self-contained working
      credentials under it
      (`identity-and-authorization/token-lifetime-and-refresh`)
- [x] 2.4 Verification material published at stable well-known addresses
      through the deployment's HTTP router; every platform credential
      signed by the one key pair that never leaves the deployment, scoped
      by audience rather than by separated signing material
      (`identity-and-authorization/verification-without-shared-secrets`,
      `identity-and-authorization/audience-bound-tokens`)
- [x] 2.5 The admin designation on the user record, read from its current
      value at every call
      (`identity-and-authorization/platform-admin-role`)

## 3. Registries, gating, and issuance

- [x] 3.1 The trusted-issuer registry — identifier, published-material
      location, capability ceiling, return addresses, call-rate bound; no
      secret field; always resolved as a set
      (`identity-and-authorization/trusted-issuer-registry`,
      `identity-and-authorization/peer-capability-ceiling`)
- [x] 3.2 The capability registry and principal-kind gating over the whole
      public function surface: every function built through the declaring
      wrappers, capability checked before kind, humans-only the default,
      totality enforced by a build-gating test
      (`identity-and-authorization/capability-registry`,
      `identity-and-authorization/principal-kind-gating`,
      `identity-and-authorization/mutation-authorization`,
      `identity-and-authorization/authentication-required`)
- [x] 3.3 The service-principal assertion exchange: signature against the
      registration's published material re-read on unknown keys, audience
      and expiry checks, single-use assertion identifiers expired on the
      assertion lifetime, excess capability refused with the excess named
      (`identity-and-authorization/service-principal-assertions`)
- [x] 3.4 Game credentials and game access tokens: per-team-per-game
      scoping with exactly the two grants, issuance answered from the game
      record's roster snapshot, liveness re-checked on every request,
      spectator tokens unbound, coach tokens team-bound with the admin as
      implicit coach, and the subject alone deciding the role
      (`identity-and-authorization/game-credential-scope`,
      `identity-and-authorization/participant-token-eligibility`,
      `identity-and-authorization/spectator-tokens`,
      `identity-and-authorization/coach-tokens`,
      `identity-and-authorization/live-game-issuance`,
      `identity-and-authorization/roster-snapshot-binding`)
- [x] 3.5 An end-to-end coherence test: tokens minted by the platform,
      verified against its published material, and fed through the
      instance's admission decision core
      (`identity-and-authorization/game-token-contents`)

## 4. Sign-in handoff and client custody

- [x] 4.1 The handoff: references created only for registered servers,
      returned only to registered addresses, redeemed once against a
      hashed challenge, the resulting credential returned in that exchange
      alone and tied to the live session
      (`identity-and-authorization/sign-in-handoff`)
- [x] 4.2 The client custody module in the application: credentials held
      in closure only, an authorized-fetch surface that never returns
      plaintext, proactive renewal ahead of expiry with quiet retry while
      the credential in hand is valid, loss surfaced only when access is
      really lost
      (`identity-and-authorization/client-credential-custody`,
      `identity-and-authorization/token-lifetime-and-refresh`)

## 5. Validation

- [x] 5.1 `// spec:` citations across the code written for the capability,
      and `// design:` references where the change's rationale warrants
      them (finalized at archive with the dated folder name)
- [x] 5.2 `pnpm spec:check` and the full battery green with the
      implementation

## Archive

- [x] 6.1 On explicit author instruction, `pnpm spec:fold migrate-identity-and-authorization` then `openspec archive --skip-specs -y migrate-identity-and-authorization` at the tail of the PR that completes the implementation (fold enforces capability-dependency order)
- [x] 6.2 Add the minted capability to `openspec/config.yaml`'s context capability list
- [x] 6.3 Run `pnpm spec:check` after archiving
