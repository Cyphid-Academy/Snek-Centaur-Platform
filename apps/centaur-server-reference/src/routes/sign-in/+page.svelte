<script lang="ts">
// spec: identity-and-authorization/sign-in-handoff,
//       identity-and-authorization/client-credential-custody
// Both ends of the platform's sign-in handoff at one address: it sends the
// browser to the platform's entry route and is the address the platform returns
// it to. A `handoff` in the query string is the difference.
// spec: identity-and-authorization/sign-in-handoff#the-redeemer-keeps-what-it-earns
// spec: identity-and-authorization/client-credential-custody#memory-only
// The deployment's own generated API rather than a table of name strings — see
// `packages/convex-host/src/index.ts` for why.
import { api } from "@cyphid/snek-convex-host/api";
// Both halves of the round trip live in `$lib/platform/handoff.ts`, shared with
// the dev configuration mount: two pages of this Server need a human's identity
// to reach the platform, and a second spelling of the verifier's custody is a
// second thing that can get it wrong.
import { beginHandoff, redeemHandoff, takeKept } from "$lib/platform/handoff";
import { ConvexHttpClient } from "convex/browser";
import { onMount } from "svelte";
import type { PageData } from "./$types";

const { data }: { data: PageData } = $props();

/** Where the verifier waits out the round trip — a top-level navigation, which
 * discards everything in memory. */
const VERIFIER_KEY = "snek.sign-in.verifier";

/** Held for the life of the page and written nowhere. */
let credential: string | undefined;

let status = $state<"signed-out" | "redeeming" | "signed-in" | "discarded" | "refused">(
  "signed-out",
);
let detail = $state("");

/**
 * Whether the client is running yet. Signing in happens entirely in the
 * browser — the verifier must never reach this server — so a button offered
 * before mount would silently do nothing on a slow load.
 *
 * spec: global-invariants/client-truthfulness
 */
let ready = $state(false);

onMount(async () => {
  ready = true;
  const reference = new URLSearchParams(window.location.search).get("handoff");
  if (reference === null) return;
  status = "redeeming";

  // The reference is deliberately left in the address bar: SvelteKit's router
  // owns the history stack and refuses a write before it has initialised, and
  // writing round it with `window.history` is the thing the router warns about.
  // A spent reference opens nothing.

  // Taken and cleared in one step: a verifier is answerable for exactly one
  // reference, and one left behind is one a later arrival could be redeemed
  // against.
  const kept = takeKept<null>(VERIFIER_KEY);

  if (kept === null) {
    status = "discarded";
    detail = "this page kept no verifier for that reference";
    return;
  }

  try {
    credential = await redeemHandoff(data.convexUrl, reference, kept.verifier);
    // Used, not shown: the credential's evidence is that the platform answers a
    // question about this human under it.
    const client = new ConvexHttpClient(data.convexUrl);
    const actions = await client.query(api.platform.attributedActions, { credential });
    status = "signed-in";
    detail = `${actions.length} attributed action(s)`;
  } catch (refused) {
    status = "refused";
    detail = refused instanceof Error ? refused.message : String(refused);
  }
});

/** Start the round trip: keep a verifier, send its challenge, hand over. */
function beginSignIn(): void {
  void beginHandoff(VERIFIER_KEY, data, null);
}
</script>

<svelte:head>
  <title>Sign in — Snek Centaur Server</title>
</svelte:head>

<main>
  <h1>Sign in</h1>
  <p data-testid="status" data-status={status}>{status}</p>
  {#if detail !== ""}
    <p data-testid="detail">{detail}</p>
  {/if}
  <!--
    Offered whenever this page holds no credential, not only from "signed-out":
    a reload of the returned-to address re-reads the spent reference, finds the
    verifier gone and lands in "discarded", which would otherwise be a dead end
    with no way back but hand-editing the URL.
  -->
  {#if status !== "signed-in" && status !== "redeeming" && ready}
    <button data-testid="begin" type="button" onclick={beginSignIn}>Sign in with Cyphid</button>
  {/if}
</main>

<style>
  main {
    font-family: system-ui, sans-serif;
    max-width: 640px;
    margin: 4rem auto;
    padding: 0 1rem;
  }
</style>
