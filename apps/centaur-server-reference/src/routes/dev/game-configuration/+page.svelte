<script lang="ts">
// The configuration surface, mounted with nothing around it.
//
// spec: game-configuration/self-contained-configuration-surface#runs-with-no-host
// This page is the requirement, exercised: one component, one binding, every
// affordance offered, and no session, no host, no deployment anywhere in the
// picture. What it renders here is what it renders inside a room once there is
// one to embed it in — embedding adds context and is never a precondition.
//
// Every affordance is offered because this mount has no access rules to express
// through them. A host that does — a room, later — passes different booleans to
// the same component, and hiding an affordance is a presentation decision
// either way: the record judges every write it receives on its own rules.
// spec: game-configuration/host-selected-affordances
import ConfigurationSurface from "$lib/surfaces/game-configuration/ConfigurationSurface.svelte";
import type { ConfigurationBinding } from "$lib/surfaces/game-configuration/devBinding";
import { devConfigurationBinding } from "$lib/surfaces/game-configuration/devBinding";
import { onDestroy, onMount } from "svelte";

// Created on the client only: the binding polls, and a server render has
// nothing to poll for. Until it exists the surface renders its own
// waiting-for-the-record state, which is the state a live subscription
// genuinely has before its first value.
let binding = $state<ConfigurationBinding | null>(null);

onMount(() => {
  binding = devConfigurationBinding();
});

onDestroy(() => binding?.close());
</script>

<svelte:head>
  <title>Game configuration (dev)</title>
</svelte:head>

<main>
  <p class="note">
    A standalone mount of the configuration surface over an in-memory game record
    held by this dev server. No sign-in, no Convex deployment. Boards are
    generated on the server, as they always are.
  </p>
  {#if binding !== null}
    <ConfigurationSurface
      {binding}
      mode="live"
      inspection={true}
      parameterEditing={true}
      boardDesignation={true}
    />
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
</style>
