<script lang="ts">
// The configuration surface, mounted with nothing around it.
//
// spec: game-configuration/self-contained-configuration-surface#runs-with-no-host
// This page is the requirement, exercised: one component, one binding, every
// affordance offered, and no room, no lobby, no surrounding application context
// anywhere in the picture. What it renders here is what it renders inside a room
// once there is one to embed it in — embedding adds context and is never a
// precondition.
//
// Every affordance is offered because this mount has no access rules to express
// through them. A host that does — a room, later — passes different booleans to
// the same component, and hiding an affordance is a presentation decision
// either way: the record judges every write it receives on its own rules.
// spec: game-configuration/host-selected-affordances
//
// **What is behind the binding is the platform itself.** The page earns a
// credential through the platform's own sign-in handoff, creates or reuses a
// game through the real `createGame` mutation, and subscribes to that game's
// configuration record. There is no dev-only record, no dev-only mutation
// surface and nothing polling: what a developer exercises here is the workflow,
// not an imitation of it.
// spec: game-configuration/board-preview#all-viewers-in-sync
import { api } from "@cyphid/snek-convex-host/api";
import { beginHandoff, takeKept } from "$lib/platform/handoff";
import { redeemHandoff } from "$lib/platform/handoff";
import type { ConfigurationBinding } from "$lib/surfaces/game-configuration/convexConfigurationBinding";
import { convexConfigurationBinding } from "$lib/surfaces/game-configuration/convexConfigurationBinding";
import ConfigurationSurface from "$lib/surfaces/game-configuration/ConfigurationSurface.svelte";
import { ConvexClient } from "convex/browser";
import { onDestroy, onMount } from "svelte";
import type { PageData } from "./$types";

const { data }: { data: PageData } = $props();

/** Where this page's verifier and the game it was headed for wait out the trip. */
const KEPT_KEY = "snek.dev.game-configuration.handoff";

/** The roster a dev game is created with: generation needs territory to seat. */
const DEV_ROSTER = [{ teamId: "team-red" }, { teamId: "team-blue" }];

type Status = "signed-out" | "redeeming" | "ready" | "discarded" | "refused";

let status = $state<Status>("signed-out");
let detail = $state("");
let gameId = $state("");

/** Held for the life of the page and written nowhere. */
let credential: string | undefined;

let client: ConvexClient | null = null;
let binding = $state<ConfigurationBinding | null>(null);

/**
 * Whether the client is running yet. The whole flow happens in the browser — the
 * verifier must never reach this server — so a button offered before mount would
 * silently do nothing on a slow load.
 * spec: global-invariants/client-truthfulness
 */
let ready = $state(false);

onMount(async () => {
  if (data.unconfigured !== "") return;
  ready = true;
  const asked = new URLSearchParams(window.location.search);
  const reference = asked.get("handoff");
  if (reference === null) return;
  status = "redeeming";

  // The reference is deliberately left in the address bar: SvelteKit's router
  // owns the history stack and refuses a write before it has initialised. A
  // spent reference opens nothing.
  const kept = takeKept<{ gameId: string }>(KEPT_KEY);
  if (kept === null) {
    status = "discarded";
    detail = "this page kept no verifier for that reference";
    return;
  }

  try {
    credential = await redeemHandoff(data.platform.convexUrl, reference, kept.verifier);
    client = new ConvexClient(data.platform.convexUrl);
    // Created through the real mutation, under the credential just earned —
    // which is what makes the record behind this mount the record a room's
    // mount would read.
    // spec: game-configuration/config-lives-on-the-game#the-game-record-starts-minimal
    gameId =
      kept.state.gameId !== ""
        ? kept.state.gameId
        : await client.mutation(api.gameConfiguration.createGame, {
            roster: DEV_ROSTER,
            credential,
          });
    binding = convexConfigurationBinding({ client, gameId, credential });
    status = "ready";
  } catch (refused) {
    status = "refused";
    detail = refused instanceof Error ? refused.message : String(refused);
  }
});

onDestroy(() => {
  binding?.close();
  void client?.close();
});

/**
 * Hand over to the platform, keeping the game this page was opened against —
 * the return address is one the registration records, so nothing may be
 * appended to it and the id would otherwise be lost on the trip.
 */
function signIn(): void {
  const wanted = new URLSearchParams(window.location.search).get("game") ?? "";
  void beginHandoff(KEPT_KEY, data.platform, { gameId: wanted });
}
</script>

<svelte:head>
  <title>Game configuration (dev)</title>
</svelte:head>

<main>
  {#if data.unconfigured !== ""}
    <!-- Reported, never thrown: a page that says which variable is unset is
         worth more to a developer than a stack trace. -->
    <section data-testid="dev-unconfigured">
      <h1>No deployment to configure a game on</h1>
      <p>
        Start a Convex deployment on loopback with <code>pnpm dev:convex:local</code>, then
        set the variables below in your own environment and restart this dev server.
      </p>
      <pre>{data.unconfigured}</pre>
    </section>
  {:else}
    <p class="note">
      A standalone mount of the configuration surface over a game on the platform's
      own Convex deployment — a real credential, the real mutations, and Convex's
      own query subscription behind the binding. Boards are generated
      platform-side, as they always are.
    </p>
    <p class="note" data-testid="status" data-status={status}>
      {status}{#if gameId !== ""}&nbsp;·&nbsp;<span data-testid="game-id">{gameId}</span>{/if}
    </p>
    {#if detail !== ""}
      <p class="note" data-testid="detail">{detail}</p>
    {/if}
    {#if binding === null && status !== "redeeming" && ready}
      <!-- Offered whenever this page holds no credential, not only from
           "signed-out": a reload of the returned-to address re-reads the spent
           reference, finds the verifier gone and lands in "discarded", which
           would otherwise be a dead end. -->
      <button data-testid="begin" type="button" onclick={signIn}>Sign in with Cyphid</button>
    {/if}
    {#if binding !== null}
      <ConfigurationSurface
        {binding}
        mode="live"
        inspection={true}
        parameterEditing={true}
        boardDesignation={true}
      />
    {/if}
  {/if}
</main>

<style>
  main {
    max-width: 72rem;
    margin: 2rem auto;
    padding: 0 1rem;
    color: #e2e8f0;
    font-family: system-ui, sans-serif;
  }
  .note {
    color: #94a3b8;
    font-size: 0.85rem;
    line-height: 1.5;
  }
  h1 {
    font-size: 1.25rem;
    color: #f8fafc;
  }
  pre {
    background: #0b1220;
    border: 1px solid #1e293b;
    border-radius: 4px;
    padding: 0.5rem;
    font-size: 0.75rem;
    overflow-x: auto;
    white-space: pre-wrap;
  }
  button {
    background: #1e293b;
    color: #f8fafc;
    border: 1px solid #334155;
    border-radius: 4px;
    padding: 0.35rem 0.7rem;
    font: inherit;
    cursor: pointer;
  }
</style>
