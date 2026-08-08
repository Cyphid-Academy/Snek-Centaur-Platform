// A binding over the dev mount's endpoints.
//
// spec: application-shell/one-state-binding#a-surface-does-not-know-its-source
// The surface is handed a `MutableBinding` and renders what it reports. That
// this one polls a dev server while `convexBinding` holds a live subscription
// is the binding's business and not the surface's: the same component, mounted
// over either, is the same component.
//
// Polling because there is no push transport here to subscribe to, and the
// interval is short enough that two tabs over the one record converge visibly —
// which is the property the standalone mount exists to let anyone check by hand
// (`board-preview#all-viewers-in-sync` is the deployment's to guarantee, and
// Convex's own query subscription is what guarantees it there).
import type { MutableBinding } from "@cyphid/snek-app-shell";
import { mutableFixtureBinding } from "@cyphid/snek-app-shell";
import type { ConfigurationMutations, GameConfigurationRecord } from "./record";

/** Where the dev mount's record lives. */
export const DEV_CONFIGURATION_ENDPOINT = "/dev/game-configuration/api";

export interface DevBindingOptions {
  readonly endpoint?: string;
  readonly pollMs?: number;
  /** The fetch to use — the page's own by default. */
  readonly fetch?: typeof globalThis.fetch;
}

export type ConfigurationBinding = MutableBinding<
  GameConfigurationRecord | null,
  ConfigurationMutations
>;

/**
 * A refusal from the record, in words a person can act on.
 *
 * The violations are the capability's own, so the message points at the
 * parameter that failed rather than re-deriving why it failed.
 * spec: global-invariants/client-truthfulness#rejections-reach-the-user
 */
function rejectionMessage(payload: unknown): string {
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

export function devConfigurationBinding(options: DevBindingOptions = {}): ConfigurationBinding {
  const endpoint = options.endpoint ?? DEV_CONFIGURATION_ENDPOINT;
  const pollMs = options.pollMs ?? 400;
  const request = options.fetch ?? globalThis.fetch.bind(globalThis);

  const mutations: ConfigurationMutations = {
    updateConfiguration: (args) => send({ action: "updateConfiguration", ...args }),
    setPreviewLock: (args) => send({ action: "setPreviewLock", ...args }),
  };
  const source = mutableFixtureBinding<GameConfigurationRecord | null, ConfigurationMutations>(
    undefined,
    mutations,
  );

  async function send(body: Record<string, unknown>): Promise<unknown> {
    const response = await request(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.status === 422) throw new Error(rejectionMessage(await response.json()));
    if (!response.ok) throw new Error(`the record answered ${response.status}`);
    // The write's own answer is the post-write record, so the surface shows the
    // regenerated preview without waiting for the next poll.
    source.set((await response.json()) as GameConfigurationRecord);
    return null;
  }

  async function refresh(): Promise<void> {
    try {
      const response = await request(endpoint);
      if (!response.ok) throw new Error(`the record answered ${response.status}`);
      source.set((await response.json()) as GameConfigurationRecord);
    } catch (error) {
      // Reported alongside the value rather than folded into it, so the surface
      // renders the loss instead of presenting the last value it saw as live.
      // spec: application-shell/one-state-binding#loss-is-the-bindings-to-report
      source.report({
        kind: "lost",
        reason: error instanceof Error ? error.message : "unreachable",
      });
    }
  }

  const timer = setInterval(() => void refresh(), pollMs);
  void refresh();

  return {
    get current() {
      return source.current;
    },
    subscribe: (run) => source.subscribe(run),
    close: () => {
      clearInterval(timer);
      source.close();
    },
    mutations,
  };
}
