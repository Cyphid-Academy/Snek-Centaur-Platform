// spec: identity-and-authorization/trusted-issuer-registry,
//       identity-and-authorization/platform-admin-role
// What this deployment was told rather than derived: who it trusts, and who
// administers it. (That both once had no writer at all, and what that made
// unreachable, is recorded in design.md's third departure.)
//
// **Internal, not public, and that is the whole shape of the decision.** Both
// are operator acts: someone at Cyphid decides that a Server or peer system is
// trusted — recording where it publishes its keys, what it may ever confer, and
// where humans may be returned to it — or that a particular human administers
// this deployment. Nobody *calls* these over the platform's public surface, so
// they declare no capability and appear in no ceiling, which also keeps them out
// of reach of the only kind of caller that could abuse them. They are invoked
// against the deployment with an admin credential (`convex run`), which is
// exactly the audience they have — and which is how a deployment holding no
// admin yet designates its first one
// (`platform-admin-role#a-deployment-can-designate-its-first-admin`).
//
// They reach their data through the component, like every other host function:
// the tables are `convex-snek-platform`'s, and the host is where a write to one
// is addressed from.
import { v } from "convex/values";
import { issuerRegistration } from "../../convex-snek-platform/convex/schema";
import { components } from "./_generated/api";
import { internalMutation } from "./_generated/server";

/**
 * Register a trusted issuer, replacing whatever was held for it.
 *
 * The argument shape is the component's own `issuerRegistration`, imported
 * rather than restated so the four public fields are spelled once. There is no
 * fifth, and the record has nowhere a secret could be put — which is the
 * requirement rather than an omission, per the anchor below.
 *
 * spec: identity-and-authorization/trusted-issuer-registry#registry-holds-no-secret
 */
export const registerIssuer = internalMutation({
  args: issuerRegistration,
  handler: async (ctx, args) => {
    await ctx.runMutation(components.snekPlatform.functions.registerIssuer, args);
  },
});

/**
 * Designate a human a platform admin of this deployment, or withdraw it —
 * one boolean, for the reason on the component's `designateAdmin`.
 *
 * spec: identity-and-authorization/platform-admin-role#a-deployment-can-designate-its-first-admin
 */
export const designateAdmin = internalMutation({
  args: { userId: v.string(), designated: v.boolean() },
  handler: async (ctx, args) => {
    await ctx.runMutation(components.snekPlatform.functions.designateAdmin, args);
  },
});
