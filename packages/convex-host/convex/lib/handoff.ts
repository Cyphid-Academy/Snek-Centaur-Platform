// Sign-in handoff bookkeeping: the transactional halves of creating and
// redeeming a handoff reference. The HTTP surface (convex/http.ts) does
// the hashing and session work; these mutations own the state, so the
// single-use flip and the verifier comparison are one serializable
// transaction each — two racing redeems cannot both commit.
// spec: identity-and-authorization/sign-in-handoff
// spec: global-invariants/transactional-invariant-enforcement#concurrent-mutations-cannot-race-past-a-guard
import { v } from "convex/values";
import { internalMutation } from "../_generated/server.js";

/** A handoff reference expires on the redirect it exists to survive. */
export const HANDOFF_REFERENCE_LIFETIME_MS = 2 * 60 * 1000;

/**
 * Record a pending handoff for an authenticated human toward a registered
 * Server. Refuses a Server that is not registered, one registered without
 * return addresses, and any REQUESTED return address that does not exactly
 * match a registered one — the platform never redirects to an address the
 * request supplied.
 * spec: identity-and-authorization/sign-in-handoff#return-address-is-registered-not-requested
 */
export const createReference = internalMutation({
  args: {
    serverId: v.string(),
    userId: v.string(),
    refHash: v.string(),
    challengeS256: v.string(),
    requestedReturnAddress: v.union(v.string(), v.null()),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    // Resolution against the registry as a set — never an assumed
    // singleton.
    // spec: identity-and-authorization/trusted-issuer-registry#the-set-is-never-assumed-singular
    const registration = await ctx.db
      .query("trusted_issuers")
      .withIndex("by_issuerId", (q) => q.eq("issuerId", args.serverId))
      .unique();
    if (registration === null) {
      return { ok: false as const, rejection: { kind: "unregistered-server" as const } };
    }
    const registered = registration.returnAddresses;
    if (registered.length === 0) {
      return { ok: false as const, rejection: { kind: "no-registered-return-address" as const } };
    }
    let returnAddress = registered[0] as string;
    if (args.requestedReturnAddress !== null) {
      if (!registered.includes(args.requestedReturnAddress)) {
        return {
          ok: false as const,
          rejection: { kind: "unregistered-return-address" as const },
        };
      }
      returnAddress = args.requestedReturnAddress;
    }
    await ctx.db.insert("handoff_references", {
      refHash: args.refHash,
      issuerRowId: registration._id,
      userId: args.userId,
      challengeS256: args.challengeS256,
      expiresAt: args.nowMs + HANDOFF_REFERENCE_LIFETIME_MS,
      used: false,
    });
    return { ok: true as const, returnAddress };
  },
});

/**
 * The single-use redemption flip. A reference is accepted ONCE — the
 * `used` flag is set in this same serializable transaction that checks
 * it, so a second redeem (concurrent or later, within lifetime or not)
 * is refused. Redemption requires the verifier whose SHA-256 was fixed at
 * creation: a reference that travelled in a URL is assumed seen, and its
 * defence is that redeeming takes something the URL did not carry.
 * spec: identity-and-authorization/sign-in-handoff#reference-is-accepted-once
 */
export const redeemReference = internalMutation({
  args: {
    refHash: v.string(),
    verifierS256: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("handoff_references")
      .withIndex("by_refHash", (q) => q.eq("refHash", args.refHash))
      .unique();
    if (row === null) {
      return { ok: false as const, rejection: { kind: "unknown-reference" as const } };
    }
    if (row.used) {
      return { ok: false as const, rejection: { kind: "already-redeemed" as const } };
    }
    if (row.expiresAt <= args.nowMs) {
      return { ok: false as const, rejection: { kind: "expired-reference" as const } };
    }
    if (row.challengeS256 !== args.verifierS256) {
      // A wrong verifier does not consume the reference: the challenge is
      // the hash of a high-entropy value, so guessing is not a live
      // threat within the two-minute lifetime, while consuming would let
      // anyone who SAW the reference in a URL burn the legitimate
      // redemption.
      return { ok: false as const, rejection: { kind: "verifier-mismatch" as const } };
    }
    await ctx.db.patch(row._id, { used: true });
    return { ok: true as const, userId: row.userId };
  },
});
