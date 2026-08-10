# Evaluating Australian Hosting for the Platform

**Status:** Evaluation and deployment plan. Mostly analysis — with one
recorded author decision (§6.7) that **does** require a spec change, which this
document scopes but does not make.
**Date:** 2026-08-09
**Occasioned by:** an externally-authored proposal, *Fly.io Hosting Architecture:
Convex + Ephemeral SpacetimeDB*, written without access to this repository.

This document evaluates what it would take to host the platform's own
runtimes in Australia, assesses that proposal against the binding spec, and
recommends a shape. It is written for a reader who has neither the proposal
nor the conversation that produced it.

---

## 1. What the platform actually has to host

Three runtime kinds (`global-invariants/runtime-ownership`), with very
different hosting consequences:

| Runtime | Who hosts it | Australian hosting is… |
|---|---|---|
| Convex deployment (exactly one, `global-invariants/single-convex-deployment`) | Cyphid | **The whole problem.** See §3. |
| SpacetimeDB host (self-hosted, per-game databases) | Cyphid | Already self-hosted by design. Region is a config line. |
| Snek Centaur Servers | **Each team, on domains they nominate** (`02-REQ-005`) | **Not controllable.** See §7. |

Only the first two are Cyphid's to place. That asymmetry is the single most
important fact in this evaluation and it is absent from the proposal.

**Load.** 2–40 concurrent games, 5–15 minutes each, within a ~2-hour session,
roughly weekly. That is a very small workload. Any sizing conclusion that
implies otherwise should be re-derived.

---

## 2. Where the proposal diverges from the binding spec

The proposal's §4–§6 — one Fly Machine per game running its own SpacetimeDB,
a stateless `fly-replay` router, HMAC join tokens, app sharding to beat the
Machines API create-rate limit, a reaper cron for orphaned Machines — rests on
a premise the spec does not hold.

### 2.1 A per-game SpacetimeDB *instance* is a database, not a machine

`global-invariants/spacetimedb-instance-isolation`, scenario
`#a-compromised-server-cannot-cross-games`, says it outright:

> the instances are separate SpacetimeDB **databases** sharing no state

The provisioning path in `05-REQ-032` step 3 is a single
`POST /v1/database` to *one* self-hosted host, carrying the pre-compiled WASM
module binary. One host, many per-game databases, isolation at the database
boundary. SpacetimeDB's own model matches: a host is a server that hosts
databases, and many databases run on one host.

Everything the proposal builds in §4–§6 exists to place, address, and reap
one machine per game. The spec needs none of it. There is no router because
there is one host address; no join token because connection authorisation is
already an OIDC-validated RS256 JWT with `aud: gameId`
(`03-REQ-039`, `global-invariants/issuer-anchored-trust`); no create-rate
sharding because creating a database is not creating a VM; no reaper because
teardown is a management-API call already specified (`02-REQ-021`).

### 2.2 The per-machine design has a licensing problem the single-host design does not

SpacetimeDB is BSL 1.1. The Additional Use Grant, verbatim:

> You may make use of the Licensed Work provided your application or service
> uses the Licensed Work with no more than **one SpacetimeDB instance in
> production** and provided that you do not use the Licensed Work for a
> Database Service.

(Change Date 2031-08-02; Change License AGPL v3.0 with a linking exception.)

One host running many databases is one instance, and the platform is not a
Database Service — third parties never control table schemas; the WASM module
is Cyphid's. The spec's design sits inside the grant.

Forty Fly Machines each running `spacetimedb` is forty production instances.
That reading needs written confirmation from Clockwork Labs, or a commercial
licence, before anyone writes the orchestrator. This is not a style
objection — it is a prerequisite the proposal does not mention.

### 2.3 The HMAC join token conflicts with a global invariant

`global-invariants/no-shared-secrets` forbids exactly what the proposal's
§5.3 proposes:

> No symmetric key, client secret, or long-lived bearer key SHALL be
> generated, stored, transmitted, or seeded anywhere to authenticate a party
> in that chain.

A shared HMAC secret held by both `convex-backend` and `stdb-router` to
authenticate routing within the platform's own trust chain is a symmetric
credential inside the chain. The proposal's own open decision #3 asks whether
Ed25519 is "worth it"; the spec answered that question already, and the answer
is not optional.

The same invariant disposes of a static warm-up token, and it is worth being
precise about why, because the legacy corpus reads the other way.
`04-REQ-072` permitted "a lightweight static-token check", and
`docs/external-setup.md` still instructs an operator to provision a
`STDB_WARMUP_TOKEN` shared secret. **Module 04 is migrated**, so that text is
no longer binding — the archive binds only unmigrated modules — and the
migration dropped the mechanism. What survives is `game-lifecycle/host-warm-up`:

> SHALL NOT require a credential carrying provisioning authority — a
> lightweight check sufficient to deter casual abuse suffices

That bounds the credential's *ceiling*, not its cryptography, and
`migrate-game-lifecycle`'s design record is explicit that the allowance is a
boundary judgement against `global-invariants/authenticated-unambiguous-identity`
— the signal sits outside the mutation surface that invariant governs. Nothing
relaxes `no-shared-secrets`, which is unconditional and names a game's
SpacetimeDB instance among the parties it binds. So the light check is
asymmetric like everything else: a credential from the trusted issuer, verified
against published material, simply not one carrying provisioning capability.
That is `issuer-anchored-trust#ceiling-is-checked-at-the-resource` applied to a
host whose worst abuse is being woken up.

**Repo defect, unrelated to hosting:** `docs/external-setup.md` §"SpacetimeDB on
Fly.io" still documents `STDB_WARMUP_TOKEN` as a shared secret. That is stale
pre-migration guidance and contradicts the binding corpus regardless of which
hosting target is chosen. It should be corrected when that section is rewritten
(§5.4).

### 2.4 It sizes the wrong workload

The proposal benchmarks and prices SpacetimeDB game machines. Turn resolution
is one `resolveTurn` call per turn over a small grid — arithmetically trivial.
The expensive computation on this platform is **Centaur bot compute**: anytime
game-tree search per snake per turn under a chess timer (`07`). That runs on
Snek Centaur Servers, which the proposal never mentions and Cyphid does not
control. Any capacity plan that omits it is planning the cheap half.

### 2.5 What the proposal gets right

Its §3 is the valuable part and is broadly sound:

- Convex self-hosting is genuinely required for Australian residency (§3 below).
- The single-writer constraint is real: never `scale count 2`, no rolling or
  blue-green deploy, generous `kill_timeout`.
- `auto_stop_machines` genuinely will not stop a backend that clients hold
  WebSockets to, so proxy-driven scale-to-zero is the wrong mechanism.
- Forward-only migrations mean a volume snapshot is the only rollback.
- The scheduled-function burst-on-wake hazard is a real trap of stopping a
  Convex backend on a timer, and auditing installed components' internal crons
  before enabling it is correct.
- Pinning the image by digest rather than a tag, and keeping backend and
  dashboard versions identical, are right.

These points survive independently of Fly and should be carried into whatever
is built.

---

## 3. Convex is the actual problem

Convex Cloud deploys to **US East (N. Virginia)** or **EU West (Ireland)**
only. Region is chosen at project creation and cannot be changed afterwards.
There is no Australian region, and no announced date for one.

So: *any* Australian-residency requirement forces self-hosting the Convex
backend. That is the decision. Everything else is comparatively easy.

**What that buys and costs.** The backend is open source under FSL-1.1-Apache-2.0
(converting to Apache-2.0 two years after each commit); self-hosting your own
application is squarely permitted — the carve-out is only against building a
competitor to Convex Cloud. It runs as a Docker image over SQLite, Postgres, or
MySQL, with local-filesystem or S3-compatible file storage, and the dashboard
and CLI are open-sourced alongside it. The spec's Convex dependencies — HTTP
actions serving OIDC discovery at `CONVEX_SITE_URL` (`05-REQ-034a`), Convex
Auth with Google (`03-REQ-007`), file storage for the WASM binary
(`05-REQ-073`), Components for the two subsystem packages, scheduled functions
for the warm-up dispatch — are all backend features rather than Cloud-only
services.

What is genuinely lost is the managed relationship: no SLA, no security
advisory stream, no support channel beyond a Discord room, forward-only
migrations, and an upstream release cadence that publishes raw git SHAs rather
than semver. Self-hosting converts Convex from a vendor into a system Cyphid
operates. For a small educational program that is a real, recurring cost, and
it should be accepted deliberately rather than as a side-effect of a
residency preference.

---

## 4. Residency, sovereignty, and the thing that probably actually matters

These are three different requirements and the proposal collapses them into
open decision #7.

1. **Data residency** — bytes sit in Australia. Fly `syd`, AWS
   `ap-southeast-2/4`, GCP `australia-southeast1/2`, Azure Australia East all
   deliver this. All are US-owned.
2. **Sovereignty** — no foreign jurisdiction can compel disclosure. Requires
   an Australian-owned and -operated provider. Fly cannot deliver it; it is a
   US company and subject to the CLOUD Act regardless of where the machine sits.
3. **Regulatory fitness** — the obligations that actually attach to handling
   Australian children's personal information.

**(3) does not point at hosting at all.** This was checked against the
primary source rather than commentary: the exposure draft of the
**Privacy (Children's Online Privacy) Code 2026** (OAIC, 31 March 2026;
consultation closed 5 June 2026; to be registered by 10 December 2026)
contains **no data localisation requirement and no restriction on overseas
hosting or overseas service providers**. Across all 27 pages the words
"localis", "offshore", "outside Australia" and "residency" do not appear.

Its only cross-border provision is s26, *Consent to cross-border
disclosures*, and it does not restrict anything. It regulates *how a child
is informed* when an entity relies on APP 8.2(b)(i) — the express-consent
route that switches **off** the APP 8.1 protections. The effect is to make
consent a worse way to escape accountability for children's data, which
leaves ordinary APP 8.1 compliance (contractual reasonable steps over the
overseas recipient) as the sensible path. s28(5)(b) adds a documentation
duty: a response to an information request must explain the APP 8.1 steps
taken if the child's information went to an overseas recipient. That is the
whole of it.

APP 8 itself is an **accountability** rule, not a prohibition — and OAIC
guidance is that supplying personal information to an overseas cloud provider
purely to store it, where the entity keeps it under its effective control and
the provider cannot use it for its own purposes, can be a *use* rather than a
*disclosure*, in which case APP 8 does not engage. This is the ordinary
footing on which Australian organisations use US cloud services.

So: **using US IT services is permitted, and nothing in the coming children's
privacy law changes that.** Hosting location is a latency, cost, operations
and positioning decision. It is not a compliance decision, and an earlier
draft of this document was wrong to imply the Code put a deadline on it. The
Code's real obligations are dated and substantial, but they land on identity,
consent and retention — see §4a.

*(Not legal advice. Whether Cyphid is an APP entity at all is the threshold
question — see §4a.)*

**The uncomfortable observation.** Under any of the three framings, server
location is not the largest exposure. Identity is Google OAuth
(`03-REQ-007`): every child's authentication round-trips to a US provider,
and their Google account identifier is the external credential the platform
resolves against. Moving compute to Melbourne while authenticating children
through Google changes the residency story and barely touches the sovereignty
one. If the goal is a defensible position on children's data, the identity
provider deserves at least as much scrutiny as the hosting region — and it is
a much harder thing to change later, because `03` is built around Convex Auth
with the Google provider and `global-invariants/durable-identity-references`
already anticipates provider change only at the resolution boundary.

That is not an argument against Australian hosting. It is an argument for
being precise about what Australian hosting is being bought to achieve, so
the answer to a parent's question is accurate.

---

## 4a. What the children's privacy law will actually require

Recorded here because the hosting question surfaced it, not because it is a
hosting matter. **Not legal advice** — this is a reading of the exposure
draft, to scope engineering work and to know what to take to a lawyer.

### The threshold question comes first

The Code binds **APP entities**. The small business exemption — annual
turnover of A$3 million or less — remains in force as at mid-2026; its removal
is signalled for a future reform tranche but has not been legislated. If
Cyphid is under the threshold and none of the exemption's carve-outs apply
(health services, trading in personal information, Commonwealth contracted
services, being related to a larger business, or opting in voluntarily), the
Privacy Act and therefore this Code do not bind it today.

Two reasons not to stop there. The exemption's removal is a matter of when,
not whether. And selling into schools imports obligations by **contract**
regardless of the Act — a state education department's procurement terms are
their own regime, and are the most likely place an actual data-residency
requirement would come from, since the Code contains none.

### If it applies, the coverage test is met comfortably

s5 and s7: the Code reaches a social media service, relevant electronic
service or designated internet service that is *"likely to be accessed by
children"* or *"primarily concerned with the activities of children."* A game
built for gifted children is the second limb without argument. There is no
scale threshold in the coverage test — only the Act's own entity threshold
above.

### The obligations that cost engineering

- **s8 age assurance** — reasonable steps to ascertain age before collecting,
  proportionate to risk of harm. There is an escape hatch worth taking:
  applying the Code's protections to *all* end-users removes the need to
  ascertain age at all. For a platform whose users are children by design,
  that is almost certainly cheaper and better than building age assurance.
- **s9 privacy by default** — technical and organisational measures so that
  by default only strictly-necessary personal information is collected, with
  child-accessible controls over anything beyond that.
- **s10, s11 best interests of the child** — a substantive test gating
  collection, and separately gating use and disclosure.
- **s13 consent** — a child may self-consent only at **15 or over**. Under 15
  requires consent from a person with parental responsibility, *reasonable
  steps to confirm that person actually has parental responsibility*, and an
  age-appropriate notice to the child covering purpose, duration, consequences
  and withdrawal. s20 adds the child's own "assent" in some circumstances.
- **s14–s19, s21 consent quality** — voluntary, informed, current, specific,
  unambiguous; no pre-ticked boxes or consent deemed from continued use; no
  coercive patterns.
- **s23–s25, s27–s29 transparency and access** — age-appropriate policy and
  collection notices, documented periodic review, access and
  information-about-handling requests answered within 30 days, direct
  marketing opt-out.
- **s32 destruction on request** — a child, or a parent of a child under 15,
  may require destruction of specified personal information, subject to
  narrow exceptions (legal proceedings, other law, enforcement, serious
  threat to life or safety).

### Where this collides with the architecture

**s32 versus the replay model, and it is a real collision.**
`02-REQ-065` and the `replay-and-audit` capability make every Centaur Team's
within-turn actions — action log entries, stateMap snapshots — visible to
*every authenticated user* for *every finished game*, permanently. That is a
deliberately public, permanently retained, cross-referenced record of what
identified children did. A parental destruction request under s32 lands
directly on it, and neither the legacy corpus nor the migrated capability has
an answer.

`global-invariants/durable-identity-references` is what makes the answer
tractable, and it is worth noticing early: every identity in a replay is
recorded as the platform's own durable identifier, never an email or a
provider subject. So destruction can be satisfied by severing the resolution
from platform identifier to person — the replay corpus stays intact as a
pedagogical and competitive record, while ceasing to be personal information
about an identifiable child. Designing for that now costs a schema decision.
Retrofitting it costs a rewrite of every artifact that names a player.

**s9 versus the action log.** The Centaur action log exists to record what
operators did, for replay and for teaching. That is data about children,
retained and shown to everyone, and "strictly necessary to provide the
service" is a test it must actually be argued to pass rather than assumed to.
The argument is available — the log *is* the pedagogical artifact the platform
exists to produce — but it should be written down under s10/s11's best-interests
framing before someone has to make it under pressure.

### The other regime, which may matter more

The **Online Safety Act** is separate from privacy and is where a children's
multiplayer game draws the most regulator attention. The under-16 social media
minimum age (in force 10 December 2025) excludes services whose sole or
primary purpose is online gaming, so Team Snek is very likely outside it.
That is not the end of it: eSafety has instead used legally enforceable
transparency notices against gaming services — Roblox, Minecraft, Fortnite,
Steam — on grooming, cyberbullying and related harms, and the Basic Online
Safety Expectations and industry codes continue to apply. The exposure there
scales with any **user-to-user communication** the platform carries. Team
coordination, room lobbies, team and player profiles are the surfaces to look
at, and that assessment is not made anywhere in the corpus.

---

## 5. Recommendation

### 5.1 Fly.io, scaled to zero — the duty cycle settles it

Sessions run about two hours a week, growing to several. That is roughly
**1–2% duty cycle**. An always-on instance bills 730 hours a month to deliver
ten, and forces the machine to be sized small precisely because it is paid for
around the clock. An earlier draft of this document recommended one always-on
VM; on the arithmetic that is the wrong shape, and the objection that
overturned it is worth recording, because it inverts the usual sizing
instinct.

Fly bills Machines **per second**, and a stopped Machine costs nothing for
compute or RAM — only its rootfs (about $0.15/GB per 30 days) and any volume
($0.15/GB/month, billed whether or not the Machine is running). So with
scale-to-zero the session machine's *size* nearly stops mattering to the bill.
Against roughly 12 billed hours a month:

| Session machine | ≈ hourly | ≈ monthly at ~12h |
|---|---|---|
| `performance-1x` / 2GB | $0.045 | **~$0.54** |
| `performance-2x` / 4GB | $0.089 | **~$1.07** |
| `performance-4x` / 8GB | $0.178 | **~$2.14** |
| `performance-8x` / 16GB | $0.356 | **~$4.27** |

(Base-region rates; `syd` sits above these under the regional pricing rollout,
but the ratio is what matters.)

A `performance-8x` running only during sessions costs a **fraction** of an
always-on `shared-cpu-2x`, which the proposal itself priced at $21–40/month.
The fixed floor is the volume plus stopped rootfs — on the order of **$5–6 a
month** for both platform machines. So the rule is: **size for the peak, pay
for the hours.** That is a strictly better deal than any always-on box, and it
gets better as Cyphid adds sessions, because the bill tracks use instead of
the calendar.

This also means the earlier "provider-agnostic Compose stack" framing was too
strong. Scale-to-zero with an API to start, stop and resize a stateful machine
holding a volume is exactly the primitive this workload wants, and Fly Machines
is a very good implementation of it. Keep it.

### 5.2 What can actually burst, and what cannot

The one thing to be clear-eyed about: of the three platform-owned runtimes,
**two cannot scale horizontally at all**, and neither limit is Fly's.

- **Convex** is single-writer by construction, and
  `global-invariants/single-convex-deployment` makes exactly one deployment
  load-bearing for cross-record transactional invariants. Never two.
- **SpacetimeDB** is capped by its own licence: the BSL Additional Use Grant
  permits *"no more than one SpacetimeDB instance in production"* (§2.2). A
  second host is a commercial-licensing conversation, not a config change.

For both, "scale high in a burst" means **a bigger machine for the session** —
which scale-to-zero makes nearly free, and which is why the two facts fit
together well. It is a real ceiling, not an unlimited one, and the ceiling on
SpacetimeDB is contractual before it is technical.

It is also worth noting how much headroom is there: 40 concurrent games of a
small grid, resolving a turn every few seconds, is a trivial load for a
database built for MMO-scale simulation. The game workload is not what will
stress a host.

**The genuinely horizontal workload is Centaur bot compute.** Anytime
game-tree search, per snake, per turn, under a chess timer, in an isolated
context per hosted team (`global-invariants/bot-compute-view-confinement`) —
embarrassingly parallel, and the only part of the platform whose cost rises
steeply with concurrent games. On the reference deployment at
`snek-centaur.cyphid.org`, that is Cyphid's to run and to scale.

So the proposal's orchestration instinct was sound and simply pointed at the
wrong runtime. **If a Machines-API fleet is built anywhere, build it for bot
compute, not for games.** That is where per-unit lifecycle, placement retry
and a reaper actually earn their complexity — and where a machine-per-tenant
model raises no licensing question at all.

### 5.3 The shape

| App | Machines | Lifecycle |
|---|---|---|
| Convex backend | 1 + volume, sized for session peak | scheduled stop; `auto_start_machines` on request |
| SpacetimeDB host | 1, sized for session peak | scale-to-zero; woken by `game-lifecycle/host-warm-up` |
| Reference Centaur Server | static serving + bot compute | the fleet, if any, goes here (§5.2) |

Per-game **databases** on the one SpacetimeDB host, per `05-REQ-032` step 3 —
not per-game machines (§2.1, §2.2). No replay router, no join token, no app
sharding, no orphan reaper: those exist only to serve a machine-per-game model
the spec does not use.

Carry the proposal's §3 hazards, which are all real and all still apply:
`auto_stop_machines` cannot stop a Convex backend that browser clients hold
WebSockets to, so the stop must be externally scheduled; audit every installed
component's internal crons before enabling a scheduled stop, or overdue jobs
fire as a burst on wake; in-flight actions are lost on stop while mutations are
safe; pin the image by digest and keep backend and dashboard versions
identical; and a volume snapshot is the only rollback from a forward-only
migration.

Evaluate `auto_stop_machines = "suspend"` against plain `stop` for the
SpacetimeDB host — suspend resumes faster, which is squarely what the warm-up
budget cares about, though it carries caveats worth reading before relying on
it for a stateful process across a week-long idle gap.

### 5.4 Consequences for the spec — the warm-up is load-bearing after all

An earlier draft of this document said an always-on host would make
`game-lifecycle/host-warm-up` a trivial no-op. With scale-to-zero it is the
opposite: it is **load-bearing**, and it was authored for precisely this
hosting model. `04-REVIEW-022` and `05-REVIEW-019` adopted scale-to-zero
deliberately and added the warm-up signal to keep the cold start off the
game-launch critical path, with the dispatch firing on game-**configuration**
creation so the host wakes while captains are still setting up. The corpus was
already shaped for this. The always-on suggestion was fighting it.

Still no spec change needed — but now because the spec anticipated this, not
because the requirement was inert.

`docs/external-setup.md` §"SpacetimeDB on Fly.io" is the one artifact that
does need work. Its hosting model is right and can stay; its TODO list is
precisely the set of decisions above; and its `STDB_WARMUP_TOKEN` shared
secret must go, being stale pre-migration guidance that contradicts
`global-invariants/no-shared-secrets` (§2.3).

One operational gap the spec deliberately does not fill: the warm-up is
best-effort by construction, and `#warm-up-never-blocks-creation` means a
failed wake is silent to the acting user. That is correct for latency
amortisation and wrong as a readiness guarantee. A session where the host
fails to resume with forty children waiting is the failure that matters, so
run a **human-visible pre-session readiness check** — a separate thing from
the warm-up, outside the spec's scope, belonging in an operational runbook.

### 5.5 What to verify before committing

1. **Written confirmation from Clockwork Labs** that one self-hosted host
   running dozens of concurrent per-game databases is one "instance" under the
   BSL Additional Use Grant. The whole provisioning design depends on this
   reading, and §5.2's ceiling depends on it too. (§2.2)
2. **A benchmark of Centaur bot compute**, not of SpacetimeDB. It sizes the
   session machine, and it is the only thing that decides whether §5.2's fleet
   is ever needed. (§2.4)
3. **Cold-start and resume timings measured in `syd`**, for both machines,
   against the ten-second warm-up budget the spec commits to.
4. **Convex self-hosted upgrade rehearsal** — snapshot, upgrade across several
   intermediate revisions, restore — before any real data exists. Forward-only
   migrations mean the rehearsal is the only thing that establishes the
   rollback works. (§3) *Only reached if Australian residency is chosen;
   Convex Cloud remains available otherwise (§4).*

Not on this list, because it is not a hosting prerequisite: legal advice on
APP entity status and the Children's Online Privacy Code. That work is real
and dated, and §4a scopes it — but it gates identity, consent and retention
design, not where the machines run. Do not let it hold up a hosting decision,
and do not let a hosting decision stand in for having done it.

---

## 6. Deployment plan: two Convex variants over one scale-to-zero host

Both variants share the SpacetimeDB side. They differ in where Convex runs,
and that difference propagates into networking, security, and — most
sharply — into whether the scale-to-zero logic can rely on Convex being
awake.

### 6.1 What the spec already settles, and the one thing it does not

Per-**instance** lifecycle is specified end to end, and the plan below must not
reinvent it:

- `game-lifecycle/teardown-after-persistence` — an instance is never torn down
  before Convex confirms the record is persisted; once confirmed, teardown is
  immediate and is **exclusively Convex's act**. Instances have no
  self-teardown (`#no-self-teardown`). The proposal's `auto_destroy` and reaper
  cron are not merely unnecessary — self-destruction is forbidden.
- `game-lifecycle/finish-notification` — bounded delivery retries, and the push
  is explicitly *not* the only path to `finished`.
- `game-lifecycle/stale-game-recovery` — a recurring sweep finds records stuck
  at `playing` past the longest game the configured clocks and turn limit could
  produce, probes for a live instance, retrieves the record or finishes with an
  error outcome, and reclaims the residue either way.
- `game-lifecycle/no-orphans` — a failed launch tears down what it provisioned.

What is **not** specified is the **host's** own lifecycle. The corpus has
`game-lifecycle/host-warm-up` for waking it and no counterpart for putting it
to sleep — correctly, since that is hosting mechanism rather than platform
behaviour. So the stop rule has to be designed. It is derivable rather than
invented:

> **The host is quiescent when no game record is `playing` and no instance is
> awaiting teardown.** Both facts are Convex's own, by
> `game-lifecycle/status-authority` and `teardown-after-persistence`.

An **abandoned** database (§6.7) is deliberately *not* awaiting teardown: it is
closed to connections and sits inert on the volume pending manual
investigation, so it must never hold the host awake. That distinction is why
quiescence is defined against teardown-pending rather than against "no
databases exist" — and note it cuts only one way, since a closed database is
also no reason to stop a host still serving other games.

Stop on quiescence plus a cooldown. Never on anything else.

### 6.2 Do not let the Fly proxy decide

`auto_stop_machines` is the wrong instrument for the SpacetimeDB host, and it
fails in **both** directions:

- **Too sticky.** The proxy stops on excess capacity judged from connection
  load. Players hold WebSocket subscriptions; one browser tab left open after a
  session pins the host indefinitely. This is the same trap the proposal
  correctly identified for the Convex backend, and it applies here for the same
  reason.
- **Too eager.** A live game whose players all briefly drop — a flaky school
  network, a between-turns lull — can present as excess capacity. Stopping a
  host mid-game destroys it, and it also breaks chess-timer continuity, because
  the clock's wall-clock reference does not survive the gap.

So: `auto_stop_machines = "off"` on the host, and keep `auto_start_machines`
on. Autostart is what makes a mistimed stop self-healing — the next
provisioning call wakes the host rather than failing — and it is what
`host-warm-up` rides on.

**Layer the stop:**

| Layer | Actor | Trigger |
|---|---|---|
| Primary | Convex | quiescence (§6.1) + cooldown, via the Fly Machines API |
| Backstop | external scheduler (e.g. a GitHub Actions cron) | host up beyond a session window — covers Convex being asleep or broken |
| Never | Fly proxy `auto_stop_machines` | — |

The backstop is not belt-and-braces padding. In variant B it is load-bearing;
see §6.5.

### 6.3 Networking and security

**The constraint that shapes everything:** SpacetimeDB serves its entire HTTP
surface — `POST /v1/database` (publish), `DELETE /v1/database/:name`,
`POST /v1/database/:name/call/:reducer`, `GET /v1/database/:name/subscribe`,
`/sql`, `/logs` — **on one host and port**. There is no separate management
port to bind privately, so the proposal's "public game port, private deploy
port" split does not map onto the real API.

Worse, and this is the finding that matters most for a publicly reachable
host: **SpacetimeDB is publish-open by default — anyone who can reach it can
create a database on it.** Publishing has no permission gate of its own;
ownership attaches to whichever identity published, so the first caller wins.
The vendor's own guidance is a reverse proxy with a path allowlist, defaulting
to permitting only `/v1/identity` and `^/v1/database/[^/]+/subscribe$` and
denying the rest.

That gives the required split:

| Surface | Paths | Who needs it |
|---|---|---|
| **Public** | `GET /v1/database/:name/subscribe` (WebSocket), `/v1/identity` | players, spectators, Snek Centaur Servers |
| **Private** | `POST /v1/database`, `DELETE /v1/database/:name`, `POST …/call/:reducer`, record retrieval | Convex alone |

**Variant A — managed Convex Cloud.** Convex calls in from the public internet
with no stable egress addresses, so the private surface cannot be closed at the
network layer. Two ways to gate it, and the second is better:

1. Verify the Convex-issued RS256 JWT (`03-REQ-048`) *at the proxy* before
   forwarding management paths — nginx `auth_request` or a JWT-aware proxy.
2. **A small provisioning shim** as its own Fly app: public HTTPS, verifies the
   Convex JWT against Convex's published JWKS, and forwards to SpacetimeDB over
   the private 6PN network. The host then needs **no public route to its
   management surface at all**.

Prefer (2). It keeps verification asymmetric (`global-invariants/no-shared-secrets`),
puts the trust decision in code that can be tested rather than in proxy
configuration, and gives variant A the same private-management posture variant
B gets for free. The shim is an HTTP service, so Fly's own autostart handles
it — it scales to zero alongside everything else.

**Variant B — self-hosted Convex on Fly.** Convex sits inside the same 6PN
network. Bind the management surface to **Flycast (private IPv6) only** and
expose a public service carrying just the subscribe path. There is then no
public route to publish — strictly stronger than an allowlist, because it is
not a rule that can be misconfigured open. This is the one genuinely good idea
in the original proposal's §4.2, applied at host level instead of per game.

**Common to both:**

- **TLS** — Fly managed certificates for `stdb.<domain>`, and in variant B for
  the Convex deployment's own domain.
- **`CONVEX_SITE_URL` must be stable and publicly reachable in both variants**
  — browsers use it, and SpacetimeDB fetches OIDC discovery and JWKS from it
  (§6.4). In variant B that means a real domain on the Convex app, not a
  private address.
- **Volume on the host, and keep it.** The SpacetimeDB data directory holds the
  `[certificate-authority]` keypair as well as the databases; regenerating that
  on every wake would change the host's identity and the ownership semantics
  that gate `DELETE`. A volume is billed while the machine is stopped, but at
  $0.15/GB/month a small one is noise.
- **`kill_signal = "SIGTERM"` and a generous `kill_timeout`** on both stateful
  machines, so the commitlog flushes. Stopping only at quiescence means there
  should be nothing in flight, but the margin is free.
- **Fly API token custody.** Convex needs a token to stop the host. That is a
  third-party secret and is expressly permitted by
  `no-shared-secrets#third-party-protocols-may-require-a-secret` — Fly's API
  admits no asymmetric client authentication, the token authenticates the
  platform outward to Fly alone, and it confers nothing inside the trust chain.
  Scope it to the host app.

### 6.4 The JWKS ordering dependency

SpacetimeDB validates connection tokens by fetching the issuer's
`.well-known/openid-configuration` and then its JWKS — **lazily, on first token
validation rather than at startup**, and cached thereafter. That single
implementation detail creates an ordering constraint the architecture has to
respect:

- **Variant A** — the issuer is `…convex.site`, always up. Non-issue.
- **Variant B** — if the Convex machine is asleep the moment SpacetimeDB first
  validates a token, discovery either cold-starts Convex inside the connection
  path or fails outright.

So **Convex must outlive the host at both ends**:

```
start Convex → warm host → provision → initialize → play
             → persist + teardown → stop host → stop Convex
```

At launch this is satisfied naturally, since Convex mints the tokens and cannot
do so asleep. The rule matters for the cases that are not the happy path: a
host restarted mid-session with a cold JWKS cache, or a maintenance window that
stops Convex first. Make the ordering explicit in the runbook rather than
relying on it falling out.

Worth verifying against a real build: `global-invariants/game-instance-hermeticity`
requires that connection-token validation use key material "obtained at instance
startup, not a per-connection external call." Lazy-fetch-then-cache satisfies
the *per-connection* half but not the *at-startup* half. Whether that matters
in practice — and whether the fetch can be forced at boot — is an
implementation question to answer before it becomes a surprise.

### 6.5 The sharpest interaction: two scale-to-zero systems

In variant B both Convex and the host scale to zero, and they are not
independent. **`stale-game-recovery` is a recurring sweep, and Convex's
scheduled functions do not run while Convex is stopped.** So:

> A game whose finish notification was lost, on a Convex that has since gone to
> sleep, is never recovered — which means its instance is never torn down,
> which means the host never reaches quiescence and never stops.

The failure is silent and it costs money continuously. Three rules contain it:

1. **Convex never stops while any game is not `finished`.** The quiescence test
   that gates the host's stop gates Convex's stop too, one step later.
2. **Drive Convex's stop and start from an external scheduler**, not from
   Convex's own crons. A process cannot reliably schedule its own resurrection,
   and the sweep it owes is exactly what its sleep suppresses.
3. **Require the sweep to have run since the last game finished** before Convex
   may stop — so the recovery path has had at least one chance before the thing
   that runs it goes away.

Variant A has none of this. Convex Cloud is always on, its crons always run,
and `stale-game-recovery` behaves as written. That is variant A's real
advantage, and it is a correctness advantage rather than a convenience one.

### 6.6 Edge-case register

| # | Case | Handling |
|---|---|---|
| 1 | Browser tabs holding WebSockets after a game ends | Explicit quiescence-driven stop, never proxy autostop (§6.2). Deleting the database drains its subscribers. |
| 2 | Stop races a launch | Self-healing: `auto_start_machines` means the provisioning call wakes the host. Add a cooldown past quiescence so the race is rare rather than merely survivable. |
| 3 | Stop while a game is live | Forbidden by the quiescence rule. Also breaks chess-timer wall-clock continuity — a second reason never to stop on connection count. |
| 4 | Abandoned game, no players | `maxGameDurationMs` and the turn limit bound it; `stale-game-recovery`'s bound sits above that. The host's stop simply waits for the sweep. |
| 5 | Self-hosted Convex asleep → sweep never runs | §6.5. The one that turns a lost notification into an unbounded bill. |
| 6 | Convex stopped mid-flight during terminal handling | In-flight actions are lost; mutations are transactional. `#lost-notification-recovered` re-drives it — provided rule 1 of §6.5 holds. |
| 7 | Overdue crons burst on Convex wake | Audit every installed component's internal crons before enabling a scheduled stop (proposal §3.4). |
| 8 | Record retrieval keeps failing | **Decided — see §6.7.** Bounded at 3 durable attempts, then abandon *that database only*: close it to connections, retain it on the volume, mark the record. Other games are unaffected; the host stops on the ordinary quiescence rule. Requires a spec change. |
| 9 | Commitlog damage on stop | `SIGTERM` + generous `kill_timeout`; stop only at quiescence. |
| 10 | Placement failure on resume at session start | Pre-session human-visible readiness check (§5.4) — the warm-up is best-effort and silent on failure by design. |
| 11 | Orphaned database surviving a stop | A volume means databases persist across stops, so ephemerality is not the reaper. `no-orphans` and `teardown-after-persistence` should prevent orphans; a host-level audit that lists databases and compares against non-`finished` game records is the cheap check that they did. |
| 12 | Flycast + autostart (variant B) | Verify that private 6PN traffic wakes a stopped machine — variant B's entire management path depends on it. |

### 6.7 Abandoning a record retrieval — the decision, and the spec change it needs

**Decision (author, 2026-08-09).** Record retrieval gets a hard attempt limit
of **3**. If persistence is still indeterminate after the third, Convex gives
up on that game: it stops trying, **closes that one database to further
connections** while leaving it in existence on the host's volume, and marks the
failure durably and loudly for manual follow-up.

**Closure is per database, not per host.** Other games on the same host are
untouched and keep running — one failed export must never disturb a session in
progress. The host stops only when the ordinary quiescence rule of §6.1 is met:
no game `playing`, and no instance awaiting teardown. An abandoned database is
closed and inert, so it does not count as awaiting teardown and never holds the
host awake — and equally, closing it does not by itself cause the host to stop.

The hazard being closed is real. As the corpus stands,
`teardown-after-persistence` is an **unconditional gate** — "an instance SHALL
NOT be torn down until Convex has confirmed persistence" — and
`stale-game-recovery` says a retrieval that yields no completed record "SHALL
leave the status untouched for a later sweep." Those compose into an unbounded
retry loop with a running meter: one export bug keeps a database perpetually
awaiting teardown, so the host never quiesces and scale-to-zero silently stops
happening. Bounded retries exist for notification *delivery*; there is no
equivalent bound on record *retrieval*. That is the hole.

**Why leaving the database in existence is the load-bearing choice.** It is
what keeps this compatible with the requirement's actual concern. The gate
exists so that "the instance stays up with its record intact and retrievable,
so the persistence can be retried against it" — the mischief being guarded
against is **discarding an unretrieved record**. Closing a database to
connections discards nothing: the data stays on the volume and the record
remains retrievable by an operator who reopens it. Deleting the database would
breach the requirement outright; closing it does not.

So what the spec change must authorise is narrower than it first appears: an
explicit bound on *attempts*, and a defined closed-but-retained state — not
permission to destroy a record.

**How to close one database — what SpacetimeDB actually supports.**

There is **no pause or suspend operation on the self-hosted management API**.
The 14 documented `/v1/database` endpoints cover create (`POST`, `PUT`), read
(`GET`) and destroy (`DELETE`), with nothing in between. A pause *does* exist
as a **Maincloud dashboard** feature — "the database is suspended and all data
is preserved, but the database is not serving requests" — which proves the
capability exists in the product, but it is not documented as reachable on a
self-hosted host by HTTP or CLI. Do not design on it; if it turns out to be
exposed, it becomes the cleanest option available.

What *is* first-class is **rejecting connections in `client_connected`**: a
documented how-to with per-language examples, where throwing or returning
`Err` makes the server terminate the connection before it is established. This
fits the architecture unusually well, because `client_connected` is **already**
the spec's enforcement point for connection admission (`02` §3.7 has it
checking `aud` and `sub` after OIDC validation). A closed-game gate there
extends an existing check rather than introducing a mechanism.

The corpus already asks for something adjacent. `game-lifecycle/game-end-boundary`
says "what the runtime refuses from that commit onward is that runtime's own
obligation" — refusing *work* after the end commit is already the instance's
job, and an abandoned database has normally already had its end commit. What
closure adds is refusing **admission**.

| # | Mechanism | Effect | Notes |
|---|---|---|---|
| 1 | **Stop issuing tokens** | No new party can obtain a credential for the game | Already true by `identity-and-authorization/sole-credential-issuer`; passive, and existing tokens live until `exp` (2h per `03`) |
| 2 | **`client_connected` refuses** | New connections rejected at handshake, valid token or not | The deliberate act. Needs a closed flag set by a reducer, so Convex calls it on the private surface |
| 3 | **Unbind the database name** (`PUT …/names`) | `/v1/database/<name>/subscribe` stops resolving; the database persists under its identity | Needs no module cooperation, but **removal semantics are undocumented** — verify that replacing the name list actually unbinds before relying on it |

**Design 1 + 2**, with 3 as a belt-and-braces option to test. Convex must
retain the database's **identity**, not just its name, on the game record, so
an operator can address it later for manual retrieval — under mechanism 3 the
name may no longer resolve at all.

**None of these evict already-connected clients.** There is no documented
module-side API to disconnect an existing client. That is tolerable here: the
game has ended, so nothing remains to do on the connection, and tokens expire
within two hours. If eviction ever matters, the only lever is a host restart,
which arrives at the next quiescence anyway.

**Do not reach for the existing error outcome.** `finish-notification` defines
an error outcome as "a game terminated by failure rather than by play," and it
records **no scores**. A game that played perfectly and merely failed to export
is not that. Using the error outcome here would record a legitimately won game
as a no-score — corrupting the competitive record to paper over an
infrastructure fault. The two failure shapes are genuinely different and the
spec change must keep them apart:

| What is known | Terminal state |
|---|---|
| Notification arrived: outcome known, persistence failed | `finished`, **scores recorded**, replay marked unavailable pending recovery |
| Nothing arrived and retrieval failed: outcome unknown | `finished`, error outcome, no scores (the existing path) |

This distinction is available because `finish-notification` has the instance
push the outcome *and* the record together — so when the push landed, losing
the record does not lose the result.

**The implementation trap: the counter must be durable.** Three attempts held
in an action's memory is not a bound, because `stale-game-recovery` re-drives
terminal handling on every sweep and would reset the count each pass — leaving
exactly the unbounded loop this decision exists to prevent, only harder to see.
The attempt count belongs **on the game record**, incremented in the same
mutation that records the failure, and the sweep must read it and decline to
re-drive an abandoned game. Space the three attempts with backoff so a Convex
cold start or a network blip does not burn the budget in a second.

**"Loudly" has to mean durably.** A log line in a self-hosted Convex that
scales to zero is the easiest thing in this system to lose. The durable
artifact is the marker on the game record — attempt count, last error, the
abandoned database's name — with logging and alerting layered on top of it, not
instead of it. That marker is also what makes manual follow-up possible at all:
it is the only thing that says *which* database on the volume is worth waking
the host for.

**Consequences to carry:**

- The host-level audit (register row 11) must now distinguish three kinds of
  database: awaiting teardown, abandoned-pending-investigation, and leaked.
  Only the third is a defect. Without the marker they are indistinguishable.
- Abandoned databases accumulate on the volume. They need a retention policy
  and volume headroom, or a slow leak reappears in a new form. Manual follow-up
  should end in one of exactly two acts: the replay is recovered and the
  database deleted, or the loss is accepted and the database deleted.
- Successor auto-creation fires on `finished`, so a session continues normally
  past an abandoned export. That is the desired behaviour — the abandonment
  must not stall the room.

**This requires a spec change, and should not be implemented before one.**
`game-lifecycle/teardown-after-persistence` and `game-lifecycle/stale-game-recovery`
both need amending — the first to bound attempts and define the abandoned
terminal state, the second to stop re-driving an abandoned record. Both live in
the open `migrate-game-lifecycle` change rather than in `specs/`, so the edit
lands there under the seed/edit rule for modified requirements. This document
records the decision and its rationale; it does not make it binding.

### 6.8 Choosing between them

| | **A — managed Convex Cloud** | **B — self-hosted Convex on Fly `syd`** |
|---|---|---|
| Platform-state residency | US East or EU West | Australia |
| Convex operations | vendor's | yours (§3) |
| `stale-game-recovery` | always runs | suppressed while Convex sleeps (§6.5) |
| Host management surface | needs the shim (§6.3) | private via Flycast, no public route |
| JWKS reachability | non-issue | ordering constraint (§6.4) |
| Moving parts | host + shim | host + Convex + external scheduler |
| Failure modes | few | the ones §6.5 and §6.4 describe |

**Recommendation: start on A, keep B as a supported target.** Variant A gets
the scale-to-zero host — which is the part of this you actually want — while
leaving Convex a managed dependency whose always-on crons make the recovery
path behave as specified. Variant B is the one to build when Australian
residency of platform state becomes a requirement worth its operational
weight (§4 establishes that no law makes it one).

The two share everything that costs real design: the single host with per-game
databases, the public/private surface split, the quiescence stop rule, and the
edge-case register. Only the Convex placement and the shim differ, which is
what makes keeping both viable cheap.

---

## 7. The part that cannot be solved by choosing a provider

Teams nominate their own Snek Centaur Server domains (`02-REQ-005`), the
captain declares trust unilaterally, and there is no platform-level server
registry (`02` DOWNSTREAM IMPACT 11). During a game those servers hold
per-team game credentials, subscribe to the game's SpacetimeDB database, and
write Centaur subsystem state to Convex. Team-internal competitive state —
Drives, bot parameters, action logs — flows through infrastructure Cyphid
neither chooses nor sees.

So "fully on Australian soil" is not achievable as a *technical guarantee* for
the platform as a whole. It is achievable for everything Cyphid operates, and
for team servers it becomes a policy question: a documented expectation, a
condition of entry into a Battle Bunker season, or nothing. Whichever it is,
it should be stated rather than left implied — a parent told the platform is
hosted in Australia will not distinguish Cyphid's Convex deployment from their
child's team's server.
