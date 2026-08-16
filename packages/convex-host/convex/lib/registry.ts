// The capability registry and principal-kind gating machinery.
//
// EVERY public function this deployment exposes is built through the
// platformQuery / platformMutation / platformAction constructors below —
// never through the raw `query(` / `mutation(` / `action(` constructors —
// so that:
//
//   (a) every public function DECLARES the capability that reaches it,
//       explicitly, never derived from where its code lives
//       (spec: identity-and-authorization/capability-registry
//        #capabilities-are-declared-not-derived);
//   (b) every public function declares which principal KINDS it accepts,
//       with humans-only as the default a function departs from explicitly
//       (spec: identity-and-authorization/principal-kind-gating);
//   (c) the declaration is TOTAL AT BUILD TIME: the registry test
//       (tests/registry-totality.test.ts) fails `pnpm test` — and with it
//       the build gate — on any public Convex function that does not carry
//       this module's registration metadata, and on any raw constructor
//       call outside lib/ and betterAuth/
//       (spec: identity-and-authorization/capability-registry
//        #unregistered-function-fails-the-build).
//
// The two checks the wrapper runs are DISTINCT AND ORDERED: the capability
// check decides reachability FIRST, from the credential's structured claim
// alone; the kind check runs after, independently — a barred kind is
// refused however broad its capabilities, and a broad capability never
// implies acceptance of a kind.
// spec: identity-and-authorization/principal-kind-gating#kind-is-checked-independently-of-capability
//
// A capability grants REACHABILITY ONLY. The wrapper hands the handler a
// resolved caller and the handler still makes its own authorization
// decision — no handler may treat the capability as having settled it.
// spec: identity-and-authorization/capability-registry#reachability-is-not-authorization
import type {
  Capability,
  CapabilityEntry,
  GameCredentialScope,
  PersistentPrincipalKind,
} from "@cyphid/snek-platform-auth";
import {
  ACTING_PRINCIPAL_CLAIM,
  hasCapability,
  readCapabilityEntries,
  readGameCredentialScope,
} from "@cyphid/snek-platform-auth";
import type {
  GenericActionCtx,
  GenericMutationCtx,
  GenericQueryCtx,
  RegisteredAction,
  RegisteredMutation,
  RegisteredQuery,
} from "convex/server";
import type { ObjectType, PropertyValidators } from "convex/values";
import type { DataModel } from "../_generated/dataModel.js";
import { action, httpAction, mutation, query } from "../_generated/server.js";
import { authComponent } from "../auth.js";

type QueryCtx = GenericQueryCtx<DataModel>;
type MutationCtx = GenericMutationCtx<DataModel>;
type ActionCtx = GenericActionCtx<DataModel>;

// ---------------------------------------------------------------------------
// The resolved caller — what a handler decides ITS OWN authorization from.
// ---------------------------------------------------------------------------

/**
 * The authenticated caller, resolved to a closed union over the platform's
 * persistent identity kinds (spec: identity-and-authorization/identity-kinds).
 *
 * A human resolves to their persistent user record — the one anchor
 * authorization and attribution are decided against
 * (spec: identity-and-authorization/authentication-required
 *  #user-record-anchors-authorization). A Centaur Team arrives under a
 * per-team game credential and carries its game scope and acting
 * principal; an external system arrives under a capability token naming
 * the acting principal without a game scope.
 */
export type ResolvedCaller =
  | {
      readonly kind: "human";
      readonly userId: string;
      /**
       * Read from the user record's CURRENT value at every call — not from
       * the credential — so a designation change is effective immediately,
       * and reactive queries answering from it re-render without a reload.
       * spec: identity-and-authorization/platform-admin-role#role-effective-without-reload
       */
      readonly isAdmin: boolean;
      readonly capabilities: ReadonlyArray<CapabilityEntry>;
    }
  | {
      readonly kind: "centaur-team";
      readonly teamId: string;
      /** spec: identity-and-authorization/capability-claim-structure#acting-principal-is-recorded */
      readonly actingPrincipal: string;
      readonly gameScope: GameCredentialScope;
      readonly capabilities: ReadonlyArray<CapabilityEntry>;
    }
  | {
      readonly kind: "external-system";
      readonly systemId: string;
      readonly actingPrincipal: string;
      readonly capabilities: ReadonlyArray<CapabilityEntry>;
    };

/** Why the wrapper refused a call — returned as data, like every rejection. */
export type AccessRejection =
  // spec: identity-and-authorization/authentication-required#unauthenticated-refused
  | { readonly kind: "unauthenticated" }
  // The credential parsed but its claims are not a platform credential's.
  | { readonly kind: "malformed-credential"; readonly reason: string }
  // spec: identity-and-authorization/capability-registry
  | { readonly kind: "capability-refused"; readonly required: Capability }
  // spec: identity-and-authorization/principal-kind-gating
  | {
      readonly kind: "kind-refused";
      readonly callerKind: PersistentPrincipalKind;
      readonly accepted: ReadonlyArray<PersistentPrincipalKind>;
    };

export type AccessRefused = { readonly ok: false; readonly rejection: AccessRejection };

const refused = (rejection: AccessRejection): AccessRefused => ({ ok: false, rejection });

// ---------------------------------------------------------------------------
// Caller resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the transport-authenticated identity into a `ResolvedCaller`.
 *
 * The identity's kind is decided structurally from the credential's own
 * claims, never guessed: a credential naming an acting principal
 * (ACTING_PRINCIPAL_CLAIM) is a service principal's — with a game scope it
 * is a per-team game credential (kind "centaur-team"), without one it is
 * an external system's capability token — and a credential naming no
 * acting principal is a human's working credential, whose subject is the
 * platform's own user id and MUST resolve to the persistent user record.
 * spec: identity-and-authorization/identity-kinds
 * spec: identity-and-authorization/authentication-required
 */
export async function resolveCaller(
  ctx: QueryCtx | MutationCtx | ActionCtx,
): Promise<{ readonly ok: true; readonly caller: ResolvedCaller } | AccessRefused> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    return refused({ kind: "unauthenticated" });
  }
  const claims = identity as unknown as Record<string, unknown>;

  // The structured capability claim, read as ENTRIES from the very first
  // enforcement line — never a string split. A platform credential always
  // carries it; a credential without it (or with an unstructured value) is
  // not a credential this platform minted.
  // spec: identity-and-authorization/capability-claim-structure#structured-from-the-first-token
  const capabilities = readCapabilityEntries(claims);
  if (capabilities === null) {
    return refused({
      kind: "malformed-credential",
      reason: "missing or unstructured capabilities claim",
    });
  }

  const actingPrincipal = claims[ACTING_PRINCIPAL_CLAIM];
  if (actingPrincipal !== undefined) {
    if (typeof actingPrincipal !== "string" || actingPrincipal.length === 0) {
      return refused({ kind: "malformed-credential", reason: "malformed acting-principal claim" });
    }
    const gameScope = readGameCredentialScope(claims);
    if (gameScope !== null) {
      // A per-team game credential: subject IS the team, and the scope
      // claim must agree with it — a credential that names one team as
      // subject and another in its scope was not minted by this platform.
      // spec: identity-and-authorization/game-credential-scope
      if (gameScope.teamId !== identity.subject) {
        return refused({
          kind: "malformed-credential",
          reason: "game scope names a different team than the credential's subject",
        });
      }
      return {
        ok: true,
        caller: {
          kind: "centaur-team",
          teamId: identity.subject,
          actingPrincipal,
          gameScope,
          capabilities,
        },
      };
    }
    return {
      ok: true,
      caller: {
        kind: "external-system",
        systemId: identity.subject,
        actingPrincipal,
        capabilities,
      },
    };
  }

  // A human working credential: resolve to the persistent user record —
  // refusing when none exists, because every authorization and attribution
  // question is answered against that record.
  // spec: identity-and-authorization/authentication-required#user-record-anchors-authorization
  const user = await authComponent.getAnyUserById(ctx, identity.subject);
  if (user === null) {
    return refused({
      kind: "malformed-credential",
      reason: "credential names no persistent user record",
    });
  }
  return {
    ok: true,
    caller: {
      kind: "human",
      userId: identity.subject,
      isAdmin: (user as { isAdmin?: boolean | null }).isAdmin === true,
      capabilities,
    },
  };
}

/**
 * The ordered gate every wrapped function runs: capability decides
 * reachability FIRST, kind is checked AFTER and independently.
 * spec: identity-and-authorization/principal-kind-gating#kind-is-checked-independently-of-capability
 */
function gate(
  caller: ResolvedCaller,
  capability: Capability,
  kinds: ReadonlyArray<PersistentPrincipalKind>,
): AccessRefused | null {
  if (!hasCapability(caller.capabilities, capability)) {
    return refused({ kind: "capability-refused", required: capability });
  }
  if (!kinds.includes(caller.kind)) {
    return refused({ kind: "kind-refused", callerKind: caller.kind, accepted: kinds });
  }
  return null;
}

// ---------------------------------------------------------------------------
// Registration metadata — what the totality test reads back.
// ---------------------------------------------------------------------------

/** The metadata every registered public function carries. */
export interface PlatformRegistration {
  readonly capability: Capability;
  readonly kinds: ReadonlyArray<PersistentPrincipalKind>;
}

/** The property name the totality test looks for on every public function. */
export const REGISTRATION_PROPERTY = "platformRegistration";

function attach<T>(fn: T, registration: PlatformRegistration): T {
  Object.defineProperty(fn, REGISTRATION_PROPERTY, {
    value: registration,
    enumerable: false,
  });
  return fn;
}

/**
 * Humans-only is the DEFAULT a function departs from explicitly: a
 * function is reachable by a service principal only where it declares that
 * kind.
 * spec: identity-and-authorization/principal-kind-gating
 */
const DEFAULT_KINDS: ReadonlyArray<PersistentPrincipalKind> = ["human"];

interface PlatformFunctionSpec<Args extends PropertyValidators, Ctx, Result> {
  readonly capability: Capability;
  readonly kinds?: ReadonlyArray<PersistentPrincipalKind>;
  readonly args: Args;
  readonly handler: (ctx: Ctx, args: ObjectType<Args>, caller: ResolvedCaller) => Promise<Result>;
}

// The three constructors deliberately mirror Convex's own, so wrapping an
// existing function is a mechanical pass. Args typing stays at Convex's
// DefaultFunctionArgs grain — the offline-generated api is the untyped
// stub anyway, and handlers narrow their own args.

export function platformQuery<Args extends PropertyValidators, Result>(
  spec: PlatformFunctionSpec<Args, QueryCtx, Result>,
): RegisteredQuery<"public", ObjectType<Args>, Promise<Result | AccessRefused>> {
  const kinds = spec.kinds ?? DEFAULT_KINDS;
  const handler = async (
    ctx: QueryCtx,
    args: ObjectType<Args>,
  ): Promise<Result | AccessRefused> => {
    const resolved = await resolveCaller(ctx);
    if (!resolved.ok) return resolved;
    const gated = gate(resolved.caller, spec.capability, kinds);
    if (gated !== null) return gated;
    return await spec.handler(ctx, args, resolved.caller);
  };
  return attach(
    // A generic PropertyValidators parameter defeats the builder's overload
    // resolution; the args are still validated by spec.args at runtime, and
    // the return type re-asserts the real shape.
    // biome-ignore lint/suspicious/noExplicitAny: see above.
    query({ args: spec.args, handler } as any) as RegisteredQuery<
      "public",
      ObjectType<Args>,
      Promise<Result | AccessRefused>
    >,
    { capability: spec.capability, kinds },
  );
}

export function platformMutation<Args extends PropertyValidators, Result>(
  spec: PlatformFunctionSpec<Args, MutationCtx, Result>,
): RegisteredMutation<"public", ObjectType<Args>, Promise<Result | AccessRefused>> {
  const kinds = spec.kinds ?? DEFAULT_KINDS;
  const handler = async (
    ctx: MutationCtx,
    args: ObjectType<Args>,
  ): Promise<Result | AccessRefused> => {
    const resolved = await resolveCaller(ctx);
    if (!resolved.ok) return resolved;
    const gated = gate(resolved.caller, spec.capability, kinds);
    if (gated !== null) return gated;
    return await spec.handler(ctx, args, resolved.caller);
  };
  return attach(
    // biome-ignore lint/suspicious/noExplicitAny: see platformQuery.
    mutation({ args: spec.args, handler } as any) as RegisteredMutation<
      "public",
      ObjectType<Args>,
      Promise<Result | AccessRefused>
    >,
    { capability: spec.capability, kinds },
  );
}

export function platformAction<Args extends PropertyValidators, Result>(
  spec: PlatformFunctionSpec<Args, ActionCtx, Result>,
): RegisteredAction<"public", ObjectType<Args>, Promise<Result | AccessRefused>> {
  const kinds = spec.kinds ?? DEFAULT_KINDS;
  const handler = async (
    ctx: ActionCtx,
    args: ObjectType<Args>,
  ): Promise<Result | AccessRefused> => {
    const resolved = await resolveCaller(ctx);
    if (!resolved.ok) return resolved;
    const gated = gate(resolved.caller, spec.capability, kinds);
    if (gated !== null) return gated;
    return await spec.handler(ctx, args, resolved.caller);
  };
  return attach(
    // biome-ignore lint/suspicious/noExplicitAny: see platformQuery.
    action({ args: spec.args, handler } as any) as RegisteredAction<
      "public",
      ObjectType<Args>,
      Promise<Result | AccessRefused>
    >,
    { capability: spec.capability, kinds },
  );
}

// ---------------------------------------------------------------------------
// HTTP surface
// ---------------------------------------------------------------------------

/**
 * The registration an HTTP endpoint carries instead of a capability: HTTP
 * routes are the sign-in-adjacent protocol surface (sign-in itself, the
 * published verification material, the assertion exchange, the handoff) —
 * exactly the surfaces that cannot demand a platform credential because
 * they are how credentials are OBTAINED. Each declares how it
 * authenticates instead.
 * spec: identity-and-authorization/authentication-required ("the only
 *   unauthenticated surface is sign-in itself plus public,
 *   non-user-specific views")
 */
export interface HttpRegistration {
  /** How the route authenticates its caller. */
  readonly authenticates:
    | "better-auth-session" // a live Better Auth session (cookie/bearer)
    | "signed-assertion" // a registered principal's signed assertion
    | "public-verification-material"; // publishes public material only
  readonly rationale: string;
}

/** Build an http action carrying its HTTP registration metadata. */
export function platformHttpAction(
  registration: HttpRegistration,
  handler: (ctx: ActionCtx, request: Request) => Promise<Response>,
) {
  return attach(
    httpAction(async (ctx, request) => handler(ctx as ActionCtx, request)),
    // HTTP registrations reuse the metadata slot; the totality test
    // accepts either shape and requires one of them on every function.
    registration as unknown as PlatformRegistration,
  );
}
