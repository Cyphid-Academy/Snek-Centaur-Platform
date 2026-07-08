<script lang="ts">
  import {
    createInitialState,
    resolveTurn,
    computeBotMoves,
    type GameState,
    type TurnEvent,
  } from "$lib/snek/engine";

  const TEAM_COLOR: Record<string, string> = { Red: "#ef4444", Blue: "#3b82f6" };
  const TEAM_HEAD: Record<string, string> = { Red: "#b91c1c", Blue: "#1d4ed8" };
  const FOOD_COLOR = "#22c55e";
  const CELL = 34;

  const INITIAL_SEED = 12345;
  let seed = $state(INITIAL_SEED);
  let state = $state<GameState>(createInitialState(INITIAL_SEED));
  let playing = $state(false);
  let speedMs = $state(220);
  let log = $state<string[]>([]);

  const px = $derived(state.board.size * CELL);
  const cells = $derived(
    Array.from({ length: state.board.size }, (_, y) =>
      Array.from({ length: state.board.size }, (_, x) => ({ x, y })),
    ),
  );
  const wall = (x: number, y: number) =>
    x === 0 || y === 0 || x === state.board.size - 1 || y === state.board.size - 1;

  const teams = $derived(
    state.teamIds.map((id) => {
      const snakes = state.snakes.filter((s) => s.teamId === id);
      const aliveSnakes = snakes.filter((s) => s.alive);
      return {
        id,
        color: TEAM_COLOR[id],
        aliveCount: aliveSnakes.length,
        total: snakes.length,
        length: aliveSnakes.reduce((n, s) => n + s.body.length, 0),
      };
    }),
  );

  function describe(e: TurnEvent): string | null {
    switch (e.type) {
      case "SnakeDied":
        return `☠ ${e.snakeId} — ${e.cause}`;
      case "FoodConsumed":
        return `🍏 ${e.snakeId} ate food`;
      case "GameEnded":
        return `🏁 game over — ${e.winnerTeamId ? e.winnerTeamId + " wins" : "draw"}`;
      default:
        return null;
    }
  }

  function step() {
    if (state.finished) return;
    // The engine calls structuredClone() on the state it receives, which throws
    // DataCloneError on Svelte 5's reactive $state proxy. Hand it a plain,
    // non-proxied snapshot instead.
    const snapshot = $state.snapshot(state);
    const moves = computeBotMoves(snapshot);
    const { state: next, events } = resolveTurn(snapshot, moves);
    state = next;
    const lines = events.map(describe).filter((l): l is string => l !== null);
    if (lines.length) log = [...lines.map((l) => `t${state.turn}  ${l}`), ...log].slice(0, 40);
  }

  function reset(newSeed = Math.floor(Math.random() * 1_000_000)) {
    playing = false;
    seed = newSeed;
    state = createInitialState(seed);
    log = [];
  }

  $effect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      if (state.finished) {
        playing = false;
        return;
      }
      step();
    }, speedMs);
    return () => clearInterval(id);
  });
</script>

<div class="wrap">
  <header>
    <h1>Team Snek <span class="tag">reduced v0 demo</span></h1>
    <p class="sub">
      Movement · wall/self/body/head-to-head collisions · food &amp; health. Two greedy bots per
      team. <strong>Potions, teams-buff mechanic, invisibility, chess timer — next.</strong>
    </p>
  </header>

  <div class="grid">
    <div class="board-col">
      <svg width={px} height={px} viewBox="0 0 {px} {px}" role="img" aria-label="game board">
        <!-- cells -->
        {#each cells as row}
          {#each row as c}
            <rect
              x={c.x * CELL}
              y={c.y * CELL}
              width={CELL}
              height={CELL}
              fill={wall(c.x, c.y) ? "#0f172a" : (c.x + c.y) % 2 ? "#1e293b" : "#1a2436"}
            />
          {/each}
        {/each}

        <!-- food -->
        {#each state.items as f (f.id)}
          <circle cx={f.x * CELL + CELL / 2} cy={f.y * CELL + CELL / 2} r={CELL * 0.22} fill={FOOD_COLOR} />
        {/each}

        <!-- snakes -->
        {#each state.snakes.filter((s) => s.alive) as s (s.id)}
          {#each s.body as seg, i (i)}
            <rect
              x={seg.x * CELL + 2}
              y={seg.y * CELL + 2}
              width={CELL - 4}
              height={CELL - 4}
              rx="7"
              fill={i === 0 ? TEAM_HEAD[s.teamId] : TEAM_COLOR[s.teamId]}
              opacity={i === 0 ? 1 : 0.9}
            />
          {/each}
          <text
            x={s.body[0].x * CELL + CELL / 2}
            y={s.body[0].y * CELL + CELL / 2 + 4}
            text-anchor="middle"
            font-size="13"
            font-weight="700"
            fill="#fff">{s.letter}</text
          >
        {/each}
      </svg>

      <div class="controls">
        <button onclick={step} disabled={state.finished}>Step ▷</button>
        <button class="primary" onclick={() => (playing = !playing)} disabled={state.finished}>
          {playing ? "Pause ⏸" : "Play ▶"}
        </button>
        <button onclick={() => reset()}>Reset ⟳</button>
        <label class="speed">
          speed
          <input type="range" min="60" max="600" step="20" bind:value={speedMs} />
        </label>
      </div>
    </div>

    <aside>
      <div class="stat">
        <div class="turn">Turn {state.turn}</div>
        {#if state.finished}
          <div class="winner">
            {state.winnerTeamId ? `${state.winnerTeamId} wins` : "Draw"}
          </div>
        {/if}
      </div>

      <table>
        <thead><tr><th>Team</th><th>Alive</th><th>Length</th></tr></thead>
        <tbody>
          {#each teams as t}
            <tr>
              <td><span class="dot" style="background:{t.color}"></span>{t.id}</td>
              <td>{t.aliveCount}/{t.total}</td>
              <td>{t.length}</td>
            </tr>
          {/each}
        </tbody>
      </table>

      <div class="log">
        <div class="log-title">events</div>
        {#each log as line}
          <div class="log-line">{line}</div>
        {/each}
        {#if log.length === 0}
          <div class="log-empty">press Play…</div>
        {/if}
      </div>
      <p class="seed">seed {seed}</p>
    </aside>
  </div>
</div>

<style>
  .wrap {
    max-width: 860px;
    margin: 0 auto;
    padding: 24px 20px 60px;
    color: #e2e8f0;
    font-family: ui-sans-serif, system-ui, sans-serif;
  }
  h1 { font-size: 1.6rem; margin: 0 0 4px; }
  .tag {
    font-size: 0.7rem;
    background: #334155;
    color: #cbd5e1;
    padding: 3px 8px;
    border-radius: 999px;
    vertical-align: middle;
    font-weight: 600;
  }
  .sub { color: #94a3b8; font-size: 0.9rem; margin: 0 0 18px; line-height: 1.5; }
  .sub strong { color: #cbd5e1; }
  .grid { display: flex; gap: 22px; flex-wrap: wrap; align-items: flex-start; }
  svg { border-radius: 10px; box-shadow: 0 8px 30px rgba(0, 0, 0, 0.35); display: block; }
  .controls { display: flex; gap: 8px; align-items: center; margin-top: 14px; flex-wrap: wrap; }
  button {
    background: #334155;
    color: #e2e8f0;
    border: none;
    padding: 8px 14px;
    border-radius: 8px;
    font-size: 0.88rem;
    font-weight: 600;
    cursor: pointer;
  }
  button:hover:not(:disabled) { background: #475569; }
  button.primary { background: #22c55e; color: #052e16; }
  button.primary:hover:not(:disabled) { background: #16a34a; }
  button:disabled { opacity: 0.4; cursor: not-allowed; }
  .speed { font-size: 0.8rem; color: #94a3b8; display: flex; align-items: center; gap: 6px; }
  aside { min-width: 220px; flex: 1; }
  .stat { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }
  .turn { font-size: 1.3rem; font-weight: 700; }
  .winner { font-weight: 700; color: #22c55e; }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; margin-bottom: 16px; }
  th { text-align: left; color: #94a3b8; font-weight: 600; border-bottom: 1px solid #334155; padding: 6px 4px; }
  td { padding: 6px 4px; border-bottom: 1px solid #1e293b; }
  .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 7px; }
  .log { background: #0f172a; border-radius: 8px; padding: 10px 12px; height: 220px; overflow-y: auto; font-size: 0.78rem; font-family: ui-monospace, monospace; }
  .log-title { color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.68rem; margin-bottom: 6px; }
  .log-line { color: #cbd5e1; padding: 1px 0; }
  .log-empty { color: #475569; }
  .seed { color: #475569; font-size: 0.72rem; margin-top: 8px; }
</style>
