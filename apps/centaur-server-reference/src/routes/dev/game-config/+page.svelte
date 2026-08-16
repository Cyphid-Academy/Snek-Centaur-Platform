<script lang="ts">
// The self-contained game-configuration surface, standing alone with every
// affordance offered — the "First delivery" design.md's "No permissions in
// this capability; affordances are host-selected" decision commits to. A
// second, inspection-only mounting of the SAME binding sits beside it to
// demonstrate host-selected-affordances#inspection-only-mounting and
// application-shell/surface-mounting-contract#the-host-states-what-is-offered:
// the two mountings differ only in what this page states, never in what
// either resolves about who is present.
// spec: game-configuration/self-contained-configuration-surface,
// game-configuration/host-selected-affordances
import { GameConfigSurface } from "$lib/config-surface/index.js";
import type {
  ConfigSurfaceMutations,
  ConfigSurfaceState,
  Rejection,
} from "$lib/config-surface/index.js";
import { bindingFromSource, mutableBinding } from "$lib/shell/index.js";
import type { BindingSource, MutableBinding } from "$lib/shell/index.js";

const POLL_MS = 2000;

// spec: application-shell/one-state-binding#a-surface-does-not-know-its-source
// — a fetch-based poll stands in for a real subscription (the design note
// this route exists to satisfy: "the reactive delivery channel's
// implementation... [is] code mechanism"); the surface consuming this
// binding cannot tell the difference from a live one.
function createDevBinding(): MutableBinding<ConfigSurfaceState, ConfigSurfaceMutations> {
  let notify: ((v: ConfigSurfaceState) => void) | null = null;
  let lose: ((reason: string) => void) | null = null;

  async function fetchState(): Promise<void> {
    try {
      const res = await fetch("/dev/game-config");
      if (!res.ok) throw new Error(`GET /dev/game-config failed: ${res.status}`);
      notify?.((await res.json()) as ConfigSurfaceState);
    } catch (err) {
      lose?.(err instanceof Error ? err.message : String(err));
    }
  }

  const source: BindingSource<ConfigSurfaceState> = {
    subscribe(onValue, onLoss) {
      notify = onValue;
      lose = onLoss;
      void fetchState();
      const interval = setInterval(() => void fetchState(), POLL_MS);
      return () => {
        clearInterval(interval);
        notify = null;
        lose = null;
      };
    },
  };

  const base = bindingFromSource(source);

  async function post(body: unknown): Promise<Rejection | null> {
    const res = await fetch("/dev/game-config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const { rejection } = (await res.json()) as { rejection: Rejection | null };
    await fetchState(); // refetch now, rather than waiting on the next poll tick
    return rejection;
  }

  const mutations: ConfigSurfaceMutations = {
    updateConfig: (config) => post({ op: "updateConfig", config }),
    updateRoster: (teams) => post({ op: "updateRoster", teams }),
    setBoardLock: (locked) => post({ op: "setBoardLock", locked }),
  };

  return mutableBinding(base, mutations);
}

const binding = createDevBinding();
</script>

<svelte:head>
  <title>Game Configuration — Dev Harness</title>
</svelte:head>

<main>
  <h1>Game configuration surface</h1>
  <p>
    The self-contained <code>game-configuration</code> surface, standing alone with every
    affordance offered. The record backing it lives in an in-memory dev harness
    (<code>src/routes/dev/game-config/harness.ts</code>) driving the same pure state machine
    (<code>@cyphid/snek-game-configuration</code>) the platform's Convex mutations will call once
    that wiring lands.
  </p>

  <section>
    <h2>Full surface — every affordance offered</h2>
    <GameConfigSurface
      {binding}
      affordances={{ inspection: true, parameterEditing: true, boardDesignation: true }}
    />
  </section>

  <section>
    <h2>Inspection-only mirror — same binding, different mount</h2>
    <GameConfigSurface
      {binding}
      affordances={{ inspection: true, parameterEditing: false, boardDesignation: false }}
    />
  </section>
</main>

<style>
  main {
    font-family: system-ui, sans-serif;
    max-width: 960px;
    margin: 2rem auto;
    padding: 0 1rem 4rem;
    color: #e2e8f0;
    background: #0f172a;
  }
  h1 {
    color: #f8fafc;
  }
  h2 {
    font-size: 1rem;
    color: #f8fafc;
  }
  p {
    color: #94a3b8;
    line-height: 1.5;
  }
  section {
    margin-top: 2rem;
    border-top: 1px solid #334155;
    padding-top: 1rem;
  }
  code {
    background: #1e293b;
    padding: 0.1em 0.4em;
    border-radius: 4px;
    font-size: 0.9em;
    color: #7dd3fc;
  }
</style>
