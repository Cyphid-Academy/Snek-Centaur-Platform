<script lang="ts">
// spec: identity-and-authorization/sign-in-handoff,
//       identity-and-authorization/client-credential-custody,
//       identity-and-authorization/token-lifetime-and-refresh
// Both ends of the platform's sign-in handoff at one address: it sends the
// browser to the platform's entry route and is the address the platform returns
// it to. A `handoff` in the query string is a returning trip; `signed-out` is a
// silent trip that found no session.
//
// The page holds no credential of its own — custody does (`$lib/custody`), in
// closure state this component only borrows through `withCredential`. What this
// file owns is the choreography: redeem what the URL carries, recover through
// the session when memory is empty, and only ever show "signed out" once a
// silent trip has actually answered that there is no session.
// spec: identity-and-authorization/sign-in-handoff#the-redeemer-keeps-what-it-earns
// spec: identity-and-authorization/client-credential-custody#memory-only
// The deployment's own generated API rather than a table of name strings — see
// `packages/convex-host/src/index.ts` for why.
import { api } from "@cyphid/snek-convex-host/api";
import { ConvexHttpClient } from "convex/browser";
import { onMount } from "svelte";
import { replaceState } from "$app/navigation";
import * as custody from "$lib/custody";
import type { PageData } from "./$types";

const { data }: { data: PageData } = $props();

/** Where the verifier waits out the round trip — a top-level navigation, which
 * discards everything in memory. Not a credential: it confers nothing and
 * answers for exactly one pending reference, which is why session storage is
 * its one possible home and holding it there breaches nothing. */
const VERIFIER_KEY = "snek.sign-in.verifier";

/** Set before a silent trip, cleared when the trip answers. A page that loads
 * finding this still set has been round the loop once already and must not go
 * again: one silent attempt per arrival, never a redirect loop. */
const SILENT_KEY = "snek.sign-in.silent-attempted";

let status = $state<
  "signed-out" | "recovering" | "redeeming" | "signed-in" | "discarded" | "refused"
>("signed-out");
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
  const params = new URLSearchParams(window.location.search);
  const reference = params.get("handoff");

  if (reference !== null) {
    const cameSilently = window.sessionStorage.getItem(SILENT_KEY) !== null;
    window.sessionStorage.removeItem(SILENT_KEY);
    await redeem(reference, cameSilently);
    return;
  }
  if (params.get("signed-out") !== null) {
    // A silent trip answered: no session. Now — and only now — "signed out"
    // is a fact rather than a page that has not looked yet.
    window.sessionStorage.removeItem(SILENT_KEY);
    return;
  }
  if (custody.holds()) {
    status = "signed-in";
    return;
  }
  if (window.sessionStorage.getItem(SILENT_KEY) !== null) {
    // Back from a silent trip with neither a reference nor a signed-out mark:
    // something upstream misbehaved, and going round again would loop.
    window.sessionStorage.removeItem(SILENT_KEY);
    return;
  }
  // An empty page with no answer in the URL: a reload, or a first arrival.
  // Memory is gone either way, and the session cookie is the one credential a
  // reload recovers — so ask the platform, silently. A live session comes
  // straight back as a fresh handoff; no session comes back as `signed-out`.
  // spec: identity-and-authorization/client-credential-custody#the-session-is-the-only-thing-a-reload-recovers
  // spec: identity-and-authorization/google-sign-in#session-survives-reload
  await beginSignIn(true);
});

/** Redeem a reference the URL carried, and take custody of what it earns. */
async function redeem(reference: string, cameSilently: boolean): Promise<void> {
  status = "redeeming";

  // Taken and cleared in one step: a verifier is answerable for exactly one
  // reference, and one left behind is one a later arrival could be redeemed
  // against.
  const verifier = window.sessionStorage.getItem(VERIFIER_KEY);
  window.sessionStorage.removeItem(VERIFIER_KEY);

  if (verifier === null) {
    // A reference with no verifier is almost always a reload re-reading a
    // spent URL — the verifier went with the first redemption. That used to
    // dead-end in "discarded"; the session can answer instead. Redeeming
    // against a challenge this page never generated is how a third party
    // would plant a session, so the reference itself is discarded unredeemed
    // either way. The one arrival that must not bounce again is the one a
    // silent trip just delivered: a fresh reference with no verifier means
    // this page's own storage is broken, and going round again would loop.
    if (cameSilently) {
      status = "discarded";
      detail = "this page kept no verifier for that reference";
      return;
    }
    await beginSignIn(true);
    return;
  }

  try {
    const client = platformClient();
    const grant = await client.action(api.issuance.redeemSignInHandoff, { reference, verifier });
    adopt(grant, client);
    // Used, not shown: the credential's evidence is that the platform answers a
    // question about this human under it.
    const actions = await custody.withCredential((credential) =>
      client.query(api.platform.attributedActions, { credential }),
    );
    status = "signed-in";
    detail = `${actions.length} attributed action(s)`;
    // The spent reference has no business staying in the address bar — a
    // reload would only re-read it. Best-effort: the router refuses writes
    // before it has initialised, and a page that keeps the stale query still
    // recovers, through the silent branch above.
    try {
      replaceState(window.location.pathname, {});
    } catch {
      // Cosmetic only; the silent branch covers a reload of the stale URL.
    }
  } catch (refused) {
    status = "refused";
    detail = refused instanceof Error ? refused.message : String(refused);
  }
}

/**
 * Hand a grant to custody, wired to renew in the background and to recover
 * through the session when the chain lapses — a page asleep past every
 * lifetime wakes up, fails one rotation, and takes the silent trip.
 *
 * spec: identity-and-authorization/token-lifetime-and-refresh#renewal-does-not-interrupt-a-live-session
 */
function adopt(grant: custody.Grant, client: ConvexHttpClient): void {
  custody.adopt(grant, {
    renew: async (credential, renewal) =>
      await client.action(api.issuance.renewCredential, { credential, renewal }),
    onLapse: () => {
      void beginSignIn(true);
    },
  });
}

/** Start the round trip: keep a verifier, send its challenge, hand over. */
async function beginSignIn(silent: boolean): Promise<void> {
  status = silent ? "recovering" : "redeeming";
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  window.sessionStorage.setItem(VERIFIER_KEY, verifier);
  if (silent) window.sessionStorage.setItem(SILENT_KEY, "1");

  const entry = new URL("/sign-in", data.convexSiteUrl);
  entry.searchParams.set("issuer", data.issuerId);
  entry.searchParams.set("return", data.returnAddress);
  entry.searchParams.set("challenge", await challenge(verifier));
  if (silent) entry.searchParams.set("silent", "1");
  window.location.href = entry.toString();
}

function platformClient(): ConvexHttpClient {
  return new ConvexHttpClient(data.convexUrl);
}

/** The challenge a verifier answers to: base64url of its SHA-256. */
async function challenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

function base64url(bytes: Uint8Array): string {
  // Byte by byte, never `String.fromCharCode(...bytes)`: spreading puts every
  // byte on the argument stack, which overflows on inputs a lot smaller than
  // "large" — fine at 32 bytes, a trap for the next reuse.
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
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
    Offered whenever this page holds no credential and is not mid-trip. By the
    time "signed-out" renders, a silent trip has answered that there really is
    no session, so the button is the honest next step — an interactive sign-in,
    allowed to reach Google.
  -->
  {#if status !== "signed-in" && status !== "redeeming" && status !== "recovering" && ready}
    <button data-testid="begin" type="button" onclick={() => beginSignIn(false)}
      >Sign in with Cyphid</button
    >
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
