// spec: identity-and-authorization/trusted-issuer-registry
// Who this platform trusts, written down.
//
// The registry is read on every assertion exchange, every handoff, and both
// sign-in routes, and until now nothing wrote to it — a deployment came up
// trusting nobody with no way to change that, which made a Snek Centaur Server
// impossible to stand up against a real deployment at all.
//
// **Internal, not public, and that is the whole shape of the decision.**
// Registering an issuer is an operator act: someone at Cyphid decides a Server
// or a peer system is trusted, and records where it publishes its keys, what it
// may ever confer, and where humans may be returned to it. Nobody *calls* this
// over the platform's public surface, so it declares no capability and appears
// in no ceiling — which also keeps it out of reach of the only kind of caller
// that could abuse it. It is invoked against the deployment with an admin
// credential (`convex run`), which is exactly the audience it has.
//
// It reaches its data through the component, like every other host function:
// the table is `convex-snek-platform`'s, and the host is where a write to it is
// addressed from.
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
