// spec: global-invariants/one-contract-many-surfaces
// The component's function surface, reachable only through the host
// (`components.snekPlatform.functions.*`).
//
// Data access only, no decisions: whether a request exceeds a ceiling, whether
// a handoff expired, whether a status permits issuance is answered in
// `convex-host`'s `auth/` modules against values these functions return.
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { gameStatus, issuerRegistration, participantSnapshot } from "./schema";

/** Liveness of this component. See `platformStatus` in the host. */
export const status = query({
  args: {},
  returns: v.string(),
  handler: async () => "snekPlatform",
});

/**
 * The registration for one issuer, or `null` if the platform holds none — which
 * is what refuses an assertion from an unregistered principal, since a valid
 * signature over a well-formed assertion proves only that someone holds a key.
 *
 * spec: identity-and-authorization/trusted-issuer-registry#the-set-is-never-assumed-singular
 * spec: identity-and-authorization/service-principal-assertions#unregistered-principal-refused
 */
export const issuer = query({
  args: { issuerId: v.string() },
  returns: v.union(v.object(issuerRegistration), v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("trusted_issuers")
      .withIndex("by_issuer", (q) => q.eq("issuerId", args.issuerId))
      .unique();
    return (
      row && {
        issuerId: row.issuerId,
        verificationMaterialUrl: row.verificationMaterialUrl,
        capabilityCeiling: row.capabilityCeiling,
        returnAddresses: row.returnAddresses,
      }
    );
  },
});

/**
 * Write one issuer's registration, replacing whatever this platform held for
 * that issuer.
 *
 * Everything a registration records is public — an identifier, where material
 * is published, a ceiling, and the addresses humans may be returned to — so
 * replacing one wholesale exposes nothing and leaves no field a stale value
 * could survive in. There is no *secret* to preserve across a rewrite, which is
 * what makes this shape safe (`#registry-holds-no-secret`).
 *
 * Deliberately not a repointing of anything: an issuer is a party the platform
 * decided to trust, not a human's linkage, so the one-way rule of
 * `linked-provider-credentials` does not apply here and must not be read across.
 * Rotation still needs no write at all — the issuer publishes new material
 * beside the old at the address already recorded.
 *
 * spec: identity-and-authorization/trusted-issuer-registry
 * spec: identity-and-authorization/trusted-issuer-registry#registry-holds-no-secret
 */
export const registerIssuer = mutation({
  args: issuerRegistration,
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("trusted_issuers")
      .withIndex("by_issuer", (q) => q.eq("issuerId", args.issuerId))
      .unique();
    if (existing) await ctx.db.replace(existing._id, args);
    else await ctx.db.insert("trusted_issuers", args);
    return null;
  },
});

/**
 * Record an assertion identifier as accepted, answering `false` if it already
 * was. The read and the insert are one mutation, so the read joins this
 * transaction's read set and a concurrent claim of the same identifier
 * invalidates one of the two — it re-runs, sees the committed row, and refuses.
 * A check made anywhere earlier could be outrun by exactly that commit.
 *
 * spec: identity-and-authorization/service-principal-assertions#replayed-assertion-refused
 * spec: global-invariants/transactional-invariant-enforcement#concurrent-mutations-cannot-race-past-a-guard
 */
export const claimAssertionId = mutation({
  args: { assertionId: v.string(), expiresAt: v.number() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const seen = await ctx.db
      .query("accepted_assertions")
      .withIndex("by_assertion", (q) => q.eq("assertionId", args.assertionId))
      .unique();
    if (seen) return false;
    await ctx.db.insert("accepted_assertions", args);
    return true;
  },
});

/** spec: identity-and-authorization/sign-in-handoff */
export const createHandoff = mutation({
  args: {
    reference: v.string(),
    userId: v.string(),
    issuerId: v.string(),
    challenge: v.string(),
    expiresAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("sign_in_handoffs", args);
    return null;
  },
});

/**
 * Take a handoff reference, given proof of being the party it was minted for,
 * deleting it in the same mutation that reads it and returning what it named.
 * Deleting on the way out is the whole of "accepted once": a second
 * presentation finds nothing, whatever the first one's outcome or the
 * reference's remaining lifetime.
 *
 * **The proof is checked here rather than by the host, and that placement is the
 * point.** The proof is the hash of the redeemer's verifier, and what it must
 * equal is the challenge stored on this row — so nobody outside this transaction
 * can check it before the row is read, and reading it anywhere else means
 * returning the challenge to a caller who is trying to guess it. Comparing here
 * lets the row survive a wrong answer: a redemption that fails to prove itself
 * does not consume the human's one chance to arrive, which is the property the
 * assertion path used to get by verifying first and calling second. The host
 * still does the hashing, so nothing cryptographic lands in this component.
 *
 * A missing row and a wrong proof are one answer, deliberately. Telling them
 * apart would say whether a reference exists to someone who cannot redeem it,
 * and nothing legitimate needs to know.
 *
 * The expiry comes back rather than being enforced here. The host is where the
 * redeeming party is authenticated, so it is where a reference that outlived
 * the redirect and a reference redeemed by the wrong party are refused
 * together, on the same terms.
 *
 * spec: identity-and-authorization/sign-in-handoff#reference-is-accepted-once
 * spec: identity-and-authorization/anonymous-reach#handoff-redemption-proves-itself
 */
export const redeemHandoff = mutation({
  args: { reference: v.string(), proof: v.string() },
  returns: v.union(
    v.object({ userId: v.string(), issuerId: v.string(), expiresAt: v.number() }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("sign_in_handoffs")
      .withIndex("by_reference", (q) => q.eq("reference", args.reference))
      .unique();
    if (!row) return null;
    if (row.challenge !== args.proof) return null;
    await ctx.db.delete(row._id);
    return { userId: row.userId, issuerId: row.issuerId, expiresAt: row.expiresAt };
  },
});

/**
 * Whether this user is a platform admin, asked of current state each time so a
 * designation that changed takes effect without a reload or a fresh session.
 *
 * spec: identity-and-authorization/platform-admin-role#role-effective-without-reload
 */
export const isPlatformAdmin = query({
  args: { userId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) =>
    (await ctx.db
      .query("platform_admins")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique()) !== null,
});

/**
 * The game as issuance sees it — its status now, and the roster snapshot taken
 * at initialization. Exactly the input `auth/eligibility.ts` decides from, so
 * the host asks one question and does not reassemble the answer.
 *
 * `normalizeId` rather than an `v.id("games")` argument: the host holds the id
 * as a string and cannot name this component's data model to type it as
 * anything else, so an id belonging to another table or another deployment
 * comes back as no game rather than as an error.
 *
 * spec: identity-and-authorization/live-game-issuance
 * spec: identity-and-authorization/roster-snapshot-binding
 */
export const gameForIssuance = query({
  args: { gameId: v.string() },
  returns: v.union(
    v.object({
      gameId: v.string(),
      status: gameStatus,
      roster: v.array(participantSnapshot),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("games", args.gameId);
    const game = id && (await ctx.db.get(id));
    return game && { gameId: game._id, status: game.status, roster: game.roster };
  },
});

/**
 * The domain of the server operating this team, for attributing a Server's
 * request to the team it claims. `null` domain means no server is nominated;
 * `null` for the whole answer means no such team.
 *
 * spec: identity-and-authorization/identity-kinds#server-domain-is-not-identity
 */
export const team = query({
  args: { teamId: v.string() },
  returns: v.union(v.object({ serverDomain: v.union(v.string(), v.null()) }), v.null()),
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("centaur_teams", args.teamId);
    const row = id && (await ctx.db.get(id));
    return row && { serverDomain: row.serverDomain };
  },
});

/**
 * Write down that a registered system took an action on a human's behalf.
 *
 * Here rather than beside the bound that admitted the call, which the host now
 * charges against a rate-limiter component of its own: what that component
 * counts is calls, and this is not a count but a record a human is later shown.
 * The two were one mutation while both were ours, and the host still calls this
 * one only on the path that admits — a refused call leaves no record of an
 * action nobody took.
 *
 * `expiresAt` arrives as an argument rather than being computed here: how long
 * a record is worth keeping is a policy of the platform that shows it, and this
 * component states no policy. `sweepExpired` below acts on the answer.
 *
 * spec: identity-and-authorization/peer-capability-ceiling#attribution-is-user-visible
 */
export const recordAttribution = mutation({
  args: {
    issuerId: v.string(),
    userId: v.string(),
    capability: v.string(),
    expiresAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("system_actions", args);
    return null;
  },
});

/**
 * The actions taken on one user's behalf through a registered system, newest
 * first. Scoped to the one user by the index rather than by a filter over the
 * whole table, so a caller reaching the wrong records is not a mistake this
 * function can make — only a wrong `userId` the host passed it.
 *
 * A page rather than everything: what the requirement asks to be showable is
 * the account's recent history, and an unbounded scan is a read a transaction
 * cannot promise to finish.
 *
 * spec: identity-and-authorization/peer-capability-ceiling#attribution-is-user-visible
 */
export const actionsTakenFor = query({
  args: { userId: v.string() },
  returns: v.array(v.object({ issuerId: v.string(), capability: v.string(), at: v.number() })),
  handler: async (ctx, args) =>
    (
      await ctx.db
        .query("system_actions")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .order("desc")
        .take(100)
    ).map((row) => ({ issuerId: row.issuerId, capability: row.capability, at: row._creationTime })),
});

/**
 * Drop accepted-assertion records, handoff references and attribution records
 * whose own expiry has passed. The first two exist only to refuse a second
 * presentation of something still within its lifetime, so once the lifetime is
 * over the record defends nothing and retaining it would be an ever-growing log
 * of who authenticated when; an attribution record outlives its usefulness the
 * same way, once nobody is going to review the action it describes.
 *
 * Batched, and returns how many it deleted, because a Convex mutation has a
 * bounded read set: the caller re-runs while the answer equals the batch size.
 * Scheduling belongs to the host, which owns this deployment's crons.
 *
 * spec: identity-and-authorization/service-principal-assertions#replayed-assertion-refused
 */
export const sweepExpired = mutation({
  args: { now: v.number() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const assertions = await ctx.db
      .query("accepted_assertions")
      .withIndex("by_expiry", (q) => q.lt("expiresAt", args.now))
      .take(200);
    const handoffs = await ctx.db
      .query("sign_in_handoffs")
      .withIndex("by_expiry", (q) => q.lt("expiresAt", args.now))
      .take(200);
    const attributions = await ctx.db
      .query("system_actions")
      .withIndex("by_expiry", (q) => q.lt("expiresAt", args.now))
      .take(200);
    for (const row of [...assertions, ...handoffs, ...attributions]) await ctx.db.delete(row._id);
    return assertions.length + handoffs.length + attributions.length;
  },
});
