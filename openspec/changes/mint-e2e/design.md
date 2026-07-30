# mint-e2e — Design

## Context

The platform runs across three runtime kinds and the battery exercises them
one at a time. Everything needed to run all three together on one machine
already exists and was measured rather than assumed: the SpacetimeDB
standalone host starts natively with no container, a Convex deployment runs on
loopback with no account and no deploy key, and a browser is already present in
both development environments. The only genuinely external dependency in the
whole system is the identity provider humans sign in through, and that turns
out to have a documented seam.

What was missing was not capability but a decision about *shape*, taken before
tests exist to depend on the alternative.

## Decisions

### 1. Every runtime is real, and the harness owns its lifecycle

The alternative — a substitute implementing a runtime's interface — is
cheaper on every axis except the one that matters. The defects this harness
exists for are the ones that live between the runtimes: an artifact rejected
at publish time, a document a peer cannot fetch, a token minted by one runtime
that another declines. Each is invisible to a substitute, because a substitute
encodes its author's belief about the runtime, and that belief is what is
under test.

The lifecycle sits with the harness rather than with the developer or with CI
configuration for the same reason: a runtime someone else started is a runtime
at an unknown version holding unknown state, and the first symptom is a test
that passes on one machine.

**If reversed:** the suite gets faster and stops discriminating. A green run
would mean the parts agree with the harness's model of each other, which is
what the unit suites already establish more cheaply.

### 2. The identity substitution replaces verification and nothing else

Human sign-in goes through one external provider, and that exclusivity is
deliberate: no password provider, no linking on a matching email claim, one
registered OAuth client whose redirect URIs name platform environments rather
than teams or developers. A harness must not weaken any of it.

Three routes were considered.

**Assemble a session directly.** Write the account and session records the
platform would have written, and hand the browser the cookie. Cheapest, and it
skips precisely the code most worth covering — account creation, the linking
policy, session issuance, cookie custody. Rejected.

**Stand up a mock provider and point sign-in at it.** The authorization
endpoint *is* overridable — the provider option exists and its own
documentation offers testing against a local server as the use case. The token
endpoint is not: the provider hardcodes it. So the redirect leg would go to
the mock and the code exchange would still leave the machine, which fails
`e2e/hermetic-substrate` outright. Making the whole redirect mockable means
substituting a generic OAuth provider for the specific one, which changes what
the provider *is* and contradicts the requirement that sign-in be through that
provider specifically. Rejected.

**Substitute the ID-token verification step.** The provider exposes a hook for
verifying an ID token, and the sign-in path that accepts one calls exactly:
verify the token, read the profile out of it, then the platform's ordinary
account resolution, linking policy, session issuance and cookie placement.
Overriding the hook replaces one thing — *whose published material the
assertion's signature is checked against* — and leaves the rest as the code
under test. It is a first-class option on the provider rather than a patch,
and the profile step needs no override at all, since its default reads the
already-verified token. Adopted.

**If reversed:** any of the alternatives either stops the harness being
hermetic or stops it testing sign-in, and the second failure is silent — the
suite still goes green while the sign-in path has never run.

### 3. The substitution is enabled by configuration, and absent by default

The seam is a signature check against material the harness holds. Left always
on, it is a second credential path into every deployment. Gated on
configuration that no real environment sets, the production path is what runs
when nothing has been touched, and enabling it is a positive act visible in a
deployment's own configuration.

Default-off rather than default-on-and-disabled-in-production is the whole
point: a thing that must be remembered to be switched off is eventually
deployed switched on. This is what
`e2e/substituted-identity-verification#absence-of-configuration-is-production-behaviour`
pins, and it is the clearest instance of constraint-mining in this change —
the decision's quality rests entirely on an invariant a future implementer
could quietly invert while every test still passed.

### 4. The harness is a workspace member under `apps/`, not `packages/`

The deciding fact is mechanical rather than taxonomic. Root project discovery
globs `packages/*` for test projects and does not glob `apps/*` at all, which
is why the two existing applications are invoked as explicit filtered runs
afterwards. A harness under `packages/` would therefore be pulled into the
fast battery automatically the moment it had a test config, and the only way
to prevent it would be to misname that config so the glob misses it — a trap
laid for the next reader. Under `apps/` it is invisible to discovery and runs
only when asked for, which is the behaviour wanted and the precedent already
set.

Two supporting facts point the same way. The root composite build's references
are hand-listed and all under `packages/`, existing so consumers can resolve a
package's built output; the harness is a leaf that nothing imports and that
publishes nothing. And `apps/` does not mean "product" here — the visual
tester is a development tool explicitly outside every player- and
operator-facing surface, and it lives there. The working distinction is
"top-level runnable thing" against "library consumed through its build
output", and a harness is the former.

**If reversed:** the fast battery acquires a multi-process suite, which is the
outcome the tier split exists to prevent.

### 5. No requirement states where the suite runs

Tempting, and wrong. Which gate invokes the harness, how long the fast battery
is allowed to take, and whether the suite blocks a merge are properties of the
project's tooling rather than of the system's behaviour, and they will
legitimately change several times. They fail admission prong (c): getting them
wrong makes the project slower or noisier, not a passing run less meaningful.
They are recorded here and enforced by the tooling itself.

The one place this leaves a soft edge is the discovery glob in decision 4 — a
future contributor could add the harness to it and quietly reintroduce the
problem. That is addressed where it can actually be seen, by a comment at the
glob and a note in the member's own agent context, rather than by a
requirement the tooling would not consult.

## Constraint-mining

Each decision, against the test *does its quality depend on an invariant a
future implementer could silently violate?*

- **1 (real runtimes)** — yes: a substitute introduced later would be locally
  reasonable and invisible in the result. Minted as
  `e2e/hermetic-substrate#real-runtimes-not-doubles`, with
  `#no-external-service-reached` covering the same failure arriving as a
  dependency on something off-machine, and
  `#teardown-does-not-leak-into-the-next-run` covering the flakiness that
  makes a suite stop being believed.
- **2 (verification only)** — yes: a later shortcut that assembles a session
  directly would pass every existing test. Minted as
  `#only-verification-is-substituted`.
- **3 (default off)** — yes, and most sharply. Minted as
  `#absence-of-configuration-is-production-behaviour`; and because a test
  identity is the obvious place to quietly grant a privilege that makes a
  scenario easier to write, `#substituted-subjects-carry-no-privilege`.
- **4 (placement)** — no. Violating it costs wall-clock, not meaning. Handled
  by a comment at the glob it turns on.
- **5 (tiering)** — no, by construction.

Separately, driving surfaces through a real browser is a fidelity property of
the same kind as decision 1 and is minted alongside it as
`e2e/browser-exercised-surfaces`, with the two-session scenario carried
because a property that only holds under divided attention cannot be observed
through a single session — and a harness that quietly checks such a property
with one session reports a pass it did not earn.

## Open Questions

None outstanding.
