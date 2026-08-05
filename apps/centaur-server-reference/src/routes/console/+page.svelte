<script lang="ts">
// spec: identity-and-authorization/client-credential-custody#memory-only
// The platform console: this server's window onto everything the
// identity-and-authorization capability issues and admits, driven against the
// live deployment. Every credential the page holds lives in component memory
// alone — decoded claims are shown, plaintext never is, and a reload obtains
// everything afresh under the session
// (`#the-session-is-the-only-thing-a-reload-recovers`).
import { api } from "@cyphid/snek-convex-host/api";
import { ConvexHttpClient } from "convex/browser";
import { onMount } from "svelte";
import { challengeFor, newVerifier } from "$lib/pkce";
import type { PageData } from "./$types";

const { data }: { data: PageData } = $props();

const VERIFIER_KEY = "snek.console.verifier";

let platformCalls: ConvexHttpClient | undefined;
function client(): ConvexHttpClient {
  platformCalls ??= new ConvexHttpClient(data.convexUrl);
  return platformCalls;
}

/** Held for the life of the page and written nowhere. */
let credential: string | undefined;

interface Claims {
  sub: string;
  aud: string;
  iss: string;
  cap: { capability: string }[];
  act?: string;
  iat: number;
  exp: number;
}

function decodeClaims(jwt: string): Claims {
  const [, payload] = jwt.split(".");
  const body = (payload ?? "").replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(body)) as Claims;
}

/**
 * A refusal as a human should read it. A dev deployment prefixes thrown
 * messages with a request id and a stack; the platform's own sentence is what
 * the console shows.
 */
function refusalText(raw: string): string {
  const uncaught = /Uncaught (?:Convex)?Error: ([^\n]*)/.exec(raw);
  return uncaught?.[1] ?? raw;
}

const message = (refused: unknown): string =>
  refusalText(refused instanceof Error ? refused.message : String(refused));

// ---------------------------------------------------------------- platform
let platform = $state<{ ok: boolean; detail: string }>({ ok: false, detail: "checking…" });

async function checkPlatform(): Promise<void> {
  try {
    const status = (await client().query(api.platform.platformStatus, {})) as {
      ok: boolean;
      components: string[];
    };
    platform = { ok: status.ok, detail: status.components.join(", ") };
  } catch (refused) {
    platform = { ok: false, detail: message(refused) };
  }
}

// ----------------------------------------------------------- session, sign-in
let signedIn = $state<{ claims: Claims } | undefined>(undefined);
let signInDetail = $state("");
let signedOutNote = $state("");
let nowSeconds = $state(Math.floor(Date.now() / 1000));

/** Start the round trip: keep a verifier, send its challenge, hand over. */
async function beginSignIn(): Promise<void> {
  const verifier = newVerifier();
  window.sessionStorage.setItem(VERIFIER_KEY, verifier);
  const entry = new URL("/sign-in", data.convexSiteUrl);
  entry.searchParams.set("issuer", data.issuerId);
  entry.searchParams.set("return", data.returnAddress);
  entry.searchParams.set("challenge", await challengeFor(verifier));
  window.location.href = entry.toString();
}

/**
 * End the platform session. Deliberately opaque (`no-cors`): the deployment
 * serves no CORS-with-credentials — a page is not meant to converse with the
 * session cookie, only the browser is — so a page can send the sign-out and
 * read nothing back. The request reaches the platform where the app and the
 * platform share a site, as this demo's topology does; a team's fork on its
 * own domain holds no affordance over the platform session at all.
 *
 * spec: identity-and-authorization/google-sign-in#sign-out-clears-client-state
 */
async function signOut(): Promise<void> {
  try {
    await fetch(`${data.convexSiteUrl}/api/auth/sign-out`, {
      method: "POST",
      mode: "no-cors",
      credentials: "include",
    });
  } catch {
    // Nothing readable either way.
  }
  credential = undefined;
  signedIn = undefined;
  tokens = {};
  attributed = undefined;
  signedOutNote =
    "sign-out sent and page state dropped — if the session ended, the next sign-in round trip goes through Google again";
}

async function redeemArrivingHandoff(): Promise<void> {
  const reference = new URLSearchParams(window.location.search).get("handoff");
  if (reference === null) return;
  // Taken and cleared in one step: a verifier is answerable for exactly one
  // reference, and a reference with no verifier behind it is discarded, never
  // redeemed — anyone can navigate a browser here carrying a reference.
  const verifier = window.sessionStorage.getItem(VERIFIER_KEY);
  window.sessionStorage.removeItem(VERIFIER_KEY);
  if (verifier === null) {
    signInDetail = "arrived with a handoff reference but no verifier — discarded";
    return;
  }
  try {
    credential = (await client().action(api.issuance.redeemSignInHandoff, {
      reference,
      verifier,
    })) as string;
    signedIn = { claims: decodeClaims(credential) };
    signInDetail = "";
  } catch (refused) {
    signInDetail = message(refused);
  }
}

const userId = $derived(signedIn ? signedIn.claims.sub.replace(/^user:/, "") : undefined);
const credentialSecondsLeft = $derived(signedIn ? signedIn.claims.exp - nowSeconds : 0);

// ------------------------------------------------------------------- tokens
let selectedGame = $state("");
let selectedTeam = $state("");
let tokens = $state<Record<string, { claims: Claims } | { refused: string }>>({});

async function issueToken(role: "operator" | "spectator" | "coach"): Promise<void> {
  if (!credential) return;
  try {
    const token = (await client().action(api.issuance.issueGameToken, {
      credential,
      gameId: selectedGame,
      role,
      ...(role === "coach" ? { teamId: selectedTeam } : {}),
    })) as string;
    heldTokens[role] = token;
    tokens = { ...tokens, [role]: { claims: decodeClaims(token) } };
  } catch (refused) {
    delete heldTokens[role];
    tokens = { ...tokens, [role]: { refused: message(refused) } };
  }
}

/** Raw tokens, memory only, for presenting at the instance — never rendered. */
const heldTokens: Record<string, string> = {};

// ----------------------------------------------------------------- instance
let admissionOutcome = $state("");
let knocks = 0;

async function knock(withRole?: string): Promise<void> {
  const token = withRole ? heldTokens[withRole] : undefined;
  if (withRole && !token) {
    admissionOutcome = `no ${withRole} token is held — issue one first`;
    return;
  }
  knocks += 1;
  const label = `knock #${knocks} (${withRole ?? "no token"})`;
  admissionOutcome = `${label}: connecting…`;
  try {
    const response = await fetch(
      `${data.stdbUrl}/v1/database/${data.stdbDatabase}/call/ping`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(["console"]),
      },
    );
    const text = (await response.text()).slice(0, 160);
    admissionOutcome =
      response.status === 200
        ? `${label}: admitted — the reducer ran`
        : `${label}: refused (${response.status}) ${text}`;
  } catch (unreachable) {
    admissionOutcome = `${label}: instance unreachable: ${message(unreachable)}`;
  }
}

// -------------------------------------------------------------- attribution
let attributed = $state<{ issuerId: string; capability: string; at: number }[] | undefined>(
  undefined,
);
let attributedDetail = $state("");

async function refreshAttributed(): Promise<void> {
  if (!credential) return;
  try {
    attributed = (await client().query(api.platform.attributedActions, { credential })) as {
      issuerId: string;
      capability: string;
      at: number;
    }[];
    attributedDetail = "";
  } catch (refused) {
    attributedDetail = message(refused);
  }
}

// ---------------------------------------------------------- server principal
interface HeldClaims {
  subject: string;
  audience: string;
  issuer: string;
  capabilities: string[];
  actingSystem?: string;
  issuedAt: number;
  expiresAt: number;
}
let serverInfo = $state<
  | {
      domain: string;
      issuanceEndpoint: string;
      publishedKeySet: { keys: unknown[] };
      held: HeldClaims | null;
    }
  | undefined
>(undefined);
let exchangeAsk = $state<Record<string, boolean>>({
  "issue-game-credential": true,
  "issue-game-token": false,
  "review-attributed-actions": false,
  "begin-sign-in-handoff": false,
});
let exchangeOutcome = $state("");
let custody = $state<{
  scope: { teamId: string; gameId: string };
  claims: HeldClaims | null;
  renewal: string | null;
  lapse?: string;
} | null>(null);
let custodyOutcome = $state("");
let actOutcome = $state<
  | {
      ok: true;
      botToken: { claims: HeldClaims };
      exchangePreserved: { iss: boolean; aud: boolean; sub: boolean } | null;
      admission: { status: number; detail: string };
    }
  | { ok: false; refused: string }
  | undefined
>(undefined);

async function refreshServer(): Promise<void> {
  serverInfo = await (await fetch("/console/exchange")).json();
}

async function exchange(): Promise<void> {
  const capabilities = Object.entries(exchangeAsk)
    .filter(([, on]) => on)
    .map(([name]) => name);
  const result = (await (
    await fetch("/console/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ capabilities }),
    })
  ).json()) as { ok: boolean; refused?: string };
  exchangeOutcome = result.ok ? "credential earned" : `refused: ${refusalText(result.refused ?? "")}`;
  await refreshServer();
}

async function refreshCustody(): Promise<void> {
  custody = ((await (await fetch("/console/game-credential")).json()) as { custody: typeof custody })
    .custody;
}

async function beginCustody(): Promise<void> {
  custodyOutcome = "acquiring…";
  const result = (await (
    await fetch("/console/game-credential", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ teamId: selectedTeam, gameId: selectedGame }),
    })
  ).json()) as { ok: boolean; refused?: string };
  custodyOutcome = result.ok ? "held" : `refused: ${refusalText(result.refused ?? "")}`;
  await refreshCustody();
}

async function act(): Promise<void> {
  actOutcome = await (await fetch("/console/act", { method: "POST" })).json();
}

onMount(() => {
  void checkPlatform();
  void redeemArrivingHandoff().then(refreshAttributed);
  void refreshServer();
  void refreshCustody();
  if (data.world) {
    selectedGame = data.world.games[0]?.gameId ?? "";
    selectedTeam = data.world.teams[0]?.teamId ?? "";
  }
  const ticker = setInterval(() => {
    nowSeconds = Math.floor(Date.now() / 1000);
  }, 1000);
  return () => clearInterval(ticker);
});
</script>

<svelte:head>
  <title>Platform console — Snek Centaur Server</title>
</svelte:head>

<main>
  <h1>Platform console</h1>
  <p class="quiet">
    This server, talking to the platform's live deployment: sign-in and sessions, the sign-in
    handoff, every credential the platform issues, and what a game instance does with one.
  </p>

  <section>
    <h2>Platform</h2>
    <p data-testid="platform" data-ok={platform.ok}>
      {platform.ok ? "up" : "down"} — {platform.detail}
    </p>
    <p class="quiet">
      Verification material, published where any party can validate alone:
      <a href={`${data.convexSiteUrl}/.well-known/openid-configuration`}>openid-configuration</a> ·
      <a href={`${data.convexSiteUrl}/.well-known/jwks.json`}>jwks.json</a> · this server's own
      published keys: <a href="/.well-known/snek-server-keys">snek-server-keys</a>
    </p>
  </section>

  <section>
    <h2>Session &amp; credential</h2>
    {#if signedIn}
      <p data-testid="session">
        Platform session: <strong>live</strong>
        <span class="quiet">
          — this credential was just minted from it; the session itself is a cookie on the
          platform's origin that no page script (here or anywhere) can read
        </span>
      </p>
    {:else}
      <p data-testid="session" class="quiet">
        Session state is the platform's own: a page cannot ask after it, it can only send the
        browser on the round trip below — silent when a session is live, through Google when not.
      </p>
    {/if}
    {#if signedOutNote}
      <p class="quiet">{signedOutNote}</p>
    {/if}
    {#if signedIn}
      <p data-testid="credential">
        Holding a credential for <code>{signedIn.claims.sub}</code>, audience
        <code>{signedIn.claims.aud}</code>, via <code>{signedIn.claims.act}</code> — capabilities:
        {signedIn.claims.cap.map((entry) => entry.capability).join(", ") || "(none)"} — expires in
        <strong>{Math.max(0, credentialSecondsLeft)}s</strong>
      </p>
      <p class="quiet">
        Held in page memory only; a reload discards it and the silent round trip earns a fresh one
        while the session lives. Renewal is the same round trip — a credential cannot renew itself.
      </p>
    {:else if signInDetail}
      <p data-testid="credential" class="refused">{signInDetail}</p>
    {/if}
    <p>
      <button type="button" onclick={beginSignIn}>
        {signedIn ? "Renew credential (silent while signed in)" : "Sign in with Cyphid"}
      </button>
      <button type="button" onclick={signOut}>Sign out</button>
    </p>
    {#if userId}
      <p class="quiet">
        Seed this deployment's world around you:
        <code>pnpm demo:seed --member={userId}</code>
        (add <code>--coach={userId}</code> and/or <code>--admin={userId}</code> to try those roles).
      </p>
    {/if}
  </section>

  <section>
    <h2>Game world</h2>
    {#if data.world}
      <ul>
        {#each data.world.teams as team (team.teamId)}
          <li>
            team <strong>{team.label}</strong> <code>{team.teamId}</code>
            {team.serverDomain ? `— operated from ${team.serverDomain}` : "— no server nominated"}
          </li>
        {/each}
        {#each data.world.games as game (game.gameId)}
          <li>game <strong>{game.label}</strong> <code>{game.gameId}</code> — {game.status}</li>
        {/each}
      </ul>
    {:else}
      <p class="quiet">
        Not seeded yet. The tables behind games and teams have no production writer until
        migrate-game-lifecycle and migrate-team-management land, so the demo stack seeds them as an
        operator act: <code>pnpm demo:seed</code>.
      </p>
    {/if}
  </section>

  <section>
    <h2>Game access tokens</h2>
    {#if !signedIn}
      <p class="quiet">Sign in first — issuance answers an authenticated identity.</p>
    {/if}
    <p>
      <label>
        game
        <select bind:value={selectedGame}>
          {#each data.world?.games ?? [] as game (game.gameId)}
            <option value={game.gameId}>{game.label} ({game.status})</option>
          {/each}
        </select>
      </label>
      <label>
        team (for coach / server custody)
        <select bind:value={selectedTeam}>
          {#each data.world?.teams ?? [] as team (team.teamId)}
            <option value={team.teamId}>{team.label}</option>
          {/each}
        </select>
      </label>
    </p>
    <p>
      <button type="button" disabled={!signedIn} onclick={() => issueToken("operator")}>
        Operator token
      </button>
      <button type="button" disabled={!signedIn} onclick={() => issueToken("spectator")}>
        Spectator token
      </button>
      <button type="button" disabled={!signedIn} onclick={() => issueToken("coach")}>
        Coach token
      </button>
    </p>
    {#each Object.entries(tokens) as [role, outcome] (role)}
      <p data-testid={`token-${role}`}>
        {#if "claims" in outcome}
          <strong>{role}</strong>: subject <code>{outcome.claims.sub}</code>, audience
          <code>{outcome.claims.aud}</code> — the subject alone decides the role, and the audience
          names the one game instance the token is inert everywhere but at.
        {:else}
          <strong>{role}</strong>: <span class="refused">{outcome.refused}</span>
        {/if}
      </p>
    {/each}
  </section>

  <section>
    <h2>Game instance admission</h2>
    <p class="quiet">
      The instance validates alone, from material and a roster seeded at initialisation. The shipped
      module's seed tables have no writer until migrate-game-lifecycle lands
      <code>initialize_game</code>, so it admits no one — every knock below shows the fail-closed
      refusal, decided by the same <code>admit()</code> the unit and end-to-end suites drive.
    </p>
    <p>
      <button type="button" onclick={() => knock()}>Knock with no token</button>
      <button type="button" onclick={() => knock("operator")}>Knock with operator token</button>
      <button type="button" onclick={() => knock("spectator")}>Knock with spectator token</button>
    </p>
    {#if admissionOutcome}
      <p data-testid="admission">{admissionOutcome}</p>
    {/if}
  </section>

  <section>
    <h2>Actions taken through a server</h2>
    <p class="quiet">
      Every call this page makes under its credential carries <code>act</code> naming this server,
      is charged against this server's call bound, and — where it changed platform state — is
      recorded for the human it acted for.
    </p>
    <p><button type="button" disabled={!signedIn} onclick={refreshAttributed}>Refresh</button></p>
    {#if attributed}
      <ul data-testid="attributed">
        {#each attributed as action, index (index)}
          <li>
            <code>{action.capability}</code> through <code>{action.issuerId}</code> at
            {new Date(action.at).toLocaleTimeString()}
          </li>
        {:else}
          <li class="quiet">nothing recorded yet</li>
        {/each}
      </ul>
    {:else if attributedDetail}
      <p class="refused">{attributedDetail}</p>
    {/if}
  </section>

  <section>
    <h2>This server as a service principal</h2>
    {#if serverInfo}
      <p class="quiet">
        <code>{serverInfo.domain}</code> proves itself with a short-lived assertion signed by its
        own key (published at <a href="/.well-known/snek-server-keys">snek-server-keys</a>), used
        only at <code>{serverInfo.issuanceEndpoint}</code>, accepted once. The platform holds no
        secret for it.
      </p>
      {#if serverInfo.held}
        <p data-testid="server-credential">
          Held: <code>{serverInfo.held.subject}</code> — capabilities
          {serverInfo.held.capabilities.join(", ") || "(none)"}
        </p>
      {/if}
    {/if}
    <fieldset>
      <legend>Exchange an assertion for a platform credential</legend>
      {#each Object.keys(exchangeAsk) as capability (capability)}
        <label class="inline">
          <input type="checkbox" bind:checked={exchangeAsk[capability]} />
          <code>{capability}</code>
        </label>
      {/each}
      <p>
        <button type="button" onclick={exchange}>Exchange</button>
        {#if exchangeOutcome}<span data-testid="exchange">{exchangeOutcome}</span>{/if}
      </p>
      <p class="quiet">
        Asking beyond the registered ceiling refuses loudly, naming the excess — never a silent
        narrowing. <code>begin-sign-in-handoff</code> is outside every peer's ceiling whatever the
        registration says: chained with redemption it would renew a human's credential without the
        human.
      </p>
    </fieldset>
    <fieldset>
      <legend>Per-team game credential, held and renewed</legend>
      <p>
        <button type="button" onclick={beginCustody}>Hold for selected team + game</button>
        <button type="button" onclick={refreshCustody}>Status</button>
        {#if custodyOutcome}<span data-testid="custody-outcome">{custodyOutcome}</span>{/if}
      </p>
      {#if custody?.claims}
        <p data-testid="custody">
          Holding <code>{custody.claims.subject}</code> — capabilities
          {custody.claims.capabilities.join(", ")} — renewal: <strong>{custody.renewal}</strong>
          (proactive at two-thirds of the fifteen-minute life; a refused call is never how expiry is
          discovered)
        </p>
      {/if}
      {#if custody?.lapse}
        <p class="refused">lapsed: {custody.lapse}</p>
      {/if}
    </fieldset>
    <fieldset>
      <legend>Act as the team's bot</legend>
      <p><button type="button" onclick={act}>Bot token + present at instance</button></p>
      {#if actOutcome}
        {#if actOutcome.ok}
          <p data-testid="act">
            bot token subject <code>{actOutcome.botToken.claims.subject}</code>;
            {#if actOutcome.exchangePreserved}
              host re-mint preserved iss/aud/sub:
              {actOutcome.exchangePreserved.iss &&
              actOutcome.exchangePreserved.aud &&
              actOutcome.exchangePreserved.sub
                ? "yes"
                : "NO"};
            {/if}
            admission: {actOutcome.admission.status === 200
              ? "admitted"
              : `refused (${actOutcome.admission.status})`}
          </p>
        {:else}
          <p data-testid="act" class="refused">{actOutcome.refused}</p>
        {/if}
      {/if}
    </fieldset>
  </section>
</main>

<style>
  :global(body) {
    background: #0f172a;
  }

  main {
    font-family: system-ui, sans-serif;
    max-width: 860px;
    margin: 2rem auto 6rem;
    padding: 0 1rem;
    color: #e2e8f0;
  }

  h1 {
    font-size: 1.6rem;
    color: #f8fafc;
  }

  section {
    border: 1px solid #1e293b;
    border-radius: 8px;
    padding: 0.25rem 1rem 0.75rem;
    margin: 1rem 0;
  }

  h2 {
    font-size: 1.05rem;
    color: #7dd3fc;
  }

  p,
  li {
    line-height: 1.55;
    color: #cbd5e1;
  }

  .quiet {
    color: #64748b;
    font-size: 0.9rem;
  }

  .refused {
    color: #fca5a5;
  }

  code {
    background: #1e293b;
    padding: 0.1em 0.35em;
    border-radius: 4px;
    font-size: 0.85em;
    color: #7dd3fc;
    overflow-wrap: anywhere;
  }

  a {
    color: #7dd3fc;
  }

  button {
    background: #0ea5e9;
    color: #0b1220;
    border: none;
    border-radius: 6px;
    padding: 0.45rem 0.8rem;
    font-weight: 600;
    cursor: pointer;
  }

  button:disabled {
    background: #334155;
    color: #94a3b8;
    cursor: not-allowed;
  }

  fieldset {
    border: 1px solid #1e293b;
    border-radius: 6px;
    margin: 0.75rem 0;
  }

  legend {
    color: #94a3b8;
    font-size: 0.9rem;
    padding: 0 0.4rem;
  }

  label {
    color: #94a3b8;
    font-size: 0.9rem;
    margin-right: 0.75rem;
  }

  label.inline {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }

  select {
    background: #1e293b;
    color: #e2e8f0;
    border: 1px solid #334155;
    border-radius: 4px;
    padding: 0.25rem;
    margin-left: 0.3rem;
  }
</style>
