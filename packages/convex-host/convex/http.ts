// The deployment's HTTP surface — the protocol layer, and only the
// protocol layer:
//
//   - Better Auth's routes (sign-in, session, the working-JWT endpoint,
//     and the STABLE WELL-KNOWN ADDRESSES publishing the platform's
//     verification material: /api/auth/convex/jwks and the OIDC discovery
//     document) — what lets a game instance, a Snek Centaur Server, or
//     any other party validate platform credentials entirely on its own.
//     spec: identity-and-authorization/verification-without-shared-secrets
//   - The service-principal assertion exchange (/issuance/game-credential):
//     machine-to-machine issuance as a project-owned endpoint rather than
//     a bent user-consent flow.
//   - The sign-in handoff (/handoff/create, /handoff/redeem).
//
// POLICY (the issuer registry and ceilings, the capability registry, kind
// gating) lives in ordinary application code — convex/lib/ and the
// function surface — never in this layer.
// design: openspec/changes/migrate-identity-and-authorization/design.md
//        ("The plugin owns protocol; ordinary application code owns policy")
import {
  ACTING_PRINCIPAL_CLAIM,
  CAPABILITIES_CLAIM,
  GAME_CREDENTIAL_CAPABILITIES,
  GAME_CREDENTIAL_SCOPE_CLAIM,
  platformAudience,
} from "@cyphid/snek-platform-auth";
import type { FunctionReference } from "convex/server";
import { httpRouter } from "convex/server";
import * as jose from "jose";
import { components, internal } from "./_generated/api.js";
import { authComponent, createAuth } from "./auth.js";
import { humanCapabilityEntries } from "./lib/grants.js";
import { verifyAssertion } from "./lib/issuance.js";
import { platformHttpAction } from "./lib/registry.js";
import { sessionLifetimeSeconds } from "./lib/sessionLifetime.js";
import { randomOpaqueValue, sha256Hex } from "./lib/sha256.js";
import { mintPlatformCredential } from "./lib/signing.js";

const http = httpRouter();

// Better Auth's protocol routes, including the published verification
// material at its stable addresses.
authComponent.registerRoutes(http, createAuth);

// ---------------------------------------------------------------------------
// Untyped-stub facades over generated references (see games.ts for why).
// ---------------------------------------------------------------------------

interface IssuanceInternalApi {
  readonly getRegistration: FunctionReference<"query", "internal">;
  readonly acceptJti: FunctionReference<"mutation", "internal">;
}
interface HandoffInternalApi {
  readonly createReference: FunctionReference<"mutation", "internal">;
  readonly redeemReference: FunctionReference<"mutation", "internal">;
  readonly recordRenewalCredential: FunctionReference<"mutation", "internal">;
  readonly getRenewalCredential: FunctionReference<"query", "internal">;
}
const internalLib = (
  internal as unknown as {
    lib: { issuance: IssuanceInternalApi; handoff: HandoffInternalApi };
  }
).lib;

interface ComponentGamesInternalApi {
  readonly getGameInternal: FunctionReference<"query", "internal">;
}
const games = (components["snek-platform"] as unknown as { games: ComponentGamesInternalApi })
  .games;

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const refuse = (status: number, rejection: unknown): Response =>
  json(status, { ok: false, rejection });

// ---------------------------------------------------------------------------
// Service-principal assertion exchange → per-team game credential
// ---------------------------------------------------------------------------

/**
 * POST /issuance/game-credential
 * Body: { assertion, gameId, teamId, requestedCapabilities? }
 *
 * The one exchange for every registered principal: a short-lived
 * assertion the principal signed with its own key, verified against the
 * material published at its registration's location; then the
 * game-credential policy — the game must be being PLAYED (re-checked at
 * this moment), the team registered to it, and the registration the
 * team's own. Renewal is this same exchange again.
 * spec: identity-and-authorization/service-principal-assertions
 * spec: identity-and-authorization/live-game-issuance
 * spec: identity-and-authorization/game-credential-scope
 */
export const issueGameCredential = platformHttpAction(
  {
    authenticates: "signed-assertion",
    rationale:
      "The issuance endpoint is where a service principal EARNS its first credential; it authenticates by assertion, not by a platform credential.",
  },
  async (ctx, request) => {
    let body: {
      assertion?: unknown;
      gameId?: unknown;
      teamId?: unknown;
      requestedCapabilities?: unknown;
    };
    try {
      body = await request.json();
    } catch {
      return refuse(400, { kind: "malformed-request", reason: "body is not JSON" });
    }
    const { assertion, gameId, teamId } = body;
    if (typeof assertion !== "string" || typeof gameId !== "string" || typeof teamId !== "string") {
      return refuse(400, {
        kind: "malformed-request",
        reason: "assertion, gameId, and teamId are required strings",
      });
    }

    // requestedCapabilities, when present, is a list of bare verb STRINGS.
    // A non-string entry is refused with the offending value NAMED — never
    // silently filtered away, which would let a request name nothing and
    // still receive both minted verbs.
    // spec: identity-and-authorization/trusted-issuer-registry#excess-fails-loudly
    let requestedCapabilities: string[] | null = null;
    if (body.requestedCapabilities !== undefined) {
      if (!Array.isArray(body.requestedCapabilities)) {
        return refuse(400, {
          kind: "malformed-request",
          reason: "requestedCapabilities must be an array of strings",
        });
      }
      for (const value of body.requestedCapabilities) {
        if (typeof value !== "string") {
          return refuse(400, { kind: "malformed-requested-capability", value });
        }
      }
      requestedCapabilities = body.requestedCapabilities as string[];
    }

    // The assertion names its issuer; the registry — queried as a set —
    // decides whether that principal is known. A valid signature over a
    // well-formed assertion proves only that someone holds a key.
    // spec: identity-and-authorization/service-principal-assertions#unregistered-principal-refused
    let issuerId: string;
    try {
      const payload = jose.decodeJwt(assertion);
      if (typeof payload.iss !== "string" || payload.iss.length === 0) {
        return refuse(400, { kind: "malformed-assertion", reason: "missing iss" });
      }
      issuerId = payload.iss;
    } catch {
      return refuse(400, { kind: "malformed-assertion", reason: "not a compact JWS" });
    }
    const registration = (await ctx.runQuery(internalLib.issuance.getRegistration, {
      issuerId,
    })) as {
      _id: string;
      issuerId: string;
      principalKind: "centaur-team" | "external-system";
      materialUrl: string;
      ceiling: string[];
    } | null;
    if (registration === null) {
      return refuse(403, { kind: "unregistered-principal" });
    }

    const verified = await verifyAssertion(assertion, registration);
    if (!verified.ok) {
      return refuse(403, verified.rejection);
    }

    // Single use, transactionally: each assertion is accepted once.
    // spec: identity-and-authorization/service-principal-assertions#replayed-assertion-refused
    const jtiResult = (await ctx.runMutation(internalLib.issuance.acceptJti, {
      jti: verified.verified.jti,
      expiresAtMs: verified.verified.expiresAtMs,
      nowMs: Date.now(),
    })) as { accepted: boolean };
    if (!jtiResult.accepted) {
      return refuse(403, { kind: "replayed-assertion" });
    }

    // Ceiling enforcement, gated on what is actually MINTED — not on the
    // request string. A game credential confers EXACTLY the two
    // game-credential verbs by definition (below), so a registration whose
    // ceiling omits either cannot confer a game credential at all: issuance
    // is refused NAMING the missing verb(s), never narrowed to the covered
    // subset. Checking `requested` alone would let a request naming only a
    // covered verb still receive both minted.
    // spec: identity-and-authorization/trusted-issuer-registry#excess-fails-loudly
    // spec: identity-and-authorization/game-credential-scope
    const ceiling = new Set(registration.ceiling);
    const conferred = GAME_CREDENTIAL_CAPABILITIES.map((entry) => entry.verb);
    const missing = conferred.filter((verb) => !ceiling.has(verb));
    if (missing.length > 0) {
      return refuse(403, { kind: "capability-excess", excess: missing });
    }
    // A caller MAY name capabilities explicitly; any beyond the ceiling is
    // still refused with the excess named, never quietly narrowed.
    // spec: identity-and-authorization/trusted-issuer-registry#excess-fails-loudly
    if (requestedCapabilities !== null) {
      const excess = requestedCapabilities.filter((verb) => !ceiling.has(verb));
      if (excess.length > 0) {
        return refuse(403, { kind: "capability-excess", excess });
      }
    }

    // Game-credential policy: only a centaur-team registration earns a
    // game credential, only for ITS OWN team (the registration's issuerId
    // IS the team id — homing and consent wiring belong to the
    // team-server-management story), and only while the game is being
    // played — re-checked at this moment, so the very next request after
    // a finish is refused however valid the assertion.
    // spec: identity-and-authorization/live-game-issuance#credential-dead-at-finish
    if (registration.principalKind !== "centaur-team" || registration.issuerId !== teamId) {
      return refuse(403, { kind: "not-the-teams-registration" });
    }
    const game = (await ctx.runQuery(games.getGameInternal, { gameId })) as {
      phase: "configuring" | "playing" | "finished";
      teams: Array<{ centaurTeamId: string }>;
    } | null;
    if (game === null) {
      return refuse(403, { kind: "game-not-found" });
    }
    if (game.phase !== "playing") {
      return refuse(403, { kind: "game-not-playing", phase: game.phase });
    }
    if (!game.teams.some((team) => team.centaurTeamId === teamId)) {
      return refuse(403, { kind: "team-not-registered" });
    }

    // Mint: the credential names the TEAM as its subject, records the
    // acting principal, is audience-bound to the platform's own
    // functions, scoped to exactly this game and team, and grants exactly
    // the two capabilities — nothing else, for every Server alike.
    // spec: identity-and-authorization/game-credential-scope#grants-nothing-beyond-the-two
    // spec: identity-and-authorization/capability-claim-structure#uniform-today-attenuable-tomorrow
    const minted = await mintPlatformCredential(ctx, {
      subject: teamId,
      audience: platformAudience(),
      claims: {
        [ACTING_PRINCIPAL_CLAIM]: registration.issuerId,
        [GAME_CREDENTIAL_SCOPE_CLAIM]: { gameId, teamId },
        [CAPABILITIES_CLAIM]: GAME_CREDENTIAL_CAPABILITIES,
      },
    });
    return json(200, { ok: true, credential: minted.credential, expiresAtMs: minted.expiresAtMs });
  },
);

http.route({ path: "/issuance/game-credential", method: "POST", handler: issueGameCredential });

// ---------------------------------------------------------------------------
// Sign-in handoff
// ---------------------------------------------------------------------------

/**
 * POST /handoff/create — authenticated (Better Auth session).
 * Body: { serverId, challengeS256, returnAddress? }
 *
 * Creates a handoff reference for the signed-in human toward a registered
 * Server. The response names the ONE return address the platform will
 * redirect to — always from the Server's registration, never from the
 * request.
 * spec: identity-and-authorization/sign-in-handoff
 */
export const handoffCreate = platformHttpAction(
  {
    authenticates: "better-auth-session",
    rationale:
      "Creating a handoff is part of the sign-in flow itself: it runs at the platform origin under the session cookie, before any platform-function credential exists.",
  },
  async (ctx, request) => {
    const auth = createAuth(ctx);
    const session = (await auth.api.getSession({ headers: request.headers })) as {
      user: { id: string };
      session: { id: string };
    } | null;
    if (session === null) {
      // spec: identity-and-authorization/authentication-required#unauthenticated-refused
      return refuse(401, { kind: "unauthenticated" });
    }
    // The originating session's own row id — a non-secret handle to the
    // session established at sign-in, never its token. Carried onto the
    // handoff so what it mints dies with this session.
    // spec: identity-and-authorization/token-lifetime-and-refresh#renewal-re-reads-the-session
    const originatingSessionId = session.session.id;
    let body: { serverId?: unknown; challengeS256?: unknown; returnAddress?: unknown };
    try {
      body = await request.json();
    } catch {
      return refuse(400, { kind: "malformed-request", reason: "body is not JSON" });
    }
    if (typeof body.serverId !== "string" || typeof body.challengeS256 !== "string") {
      return refuse(400, {
        kind: "malformed-request",
        reason: "serverId and challengeS256 are required strings",
      });
    }
    if (!/^[0-9a-f]{64}$/.test(body.challengeS256)) {
      return refuse(400, {
        kind: "malformed-request",
        reason: "challengeS256 must be lowercase hex sha-256",
      });
    }
    const reference = randomOpaqueValue();
    const refHash = await sha256Hex(reference);
    const result = (await ctx.runMutation(internalLib.handoff.createReference, {
      serverId: body.serverId,
      userId: session.user.id,
      refHash,
      challengeS256: body.challengeS256,
      originatingSessionId,
      requestedReturnAddress: typeof body.returnAddress === "string" ? body.returnAddress : null,
      nowMs: Date.now(),
    })) as { ok: true; returnAddress: string } | { ok: false; rejection: { kind: string } };
    if (!result.ok) {
      return refuse(403, result.rejection);
    }
    return json(200, { ok: true, reference, returnAddress: result.returnAddress });
  },
);

http.route({ path: "/handoff/create", method: "POST", handler: handoffCreate });

/**
 * POST /handoff/redeem — unauthenticated transport; what authenticates
 * the caller is possession of the PKCE-shaped VERIFIER, which never
 * travelled in the reference's URL.
 * Body: { reference, verifier }
 *
 * Single-use, transactional. The credential returned is an opaque RENEWAL
 * credential — NOT a second independent Better Auth session. It is bounded
 * two ways, recorded on the handoff_credentials row:
 *
 *   (a) by the redeeming Server's registered ceiling: every working
 *       credential minted under it carries the human's capabilities
 *       intersected with that ceiling, never the human's full set
 *       (spec: identity-and-authorization/sign-in-handoff
 *        #server-never-holds-the-provider-exchange,
 *        peer-capability-ceiling#ceiling-sits-below-the-user);
 *   (b) to the human's ORIGINATING session: the working-credential mint path
 *       re-reads that session's liveness on every renewal, so revoking it
 *       ends renewal under this credential
 *       (spec: identity-and-authorization/token-lifetime-and-refresh
 *        #renewal-re-reads-the-session).
 *
 * DESIGN CHOICE (why not a second session): a second independent session
 * would carry the human's FULL capabilities and would survive revocation of
 * the human's originating session — a credential outliving the human's
 * presence. Anchoring to the originating session id, and minting working
 * credentials through a dedicated ceiling-bounded path rather than Better
 * Auth's /token (whose payload is global and cannot be narrowed per handoff),
 * is what makes both bounds enforceable. The renewal credential is opaque and
 * stateful (checked against platform state every use), so it does not violate
 * the fifteen-minute self-contained bound.
 * spec: identity-and-authorization/sign-in-handoff#the-redeemer-keeps-what-it-earns
 * spec: global-invariants/credential-confinement ("credentials return
 *   only to the requester")
 */
export const handoffRedeem = platformHttpAction(
  {
    authenticates: "signed-assertion",
    rationale:
      "Redemption authenticates by proof-of-verifier: the party that generated the challenge is the party the credential was minted for.",
  },
  async (ctx, request) => {
    let body: { reference?: unknown; verifier?: unknown };
    try {
      body = await request.json();
    } catch {
      return refuse(400, { kind: "malformed-request", reason: "body is not JSON" });
    }
    if (typeof body.reference !== "string" || typeof body.verifier !== "string") {
      return refuse(400, {
        kind: "malformed-request",
        reason: "reference and verifier are required strings",
      });
    }
    const result = (await ctx.runMutation(internalLib.handoff.redeemReference, {
      refHash: await sha256Hex(body.reference),
      verifierS256: await sha256Hex(body.verifier),
      nowMs: Date.now(),
    })) as
      | { ok: true; userId: string; ceiling: string[]; originatingSessionId: string }
      | { ok: false; rejection: { kind: string } };
    if (!result.ok) {
      return refuse(403, result.rejection);
    }
    const renewalCredential = randomOpaqueValue();
    const now = Date.now();
    const expiresAtMs = now + sessionLifetimeSeconds() * 1000;
    await ctx.runMutation(internalLib.handoff.recordRenewalCredential, {
      credentialHash: await sha256Hex(renewalCredential),
      userId: result.userId,
      ceiling: result.ceiling,
      originatingSessionId: result.originatingSessionId,
      expiresAtMs,
    });
    return json(200, { ok: true, renewalCredential, expiresAtMs });
  },
);

http.route({ path: "/handoff/redeem", method: "POST", handler: handoffRedeem });

// Better Auth session lookup facade (untyped-stub over the component adapter).
interface BetterAuthAdapterApi {
  readonly findOne: FunctionReference<"query", "internal">;
}
const betterAuthAdapter = (
  components as unknown as { betterAuth: { adapter: BetterAuthAdapterApi } }
).betterAuth.adapter;

/** The bearer credential a request carries, if any. */
function bearerOf(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header === null) return null;
  const match = /^Bearer (.+)$/.exec(header);
  return match?.[1] ?? null;
}

/**
 * POST /handoff/working-credential — the ceiling-bounded, origin-anchored
 * working-credential mint for a handoff renewal credential.
 * Auth: Bearer <renewal credential> (the opaque value redemption returned).
 *
 * Every mint here re-reads the originating session's liveness and re-applies
 * the Server's ceiling, so neither the human's absence nor the Server's bound
 * can be outlived by a credential minted in the human's name.
 * spec: identity-and-authorization/token-lifetime-and-refresh#renewal-re-reads-the-session
 * spec: identity-and-authorization/sign-in-handoff#server-never-holds-the-provider-exchange
 * spec: identity-and-authorization/peer-capability-ceiling#ceiling-sits-below-the-user
 */
export const handoffWorkingCredential = platformHttpAction(
  {
    authenticates: "better-auth-session",
    rationale:
      "The renewal credential is the stateful anchor a working credential is minted under — this endpoint plays Better Auth's /token role for the handoff, but bounded by the Server's ceiling and the originating session's liveness.",
  },
  async (ctx, request) => {
    const renewalCredential = bearerOf(request);
    if (renewalCredential === null) {
      return refuse(401, { kind: "unauthenticated" });
    }
    const row = (await ctx.runQuery(internalLib.handoff.getRenewalCredential, {
      credentialHash: await sha256Hex(renewalCredential),
      nowMs: Date.now(),
    })) as { userId: string; ceiling: string[]; originatingSessionId: string } | null;
    if (row === null) {
      return refuse(401, { kind: "renewal-refused" });
    }

    // Re-read the ORIGINATING session's liveness: a revoked (deleted) or
    // expired session ends renewal, whatever the Server's registration still
    // permits — a human's absence ends what is minted in their name.
    // spec: identity-and-authorization/token-lifetime-and-refresh#renewal-re-reads-the-session
    const originSession = (await ctx.runQuery(betterAuthAdapter.findOne, {
      model: "session",
      where: [{ field: "_id", value: row.originatingSessionId }],
    })) as { expiresAt?: number } | null;
    if (originSession === null || (originSession.expiresAt ?? 0) <= Date.now()) {
      return refuse(401, { kind: "renewal-refused" });
    }

    // Capabilities = the human's current capabilities INTERSECTED with the
    // redeeming Server's ceiling — re-read from the user record each renewal,
    // never the human's full set.
    // spec: identity-and-authorization/sign-in-handoff#server-never-holds-the-provider-exchange
    // spec: identity-and-authorization/peer-capability-ceiling#ceiling-sits-below-the-user
    const user = (await authComponent.getAnyUserById(ctx, row.userId)) as {
      isAdmin?: boolean | null;
    } | null;
    if (user === null) {
      return refuse(401, { kind: "renewal-refused" });
    }
    const ceiling = new Set(row.ceiling);
    const capabilities = humanCapabilityEntries(user.isAdmin === true).filter((entry) =>
      ceiling.has(entry.verb),
    );

    const minted = await mintPlatformCredential(ctx, {
      subject: row.userId,
      audience: platformAudience(),
      claims: { [CAPABILITIES_CLAIM]: capabilities },
    });
    return json(200, {
      ok: true,
      workingCredential: minted.credential,
      expiresAtMs: minted.expiresAtMs,
    });
  },
);

http.route({
  path: "/handoff/working-credential",
  method: "POST",
  handler: handoffWorkingCredential,
});

export default http;
