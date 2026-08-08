import type { MutableBinding } from "@cyphid/snek-app-shell";
import { convexMutableBinding } from "@cyphid/snek-app-shell";
// The configuration surface's binding over the platform's own deployment.
//
// spec: application-shell/one-state-binding#a-surface-does-not-know-its-source
// The surface is handed a `MutableBinding` and renders what it reports. What is
// behind it is this: Convex's own query subscription, re-run by the deployment
// on every write that touches this game's record, so several surfaces over one
// game converge with none of them polling and no client holding a private
// candidate.
// spec: game-configuration/board-preview#all-viewers-in-sync
//
// The credential travels as an argument of every call — the read's and the
// writes' alike — because that is how the host's public functions take one
// (`packages/convex-host/convex/publicFunctions.ts`). It is held in memory by
// the page that earned it and written nowhere.
// spec: identity-and-authorization/client-credential-custody#memory-only
import { api } from "@cyphid/snek-convex-host/api";
import type { ConvexClient } from "convex/browser";
import { ConvexError } from "convex/values";
import type { ConfigurationMutations, GameConfigurationRecord } from "./record";

export type ConfigurationBinding = MutableBinding<
  GameConfigurationRecord | null,
  ConfigurationMutations
>;

export interface ConfigurationBindingOptions {
  /** A live client, owned by the caller. */
  readonly client: ConvexClient;
  /** The game whose record this surface is mounted over. */
  readonly gameId: string;
  /** The platform credential this page earned, if it holds one. */
  readonly credential?: string | undefined;
}

/**
 * A refusal from the deployment, in words a person can act on.
 *
 * The violations are the capability's own — `validateGameConfig`'s, carried
 * through the mutation's `ConvexError` payload — so the message points at the
 * parameter that failed rather than re-deriving why it failed. A `ConvexError`
 * because a production deployment reveals a plain `Error`'s message to no
 * caller, so an unstructured refusal would name the parameter only in the logs.
 *
 * spec: global-invariants/client-truthfulness#rejections-reach-the-user
 * spec: game-configuration/closed-parameter-vocabulary#out-of-range-rejected-regardless-of-client
 */
export function rejectionMessage(payload: unknown): string {
  const violations =
    typeof payload === "object" && payload !== null && "violations" in payload
      ? (payload as { violations: unknown }).violations
      : null;
  if (!Array.isArray(violations) || violations.length === 0) return "The write was rejected.";
  return `Rejected: ${violations
    .map((violation: Record<string, unknown>) =>
      violation["path"] === undefined
        ? String(violation["code"])
        : `${String(violation["path"])} (${String(violation["code"])})`,
    )
    .join(", ")}`;
}

/** Run a write, turning a structured refusal into a message the surface renders. */
async function reporting(write: () => Promise<unknown>): Promise<unknown> {
  try {
    return await write();
  } catch (refused) {
    if (refused instanceof ConvexError) throw new Error(rejectionMessage(refused.data));
    throw refused;
  }
}

/**
 * Subscribe to one game's configuration record and offer the two writes the
 * surface may make of it.
 *
 * The game id is supplied here rather than by the surface: the surface emits
 * whole configuration subtrees and a boolean, which is the shape the record
 * stores, and which game they are stored on is the mounting's business.
 * spec: game-configuration/self-contained-configuration-surface#output-is-the-stored-shape
 */
export function convexConfigurationBinding(
  options: ConfigurationBindingOptions,
): ConfigurationBinding {
  const { client, gameId, credential } = options;
  const source = convexMutableBinding({
    client,
    query: api.gameConfiguration.gameConfiguration,
    args: { gameId },
    credential,
    mutations: {
      updateConfiguration: api.gameConfiguration.updateConfiguration,
      setPreviewLock: api.gameConfiguration.setPreviewLock,
    },
  });

  const mutations: ConfigurationMutations = {
    updateConfiguration: (args) =>
      reporting(() => source.mutations.updateConfiguration({ gameId, ...args })),
    setPreviewLock: (args) => reporting(() => source.mutations.setPreviewLock({ gameId, ...args })),
  };

  return {
    // The delivered record and the shape the surface reads are one document —
    // the component's validator declares the wire spelling `record.ts` types.
    // The assertion is the seam between the deployment's generated types and
    // the capability package's own, which are structurally the same and
    // nominally unrelated.
    get current() {
      return source.current as ConfigurationBinding["current"];
    },
    subscribe: (run) =>
      source.subscribe((snapshot) => run(snapshot as ConfigurationBinding["current"])),
    close: () => source.close(),
    mutations,
  };
}
