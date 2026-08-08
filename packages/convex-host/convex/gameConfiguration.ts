// The pre-launch shaping of a game, as this deployment's public surface.
//
// Everything the capability's requirements bind happens in ONE transaction of
// the update mutation below: the authoritative bounds check, the cross-field
// duration condition, the edit window, and — when the write changes what a
// board is generated from — the regeneration of the preview and the clearing
// of the lock. A guard in a second, later write would leave a window in which
// a standing lock designates a preview its own parameters no longer produce.
//
// **Boards are only ever generated here**, by the one shared generator, so the
// preview a surface renders is produced by the same generation the launch will
// use and no client runs a board-generation algorithm at all.
//
// spec: game-configuration/config-lives-on-the-game
// spec: game-configuration/launch-freeze
// spec: game-configuration/board-preview
// spec: game-configuration/board-preview-lock-in
// spec: game-configuration/generation-parameter-boundary
// spec: global-invariants/transactional-invariant-enforcement
// spec: global-invariants/one-shared-generation
import type { CentaurTeamId } from "@cyphid/snek-engine";
import type { ConfigViolation, GameConfig } from "@cyphid/snek-game-configuration";
import {
  DEFAULT_GAME_CONFIG,
  changesGenerationInputs,
  generateBoardAndInitialState,
  previewDocument,
  validateGameConfig,
} from "@cyphid/snek-game-configuration";
import type { Value } from "convex/values";
import { ConvexError, v } from "convex/values";
// The two halves' validators are the component's own declaration, imported
// rather than spelled again here: the stored shape and the wire shape are one
// document, and a second copy in the host is exactly the drift
// `engine-schema-fidelity`'s mirror guard exists to make impossible.
// spec: game-configuration/self-contained-configuration-surface#output-is-the-stored-shape
import { gameplayConfig, generationConfig } from "../../convex-snek-platform/convex/schema";
import { components } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import { publicMutation, publicQuery } from "./publicFunctions";

/**
 * A rejected configuration write, as the party that made it can act on it.
 *
 * A `ConvexError` carrying the structured violations rather than a thrown
 * `Error`: a production deployment reveals a plain error's message to no
 * caller, so a refusal that named the offending parameter would name it only
 * in the logs. The violations are `validateGameConfig`'s own — the surface
 * points at the parameter that failed rather than re-deriving why.
 *
 * spec: game-configuration/closed-parameter-vocabulary#out-of-range-rejected-regardless-of-client
 * spec: global-invariants/client-truthfulness#rejections-reach-the-user
 */
export interface ConfigurationRejected {
  readonly kind: "configuration-rejected";
  readonly violations: ReadonlyArray<Record<string, Value>>;
}

/**
 * One violation as a Convex `Value`: the same document, re-spelled for the
 * wire because the capability's own violation type is read-only and a
 * `ConvexError`'s payload may not be.
 */
const onTheWire = (violation: ConfigViolation): Record<string, Value> =>
  violation.code === "unbounded-game"
    ? { code: violation.code, paths: [...violation.paths] }
    : { ...violation };

/** Which game statuses are still open for configuration. */
// A game is editable only while it awaits launch; at launch the configuration
// freezes for the rest of the game's life, and a game that ends without ever
// launching likewise stops being editable.
// spec: game-configuration/launch-freeze#post-launch-writes-rejected
const AWAITING_LAUNCH = "not-started";

/**
 * Create a game in its minimal form and generate its first board preview.
 *
 * The record starts with every parameter at its default, so a board can be
 * generated from it untouched; the preview is produced here, at creation, for
 * the same reason it is produced on every later change to generation's inputs
 * — a configuration surface that mounts against this game renders the platform's
 * candidate rather than nothing. A game created with no teams has no territory
 * to seat, so its preview waits for the roster that generation reads.
 *
 * spec: game-configuration/config-lives-on-the-game#the-game-record-starts-minimal
 * spec: game-configuration/generation-parameters#a-default-for-every-generation-parameter
 */
export const createGame = publicMutation({ capability: "configure-game" })({
  args: { roster: v.optional(v.array(v.object({ teamId: v.string() }))) },
  handler: async (ctx, args): Promise<string> => {
    const roster = args.roster ?? [];
    const gameId: string = await ctx.runMutation(components.snekPlatform.functions.createGame, {
      roster: roster.map((team) => ({
        teamId: team.teamId,
        memberUserIds: [],
        coachUserIds: [],
      })),
    });
    if (roster.length > 0) await regenerate(ctx, gameId, DEFAULT_GAME_CONFIG, roster);
    return gameId;
  },
});

/**
 * This game's own configured values, the one current preview, and the lock.
 *
 * Delivered by Convex's own query subscription, which is what makes every
 * surface showing this game render the same candidate. The board seed is not in
 * the answer, because it is in no query's answer.
 *
 * spec: game-configuration/board-preview#all-viewers-in-sync
 * spec: game-configuration/config-lives-on-the-game#views-read-the-games-own-record
 * spec: game-configuration/board-generation-retry
 */
export const gameConfiguration = publicQuery({ capability: "read-game-configuration" })({
  args: { gameId: v.string() },
  handler: async (ctx, args) =>
    await ctx.runQuery(components.snekPlatform.functions.gameConfiguration, {
      gameId: args.gameId,
    }),
});

/**
 * Edit a game's configuration.
 *
 * An edit carries whole subtrees rather than a path and a value, because the
 * shape the surface emits is the shape the record stores. What it means for a
 * write to be accepted is decided here, over the POST-WRITE record: the
 * duration condition is a predicate over two fields together, so no per-value
 * check can express it and no ordering of two edits may pass through a record
 * carrying neither limit.
 *
 * Then, and only if the write changed what the board is generated from, the
 * preview regenerates and the lock clears — in this same transaction.
 *
 * spec: game-configuration/closed-parameter-vocabulary
 * spec: game-configuration/bounded-game-duration#switching-which-limit-applies
 * spec: game-configuration/parameter-bounds-sourcing#widget-and-validator-agree
 * spec: game-configuration/board-preview-lock-in#board-affecting-edit-clears-the-lock
 */
export const updateConfiguration = publicMutation({ capability: "configure-game" })({
  args: {
    gameId: v.string(),
    generation: v.optional(generationConfig),
    runtime: v.optional(gameplayConfig),
  },
  handler: async (ctx, args): Promise<null> => {
    const game = await editable(ctx, args.gameId);
    const candidate = {
      generation: args.generation ?? game.config.generation,
      runtime: args.runtime ?? game.config.runtime,
    };
    const validation = validateGameConfig(candidate);
    if (!validation.ok) {
      throw new ConvexError({
        kind: "configuration-rejected",
        violations: validation.violations.map(onTheWire),
      } satisfies ConfigurationRejected);
    }
    // The capability's own helper decides the trigger, so the regeneration and
    // the lock-clearing cannot disagree about what counts as a change.
    if (!changesGenerationInputs(args)) {
      await ctx.runMutation(components.snekPlatform.functions.setConfiguration, {
        gameId: args.gameId,
        config: candidate,
      });
      return null;
    }
    await regenerate(ctx, args.gameId, candidate, game.roster);
    return null;
  },
});

/**
 * Designate the current preview as this game's starting state, or withdraw the
 * designation.
 *
 * It takes a boolean and a game, and no board: the flag designates the
 * platform-held current preview, so there is nowhere for client-supplied board
 * data to go.
 *
 * spec: game-configuration/board-preview-lock-in#lock-carries-no-board-data
 * spec: game-configuration/board-preview-lock-in#lock-toggles-freely-before-launch
 */
export const setPreviewLock = publicMutation({ capability: "configure-game" })({
  args: { gameId: v.string(), locked: v.boolean() },
  handler: async (ctx, args): Promise<null> => {
    await editable(ctx, args.gameId);
    await ctx.runMutation(components.snekPlatform.functions.setPreviewLock, {
      gameId: args.gameId,
      locked: args.locked,
    });
    return null;
  },
});

// ---------------------------------------------------------------------------
// The two things every write does before it writes.
// ---------------------------------------------------------------------------

type GameForConfiguration = NonNullable<Awaited<ReturnType<typeof gameForConfiguration>>>;

const gameForConfiguration = async (ctx: MutationCtx, gameId: string) =>
  await ctx.runQuery(components.snekPlatform.functions.gameForConfiguration, { gameId });

/**
 * The game, if it is still open for configuration — read inside the same
 * transaction as the write it guards, so a write cannot slip past a launch
 * committing concurrently.
 *
 * spec: game-configuration/launch-freeze#post-launch-writes-rejected
 * spec: global-invariants/transactional-invariant-enforcement#concurrent-mutations-cannot-race-past-a-guard
 */
async function editable(ctx: MutationCtx, gameId: string): Promise<GameForConfiguration> {
  const game = await gameForConfiguration(ctx, gameId);
  if (!game) throw new Error(`no game ${gameId}`);
  if (game.status !== AWAITING_LAUNCH) {
    throw new ConvexError({
      kind: "configuration-frozen",
      status: game.status,
    });
  }
  return game;
}

/**
 * Run the one shared generator against the config and roster it is handed, and
 * store the result in the single preview slot, clearing the lock.
 *
 * The inputs are explicit rather than re-read here: each caller already holds
 * the pair it means to generate from — the validated candidate and the game it
 * guarded, or a new game's defaults and its roster — and a second read could
 * generate from something the caller did not intend.
 *
 * The seed is drawn fresh for every regeneration and stored beside the board it
 * produced; it reaches no client, so a client cannot reproduce a candidate it
 * has not been shown. `Math.random` is Convex's own seeded randomness inside a
 * mutation — unpredictable to a caller, and reproduced rather than re-drawn if
 * the transaction is retried, which is what keeps a retried write from
 * committing a different board than the one it computed.
 *
 * An infeasible parameter set yields the generator's structured failure rather
 * than a board of anyone's choosing, and that failure goes into the same slot —
 * so it reaches the configuring user through the ordinary reactive delivery,
 * naming the constraint that failed on the final attempt.
 *
 * spec: game-configuration/board-generation-retry
 * spec: game-configuration/infeasibility-surfaced#failure-names-the-constraint
 * spec: game-configuration/board-preview#one-slot-no-archive
 */
async function regenerate(
  ctx: MutationCtx,
  gameId: string,
  config: GameConfig,
  roster: ReadonlyArray<{ readonly teamId: string }>,
): Promise<void> {
  const seed = freshBoardSeed();
  const result = generateBoardAndInitialState(
    config,
    // The team id stands in as the display name: a roster snapshot carries no
    // display name, and team display names arrive with team-management's roster
    // work. Until then a snake reads "team-red.A".
    roster.map((team) => ({ centaurTeamId: team.teamId as CentaurTeamId, name: team.teamId })),
    seed,
  );
  await ctx.runMutation(components.snekPlatform.functions.setConfigurationAndPreview, {
    gameId,
    config,
    boardPreview: previewDocument(result),
    boardSeed: seed.buffer as ArrayBuffer,
  });
}

/** Thirty-two bytes of this transaction's randomness. */
function freshBoardSeed(): Uint8Array {
  const seed = new Uint8Array(32);
  for (let i = 0; i < seed.length; i++) seed[i] = Math.floor(Math.random() * 256);
  return seed;
}
