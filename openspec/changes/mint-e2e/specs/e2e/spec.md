## Purpose

What the end-to-end harness must be in order for a passing run to mean the
system works: every runtime a real one the harness starts and stops itself,
nothing outside the machine required, a human's session established through
the platform's own sign-in with only its external verification step
substituted, and any surface a human operates exercised through a real
browser. This capability owns the harness's fidelity to the deployed system —
never what any individual test asserts, which belongs to the capability whose
behaviour that test checks.

Admission test — a requirement belongs in this capability iff all three hold:
**(a)** it constrains the harness itself, not any behaviour the harness
observes; **(b)** it reads identically whichever scenario is running, and for
a harness running none; **(c)** violating it makes every passing run mean less
than it appears to, rather than making one particular test wrong. Anything
failing (a) belongs to the capability that owns the behaviour; anything
failing (b) is a test, not a property of the harness; anything failing (c) is
a defect rather than a broken invariant.

Depends on: global-invariants, identity-and-authorization.

## ADDED Requirements

### Requirement: e2e/hermetic-substrate
Depends on: global-invariants/runtime-ownership.

The harness SHALL bring up each kind of runtime the platform deploys as a real instance of that runtime, started and stopped by the harness itself on the machine running the tests, and SHALL require no service outside that machine. A runtime SHALL NOT be replaced by a substitute that implements its interface, because the defects this harness exists to catch are the ones that live between the runtimes rather than inside any one of them.

#### Scenario: #no-external-service-reached
- **WHEN** the harness runs on a machine with no route off it, having already acquired its own executables
- **THEN** every test that passed with a route still passes — a run's verdict depends on the code in the tree and on nothing that could be reconfigured, rate-limited, or taken offline elsewhere

#### Scenario: #real-runtimes-not-doubles
- **WHEN** a test needs a runtime the platform deploys
- **THEN** it gets that runtime, running the same artifact a deployment runs, and never an in-process substitute — a substitute agrees with its author's belief about the runtime, which is exactly the belief under test

#### Scenario: #teardown-does-not-leak-into-the-next-run
- **WHEN** a run ends, whether it passed, failed, or was interrupted
- **THEN** it leaves behind no process holding a port and no state that would change a later run's verdict, so a failure is reproducible and a pass is not an inheritance

### Requirement: e2e/substituted-identity-verification
Depends on: identity-and-authorization/google-sign-in, identity-and-authorization/linked-provider-credentials, global-invariants/no-shared-secrets.

The harness SHALL establish a signed-in human by presenting the platform an identity assertion the platform verifies against public material the harness controls, substituting that verification step alone and leaving every other step of establishing the session — resolving the account, applying the linking policy, issuing the session, and placing it in the client's custody — to the platform's ordinary path. The substitution SHALL be inert unless a deployment is explicitly configured for it, and a deployment that is not so configured SHALL verify exactly as it does in production.

#### Scenario: #absence-of-configuration-is-production-behaviour
- **WHEN** a deployment carries no configuration enabling the substitution
- **THEN** an assertion the harness signed is refused exactly as any other unverifiable one is — the production path is what runs when nothing has been switched on, rather than something a deployment must remember to switch off

#### Scenario: #only-verification-is-substituted
- **WHEN** a harness-authenticated human acts against the platform
- **THEN** the account they act as was created and linked by the platform's own rules under its own policy, and the session they hold was issued and stored by the platform's own mechanism — a test that passes because the harness assembled a session by hand proves nothing about signing in

#### Scenario: #substituted-subjects-carry-no-privilege
- **WHEN** a human established this way is authorized for anything
- **THEN** the decision reads their identity exactly as it reads any other human's — the substitution settles who someone is, never what they may do

### Requirement: e2e/browser-exercised-surfaces
Depends on: global-invariants/one-contract-many-surfaces, global-invariants/client-truthfulness.

Where a requirement is about what a human sees or may do, the harness SHALL exercise it by driving a real browser against the running application, acting as that human's own client rather than calling past it. Where a scenario is about two or more humans acting at once, each SHALL be driven as a separate browser session with its own identity, because a property that only holds when attention is divided cannot be observed through one.

#### Scenario: #driven-as-the-human-not-past-them
- **WHEN** the harness checks an affordance a human is or is not offered
- **THEN** it reads what the browser renders and acts through it, never by calling the underlying contract directly — an affordance wrongly enabled is invisible to a test that never looked at the affordance

#### Scenario: #concurrent-operators-are-concurrent-sessions
- **WHEN** a scenario turns on two humans acting at the same time
- **THEN** two independent browser sessions under two identities are live at once, so exclusivity and contention are exercised rather than assumed
