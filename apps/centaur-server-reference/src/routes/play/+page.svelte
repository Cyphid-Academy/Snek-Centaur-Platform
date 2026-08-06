<script lang="ts">
// The demo: two teams, one counter each, and a button.
//
// Everything the page does to get you into the game is the platform's real
// machinery — sign in at the platform's own origin, come back with a handoff
// reference only this page can redeem, and ask the platform for a game access
// token it decides whether to issue. What the game then lets you do is the
// instance's decision, made from the token's subject and the roster it was
// seeded with. The counter is the smallest thing worth playing that shows it.
//
// spec: identity-and-authorization/client-credential-custody#memory-only
import GameBoard from "./GameBoard.svelte";
import { challengeFor, newVerifier } from "$lib/pkce";
import { api } from "@cyphid/snek-convex-host/api";
import { ConvexHttpClient } from "convex/browser";
import { onMount } from "svelte";
import type { PageData } from "./$types";

const { data }: { data: PageData } = $props();

/** Where the verifier waits out the round trip — memory does not survive one. */
const VERIFIER_KEY = "snek.play.verifier";

/** Held for the life of the page, written nowhere, never rendered. */
let credential: string | undefined;

let platformCalls: ConvexHttpClient | undefined;
const client = (): ConvexHttpClient => {
  platformCalls ??= new ConvexHttpClient(data.convexUrl);
  return platformCalls;
};

interface WorldTeam {
  label: string;
  teamId: string;
}
interface WorldPlayer {
  userId: string;
  name?: string;
  team: string;
}
interface World {
  teams: WorldTeam[];
  game: { gameId: string; status: string };
  players: WorldPlayer[];
  admins: string[];
}

const message = (thrown: unknown): string =>
  thrown instanceof Error ? thrown.message : String(thrown);

let stage = $state<"signed-out" | "arriving" | "seating" | "playing" | "refused">("signed-out");
let detail = $state("");
let world = $state<World | undefined>(undefined);
let userId = $state("");
/** Watching on purpose: a spectator token instead of an operator one. */
let watching = $state(false);
let token = $state("");
let tokenExpiry = $state(0);
let now = $state(Math.floor(Date.now() / 1000));
let refusal = $state("");

const myTeam = $derived(world?.players.find((player) => player.userId === userId)?.team);
const teamLabels = $derived(
  Object.fromEntries((world?.teams ?? []).map((team) => [team.teamId, team.label])),
);
const secondsLeft = $derived(tokenExpiry === 0 ? 0 : Math.max(0, tokenExpiry - now));

/** Send the browser to the platform to sign in, keeping the verifier behind. */
async function signIn(): Promise<void> {
  const verifier = newVerifier();
  window.sessionStorage.setItem(VERIFIER_KEY, verifier);
  const entry = new URL("/sign-in", data.convexSiteUrl);
  entry.searchParams.set("issuer", data.issuerId);
  entry.searchParams.set("return", data.returnAddress);
  entry.searchParams.set("challenge", await challengeFor(verifier));
  window.location.href = entry.toString();
}

/**
 * Redeem the reference this page was returned with. A reference that arrives
 * with no verifier behind it is discarded rather than redeemed — anyone can
 * navigate a browser here carrying one.
 *
 * spec: identity-and-authorization/sign-in-handoff#the-redeemer-keeps-what-it-earns
 */
async function redeem(reference: string): Promise<boolean> {
  const verifier = window.sessionStorage.getItem(VERIFIER_KEY);
  window.sessionStorage.removeItem(VERIFIER_KEY);
  if (verifier === null) {
    stage = "refused";
    detail = "arrived with a handoff reference this page kept no verifier for";
    return false;
  }
  try {
    credential = (await client().action(api.issuance.redeemSignInHandoff, {
      reference,
      verifier,
    })) as string;
    return true;
  } catch (refused) {
    stage = "refused";
    detail = message(refused);
    return false;
  }
}

/** Say hello, which seats this human if they hold no seat yet. */
async function sayHello(): Promise<boolean> {
  const answer = (await (
    await fetch("/play/api/hello", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ credential }),
    })
  ).json()) as { ok: boolean; refused?: string; userId?: string; world?: World };
  if (!answer.ok) {
    stage = "refused";
    detail = answer.refused ?? "this server would not seat you";
    return false;
  }
  userId = answer.userId ?? "";
  world = answer.world;
  return true;
}

/**
 * Ask the platform for a game access token: an operator's if this human holds
 * a seat and wants to play, a spectator's otherwise.
 *
 * The platform decides. An operator token is issued only to somebody the
 * game's roster snapshot records on a participating team, and only while the
 * game is being played — so a refusal here is the eligibility rule speaking,
 * not this page.
 *
 * spec: identity-and-authorization/participant-token-eligibility
 * spec: identity-and-authorization/spectator-tokens
 */
async function obtainToken(): Promise<void> {
  if (!credential || !world) return;
  const role = !watching && myTeam ? "operator" : "spectator";
  try {
    const issued = (await client().action(api.issuance.issueGameToken, {
      credential,
      gameId: world.game.gameId,
      role,
    })) as string;
    const claims = JSON.parse(
      atob((issued.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/")),
    ) as { exp: number; sub: string };
    token = issued;
    tokenExpiry = claims.exp;
    subject = claims.sub;
    stage = "playing";
    refusal = "";
  } catch (refused) {
    stage = "refused";
    detail = message(refused);
  }
}

/** The subject of the token in hand — what the instance decides the role from. */
let subject = $state("");

/** Swap between playing and watching: a different token, a fresh connection. */
async function toggleWatching(): Promise<void> {
  watching = !watching;
  token = "";
  await obtainToken();
}

/** The instance closed the connection. */
async function closed(everConnected: boolean): Promise<void> {
  if (!everConnected) {
    refusal = "the game refused this connection — its log says why";
    return;
  }
  // A working connection that ended wants a fresh token: an established one
  // survives its token's expiry, so a reconnect is the only thing that needs a
  // new one.
  token = "";
  await obtainToken();
}

async function refreshWorld(): Promise<void> {
  const answer = (await (await fetch("/play/api/world")).json()) as { world?: World };
  if (answer.world) world = answer.world;
}

onMount(() => {
  const reference = new URLSearchParams(window.location.search).get("handoff");
  if (reference !== null) {
    stage = "arriving";
    void (async () => {
      if (!(await redeem(reference))) return;
      stage = "seating";
      if (!(await sayHello())) return;
      await obtainToken();
    })();
  } else {
    void refreshWorld();
  }
  const ticker = setInterval(() => {
    now = Math.floor(Date.now() / 1000);
  }, 1000);
  // Players who arrive after this page did change who is on which team, and a
  // seat of one's own can only arrive this way once the page is loaded.
  const poller = setInterval(refreshWorld, 3000);
  return () => {
    clearInterval(ticker);
    clearInterval(poller);
  };
});
</script>

<svelte:head>
  <title>Team counter race — Snek Centaur Server</title>
</svelte:head>

<main>
  <h1>Team counter race</h1>

  {#if stage === "signed-out"}
    <p>
      Sign in and you are seated on a team. Press <strong>+1</strong> for your team; everyone
      watching sees every press as it lands.
    </p>
    <p><button data-testid="sign-in" type="button" onclick={signIn}>Sign in with Cyphid</button></p>
  {:else if stage === "arriving" || stage === "seating"}
    <p data-testid="stage">{stage === "arriving" ? "signing you in…" : "finding you a seat…"}</p>
  {:else if stage === "refused"}
    <p data-testid="stage" class="refused">{detail}</p>
    <p><button type="button" onclick={signIn}>Try again</button></p>
  {/if}

  {#if stage === "playing" && world}
    <p data-testid="seat">
      {#if watching}
        Watching as a spectator.
      {:else if myTeam}
        You play for <strong>{myTeam}</strong>.
      {:else}
        You hold no seat, so you are watching.
      {/if}
    </p>

    {#key token}
      <GameBoard
        {token}
        stdbUrl={data.stdbUrl}
        database={data.stdbDatabase}
        {teamLabels}
        onclosed={closed}
        onrefusal={(said) => {
          refusal = said;
        }}
      />
    {/key}

    {#if refusal}
      <p data-testid="refusal" class="refused">{refusal}</p>
    {/if}

    <p>
      <button data-testid="watch" type="button" onclick={toggleWatching}>
        {watching ? "Take my seat back" : "Watch as a spectator instead"}
      </button>
    </p>

    <section class="who">
      <h2>Who is playing</h2>
      <ul data-testid="players">
        {#each world.teams as team (team.teamId)}
          <li>
            <strong>{team.label}</strong>:
            {world.players
              .filter((player) => player.team === team.label)
              .map((player) => (player.userId === userId ? "you" : (player.name ?? player.userId)))
              .join(", ") || "nobody yet"}
          </li>
        {/each}
      </ul>
    </section>

    <section class="under">
      <h2>What just happened</h2>
      <ul>
        <li>
          You signed in at the platform's own origin — this server never saw the exchange with
          Google, only a single-use reference it could not have redeemed itself.
        </li>
        <li>
          The platform issued you a game token for <code>{subject}</code>, good for one game and
          <strong>{secondsLeft}s</strong> more. It is held in this page's memory and nothing else;
          a reload obtains another.
        </li>
        <li>
          The game decided what that token earns on its own — from its seeded roster, with no call
          back to the platform. Your team came from that roster, not from anything this page said.
        </li>
        <li>
          Watching gets you a spectator token, whose identity has no team to act for — so the game
          refuses its presses, structurally, rather than by checking a permission.
        </li>
      </ul>
    </section>
  {/if}
</main>

<style>
  :global(body) {
    background: #0f172a;
  }

  main {
    font-family: system-ui, sans-serif;
    max-width: 620px;
    margin: 3rem auto 6rem;
    padding: 0 1rem;
    color: #cbd5e1;
  }

  h1 {
    font-size: 1.7rem;
    color: #f8fafc;
  }

  h2 {
    font-size: 0.95rem;
    color: #7dd3fc;
    margin-bottom: 0.4rem;
  }

  p,
  li {
    line-height: 1.6;
  }

  .refused {
    color: #fca5a5;
  }

  .who,
  .under {
    margin-top: 2rem;
    border-top: 1px solid #1e293b;
    padding-top: 1rem;
  }

  .under li {
    color: #64748b;
    font-size: 0.9rem;
    margin-bottom: 0.4rem;
  }

  code {
    background: #1e293b;
    padding: 0.1em 0.35em;
    border-radius: 4px;
    color: #7dd3fc;
    font-size: 0.85em;
    overflow-wrap: anywhere;
  }

  button {
    background: #0ea5e9;
    color: #0b1220;
    border: none;
    border-radius: 8px;
    padding: 0.55rem 1.1rem;
    font-weight: 600;
    cursor: pointer;
  }
</style>
