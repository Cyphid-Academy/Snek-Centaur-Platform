import { encodeGameSubject } from "@cyphid/snek-stdb/subject";
// spec: identity-and-authorization/sole-credential-issuer,
//       identity-and-authorization/service-principal-assertions,
//       identity-and-authorization/trusted-issuer-registry,
//       identity-and-authorization/peer-capability-ceiling,
//       identity-and-authorization/sign-in-handoff,
//       identity-and-authorization/game-credential-scope,
//       identity-and-authorization/participant-token-eligibility,
//       identity-and-authorization/live-game-issuance
// Everything the platform issues, and the only place it is issued.
//
// All but one are actions rather than mutations: issuance has to fetch the
// material a service principal publishes, and only an action may reach the
// network.
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { v } from "convex/values";
import { base64url, createRemoteJWKSet, decodeJwt, errors, jwtVerify } from "jose";
import type { IssuerRegistration as Registration } from "../../convex-snek-platform/convex/schema";
import { components } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { type CapabilityEntry, mint } from "./auth/credential";
import {
  PLATFORM_AUDIENCE,
  assertionAudience,
  deploymentSigner,
  encodePrincipal,
  issuer,
} from "./auth/deployment";
import { type TokenRequest, decideGameTokenIssuance } from "./auth/eligibility";
import {
  CAPABILITIES,
  type Capability,
  GAME_CREDENTIAL_CAPABILITIES,
  PEER_FORBIDDEN_CAPABILITIES,
  SESSION_CAPABILITIES,
} from "./capabilities";
import { type Principal, boundSystemCall, publicAction, publicMutation } from "./publicFunctions";

/**
 * spec: identity-and-authorization/sign-in-handoff
 */
const HANDOFF_LIFETIME_MS = 60_000;

/**
 * What minting a handoff needs of a context, spelled structurally because it is
 * reached from both a mutation's and an HTTP action's — the two entrances a
 * human has — and neither's concrete type is the other's.
 */
export interface HandoffMinter {
  runQuery<Q extends FunctionReference<"query", "internal">>(
    query: Q,
    args: FunctionArgs<Q>,
  ): Promise<FunctionReturnType<Q>>;
  runMutation<M extends FunctionReference<"mutation", "internal">>(
    mutation: M,
    args: FunctionArgs<M>,
  ): Promise<FunctionReturnType<M>>;
}

/**
 * One registered issuer, or `null`.
 *
 * Typed from the component's own validator, like every other reader of a
 * registration: a `runQuery` result can only be typed by annotation here, so an
 * interface written out by hand would typecheck on both sides of a field rename
 * and fail at runtime.
 */
export async function registrationFor(
  ctx: HandoffMinter,
  issuerId: string,
): Promise<Registration | null> {
  return await ctx.runQuery(components.snekPlatform.functions.issuer, { issuerId });
}

/** The registration, or the one refusal every path gives an unregistered issuer. */
async function requiredRegistration(ctx: HandoffMinter, issuerId: string): Promise<Registration> {
  const registration = await registrationFor(ctx, issuerId);
  if (!registration) throw new Error(`no registration for issuer ${issuerId}`);
  return registration;
}

/**
 * Authenticate a non-human principal from the assertion it signed, and answer
 * with its registration.
 *
 * spec: identity-and-authorization/service-principal-assertions
 * spec: identity-and-authorization/service-principal-assertions#unregistered-principal-refused
 */
async function authenticatedPrincipal(ctx: ActionCtx, assertion: string): Promise<Registration> {
  const claimedIssuer = decodeJwt(assertion).iss ?? "";
  const registration = await requiredRegistration(ctx, claimedIssuer);

  // spec: identity-and-authorization/service-principal-assertions#rotation-needs-no-coordination
  const payload = await verifiedAssertion(
    assertion,
    claimedIssuer,
    publishedKeySet(registration.verificationMaterialUrl),
  );

  // Charged after the signature is checked, deliberately: charging on the
  // claimed issuer alone would let anyone holding no key at all exhaust a real
  // Server's window by naming it.
  // spec: identity-and-authorization/peer-capability-ceiling
  await boundSystemCall(ctx, registration.issuerId);

  // spec: identity-and-authorization/service-principal-assertions#replayed-assertion-refused
  if (!payload.jti || typeof payload.exp !== "number") {
    throw new Error("assertion carries no unique identifier");
  }
  const accepted: boolean = await ctx.runMutation(
    components.snekPlatform.functions.claimAssertionId,
    { assertionId: payload.jti, expiresAt: payload.exp * 1000 },
  );
  if (!accepted) throw new Error("assertion has already been accepted");
  return registration;
}

/**
 * What a peer may sign an assertion with. Wider than the platform's own `ALG`
 * on purpose: which algorithm a registered Server uses is its decision, not a
 * constraint this deployment's signing choice should leak onto it.
 */
const ASSERTION_ALGS = ["ES256", "RS256"];

/**
 * One remote key set per published location, held across calls. `jose` owns
 * the fetch: it times out, matches `kid` where one is offered, and — the
 * property the bare `fetch` this replaced lacked — caches, so an
 * unauthenticated caller can no longer turn every exchange attempt into
 * outbound traffic toward a registered issuer's URL.
 */
const remoteKeySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function publishedKeySet(url: string): ReturnType<typeof createRemoteJWKSet> {
  let keys = remoteKeySets.get(url);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(url));
    remoteKeySets.set(url, keys);
  }
  return keys;
}

/**
 * Forget every published key set fetched so far. A testing hook: production
 * needs no equivalent, because rotation is covered by the bounded reload below
 * and staleness by the cache's own expiry.
 */
export function forgetPublishedMaterial(): void {
  remoteKeySets.clear();
}

/**
 * Verify the assertion against what the principal publishes. The audience is
 * `assertionAudience()` — *this deployment*, not the platform at large — for
 * the reason recorded on `assertionAudience` in `auth/deployment.ts`.
 *
 * A signature no cached key validates may be signed by a key published since
 * the material was last read — the rotation `#rotation-needs-no-coordination`
 * scripts, arriving with no `kid` to miss the cache on. One reload covers it,
 * gated on the set's cooldown so refusals cannot be turned into unbounded
 * outbound traffic.
 */
async function verifiedAssertion(
  assertion: string,
  claimedIssuer: string,
  keys: ReturnType<typeof createRemoteJWKSet>,
) {
  try {
    return await assertionAgainst(keys, assertion, claimedIssuer);
  } catch (refusal) {
    const unmatched =
      refusal instanceof errors.JWSSignatureVerificationFailed ||
      refusal instanceof errors.JWKSNoMatchingKey;
    if (unmatched && !keys.coolingDown) {
      await keys.reload();
      try {
        return await assertionAgainst(keys, assertion, claimedIssuer);
      } catch {
        // The refusal below is the answer either way.
      }
    }
    // One answer for every cryptographic refusal, as before this client used a
    // library: what precisely failed is not owed to a caller who could not
    // sign.
    throw new Error("assertion is not signed by any key this principal publishes");
  }
}

/** One verification attempt, trying every candidate where several keys match. */
async function assertionAgainst(
  keys: ReturnType<typeof createRemoteJWKSet>,
  assertion: string,
  claimedIssuer: string,
) {
  const options = {
    issuer: claimedIssuer,
    audience: assertionAudience(),
    algorithms: ASSERTION_ALGS,
    // Required, not merely checked when offered — a credential that declines
    // to say when it dies would otherwise verify forever.
    requiredClaims: ["exp"],
  };
  try {
    return (await jwtVerify(assertion, keys, options)).payload;
  } catch (error) {
    // Several kid-less keys of the right shape: jose hands back the
    // candidates rather than guessing, and trying each is this caller's job.
    if (error instanceof errors.JWKSMultipleMatchingKeys) {
      for await (const candidate of error) {
        try {
          return (await jwtVerify(assertion, candidate, options)).payload;
        } catch {
          // The next candidate, or the throw below.
        }
      }
      throw new errors.JWSSignatureVerificationFailed();
    }
    throw error;
  }
}

/**
 * What this issuer may confer at most: its registered ceiling, less anything no
 * external system may ever hold whatever its registration says.
 *
 * spec: identity-and-authorization/peer-capability-ceiling#ceiling-sits-below-the-user
 */
function ceilingOf(registration: Registration): ReadonlyArray<Capability> {
  return registration.capabilityCeiling.filter(
    (name): name is Capability =>
      name in CAPABILITIES && !PEER_FORBIDDEN_CAPABILITIES.includes(name as Capability),
  );
}

const entries = (capabilities: ReadonlyArray<Capability>): ReadonlyArray<CapabilityEntry> =>
  capabilities.map((capability) => ({ capability }));

/**
 * The requested capabilities, or a refusal naming exactly what was excessive.
 *
 * spec: identity-and-authorization/trusted-issuer-registry#excess-fails-loudly
 */
function granted(
  registration: Registration,
  requested: ReadonlyArray<string>,
): ReadonlyArray<CapabilityEntry> {
  const ceiling = ceilingOf(registration);
  const excess = requested.filter((name) => !ceiling.includes(name as Capability));
  if (excess.length > 0) {
    throw new Error(`beyond ${registration.issuerId}'s ceiling: ${excess.join(", ")}`);
  }
  return entries(requested as ReadonlyArray<Capability>);
}

/**
 * Exchange a signed assertion for a platform credential naming the principal
 * that signed it.
 *
 * Anonymous by capability: the proof here is the signature, not a credential.
 * `act` and `sub` are the same principal, since a system acting as itself is
 * its own actor.
 *
 * spec: identity-and-authorization/service-principal-assertions
 * spec: identity-and-authorization/capability-claim-structure#acting-principal-is-recorded
 */
export const exchangeAssertion = publicAction({ capability: "exchange-assertion" })({
  args: { assertion: v.string(), capabilities: v.array(v.string()) },
  returns: v.string(),
  handler: async (ctx, args) => {
    const registration = await authenticatedPrincipal(ctx, args.assertion);
    return mint(await deploymentSigner(ctx), issuer(), {
      subject: encodePrincipal({ kind: "external-system", issuerId: registration.issuerId }),
      audience: PLATFORM_AUDIENCE,
      cap: granted(registration, args.capabilities),
      act: registration.issuerId,
    });
  },
});

/**
 * Mint a handoff reference and answer with the address to send the browser to.
 * The one mutating function on this surface.
 *
 * Reachable by a live session and by nothing else — `begin-sign-in-handoff`
 * is declared `session` and sits on `PEER_FORBIDDEN_CAPABILITIES`, whose
 * comment in `capabilities.ts` holds the chain argument. What is left is the
 * human's own session, read at the moment of the call, which is what makes
 * renewal re-read the session by construction rather than by discipline.
 *
 * spec: identity-and-authorization/sign-in-handoff#return-address-is-registered-not-requested
 * spec: identity-and-authorization/token-lifetime-and-refresh#renewal-re-reads-the-session
 * spec: identity-and-authorization/mutation-authorization
 */
export const beginSignInHandoff = publicMutation({ capability: "begin-sign-in-handoff" })({
  args: { issuerId: v.string(), returnAddress: v.string(), challenge: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    // `ctx.caller` is the human already: this capability is not anonymously
    // reachable and declares no kind but the default, so the builder refused
    // everything else before the handler ran.
    return mintHandoff(ctx, { ...args, userId: ctx.caller.userId });
  },
});

/**
 * Mint a handoff reference for one human and one registered Server, and answer
 * with the address to send the browser to.
 *
 * Shared by the mutation above and by the sign-in return route, which mints on
 * behalf of the human whose session cookie it just read. Deliberately a plain
 * function and not a public builder: it is the step both entrances have in
 * common, not a third entrance, and the capability that reaches it is declared
 * by whichever one is being used.
 *
 * spec: identity-and-authorization/sign-in-handoff#return-address-is-registered-not-requested
 */
export async function mintHandoff(
  ctx: HandoffMinter,
  args: { userId: string; issuerId: string; returnAddress: string; challenge: string },
): Promise<string> {
  const registration = await requiredRegistration(ctx, args.issuerId);
  if (!registration.returnAddresses.includes(args.returnAddress)) {
    throw new Error(`${args.returnAddress} is not a return address this issuer registered`);
  }
  // Opaque: it names nothing and confers nothing, so the URL it travels in
  // carries no authority at all. What redeeming it takes instead is the
  // `challenge` field in `convex-snek-platform`'s `schema.ts`.
  const reference = crypto.randomUUID();
  await ctx.runMutation(components.snekPlatform.functions.createHandoff, {
    reference,
    userId: args.userId,
    issuerId: args.issuerId,
    challenge: args.challenge,
    expiresAt: Date.now() + HANDOFF_LIFETIME_MS,
  });
  return `${args.returnAddress}?handoff=${reference}`;
}

/**
 * Redeem a handoff reference for a credential naming the human it was minted
 * for.
 *
 * The proof is checked inside the component's own mutation, against the
 * challenge on the row, so a redemption that fails to prove itself does not
 * consume the human's one chance to arrive. See `redeemHandoff` there.
 *
 * spec: identity-and-authorization/sign-in-handoff#the-redeemer-keeps-what-it-earns
 * spec: identity-and-authorization/sign-in-handoff#reference-is-accepted-once
 * spec: identity-and-authorization/anonymous-reach#handoff-redemption-proves-itself
 */
export const redeemSignInHandoff = publicAction({ capability: "redeem-handoff" })({
  args: { reference: v.string(), verifier: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    const handoff: { userId: string; issuerId: string; expiresAt: number } | null =
      await ctx.runMutation(components.snekPlatform.functions.redeemHandoff, {
        reference: args.reference,
        proof: await challengeFor(args.verifier),
      });
    // One answer for "no such reference" and "wrong verifier" — see
    // `redeemHandoff`. Saying which would tell someone who cannot redeem a
    // reference whether it exists.
    if (!handoff) throw new Error("no such handoff reference");
    if (handoff.expiresAt <= Date.now()) throw new Error("handoff reference has expired");
    const registration = await requiredRegistration(ctx, handoff.issuerId);
    return mint(await deploymentSigner(ctx), issuer(), {
      subject: encodePrincipal({ kind: "human", userId: handoff.userId }),
      audience: PLATFORM_AUDIENCE,
      // Bounded twice over: by that Server's registered ceiling
      // (`#server-never-holds-the-provider-exchange`) whoever redeems it, and
      // by what the human could do directly
      // (`peer-capability-ceiling#ceiling-sits-below-the-user`), which the
      // intersection with the session claim is what enforces.
      cap: entries(ceilingOf(registration).filter((c) => SESSION_CAPABILITIES.includes(c))),
      // The Server the human arrived through is still named.
      // spec: identity-and-authorization/capability-claim-structure#acting-principal-is-recorded
      act: registration.issuerId,
    });
  },
});

/**
 * The challenge a verifier answers to: base64url of its SHA-256.
 *
 * Hashing is the host's so the component stores and compares an opaque string
 * and gains no crypto. One-way is the whole mechanism — the challenge travels
 * through the browser and through Google in a URL, and what it protects is a
 * verifier that never left the page that made it.
 *
 * spec: identity-and-authorization/anonymous-reach#handoff-redemption-proves-itself
 */
async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url.encode(new Uint8Array(digest));
}

/**
 * A Snek Centaur Server's per-team, per-game credential.
 *
 * spec: identity-and-authorization/game-credential-scope
 * spec: identity-and-authorization/live-game-issuance
 */
export const issueGameCredential = publicAction({
  capability: "issue-game-credential",
  principals: ["external-system"],
})({
  args: { teamId: v.string(), gameId: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    const caller = ctx.caller;
    const team: { serverDomain: string | null } | null = await ctx.runQuery(
      components.snekPlatform.functions.team,
      { teamId: args.teamId },
    );
    if (!team || team.serverDomain !== caller.issuerId) {
      throw new Error(`${caller.issuerId} does not operate team ${args.teamId}`);
    }
    const game = await gameBeingPlayed(ctx, args.gameId);
    if (!game.roster.some((participant) => participant.teamId === args.teamId)) {
      throw new Error(`team ${args.teamId} is not a participant of game ${args.gameId}`);
    }
    return mint(await deploymentSigner(ctx), issuer(), {
      subject: encodePrincipal({ kind: "centaur-team", teamId: args.teamId, gameId: game.gameId }),
      audience: PLATFORM_AUDIENCE,
      cap: entries(GAME_CREDENTIAL_CAPABILITIES),
      act: caller.issuerId,
    });
  },
});

/**
 * A game access token — operator, bot, spectator, or coach.
 *
 * The eligibility rule is `auth/eligibility.ts`'s; this reads the game as
 * issuance sees it, turns the caller into the request that decision takes, and
 * mints what it approves.
 *
 * The claim is empty because a game access token confers nothing at *this*
 * deployment: it is admission to one instance. It still carries the claim, as
 * every credential does, so nothing reading one has a second shape to handle.
 *
 * spec: identity-and-authorization/participant-token-eligibility
 * spec: identity-and-authorization/spectator-tokens
 * spec: identity-and-authorization/coach-tokens
 * spec: identity-and-authorization/game-token-contents
 */
export const issueGameToken = publicAction({
  capability: "issue-game-token",
  principals: ["human", "centaur-team"],
})({
  args: {
    gameId: v.string(),
    role: v.union(
      v.literal("operator"),
      v.literal("bot"),
      v.literal("spectator"),
      v.literal("coach"),
    ),
    teamId: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const caller = ctx.caller;
    const game = await gameBeingPlayed(ctx, args.gameId);
    // The admin's implicit coach standing over every team, read from current
    // state so a designation that changed takes effect without a fresh session.
    // spec: identity-and-authorization/platform-admin-role#implicit-coach-everywhere
    const isAdmin =
      caller.kind === "human" &&
      (await ctx.runQuery(components.snekPlatform.functions.isPlatformAdmin, {
        userId: caller.userId,
      }));
    const decision = decideGameTokenIssuance(game, tokenRequest(caller, args), isAdmin);
    if (!decision.ok) throw new Error(`no token issued: ${decision.refusal}`);
    return mint(await deploymentSigner(ctx), issuer(), {
      subject: encodeGameSubject(decision.subject),
      audience: game.gameId,
      cap: [],
    });
  },
});

/**
 * What the caller is asking for, in the terms the pure decision takes.
 *
 * A Centaur Team principal's team and game come from its credential's subject
 * rather than from the request.
 *
 * spec: identity-and-authorization/participant-token-eligibility#bot-token-requires-team-credential
 */
function tokenRequest(
  caller: Principal,
  args: { role: "operator" | "bot" | "spectator" | "coach"; teamId?: string },
): TokenRequest {
  if (caller.kind === "centaur-team") {
    if (args.role !== "bot") throw new Error("a game credential obtains bot tokens alone");
    return { role: "bot", credentialTeamId: caller.teamId, credentialGameId: caller.gameId };
  }
  if (caller.kind !== "human") throw new Error("this caller holds no game token eligibility");
  if (args.role === "bot") throw new Error("a bot token is issued against a game credential");
  if (args.role !== "coach") return { role: args.role, userId: caller.userId };
  if (!args.teamId) throw new Error("a coach token names the team whose view it grants");
  return { role: "coach", userId: caller.userId, teamId: args.teamId };
}

/**
 * The game, re-read at the moment of the request.
 *
 * spec: identity-and-authorization/live-game-issuance#credential-dead-at-finish
 */
async function gameBeingPlayed(ctx: ActionCtx, gameId: string) {
  const game = await ctx.runQuery(components.snekPlatform.functions.gameForIssuance, { gameId });
  if (!game) throw new Error(`no game ${gameId}`);
  if (game.status !== "playing") throw new Error(`game ${gameId} is ${game.status}`);
  return game;
}
