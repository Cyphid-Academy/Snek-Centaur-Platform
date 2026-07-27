# Adopt federated trust invariants

## Why

Cyphid is a federation of independently deployed systems, and the Team Snek
platform is one of them. Its Convex deployment is the sole authorization
server for the platform's own affordances, and every other party in the
trust chain — game instances, Snek Centaur Servers, peer Cyphid systems —
is a client or resource server validating against published material.
`global-invariants` currently describes a closed world with one issuer, one
kind of service credential, and one delivery channel for it. Three
invariants the rest of that world now rests on are unstated, and six
existing ones assert a credential model the platform no longer has.

## What Changes

- **Three ADDED requirements**, each a rule no user-story capability owns
  and every one of them falsifiable by an implementer working alone:
  `no-shared-secrets` (authentication is asymmetric everywhere, so nothing
  a component holds at rest can impersonate it), `issuer-anchored-trust`
  (a resource holder trusts *issuers* with recorded capability ceilings, and
  enforces those ceilings itself), and `durable-identity-references` (records
  name the platform's own identifiers, never an external provider's).
- **Five MODIFIED requirements**: `ephemeral-game-credentials` and
  `credential-confinement` (a Server earns its own short-lived per-team,
  per-game credentials by proving domain control rather than receiving them
  on a delivery channel); `access-follows-identity` and
  `authenticated-unambiguous-identity` (platform identity rather than
  provider identity; external systems join the closed kind enumeration);
  `one-contract-many-surfaces` (no service component ever exercises a
  human's authority, not merely no Server).

## Carving rationale

Each addition passes the capability's admission test. `no-shared-secrets`
and `issuer-anchored-trust` constrain Convex, game instances, and Snek
Centaur Servers alike, and no single workflow owns them — the same rule
governs a Server obtaining a team credential, a peer system calling the
platform, and an automation calling a Server. `durable-identity-references`
binds token minting in Convex, identity derivation in SpacetimeDB, and every
historical record: it is the invariant that keeps account-linking changes
from rewriting history, and it is silently violable by any implementer who
puts a provider subject in a claim.

What is *not* here: the trusted-issuer registry itself, the capability
vocabulary, homing and whitelist admission, and the provisioning credential
are all owned by user-story capabilities and authored in their own changes.
This change states only the rules those solutions must stay inside.

## Capabilities

### Modified: global-invariants

Three ADDED requirements; five MODIFIED (`ephemeral-game-credentials`,
`credential-confinement`, `access-follows-identity`,
`authenticated-unambiguous-identity`, `one-contract-many-surfaces`).
Dependencies unchanged: game-engine only.

Two scenario slugs are removed by the MODIFIED blocks, because a Server no
longer receives a credential it could hold to a game's end:
`ephemeral-game-credentials#game-credentials-expire` and
`credential-confinement#game-credential-has-one-delivery-path`. Their
dependents are swept in the same PR.

## Impact

- `openspec/specs/global-invariants/spec.md` gains three requirements and
  has six replaced at archive.
- Open changes citing the removed scenario slugs are re-pointed in the same
  PR; `pnpm spec:graph` is regenerated with the dependency edits.
- No code changes.

## Open Questions

None. The two questions this change surfaced are recorded with the
capabilities that own the decisions rather than here, because neither changes
an invariant's text and both are answered inside a concrete story: whether the
federation designates one system authoritative for Cyphid identity is
`identity-and-authorization`'s, and whether a provisioned instance re-resolves
the platform's signing keys is `game-lifecycle`'s. Nothing about these
invariants waits on either answer.
