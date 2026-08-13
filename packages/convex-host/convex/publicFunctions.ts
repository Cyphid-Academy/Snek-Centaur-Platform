// spec: identity-and-authorization/capability-registry,
//       identity-and-authorization/principal-kind-gating,
//       identity-and-authorization/peer-capability-ceiling
// How a public function is built, and the only way one may be.
//
// This is the only module in `convex/` permitted to import Convex's
// `query`/`mutation`/`action`: `scripts/check-public-surface.mjs` fails the
// build on any other file that does, and on any exported handler that did not
// go through a builder here.
import type { GenericCtx } from "@convex-dev/better-auth";
import { RateLimiter, type RunMutationCtx } from "@convex-dev/rate-limiter";
import { customAction, customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { ConvexError, v } from "convex/values";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { action, httpAction, mutation, query } from "./_generated/server";
import { createAuth } from "./auth";
import { verify } from "./auth/credential";
import {
  PLATFORM_AUDIENCE,
  type PlatformPrincipal,
  decodePrincipal,
  deploymentKeys,
  issuer,
} from "./auth/deployment";
import {
  ANONYMOUS_CAPABILITIES,
  type CAPABILITIES,
  type Capability,
  HUMANS_ONLY,
  type PrincipalKind,
  SESSION_CAPABILITIES,
} from "./capabilities";

/**
 * What a public function declares about itself.
 *
 * `principals` is optional and defaults to human identities alone — the default
 * `principal-kind-gating` requires a function to depart from explicitly, so
 * accepting a Snek Centaur Server or a registered external system is always
 * visible at the declaration site.
 *
 * Both parameters are inferred from the literal a function declares, and they
 * are what makes `ctx.caller` arrive already narrowed — see `AdmittedCaller`.
 */
export interface PublicFunctionDeclaration<
  C extends Capability = Capability,
  K extends PrincipalKind = PrincipalKind,
> {
  readonly capability: C;
  readonly principals?: ReadonlyArray<K>;
}

/**
 * The capabilities the registry declares anonymously reachable, as a type.
 *
 * The same fact `ANONYMOUS_CAPABILITIES` derives at runtime, read off the same
 * `as const` registry — so the two cannot disagree, and neither is a list.
 */
type AnonymousCapability = {
  [K in Capability]: (typeof CAPABILITIES)[K] extends { anonymous: true } ? K : never;
}[Capability];

/**
 * The caller a handler receives, given what its function declared.
 *
 * **Both checks `admit` performs are already in this type, so no handler
 * repeats either.** The kind narrows to what was declared, because a principal
 * of any other kind was refused before the handler ran; and `null` appears only
 * where the capability is anonymously reachable, because everywhere else a
 * caller with no credential could not have reached the function at all. Seven
 * handlers used to open with a hand-written `if (caller?.kind !== "human")`,
 * each with its own message and each an opportunity to check the wrong thing —
 * or, worse, to check nothing and read a field the kind does not have.
 *
 * spec: identity-and-authorization/principal-kind-gating
 */
export type AdmittedCaller<C extends Capability, K extends PrincipalKind> =
  | Extract<Principal, { kind: K }>
  | (C extends AnonymousCapability ? null : never);

/**
 * The caller as a handler may see it: who is calling, by the platform's own
 * durable identifier, and of which kind. `null` is the anonymous caller, who
 * reached a function on `ANONYMOUS_CAPABILITIES` alone.
 *
 * It is the credential's subject, decoded — so a handler receives the ids its
 * caller's kind is actually identified by (`identity-kinds`), and deliberately
 * *not* the capabilities the credential carried: withholding them is the only
 * form of the cited rule an API shape can enforce.
 *
 * spec: identity-and-authorization/capability-registry#reachability-is-not-authorization
 */
export type Principal = PlatformPrincipal;

/**
 * A caller as the credential presented describes it.
 *
 * `actingSystem` is the registered system the call came *through*, from the
 * credential's `act` — set on every credential issuance mints for a service
 * principal, whether the subject is that system itself or the human it redeemed
 * a handoff for. It lives here and deliberately not on `Principal`: the two
 * things below are the platform's own business, and the paragraph above
 * `Principal` says why a handler is given the subject and nothing else.
 *
 * spec: identity-and-authorization/capability-claim-structure#acting-principal-is-recorded
 */
export interface ResolvedCaller {
  readonly principal: Principal;
  readonly capabilities: ReadonlyArray<Capability>;
  readonly actingSystem?: string;
}

/**
 * The bound on a registered system's calls: how many, over how long.
 *
 * Constants rather than a column of the issuer's registration, on cost. The
 * assertion path holds a registration already, but the credentialed path —
 * every ordinary public call a system makes — knows only the issuer named in
 * `act`, so reading a limit from the registry would be a component query on
 * every single call to learn a number that is the same for everyone. A
 * per-issuer limit is a registration column and a second lookup on the day one
 * is actually wanted.
 *
 * spec: identity-and-authorization/peer-capability-ceiling
 */
export const CALL_WINDOW_MS = 60_000;
export const CALLS_PER_WINDOW = 600;

/**
 * The bound itself, kept by `@convex-dev/rate-limiter`.
 *
 * A token bucket rather than a fixed window, which is the whole reason the
 * counting moved out of our own component: a fixed window admits its full
 * allowance in the last instant of one window and again in the first instant of
 * the next, so the burst a ceiling exists to bound is exactly the one it lets
 * through. A bucket refilling at `rate` per `period` cannot be gamed that way,
 * and `capacity` defaults to `rate`, so an issuer that has been quiet starts
 * able to spend a full window's worth and no more.
 *
 * Deliberately unsharded. Sharding divides the capacity and spends a randomly
 * chosen shard, which buys write throughput by making the ceiling approximate —
 * a call can be refused while capacity sits in another shard. That is a poor
 * trade for a bound whose entire job is to say exactly what a compromised peer
 * may do, so the default of one shard stands until contention is something we
 * have measured rather than imagined. The lever is `shards:` on this object.
 *
 * Exported for the suite beside this file, which spends a bucket down to its
 * last token to test the boundary from both sides. Through this object rather
 * than one of its own, so the fixture and the code under test cannot disagree
 * about what the bound is — and through the limiter at all rather than by
 * seeding a row, which is a thing the counting component no longer lets anyone
 * outside it do.
 *
 * spec: identity-and-authorization/peer-capability-ceiling
 */
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  systemCall: { kind: "token bucket", rate: CALLS_PER_WINDOW, period: CALL_WINDOW_MS },
});

/**
 * What a refused call tells the party that has to act on it.
 *
 * A `ConvexError` rather than a bare `Error`, which is the difference between
 * the operator of that system reading this and reading nothing: a production
 * deployment reveals a thrown `Error`'s message to no caller, so the refusal
 * that named an issuer and its bound in prose named them only in the logs.
 * `retryAfter` is the question an operator asks next and the one a bare count
 * could never answer.
 *
 * spec: identity-and-authorization/peer-capability-ceiling
 */
export interface CallBoundExceeded {
  readonly kind: "call-bound-exceeded";
  readonly issuerId: string;
  readonly limit: number;
  readonly windowMs: number;
  readonly retryAfter: number;
}

/**
 * How long an attribution record is kept. It exists to be reviewed, and a
 * record past the point anyone will review it is only a durable account of who
 * acted through whom.
 *
 * Exported for the suite beside this file, so the case that walks a record up
 * to its expiry and past it is asking about the retention this states rather
 * than about a number of its own that happens to agree today.
 *
 * spec: identity-and-authorization/peer-capability-ceiling#attribution-is-user-visible
 */
export const ATTRIBUTION_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * A context that can write — a mutation's or an action's, never a query's.
 * Spelled structurally because the one function below is reached from both, and
 * because a query context failing to satisfy it is exactly the distinction the
 * recording turns on.
 *
 * The rate limiter's own `RunMutationCtx` rather than a hand-rolled twin of it,
 * which is the same two-method shape this file used to spell for itself. It
 * carries `runQuery` as well, not because anything here reads but because that
 * is what the limiter asks for; `writes()` below still turns on `runMutation`
 * alone, which remains the honest test of the distinction.
 */
type Writer = RunMutationCtx;

/**
 * Charge one call to a registered system's window, refusing when the window is
 * spent, and record the attribution where the call was taken for a human.
 *
 * Both enforcement points call this, and there are exactly two, because there
 * are exactly two ways a registered system's call is authenticated: it presents
 * a credential, which every public function resolves through `declared` below,
 * or it presents a signed assertion, which `issuance.ts` authenticates directly
 * — that path holds no credential yet, so nothing downstream would ever see it.
 *
 * `limit` reads and spends the bucket in a single component mutation, which is
 * what lets the bound be charged where the change is made: two calls arriving
 * together cannot both pass a count neither has settled, because there is no
 * moment between the read and the write for the other to occupy.
 *
 * The attribution is written afterwards and only on the admitting path, so a
 * refused call still leaves no record of an action nobody took. From a mutation
 * the two are the caller's own transaction and roll back together; from an
 * action they are two transactions, as every component call from an action
 * already is.
 *
 * spec: identity-and-authorization/peer-capability-ceiling
 * spec: global-invariants/transactional-invariant-enforcement#concurrent-mutations-cannot-race-past-a-guard
 */
export async function boundSystemCall(
  ctx: Writer,
  issuerId: string,
  attribution?: { userId: string; capability: Capability },
): Promise<void> {
  const { ok, retryAfter } = await rateLimiter.limit(ctx, "systemCall", { key: issuerId });
  // Thrown here rather than by the limiter's own `throws`, which names the
  // limit but not the issuer: naming both is what makes the refusal actionable
  // by the party that has to act on it — the operator of that system, who
  // otherwise learns only that something of theirs was refused.
  if (!ok) {
    throw new ConvexError({
      kind: "call-bound-exceeded",
      issuerId,
      limit: CALLS_PER_WINDOW,
      windowMs: CALL_WINDOW_MS,
      retryAfter,
    } satisfies CallBoundExceeded);
  }
  if (attribution) {
    await ctx.runMutation(components.snekPlatform.functions.recordAttribution, {
      issuerId,
      ...attribution,
      expiresAt: Date.now() + ATTRIBUTION_RETENTION_MS,
    });
  }
}

/**
 * The one argument every public function carries beyond its own: the platform
 * credential the caller presents, if it holds one.
 *
 * An argument rather than the `Authorization` header, which is where a bearer
 * token belongs and where a human's Better Auth session does arrive. Convex
 * resolves that header itself, against the issuers listed in `auth.config.ts`,
 * and this deployment is not one of them: a credential of ours presented there
 * is not resolved into `ctx.auth`, and the raw token never reaches a query
 * context to be verified by hand either. The builders below consume
 * this argument before the handler runs, so no handler ever sees a credential
 * or could mistake holding one for having checked it.
 */
const CREDENTIAL_ARG = { credential: v.optional(v.string()) };

/**
 * THE SEAM. The single point at which a caller's identity enters the public
 * surface: it verifies whatever credential the request carried and answers who
 * presented it, or `null` when none was presented.
 *
 * Two ways in, and only two. A platform credential is verified against this
 * deployment's own published material with `auth/credential.ts`'s `verify`,
 * bound to this platform's audience — so a game access token, which names a
 * game instead, is refused here rather than anywhere later. A human's session
 * arrives instead through `ctx.auth`, already resolved by Convex against the
 * Better Auth component: that component's `account` row is the provider linkage
 * `linked-provider-credentials` describes, so the subject Convex hands back
 * *is* the platform user record, resolved through the linkage and nothing else.
 *
 * Every enforcement site below reads that one answer, so nothing else in
 * `convex/` needs to learn how a credential is checked.
 *
 * spec: identity-and-authorization/authentication-required#user-record-anchors-authorization
 * spec: identity-and-authorization/linked-provider-credentials#the-linkage-is-the-only-lookup
 */
export async function resolveCaller(
  ctx: GenericCtx<DataModel>,
  credential?: string,
): Promise<ResolvedCaller | null> {
  if (credential) {
    const payload = await verify(credential, await deploymentKeys(ctx), {
      issuer: issuer(),
      audience: PLATFORM_AUDIENCE,
    });
    const principal = decodePrincipal(payload.sub);
    if (!principal) throw new Error("credential names no principal this platform recognises");
    // Entries, never a string this code splits — so constraining an entry later
    // is a change to minting and to nothing here.
    // spec: identity-and-authorization/capability-claim-structure#structured-from-the-first-token
    return {
      principal,
      capabilities: payload.cap.map((entry) => entry.capability),
      // Omitted when the credential names no acting system, rather than carried
      // as an explicit `undefined`: `actingSystem` is optional because a caller
      // may genuinely act for nobody, and the two spellings mean the same thing
      // to every reader of a `ResolvedCaller` — so only one of them should exist.
      ...(payload.act === undefined ? {} : { actingSystem: payload.act }),
    };
  }
  const identity = await ctx.auth.getUserIdentity();
  return (
    identity && {
      principal: { kind: "human", userId: identity.subject },
      capabilities: SESSION_CAPABILITIES,
    }
  );
}

/**
 * The two checks, in the order `principal-kind-gating` fixes.
 *
 * Capability first, deciding only whether the credential reaches this function
 * at all and knowing nothing about the caller beyond the claim. Kind second,
 * and separately: breadth of capability never implies acceptance of kind, so a
 * principal of an undeclared kind is refused however broad its claim
 * (`#kind-is-checked-independently-of-capability`,
 * `#service-reach-is-declared-never-inferred`). Both must pass.
 */
async function admit(
  ctx: GenericCtx<DataModel>,
  credential: string | undefined,
  declaration: PublicFunctionDeclaration,
): Promise<ResolvedCaller | null> {
  return admitCaller(await resolveCaller(ctx, credential), declaration);
}

/**
 * The same two checks, over a caller somebody else resolved.
 *
 * Split out because there is one caller `resolveCaller` cannot produce: a human
 * arriving at an HTTP route with a session *cookie*. Convex populates `ctx.auth`
 * from a validated `Authorization` JWT and never from a cookie, so
 * `publicHttpAction` below reads that session from Better Auth and lands here
 * with the answer. The checks stay in one place; only the way the caller was
 * learned differs.
 */
async function admitCaller(
  caller: ResolvedCaller | null,
  declaration: PublicFunctionDeclaration,
): Promise<ResolvedCaller | null> {
  const claim = caller?.capabilities ?? ANONYMOUS_CAPABILITIES;
  if (!claim.includes(declaration.capability)) {
    throw new Error(`no capability ${declaration.capability} in the caller's claim`);
  }
  // The anonymous caller is not a principal at all, so there is no kind to
  // accept or refuse: what it may reach was settled entirely by the claim above.
  const kind = caller?.principal.kind;
  if (kind && !(declaration.principals ?? HUMANS_ONLY).includes(kind)) {
    throw new Error(`this function does not accept a ${kind} principal`);
  }
  return caller;
}

/**
 * The customization all three builders share: consume the credential, admit,
 * and — where the call came through a registered system — charge it against
 * that system's bound and write down what was done on whose behalf.
 *
 * Centrally, so that no handler has to remember either. The handler still
 * receives the principal alone, which is the whole of `Principal`'s reticence:
 * `act` reaches the platform's own bookkeeping and never a handler that could
 * read it as standing.
 *
 * spec: identity-and-authorization/peer-capability-ceiling#read-volume-is-bounded-outside-the-capability-system
 * spec: identity-and-authorization/peer-capability-ceiling
 * spec: identity-and-authorization/peer-capability-ceiling#the-bound-is-charged-where-the-change-is-made
 * spec: identity-and-authorization/peer-capability-ceiling#attribution-is-user-visible
 */
const declared = <C extends Capability, K extends PrincipalKind>(
  declaration: PublicFunctionDeclaration<C, K>,
) => ({
  args: CREDENTIAL_ARG,
  input: async (ctx: GenericCtx<DataModel> & Partial<Writer>, args: { credential?: string }) => {
    const caller = await admit(ctx, args.credential, declaration);
    if (caller?.actingSystem && writes(ctx)) {
      // Attribution names a human or nobody: a system acting as itself, or for
      // a Centaur Team, has taken no action on any user's account for a user to
      // be shown.
      const subject = caller.principal;
      await boundSystemCall(
        ctx,
        caller.actingSystem,
        subject.kind === "human"
          ? { userId: subject.userId, capability: declaration.capability }
          : undefined,
      );
    }
    // The cast is where the two runtime checks above become the type below:
    // `admitCaller` has already refused every kind this function did not
    // declare, and refused the anonymous caller unless the capability is
    // anonymously reachable, so what remains is exactly `AdmittedCaller`.
    // TypeScript cannot see that a value-level `includes` narrowed a union, and
    // this is the one place the correspondence is asserted rather than repeated
    // in every handler.
    return {
      ctx: { caller: (caller?.principal ?? null) as AdmittedCaller<C, K> },
      args: {},
    };
  },
});

const writes = (
  ctx: GenericCtx<DataModel> & Partial<Writer>,
): ctx is GenericCtx<DataModel> & Writer => ctx.runMutation !== undefined;

export const publicQuery = <C extends Capability, K extends PrincipalKind = "human">(
  declaration: PublicFunctionDeclaration<C, K>,
) => customQuery(query, declared(declaration));

export const publicMutation = <C extends Capability, K extends PrincipalKind = "human">(
  declaration: PublicFunctionDeclaration<C, K>,
) => customMutation(mutation, declared(declaration));

/**
 * A public action, declaring what reaches it.
 *
 * Actions exist on this surface for one reason: issuance has to reach the
 * network, to read the material a service principal publishes at the location
 * its registration records. Nothing else about them differs.
 */
export const publicAction = <C extends Capability, K extends PrincipalKind = "human">(
  declaration: PublicFunctionDeclaration<C, K>,
) => customAction(action, declared(declaration));

/**
 * A publication endpoint: an HTTP route serving one fixed public document.
 *
 * It declares no capability, and that is sound rather than an exemption — the
 * builder gives its body no context at all, so such a route cannot read a
 * caller, reach state, or do anything but return material that is public by
 * definition. `verification-without-shared-secrets` requires these addresses to
 * be reachable by a game instance that holds nothing of ours, so a capability
 * check on them would be a check nobody could ever pass.
 *
 * spec: identity-and-authorization/verification-without-shared-secrets
 */
export const publishedDocument = (document: () => unknown) =>
  httpAction(async () => Response.json(document()));

/**
 * The published key-set endpoint: `publishedDocument`'s one sibling, for the
 * document that is not fixed. The keys live where Better Auth's `jwt` plugin
 * keeps them (`auth/deployment.ts`), so serving them takes the context the
 * plugin reads through — and the body below is the plugin's own endpoint, not
 * a handler of ours, so the route still cannot read a caller or reach anything
 * beyond the material it publishes. The plugin creates the deployment's key on
 * the first read of an empty store, so this address is never a 404 that a game
 * instance's startup trips over.
 *
 * spec: identity-and-authorization/verification-without-shared-secrets
 * spec: identity-and-authorization/verification-without-shared-secrets#same-material-platform-wide
 */
export const publishedKeySet = () =>
  httpAction(async (ctx) => Response.json(await createAuth(ctx).api.getJwks()));

/**
 * A public HTTP route a browser navigates to, declaring what reaches it.
 *
 * The one departure from `declared()` is where the caller comes from. A browser
 * arriving here carries the platform's session as a *cookie*, and Convex
 * populates `ctx.auth` from a validated `Authorization` JWT and never from a
 * cookie — so `resolveCaller` sees nothing, and the same is true of
 * `@convex-dev/better-auth`'s own `getAuthUser`/`getHeaders` helpers, which all
 * start from `ctx.auth.getUserIdentity()`. The session is therefore read from
 * Better Auth directly and turned into the same `ResolvedCaller` the credentialed
 * path produces. The subject is Better Auth's `user.id`, which is the id
 * `ctx.auth`'s `identity.subject` carries too, so a route here and a function
 * call elsewhere name the same human the same way.
 *
 * Both checks are `admitCaller`'s, unchanged and unduplicated — the point of
 * splitting it. A refusal becomes a status code rather than escaping as a 500:
 * 401 where nothing identified the caller, 403 where something did and it was
 * not enough.
 *
 * The declaration and the route are two arguments, and the route is an object
 * carrying `handler` rather than a bare function, because
 * `scripts/check-public-surface.mjs` recognises a public function by that key. A
 * positional callback would build a route the totality check cannot see, which
 * is the one thing this module exists to prevent.
 *
 * spec: identity-and-authorization/capability-registry
 * spec: identity-and-authorization/authentication-required
 */
export const publicHttpAction = <C extends Capability, K extends PrincipalKind = "human">(
  declaration: PublicFunctionDeclaration<C, K>,
  route: {
    handler: (
      ctx: ActionCtx & { caller: AdmittedCaller<C, K> },
      request: Request,
    ) => Promise<Response>;
  },
) =>
  httpAction(async (ctx, request) => {
    const session = await sessionCaller(ctx, request);
    try {
      await admitCaller(session, declaration);
    } catch (refusal) {
      const message = refusal instanceof Error ? refusal.message : "refused";
      return new Response(message, {
        status: session ? 403 : 401,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return route.handler(
      Object.assign(ctx, { caller: (session?.principal ?? null) as AdmittedCaller<C, K> }),
      request,
    );
  });

/**
 * The human whose session cookie this request carries, as a caller — or `null`,
 * which is every caller who has not signed in yet and is not an error here.
 *
 * `SESSION_CAPABILITIES` is the claim, exactly as the `ctx.auth` branch of
 * `resolveCaller` gives it: this is the same principal reaching the platform by
 * a different door, so it may reach the same things.
 */
async function sessionCaller(ctx: ActionCtx, request: Request): Promise<ResolvedCaller | null> {
  const session = await createAuth(ctx).api.getSession({ headers: request.headers });
  return (
    session && {
      principal: { kind: "human", userId: session.user.id },
      capabilities: SESSION_CAPABILITIES,
    }
  );
}
