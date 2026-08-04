// spec: identity-and-authorization/service-principal-assertions#replayed-assertion-refused
// spec: identity-and-authorization/peer-capability-ceiling#attribution-is-user-visible
// This deployment's scheduled work.
//
// One job so far: the sweep the platform component defers to the host. Three of
// its tables hold rows that stop meaning anything at a time they each carry —
// accepted assertion ids, handoff references, attribution records — and every
// one of them is written on a path a caller controls, so a deployment with
// nothing sweeping them grows a permanent log of who authenticated when and who
// acted through whom. That is the record the retention on each was chosen to
// avoid keeping.
import { cronJobs } from "convex/server";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

/**
 * Delete one batch of expired rows, and come back for the next if the batch was
 * not empty.
 *
 * `sweepExpired` is bounded because a Convex mutation's read set is, so a sweep
 * is a chain of them rather than one. The chain continues on any non-empty
 * answer rather than only on a full batch: the component's batch size is its
 * own business, and re-reading it here would be a constant that goes quietly
 * wrong the day that one changes. The cost of not knowing it is a single mutation
 * that deletes nothing at the end of each chain.
 *
 * Scheduled rather than recursive-with-a-delay so that a chain which fails
 * partway is retried by the next hour's run, not lost.
 */
export const sweep = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const deleted = await ctx.runMutation(components.snekPlatform.functions.sweepExpired, {
      now: Date.now(),
    });
    if (deleted > 0) await ctx.scheduler.runAfter(0, internal.crons.sweep, {});
    return null;
  },
});

const crons = cronJobs();
// Hourly, against retentions measured in minutes and days: what the sweep
// bounds is how long an expired row lingers, and an hour is far inside every
// window that matters while costing one mutation a run on a quiet deployment.
crons.interval("sweep expired platform records", { hours: 1 }, internal.crons.sweep, {});

export default crons;
