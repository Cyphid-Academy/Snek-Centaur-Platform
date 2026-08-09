# Evaluating Australian Hosting for the Platform

**Status:** Evaluation, not a decision. No spec change is proposed here.
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
| Snek Centaur Servers | **Each team, on domains they nominate** (`02-REQ-005`) | **Not controllable.** See §6. |

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

`global-invariants/no-shared-secrets` forbids exactly what §5.3 proposes:

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
(§5.3).

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

(3) is the one with a date on it. The OAIC released the exposure draft of the
**Privacy (Children's Online Privacy) Code 2026** on 31 March 2026;
consultation closed 5 June 2026; the Code **will be registered by 10 December
2026**. It applies to online services including games and educational tools
that handle children's personal information, and a breach of the Code is a
breach of the Privacy Act. Commencement and transition period were still
unconfirmed as at this writing. Whether Cyphid is an APP entity at all (the
small-business turnover threshold) is a question for a lawyer, not for this
document — but the Code is the reason to treat the hosting decision as having
a deadline rather than being a preference.

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

## 5. Recommendation

### 5.1 Right-size first

The workload is a few dozen 10-minute games, weekly. The whole platform-owned
footprint is:

- one Convex backend (single-writer by nature — no HA to lose),
- its datastore,
- one SpacetimeDB host,
- the reference Centaur Server at `snek-centaur.cyphid.org`,
- a reverse proxy terminating TLS.

That is a Docker Compose file on **one adequately-sized virtual machine**.
Not four Fly apps, a replay router, token minting, app sharding, pre-provisioning
from lobby state, and a reaper cron. The proposal's §6.5 sharding table — 600
concurrent machines, 10-minute spin-up — is planning for roughly fifteen times
the stated peak, against a rate limit that only exists because it chose to
create VMs.

### 5.2 The one question that selects the answer

**Is the requirement residency or sovereignty?** It cleanly picks the target:

- **Residency** (bytes in Australia; US-owned operator acceptable) → Fly.io
  `syd`. Matches what the spec's design text already names, gives managed
  volumes with snapshots, managed TLS, and the least operational surface.
  Sydney only — there is no Melbourne region.
- **Sovereignty** (Australian-owned and -operated) → an Australian-owned
  provider with a Melbourne presence. Several exist at the relevant scale;
  they are ordinary VM hosts, so the deliverable is the same Compose stack
  with self-managed TLS, backups, and patching.

At this scale the operational delta between the two is smaller than it looks,
because the Fly-specific machinery the spec currently anticipates —
scale-to-zero, the warm-up signal, the Machines API — is complexity that a
plain always-on VM simply does not need. An always-on 8GB VM is in the same
cost band as the proposal's own $34–80/month estimate, which is dominated by
the always-on Convex machine either way.

**Recommendation: build for portability, target sovereignty.** Deliver the
platform's own runtimes as a provider-agnostic Compose stack. Then the hosting
substrate is a deployment target rather than an architecture, moving between
Fly `syd` and an Australian-owned VM is a redeploy, and the choice above can be
deferred past the point where it would otherwise block implementation. If
sovereignty is the real requirement — and for a program built around
Australian children it probably is — go there directly and skip the Fly-shaped
detour, because unwinding scale-to-zero later costs more than never adopting it.

### 5.3 Consequences for the spec

None of this requires a spec change, which is worth stating explicitly:

- `game-lifecycle/host-warm-up` is written as **MAY** suspend. An always-on
  host satisfies it trivially — the warm-up signal becomes a success no-op,
  which the requirement already contemplates. The Fly-specific
  scale-to-zero mechanics live only in design text (`04` §2.13, `05` §2.3.1)
  and in `docs/external-setup.md`, exactly as `04-REVIEW-022` intended when it
  kept the requirement implementation-neutral.
- `docs/external-setup.md` §"SpacetimeDB on Fly.io" is a stub whose TODO list
  is precisely the set of decisions this evaluation feeds. It should be
  rewritten once the target is chosen, not before.

### 5.4 What to verify before committing

1. **Written confirmation from Clockwork Labs** that one self-hosted host
   running one per-game database at a time — dozens concurrently — is one
   "instance" under the BSL Additional Use Grant. The whole provisioning
   design depends on this reading. (§2.2)
2. **Legal advice** on APP entity status and the Children's Online Privacy
   Code's application to Battle Bunker, before the Code is registered in
   December 2026. (§4)
3. **A benchmark of Centaur bot compute**, not of SpacetimeDB. That is the
   workload that will determine what the reference deployment costs. (§2.4)
4. **Convex self-hosted upgrade rehearsal** — snapshot, upgrade across
   several intermediate revisions, restore — before any real data exists.
   Forward-only migrations mean the rehearsal is the only thing that
   establishes the rollback works. (§3)

---

## 6. The part that cannot be solved by choosing a provider

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
