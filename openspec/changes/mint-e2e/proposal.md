# mint-e2e — Proposal

This is a mint change: ADDED-only, no seed/edit pair. It carries one delta —
the new capability — and is self-contained.

## Why

No check anywhere runs two of the platform's runtimes at the same time.
`pnpm verify` is lint, typecheck, unit tests, `smoke` and `spec:check`; of
these only `smoke` starts a process, and it starts one application's dev
server and fetches two paths from it. Every defect that lives *between* two
runtimes is therefore invisible to the whole battery, and the corpus has no
capability that could state otherwise, because a harness is not a behaviour
any user story owns.

That gap is not hypothetical. Publishing the SpacetimeDB module fails outright
— the module carries a top-level export the runtime rejects — while all five
CI jobs stay green, because publishing the module is in no gate. The failure
is exactly the shape this capability exists to catch: not wrong logic inside a
runtime, but an artifact that never reaches the runtime it was written for.

Three facts about such a harness need to be binding before one is built,
because each is cheap to honour at the start and expensive to retrofit once
tests depend on the alternative:

1. **Fidelity.** A harness that substitutes an in-process double for a runtime
   tests its author's model of that runtime. The substitutions are always
   locally reasonable and the loss is invisible in the result.
2. **How a human is signed in.** Sign-in is through one external identity
   provider, deliberately and exclusively. A harness must sign in without it,
   and the tempting shortcuts — assembling a session by hand, or enabling a
   second credential path — either skip the code under test or weaken the
   property the exclusivity exists to hold.
3. **What "a human did this" means in a test.** A property about an affordance
   a human is offered is not observed by calling the contract behind it.

## Carving decision

Mint **`e2e`** — a capability owning what the harness must *be*, never what
any test asserts.

Bounded by a three-prong admission test carried in its Purpose, whose prong
(b) counterfactual is **would this read identically for a harness running no
scenarios at all?** That prong is what stops the capability from accumulating
the assertions themselves: every statement about what the platform does under
test belongs to the capability that owns the behaviour, and arrives as that
capability's own requirement.

Precedent for a dev-tool capability that is not a product surface is
`visual-tester`, which is explicitly outside every player- and
operator-facing surface and is nonetheless a capability, for the same reason
this one is: the tool makes claims about the system, and the claims are only
worth what the tool's own construction guarantees.

Declared dependencies: **global-invariants** and
**identity-and-authorization**.

## What Changes

- **New capability `e2e`** (mint delta, ADDED-only, 3 requirements), all new:
  `hermetic-substrate`, `substituted-identity-verification`,
  `browser-exercised-surfaces`.
- **No existing requirement is touched.** The identity substitution imposes an
  obligation discharged in the deployment's sign-in configuration, and it is
  authored here rather than there because the fact it understands — that a
  harness must authenticate without the provider — is this capability's, not
  the identity story's. The dependency is declared in that direction and the
  obligation is not restated on the other side.

## Changes outside this folder

None. The capability stands alone, and the code it constrains arrives as this
change's implementation.

## Impact

- A new workspace member holding the harness, invoked explicitly and outside
  the fast battery.
- One configuration-gated seam in the deployment's sign-in path, inert unless
  switched on.
- A gate for publishing the SpacetimeDB module, which currently has none.
