<script lang="ts">
// The board: a live connection to the game instance, and the one button.
//
// This is the only file that talks to the instance. It is handed a game access
// token and does exactly what any client does with one — presents it at connect
// time and finds out whether it is admitted. Nothing here decides what the
// holder may do: the instance derives that from the token's subject and its own
// seeded roster, and this page discovers the answer by trying.
//
// The SDK exchanges the token at the host's `/v1/identity/websocket-token`
// before opening the socket, which is the path a browser has to take — it
// cannot set an Authorization header on a WebSocket upgrade. That exchange
// re-signs the token under the host's own key while carrying the platform's
// issuer, game binding and subject through unaltered, which is what keeps it
// admissible.
// spec: identity-and-authorization/connect-time-validation#re-issuance-preserves-the-binding
//
// **The connection is built and torn down here rather than through
// `spacetimedb/svelte`'s provider.** That wrapper pools one connection per host
// and database and hands it to every consumer, which is wrong for the one thing
// this page must be able to do: present a *different* token — an operator's or
// a spectator's — against the same instance. Pooled, the second token is never
// presented and the first connection's privileges quietly persist, which is a
// demo that lies about the thing it exists to show.
import { DbConnection } from "$lib/game/_generated";

interface Props {
  token: string;
  stdbUrl: string;
  database: string;
  /** Labels for the team ids the counters are keyed by. */
  teamLabels: Record<string, string>;
  /** Told when a connection ends, and whether it had ever been established. */
  onclosed: (everConnected: boolean) => void;
  /** Told what the instance said about an attempt to act. */
  onrefusal: (refusal: string) => void;
}

const { token, stdbUrl, database, teamLabels, onclosed, onrefusal }: Props = $props();

interface Counter {
  teamId: string;
  count: number;
}

let counters = $state<Counter[]>([]);
let ready = $state(false);
/** The connection a press goes through, or `undefined` while there is none. */
let live: DbConnection | undefined;

const read = (connection: DbConnection): void => {
  counters = [...connection.db.teamCounter.iter()]
    .map((row) => ({ teamId: String(row["teamId"]), count: Number(row["count"]) }))
    .sort((a, b) => a.teamId.localeCompare(b.teamId));
};

// One connection per token, torn down when the token changes or the page goes
// away. Svelte runs the cleanup before the next pass, so the old socket is
// always closed before a new one is opened — which is what keeps a press from
// going out under a token the holder has already given up.
$effect(() => {
  const bearing = token;
  let current = true;
  let everConnected = false;
  ready = false;
  counters = [];

  const connection = DbConnection.builder()
    .withUri(stdbUrl)
    .withDatabaseName(database)
    .withToken(bearing)
    .onConnect((established) => {
      everConnected = true;
      if (!current) return;
      live = established;
      established
        .subscriptionBuilder()
        .onApplied(() => {
          if (!current) return;
          ready = true;
          read(established);
        })
        .subscribe(["SELECT * FROM team_counter"]);
      // Every press by anybody arrives as one of these.
      established.db.teamCounter.onInsert(() => current && read(established));
      established.db.teamCounter.onUpdate(() => current && read(established));
      established.db.teamCounter.onDelete(() => current && read(established));
    })
    .onConnectError((_context, error) => {
      if (current) onrefusal(error.message);
    })
    // The whole of what a refused client is told. The host answers the upgrade
    // and the module then throws, so the socket closes carrying no reason at
    // all — a disconnect that arrives before any successful connect *is* the
    // admission refusal, and the reason for it is in the instance's own log.
    .onDisconnect(() => {
      if (!current) return;
      ready = false;
      live = undefined;
      onclosed(everConnected);
    })
    .build();

  return () => {
    // `current` first: the teardown's own disconnect must not be reported as
    // the instance closing the connection.
    current = false;
    if (live === connection) live = undefined;
    connection.disconnect();
  };
});

async function press(): Promise<void> {
  onrefusal("");
  if (!live) {
    onrefusal("not connected to the game");
    return;
  }
  try {
    // The reducer view's precise type is lost with the generated bindings'
    // `@ts-nocheck` (see scripts/generate-demo-bindings.mjs), so the one call
    // this page makes names its own shape. The module's `increment` takes no
    // arguments, which is the whole of what there is to get wrong.
    const reducers = live.reducers as unknown as {
      increment: (args: Record<string, never>) => Promise<void>;
    };
    await reducers.increment({});
  } catch {
    // The instance tells a client nothing about why it refused — deliberately,
    // and the same reticence that keeps admission records unreadable. What
    // reaches here is the host's generic failure, so the message below is this
    // page's own: `increment` refuses for exactly one reason, which is that the
    // connection's admitted identity carries no team to act for. The instance's
    // log has the refusal in its own words.
    onrefusal("the game refused the press: this connection may not act for any team");
  }
}
</script>

<div class="board" data-testid="board" data-ready={ready}>
  {#each counters as counter (counter.teamId)}
    <div class="counter" data-testid={`counter-${teamLabels[counter.teamId] ?? counter.teamId}`}>
      <span class="team">{teamLabels[counter.teamId] ?? counter.teamId}</span>
      <span class="count">{counter.count}</span>
    </div>
  {:else}
    <p class="quiet">{ready ? "no teams yet" : "connecting to the game…"}</p>
  {/each}
</div>

<button data-testid="press" type="button" onclick={press} disabled={!ready}>+1</button>

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
