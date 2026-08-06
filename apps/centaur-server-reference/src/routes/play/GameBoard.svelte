<script lang="ts">
// The board: a live connection to the game instance, and the one button.
//
// This is the only file that talks to the instance. It is handed a game access
// token and does exactly what any client does with one — presents it at
// connect time and finds out whether it is admitted. Nothing here decides what
// the holder may do: the instance derives that from the token's subject and its
// own seeded roster, and this page discovers the answer by trying.
//
// The SDK exchanges the token at the host's `/v1/identity/websocket-token`
// before opening the socket, which is the path a browser has to take — it
// cannot set an Authorization header on a WebSocket upgrade. That exchange
// re-signs the token under the host's own key while carrying the platform's
// issuer, game binding and subject through unaltered, which is what keeps it
// admissible.
// spec: identity-and-authorization/connect-time-validation#re-issuance-preserves-the-binding
import { DbConnection, reducers, tables } from "$lib/game/_generated";
import { createSpacetimeDBProvider, useReducer, useTable } from "spacetimedb/svelte";
import { onDestroy } from "svelte";

interface Props {
  token: string;
  stdbUrl: string;
  database: string;
  /** Labels for the team ids the counters are keyed by. */
  teamLabels: Record<string, string>;
  /** Told when the instance closes the connection, so the page can react. */
  onclosed: (everConnected: boolean) => void;
  /** Told what the instance said about an attempt to act. */
  onrefusal: (refusal: string) => void;
}

const { token, stdbUrl, database, teamLabels, onclosed, onrefusal }: Props = $props();

let everConnected = false;

// The provider takes the *builder*: it owns building and rebuilding the
// connection, and it must be created at component init. The page remounts this
// component whenever the token changes, so a new token is always a new
// connection rather than a mutation of a live one.
// The initial values are the right ones to capture: this component is keyed on
// the token, so a change to any of them arrives as a remount with a connection
// of its own rather than as an update to a live one.
// svelte-ignore state_referenced_locally
const connection = createSpacetimeDBProvider(
  DbConnection.builder()
    .withUri(stdbUrl)
    .withDatabaseName(database)
    .withToken(token)
    .onConnect(() => {
      everConnected = true;
    })
    .onConnectError((_context, error) => {
      onrefusal(error.message);
    })
    // The whole of what a refused client is told. The host answers the upgrade
    // and the module then throws, so the socket closes carrying no reason at
    // all — a disconnect that arrives before any successful connect *is* the
    // admission refusal, and the reason for it is in the instance's own log.
    .onDisconnect(() => {
      onclosed(everConnected);
    }),
);

const [counters, ready] = useTable(tables.teamCounter);
const increment = useReducer(reducers.increment);

onDestroy(() => {
  // The provider is reference-counted and cleans up on its own, but a remount
  // on every token change makes leaking a socket cheap to do and expensive to
  // notice — so the connection is closed where it was opened.
  $connection.getConnection()?.disconnect();
});

/** The counters, in the shape the markup reads them. */
const rows = $derived(
  $counters.map((row) => ({ teamId: String(row["teamId"]), count: Number(row["count"]) })),
);

async function press(): Promise<void> {
  onrefusal("");
  try {
    await increment();
  } catch (refused) {
    // A reducer that threw refused this caller. The instance's message says
    // why, and for a spectator it says it in the words of the rule: this
    // connection may not act for any team.
    onrefusal(refused instanceof Error ? refused.message : String(refused));
  }
}
</script>

<div class="board" data-testid="board" data-ready={$ready}>
  {#each rows as counter (counter.teamId)}
    <div class="counter" data-testid={`counter-${teamLabels[counter.teamId] ?? counter.teamId}`}>
      <span class="team">{teamLabels[counter.teamId] ?? counter.teamId}</span>
      <span class="count">{counter.count}</span>
    </div>
  {:else}
    <p class="quiet">{$ready ? "no teams yet" : "connecting to the game…"}</p>
  {/each}
</div>

<button data-testid="press" type="button" onclick={press} disabled={!$ready}>+1</button>

<style>
  .board {
    display: flex;
    gap: 1.5rem;
    margin: 1rem 0;
  }

  .counter {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 1.25rem 1rem;
    border: 1px solid #1e293b;
    border-radius: 10px;
    background: #0b1220;
  }

  .team {
    color: #94a3b8;
    font-size: 0.95rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .count {
    color: #f8fafc;
    font-size: 3rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }

  .quiet {
    color: #64748b;
  }

  button {
    background: #0ea5e9;
    color: #0b1220;
    border: none;
    border-radius: 8px;
    padding: 0.7rem 1.6rem;
    font-size: 1.1rem;
    font-weight: 700;
    cursor: pointer;
  }

  button:disabled {
    background: #334155;
    color: #94a3b8;
    cursor: not-allowed;
  }
</style>
