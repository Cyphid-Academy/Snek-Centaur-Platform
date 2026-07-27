# Design — adopt-federated-trust-invariants

## Context

The platform is one Cyphid system among several, each with its own Convex
deployment. Systems trust each other as peers, not as parents: a peer's
signature proves who signed, and nothing more. Within the platform the same
shape holds one level down — a Snek Centaur Server, a game instance, and a
browser client are all parties whose authority the platform records rather
than infers.

This change states the cross-runtime rules that shape has to obey. The
mechanisms it constrains — the issuer registry, the capability vocabulary,
homing, whitelist admission, instance provisioning — are authored by the
capabilities that own them.

## Decisions

### One delegation pattern, stated once

`issuer-anchored-trust` is deliberately a single requirement covering every
authority relationship in the platform, rather than a per-relationship rule
repeated in each capability. A resource holder names issuers, records what
each may confer, and enforces that ceiling itself; a Snek Centaur Server
trusting an administrative issuer and the platform trusting a peer system
are the same operation at different depths.

Stating it as one rule is what makes attenuation free: an issuer may mint a
narrowly scoped credential for one caller and one purpose without the
resource holder learning why, because the resource holder checks the
ceiling, not the reason. *Reversed* — trust anchored on individual callers
— every new automation becomes a configuration change at every resource it
touches, and the pressure is then toward one broad credential shared
between automations, which is the outcome the model exists to avoid.

The requirement says the ceiling is checked *at the resource* because the
alternative reading is the dangerous one. An implementation that allowlists
callers, or that trusts an issuer to have already narrowed correctly, passes
every test written against the success path and fails only against a
compromised or misconfigured issuer — exactly the case the control exists
for.

### Recognition is not authorization

The scenario `#recognition-is-not-authorization` exists because registering
a peer is the moment the mistake gets made. Adding an issuer to a trust set
is a small, plausible-looking act; if the implementation treats a
recognised signature as sufficient, that act silently widens everything the
resource holder protects. Recording the ceiling *with* the issuer, in the
same write, is what makes widening impossible to do by accident.

### Asymmetric authentication is behaviour, not a construction choice

`global-invariants` states behaviour and leaves primitives to code, and this
change keeps that line: no requirement here names a signature algorithm, a
document format, a claim, or an endpoint. But *whether a credential is a
shared secret* is not a construction detail — it decides what a compromised
component yields, whether a credential can be rotated without coordination,
and whether onboarding a new party requires a human to move a secret. So
`no-shared-secrets` is stated as a requirement, and the primitives that
satisfy it stay in code.

The rule bans secrets *shared between two parties for authentication*. A
token an authority signs and a bearer presents is still permitted — the game-end
callback credential is one, and it is safe on the same terms as any other
signed token: verified against published material, never compared against a
stored copy. *Reversed*, the platform re-acquires the property that some
component somewhere holds a secret whose disclosure forges credentials
undetectably, and every new participant needs a human to provision one.

**The rule is scoped to the platform's own trust chain, and that scope is
load-bearing rather than a hedge.** Read unconditionally it would forbid
Google sign-in, because a consumer identity provider's authorization-code
exchange admits no asymmetric client authentication: the platform must hold
the client secret that protocol defines. Since `google-sign-in` makes Google
the sole human credential, an unscoped `no-shared-secrets` would put two
requirements of this corpus in direct contradiction — and the contradiction
would surface at the worst moment, when someone first tries to configure
sign-in and finds an invariant forbidding it.

The scope that resolves it is the one that carries the invariant's actual
meaning. What `no-shared-secrets` protects is the property that **nothing a
component here holds can impersonate another party here**: examine any
runtime's state and you find its own private key and other parties' public
material. A third-party client secret does not weaken that. It authenticates
the platform *outward*, as itself, to one named service; it confers nothing
on anyone inside the chain; and no resource holder here would honour it as
authority, because none is configured to. Its disclosure costs the platform
its standing with that one provider — a real cost, contained and rotatable —
and forges no credential any Convex function, game instance, or Snek Centaur
Server would accept.

*Reversed* — the carve-out omitted — the invariant is either violated in
practice on day one and quietly disbelieved thereafter, or honoured by
dropping the one human authentication provider the corpus mandates. The
narrower rule is the one that can actually be kept, and a rule kept is worth
more than a rule stated. What it must not become is a general licence: the
permission is confined to protocols where no asymmetric option exists, for
the platform's own outward authentication, and never for a party the platform
is itself vouching for.

### Identity references name what the platform controls

`durable-identity-references` is the invariant behind treating an external
provider account as a credential linked to a user rather than as the user.
The load-bearing consequence is in the records: a game instance derives its
own identity from a credential's subject, and historical records keep
whatever identifier they were written with. If those name a provider's
subject, replacing a person's provider account breaks every record's
linkage and turns the retired-credential table into a permanent join
dependency for reading history. Naming the platform's own identifier makes
the change a status flag and an insert.

*Reversed*, the failure is invisible at authoring time and unrecoverable
later: nothing goes wrong until the first person changes provider account,
and by then the identifier is in every historical record.

## Constraint-mining (mandatory final step)

Each decision judged for an invariant a future implementer could silently
violate:

1. **Ceiling enforcement at the resource** — *minted*:
   `issuer-anchored-trust#ceiling-is-checked-at-the-resource`. An
   implementation that trusts the issuer to have narrowed correctly is
   indistinguishable from a correct one until an issuer misbehaves.
2. **Registration confers nothing** — *minted*:
   `#recognition-is-not-authorization`. Silently violable by the natural
   implementation, which treats a verified signature as an authorization
   decision.
3. **Attenuation never widens** — *minted*: `#authority-only-narrows`.
   Without it, a delegation chain's authority is whatever its last hop
   claims.
4. **No secret at rest anywhere** — *minted*: `no-shared-secrets` with
   `#no-secret-at-rest` and `#no-secret-configured-into-a-component`. The
   second is the one that gets violated: onboarding a new participant is
   exactly when someone reaches for a generated secret.
5. **Records name platform identifiers** — *minted*:
   `durable-identity-references` with
   `#provider-change-breaks-no-record`. Nothing surfaces the violation
   until the first rebinding.
Checked and left out: the wire representation of capabilities, token
lifetimes, which party holds the issuer registry, and how a resource holder
discovers an issuer's public material — all mechanism, and all bounded by
the requirements above.

## Risks / Trade-offs

- **`no-shared-secrets` bites surfaces beyond the ones motivating it.** Any
  affordance authenticated by a long-lived bearer key is now a violation,
  including administrative automation surfaces. That is the intended reach:
  a global-scope key held by a service and carrying a human's authority is
  the exact combination the invariant exists to prevent. The cost is that
  the simplest possible integration story — issue a key, paste it into a
  script — is no longer available, and an integrator registers a key pair
  instead.
- **Short, continuously re-earned credentials trade revocation immediacy for
  stateless verification.** Withdrawing a party's authority stops issuance
  at once but leaves an outstanding credential valid to its expiry. This is
  why the credential lifetime bound belongs in the capability that issues
  them and why it must stay short.
