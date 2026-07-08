<script lang="ts">
  import {
    CellType,
    DEFAULT_GAME_CONFIG,
    ItemType,
    createLocalGame,
    invulnerabilityLevel,
    isVisible,
    parityOf,
    seedFromText,
  } from "@cyphid/snek-centaur-server-lib";
  import type {
    BoardGenerationFailure,
    CentaurTeamId,
    GameConfig,
    GameOutcome,
    LocalGame,
    SnakeId,
    SnakeState,
    TurnEvent,
  } from "@cyphid/snek-centaur-server-lib";
  import { computeBotMoves } from "$lib/snek/bot";

  const TEAMS = [
    { centaurTeamId: "red" as CentaurTeamId, name: "Red" },
    { centaurTeamId: "blue" as CentaurTeamId, name: "Blue" },
  ];
  const TEAM_BODY: Record<string, string> = { red: "#ef4444", blue: "#3b82f6" };
  const TEAM_HEAD: Record<string, string> = { red: "#b91c1c", blue: "#1d4ed8" };

  // Small, lively local configuration (ranges per 01-REQ-063..077): a 15
  // board with a couple of snakes per team, light hazards, fertile ground on
  // (food only spawns there, 01-REQ-048), and both potions enabled.
  const DEMO_CONFIG: GameConfig = {
    orchestration: {
      boardSize: 15,
      snakesPerTeam: 2,
      hazardPercentage: 6,
      fertileGround: { density: 30, clustering: 10 },
    },
    runtime: {
      ...DEFAULT_GAME_CONFIG.runtime,
      maxTurns: 300,
      foodSpawnRate: 0.6,
      invulnPotionSpawnRate: 0.1,
      invisPotionSpawnRate: 0.07,
    },
  };

  const CELL = 30;

  interface View {
    readonly board: LocalGame["state"]["board"];
    readonly snakes: LocalGame["state"]["snakes"];
    readonly items: LocalGame["state"]["items"];
    readonly turn: number;
    readonly outcome: GameOutcome;
  }

  // The driver stays OUTSIDE $state on purpose: the engine and bot must only
  // ever see the driver's plain objects, never Svelte 5 reactive proxies
  // (the v0 PoC hit DataCloneError handing a $state proxy to the engine).
  // Rendering reads the `view` snapshot instead.
  const INITIAL_SEED = "snek-demo";
  let game: LocalGame | null = null;
  let seedText = $state(INITIAL_SEED);
  let view = $state<View | null>(null);
  let failure = $state<BoardGenerationFailure | null>(null);
  let playing = $state(false);
  let speedMs = $state(180);
  let log = $state<string[]>([]);

  function syncView(): void {
    if (game === null) return;
    view = {
      board: game.state.board,
      snakes: game.state.snakes,
      items: game.state.items,
      turn: game.turnNumber,
      outcome: game.outcome,
    };
  }

  function startGame(text: string): void {
    playing = false;
    log = [];
    failure = null;
    game = null;
    view = null;
    const created = createLocalGame(DEMO_CONFIG, TEAMS, seedFromText(text));
    if ("code" in created) {
      failure = created;
      return;
    }
    game = created;
    syncView();
  }

  function step(): void {
    if (game === null || game.finished) return;
    const resolution = game.step(computeBotMoves(game.state, DEMO_CONFIG.runtime));
    syncView();
    const turn = game.turnNumber;
    const lines = resolution.events
      .map(describe)
      .filter((line): line is string => line !== null)
      .map((line) => `t${turn}  ${line}`);
    if (lines.length > 0) log = [...lines, ...log].slice(0, 60);
    if (game.finished) playing = false;
  }

  function newRandomGame(): void {
    seedText = `snek-${Math.random().toString(36).slice(2, 8)}`;
    startGame(seedText);
  }

  function teamName(id: CentaurTeamId): string {
    return TEAMS.find((t) => t.centaurTeamId === id)?.name ?? id;
  }

  function snakeLabel(id: SnakeId): string {
    const snake = game?.state.snakes.find((s) => s.snakeId === id);
    return snake === undefined ? `#${id}` : `${teamName(snake.centaurTeamId)} ${snake.letter}`;
  }

  const DEATH_TEXT: Record<string, string> = {
    wall: "hit a wall",
    self_collision: "ran into itself",
    body_collision: "ran into a snake",
    head_to_head: "lost a head-to-head",
    health_depletion: "ran out of health",
  };

  function describe(e: TurnEvent): string | null {
    switch (e.kind) {
      case "snake_died": {
        const how = DEATH_TEXT[e.cause] ?? e.cause;
        const hazard =
          e.cause === "health_depletion" && e.sources?.includes("hazard") ? " (hazard)" : "";
        const killer = e.killerSnakeId === null ? "" : ` — killed by ${snakeLabel(e.killerSnakeId)}`;
        return `☠ ${snakeLabel(e.snakeId)} ${how}${hazard}${killer}`;
      }
      case "snake_severed":
        return `✂ ${snakeLabel(e.victimSnakeId)} lost ${e.segmentsLost} segments to ${snakeLabel(e.attackerSnakeId)}`;
      case "food_eaten":
        return `🍏 ${snakeLabel(e.snakeId)} ate (+${e.healthRestored} hp)`;
      case "potion_collected": {
        const kind = e.potionType === ItemType.InvulnPotion ? "invulnerability" : "invisibility";
        return `🧪 ${snakeLabel(e.snakeId)} drank the ${kind} potion — team buff, collector debuff`;
      }
      case "effect_cancelled":
        return `💨 ${snakeLabel(e.snakeId)} lost ${e.family} (${e.reason.replace(/_/g, " ")})`;
      case "potion_spawned": {
        const kind = e.potionType === ItemType.InvulnPotion ? "🛡 invulnerability" : "👻 invisibility";
        return `${kind} potion appeared`;
      }
      default:
        return null; // snake_moved / food_spawned / effect_applied: too noisy
    }
  }

  function cellFill(type: number, x: number, y: number): string {
    const parity = parityOf({ x, y });
    if (type === CellType.Wall) return "#0b1220";
    if (type === CellType.Hazard) return parity ? "#43214d" : "#3a1d44";
    if (type === CellType.Fertile) return parity ? "#1d3b2a" : "#17331f";
    return parity ? "#1e293b" : "#1a2436";
  }

  interface SnakeStyle {
    readonly opacity: number;
    readonly stroke: string | null;
    readonly dash: string | null;
  }

  function snakeStyle(s: SnakeState): SnakeStyle {
    if (!s.alive) return { opacity: 0.15, stroke: null, dash: null };
    const level = invulnerabilityLevel(s);
    const invisDebuff = s.activeEffects.some(
      (e) => e.family === "invisibility" && e.state === "debuff",
    );
    return {
      opacity: isVisible(s) ? 1 : 0.35,
      stroke: level !== 0 ? "#fbbf24" : invisDebuff ? "#22d3ee" : null,
      dash: level === -1 || (level === 0 && invisDebuff) ? "4 3" : null,
    };
  }

  function effectBadges(s: SnakeState): string {
    return s.activeEffects
      .map((e) => `${e.family === "invulnerability" ? "🛡" : "👻"}${e.state === "buff" ? "+" : "−"}`)
      .join(" ");
  }

  const px = $derived(view === null ? 0 : view.board.boardSize * CELL);

  const teamRows = $derived(
    view === null
      ? []
      : TEAMS.map((t) => {
          const snakes = (view as View).snakes.filter((s) => s.centaurTeamId === t.centaurTeamId);
          const aliveSnakes = snakes.filter((s) => s.alive);
          return {
            id: t.centaurTeamId,
            name: t.name,
            color: TEAM_BODY[t.centaurTeamId],
            aliveCount: aliveSnakes.length,
            total: snakes.length,
            length: aliveSnakes.reduce((n, s) => n + s.body.length, 0),
            snakes,
          };
        }),
  );

  const banner = $derived.by(() => {
    if (view === null) return null;
    const outcome = view.outcome;
    if (outcome.kind === "victory") {
      return { title: `${teamName(outcome.winnerCentaurTeamId)} wins`, scores: outcome.scores };
    }
    if (outcome.kind === "draw") {
      const tied = outcome.tiedCentaurTeamIds.map(teamName).join(", ");
      return { title: `Draw — ${tied}`, scores: outcome.scores };
    }
    if (outcome.kind === "error") return { title: `Error: ${outcome.reason}`, scores: null };
    return null;
  });

  $effect(() => {
    if (!playing) return;
    const id = setInterval(step, speedMs);
    return () => clearInterval(id);
  });

  startGame(INITIAL_SEED);
</script>

<svelte:head>
  <title>Team Snek — demo</title>
</svelte:head>

<div class="wrap">
  <header>
    <h1>Team Snek <span class="tag">engine demo</span></h1>
    <p class="sub">
      Two greedy Centaur bots play the full <code>@cyphid/snek-engine</code> rules: simultaneous
      movement, collisions &amp; severing, hazards, fertile ground, potions with team
      buffs/debuffs. Deterministic per seed.
    </p>
  </header>

  {#if failure !== null}
    <div class="failure">
      <strong>Board generation failed:</strong>
      <code>{failure.code}</code> after {failure.attemptsUsed} attempts — try another seed.
      <button onclick={newRandomGame}>New seed</button>
    </div>
  {:else if view !== null}
    <div class="grid">
      <div class="board-col">
        <svg width={px} height={px} viewBox="0 0 {px} {px}" role="img" aria-label="game board">
          {#each { length: view.board.boardSize } as _row, y (y)}
            {#each { length: view.board.boardSize } as _col, x (x)}
              <rect
                x={x * CELL}
                y={y * CELL}
                width={CELL}
                height={CELL}
                fill={cellFill(view.board.cells[y * view.board.boardSize + x] ?? 0, x, y)}
              />
            {/each}
          {/each}

          {#each view.items.filter((i) => !i.consumed) as item (item.itemId)}
            {#if item.itemType === ItemType.Food}
              <circle
                cx={item.cell.x * CELL + CELL / 2}
                cy={item.cell.y * CELL + CELL / 2}
                r={CELL * 0.22}
                fill="#22c55e"
              >
                <title>food</title>
              </circle>
            {:else if item.itemType === ItemType.InvulnPotion}
              <rect
                x={item.cell.x * CELL + CELL * 0.26}
                y={item.cell.y * CELL + CELL * 0.26}
                width={CELL * 0.48}
                height={CELL * 0.48}
                fill="#f59e0b"
                transform="rotate(45 {item.cell.x * CELL + CELL / 2} {item.cell.y * CELL + CELL / 2})"
              >
                <title>invulnerability potion</title>
              </rect>
            {:else}
              <circle
                cx={item.cell.x * CELL + CELL / 2}
                cy={item.cell.y * CELL + CELL / 2}
                r={CELL * 0.24}
                fill="none"
                stroke="#22d3ee"
                stroke-width="3"
              >
                <title>invisibility potion</title>
              </circle>
            {/if}
          {/each}

          {#each view.snakes as s (s.snakeId)}
            {@const style = snakeStyle(s)}
            <g opacity={style.opacity}>
              {#each s.body as seg, i (i)}
                <rect
                  x={seg.x * CELL + 2}
                  y={seg.y * CELL + 2}
                  width={CELL - 4}
                  height={CELL - 4}
                  rx="7"
                  fill={s.alive ? (i === 0 ? TEAM_HEAD[s.centaurTeamId] : TEAM_BODY[s.centaurTeamId]) : "#475569"}
                  stroke={style.stroke}
                  stroke-width={style.stroke === null ? 0 : 2}
                  stroke-dasharray={style.dash}
                />
              {/each}
              {#if s.body[0] !== undefined}
                <text
                  x={s.body[0].x * CELL + CELL / 2}
                  y={s.body[0].y * CELL + CELL / 2 + 4}
                  text-anchor="middle"
                  font-size="12"
                  font-weight="700"
                  fill="#fff">{s.letter}</text
                >
              {/if}
            </g>
          {/each}
        </svg>

        <div class="controls">
          <button onclick={step} disabled={view.outcome.kind !== "in_progress"}>Step ▷</button>
          <button
            class="primary"
            onclick={() => (playing = !playing)}
            disabled={view.outcome.kind !== "in_progress"}
          >
            {playing ? "Pause ⏸" : "Play ▶"}
          </button>
          <button onclick={() => startGame(seedText)}>Replay ⟲</button>
          <button onclick={newRandomGame}>New game ⟳</button>
          <label class="speed">
            speed
            <input type="range" min="60" max="600" step="20" bind:value={speedMs} />
          </label>
        </div>
        <label class="seed-row">
          seed
          <input class="seed-input" type="text" bind:value={seedText} />
          <span class="hint">edit + Replay to reproduce a game</span>
        </label>
      </div>

      <aside>
        <div class="stat">
          <div class="turn">Turn {view.turn}</div>
          {#if banner !== null}
            <div class="winner">{banner.title}</div>
          {/if}
        </div>
        {#if banner !== null && banner.scores !== null}
          <p class="scores">
            {#each TEAMS as t (t.centaurTeamId)}
              <span>
                <span class="dot" style="background:{TEAM_BODY[t.centaurTeamId]}"></span>
                {t.name}: {(banner.scores.get(t.centaurTeamId) ?? 0).toFixed(2)}
              </span>
            {/each}
          </p>
        {/if}

        <table>
          <thead><tr><th>Team</th><th>Alive</th><th>Length</th></tr></thead>
          <tbody>
            {#each teamRows as t (t.id)}
              <tr>
                <td><span class="dot" style="background:{t.color}"></span>{t.name}</td>
                <td>{t.aliveCount}/{t.total}</td>
                <td>{t.length}</td>
              </tr>
            {/each}
          </tbody>
        </table>

        <div class="snakes">
          {#each teamRows as t (t.id)}
            {#each t.snakes as s (s.snakeId)}
              <div class="snake-row" class:dead={!s.alive}>
                <span class="dot" style="background:{t.color}"></span>
                <span class="snake-name">{t.name} {s.letter}</span>
                <span class="hp-bar">
                  <span
                    class="hp-fill"
                    style="width:{s.alive ? (100 * s.health) / DEMO_CONFIG.runtime.maxHealth : 0}%"
                  ></span>
                </span>
                <span class="snake-meta">
                  {s.alive ? `${s.health}hp · ${s.body.length}` : "dead"}
                  {effectBadges(s)}
                </span>
              </div>
            {/each}
          {/each}
        </div>

        <div class="log">
          <div class="log-title">events</div>
          {#each log as line, i (i)}
            <div class="log-line">{line}</div>
          {/each}
          {#if log.length === 0}
            <div class="log-empty">press Play…</div>
          {/if}
        </div>
      </aside>
    </div>
  {/if}
</div>

<style>
  .wrap {
    max-width: 920px;
    margin: 0 auto;
    padding: 24px 20px 60px;
    color: #e2e8f0;
    font-family: ui-sans-serif, system-ui, sans-serif;
  }
  h1 {
    font-size: 1.6rem;
    margin: 0 0 4px;
  }
  .tag {
    font-size: 0.7rem;
    background: #334155;
    color: #cbd5e1;
    padding: 3px 8px;
    border-radius: 999px;
    vertical-align: middle;
    font-weight: 600;
  }
  .sub {
    color: #94a3b8;
    font-size: 0.9rem;
    margin: 0 0 18px;
    line-height: 1.5;
    max-width: 640px;
  }
  code {
    background: #1e293b;
    padding: 0.1em 0.4em;
    border-radius: 4px;
    font-size: 0.9em;
    color: #7dd3fc;
  }
  .failure {
    background: #3f1d2b;
    border: 1px solid #9f1239;
    border-radius: 8px;
    padding: 14px 16px;
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }
  .grid {
    display: flex;
    gap: 22px;
    flex-wrap: wrap;
    align-items: flex-start;
  }
  svg {
    border-radius: 10px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.35);
    display: block;
  }
  .controls {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 14px;
    flex-wrap: wrap;
  }
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
  button:hover:not(:disabled) {
    background: #475569;
  }
  button.primary {
    background: #22c55e;
    color: #052e16;
  }
  button.primary:hover:not(:disabled) {
    background: #16a34a;
  }
  button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .speed {
    font-size: 0.8rem;
    color: #94a3b8;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .seed-row {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 10px;
    font-size: 0.8rem;
    color: #94a3b8;
  }
  .seed-input {
    background: #0f172a;
    border: 1px solid #334155;
    color: #e2e8f0;
    border-radius: 6px;
    padding: 5px 8px;
    font-family: ui-monospace, monospace;
    font-size: 0.8rem;
    width: 160px;
  }
  .hint {
    color: #475569;
    font-size: 0.72rem;
  }
  aside {
    min-width: 250px;
    flex: 1;
  }
  .stat {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 8px;
  }
  .turn {
    font-size: 1.3rem;
    font-weight: 700;
  }
  .winner {
    font-weight: 700;
    color: #22c55e;
  }
  .scores {
    display: flex;
    gap: 14px;
    font-size: 0.85rem;
    color: #cbd5e1;
    margin: 0 0 10px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
    margin-bottom: 12px;
  }
  th {
    text-align: left;
    color: #94a3b8;
    font-weight: 600;
    border-bottom: 1px solid #334155;
    padding: 6px 4px;
  }
  td {
    padding: 6px 4px;
    border-bottom: 1px solid #1e293b;
  }
  .dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    margin-right: 7px;
  }
  .snakes {
    margin-bottom: 14px;
    display: grid;
    gap: 5px;
  }
  .snake-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.78rem;
    color: #cbd5e1;
  }
  .snake-row.dead {
    color: #475569;
  }
  .snake-name {
    width: 52px;
  }
  .hp-bar {
    flex: 0 0 70px;
    height: 6px;
    background: #1e293b;
    border-radius: 3px;
    overflow: hidden;
  }
  .hp-fill {
    display: block;
    height: 100%;
    background: #22c55e;
  }
  .snake-meta {
    color: #94a3b8;
    font-size: 0.72rem;
  }
  .log {
    background: #0f172a;
    border-radius: 8px;
    padding: 10px 12px;
    height: 240px;
    overflow-y: auto;
    font-size: 0.78rem;
    font-family: ui-monospace, monospace;
  }
  .log-title {
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 0.68rem;
    margin-bottom: 6px;
  }
  .log-line {
    color: #cbd5e1;
    padding: 1px 0;
  }
  .log-empty {
    color: #475569;
  }
</style>
