<script lang="ts">
// spec: visual-tester/board-editor — every authorable component of game
// state is editable here; alive/lastDirection and clocks are read-only.
import { CellType, Direction, ItemType } from "@cyphid/snek-engine";
import type { CentaurTeamId, EffectFamily, GameRuntimeConfig } from "@cyphid/snek-engine";
import * as editor from "../editor.js";
import { bytesToHex, hexToBytes, randomSeed } from "../seed.js";
import type { TesterStore } from "../store.svelte.js";
import type { Tool } from "../tools.js";

interface Props {
  store: TesterStore;
  tool: Tool;
  onToolChange: (tool: Tool) => void;
}

const { store, tool, onToolChange }: Props = $props();

const state = $derived(store.currentState);
const config = $derived(store.session.config);

// Initialize from the live session so these are never blank — even before the
// sync effects first run (e.g. during hydration), which was surfacing empty
// seed / board-size fields that blocked editing with no explanation.
let boardSizeInput = $state(String(store.currentState.board.boardSize));
let seedInput = $state(bytesToHex(store.session.gameSeed));
let seedError = $state<string | null>(null);

$effect(() => {
  boardSizeInput = String(state.board.boardSize);
});
$effect(() => {
  seedInput = bytesToHex(store.session.gameSeed);
  seedError = null;
});

// spec: visual-tester/board-editor — board-generation parameters.
const boardgenFields = $derived([
  { key: "boardSize" as const, label: "Board size" },
  { key: "snakesPerTeam" as const, label: "Snakes/team" },
  { key: "hazardPercentage" as const, label: "Hazard %" },
  { key: "density" as const, label: "Fertile density" },
  { key: "clustering" as const, label: "Fertile clustering" },
]);
function setBoardgenField(key: keyof typeof store.boardgen, raw: string): void {
  const value = Number(raw);
  if (!Number.isFinite(value)) return;
  store.boardgen = { ...store.boardgen, [key]: value };
}

function isTool(t: Tool): boolean {
  return JSON.stringify(t) === JSON.stringify(tool);
}

function applyBoardSize(): void {
  const n = Number(boardSizeInput);
  store.applyEdit((s) => editor.resizeBoard(s, n, config));
}

function applySeed(): void {
  const bytes = hexToBytes(seedInput.trim());
  if (bytes === null) {
    seedError = "seed must be exactly 64 hex characters (32 bytes)";
    return;
  }
  seedError = null;
  store.setSeed(bytes);
}

function setConfigField(path: string, raw: string): void {
  const value = Number(raw);
  if (!Number.isFinite(value)) return;
  const next: GameRuntimeConfig = structuredClone(config);
  const mutable = next as unknown as Record<string, unknown>;
  if (path.startsWith("clock.")) {
    (mutable.clock as Record<string, number>)[path.slice(6)] = value;
  } else {
    (mutable as Record<string, number>)[path] = value;
  }
  store.setConfig(next);
}

const DIR_LABELS: Record<Direction, string> = {
  [Direction.Up]: "Up",
  [Direction.Right]: "Right",
  [Direction.Down]: "Down",
  [Direction.Left]: "Left",
};

const FAMILIES: EffectFamily[] = ["invulnerability", "invisibility"];

const configFields = $derived([
  { path: "maxHealth", value: config.maxHealth },
  { path: "maxTurns", value: config.maxTurns },
  { path: "hazardDamage", value: config.hazardDamage },
  { path: "foodSpawnRate", value: config.foodSpawnRate },
  { path: "invulnPotionSpawnRate", value: config.invulnPotionSpawnRate },
  { path: "invisPotionSpawnRate", value: config.invisPotionSpawnRate },
  { path: "clock.initialBudgetMs", value: config.clock.initialBudgetMs },
  { path: "clock.budgetIncrementMs", value: config.clock.budgetIncrementMs },
  { path: "clock.firstTurnTimeMs", value: config.clock.firstTurnTimeMs },
  { path: "clock.maxTurnTimeMs", value: config.clock.maxTurnTimeMs },
]);
</script>

<section>
  <h2>Tools</h2>
  <div class="tools">
    <button type="button" class:active={isTool({ kind: "inspect" })} onclick={() => onToolChange({ kind: "inspect" })}>Inspect</button>
    <button type="button" class:active={isTool({ kind: "paint", cellType: CellType.Normal })} onclick={() => onToolChange({ kind: "paint", cellType: CellType.Normal })}>Paint Normal</button>
    <button type="button" class:active={isTool({ kind: "paint", cellType: CellType.Hazard })} onclick={() => onToolChange({ kind: "paint", cellType: CellType.Hazard })}>Paint Hazard</button>
    <button type="button" class:active={isTool({ kind: "paint", cellType: CellType.Fertile })} onclick={() => onToolChange({ kind: "paint", cellType: CellType.Fertile })}>Paint Fertile</button>
    <button type="button" class:active={isTool({ kind: "placeItem", itemType: ItemType.Food })} onclick={() => onToolChange({ kind: "placeItem", itemType: ItemType.Food })}>Place Food</button>
    <button type="button" class:active={isTool({ kind: "placeItem", itemType: ItemType.InvulnPotion })} onclick={() => onToolChange({ kind: "placeItem", itemType: ItemType.InvulnPotion })}>Place Invuln</button>
    <button type="button" class:active={isTool({ kind: "placeItem", itemType: ItemType.InvisPotion })} onclick={() => onToolChange({ kind: "placeItem", itemType: ItemType.InvisPotion })}>Place Invis</button>
    <button type="button" class:active={isTool({ kind: "eraseItem" })} onclick={() => onToolChange({ kind: "eraseItem" })}>Erase Item</button>
    <button type="button" class:active={tool.kind === "addSnake"} onclick={() => onToolChange({ kind: "addSnake" })}>Add Snake</button>
  </div>

  <h2>Board generation</h2>
  <div class="config">
    {#each boardgenFields as f (f.key)}
      <label class="cfg">
        {f.label}
        <input
          value={String(store.boardgen[f.key])}
          size="5"
          inputmode="numeric"
          onchange={(e) => setBoardgenField(f.key, e.currentTarget.value)}
        />
      </label>
    {/each}
    <button type="button" onclick={() => store.newFromBoardgen()}>Generate</button>
  </div>

  <h2>Board</h2>
  <div class="row">
    <label>Size <input bind:value={boardSizeInput} size="4" inputmode="numeric" /></label>
    <button type="button" onclick={applyBoardSize}>Apply size</button>
  </div>

  <h2>Game seed</h2>
  <div class="row seedrow">
    <input bind:value={seedInput} class="seed" spellcheck="false" />
    <button type="button" onclick={applySeed}>Set seed</button>
    <button type="button" onclick={() => { seedInput = bytesToHex(randomSeed()); applySeed(); }}>Randomize</button>
  </div>
  {#if seedError}<p class="error">{seedError}</p>{/if}

  <h2>Teams</h2>
  <div class="teams">
    {#each store.teams as team (team.id)}
      <div class="team">
        <input
          type="color"
          aria-label={`${team.name} colour`}
          value={team.colour}
          onchange={(e) => store.setTeamColour(team.id, e.currentTarget.value)}
        />
        <input
          class="teamname"
          value={team.name}
          size="10"
          onchange={(e) => store.renameTeam(team.id, e.currentTarget.value)}
        />
      </div>
    {/each}
    <button type="button" onclick={() => store.addTeam()}>Add team</button>
  </div>

  <h2>Snakes</h2>
  {#if state.snakes.length === 0}
    <p class="muted">No snakes. Use the Add Snake tool.</p>
  {/if}
  {#each state.snakes as snake (snake.snakeId)}
    <!-- spec: visual-tester/snake-selection — selection drives expansion:
         the selected snake is the sole open one, and toggling selects. -->
    <details class="snake" open={snake.snakeId === store.selectedSnakeId}>
      <summary
        onclick={(e) => {
          e.preventDefault();
          // The list summary is the one place click-to-deselect makes sense
          // (collapse the open row); it computes the next value and calls the
          // single selection API.
          store.selectSnake(store.selectedSnakeId === snake.snakeId ? null : snake.snakeId);
        }}
      >
        #{snake.snakeId} {snake.letter} ({store.teams.find((t) => t.id === snake.centaurTeamId)?.name ?? snake.centaurTeamId}) — {snake.body.length} seg,
        hp {snake.health}
      </summary>
      <div class="row">
        <!-- spec: visual-tester/board-editor#letters-auto-assigned — read-only -->
        <span class="muted">letter {snake.letter} (auto)</span>
        <label>Team
          <select
            value={snake.centaurTeamId}
            onchange={(e) =>
              store.applyEdit((s) =>
                editor.setSnakeTeam(s, snake.snakeId, e.currentTarget.value as CentaurTeamId, config))}
          >
            {#each store.teams as t (t.id)}
              <option value={t.id}>{t.name}</option>
            {/each}
          </select>
        </label>
        <label>Health
          <input
            value={String(snake.health)}
            size="4"
            inputmode="numeric"
            onchange={(e) =>
              store.applyEdit((s) => editor.setSnakeHealth(s, snake.snakeId, Number(e.currentTarget.value)))}
          />
        </label>
      </div>
      <div class="row">
        <!-- spec: visual-tester/board-editor#derived-lifecycle-fields — shown, never editable -->
        <span class="muted">alive: {snake.alive ? "yes" : "no"} (derived)</span>
        <span class="muted">
          last direction: {snake.lastDirection === null ? "null" : DIR_LABELS[snake.lastDirection]} (derived)
        </span>
      </div>
      <div class="row">
        <button
          type="button"
          class:active={tool.kind === "extendBody" && store.selectedSnakeId === snake.snakeId}
          onclick={() => {
            // spec: visual-tester/snake-selection#extend-targets-selection —
            // selecting the snake and entering extend mode are the same gesture,
            // so the extend target is always the selected snake.
            store.selectSnake(snake.snakeId);
            onToolChange({ kind: "extendBody" });
          }}
        >
          Extend body (click cells)
        </button>
        <button type="button" onclick={() => store.applyEdit((s) => editor.removeTailCell(s, snake.snakeId))}>
          Remove tail
        </button>
        <button type="button" class="danger" onclick={() => store.applyEdit((s) => editor.removeSnake(s, snake.snakeId, config))}>
          Remove snake
        </button>
      </div>
      <div class="row effects">
        {#each FAMILIES as family (family)}
          {@const effect = snake.activeEffects.find((e) => e.family === family)}
          <span class="effect">
            {family}:
            {#if effect}
              {effect.state}, expires T{effect.expiryTurn}
              <button type="button" onclick={() => store.applyEdit((s) => editor.removeSnakeEffect(s, snake.snakeId, family))}>x</button>
            {:else}
              <button type="button" onclick={() => store.applyEdit((s) => editor.setSnakeEffect(s, snake.snakeId, family, "buff", store.cursor + 3))}>+buff</button>
              <button type="button" onclick={() => store.applyEdit((s) => editor.setSnakeEffect(s, snake.snakeId, family, "debuff", store.cursor + 3))}>+debuff</button>
            {/if}
          </span>
        {/each}
      </div>
      <p class="muted body">body: {snake.body.map((c) => `(${c.x},${c.y})`).join(" ")}</p>
    </details>
  {/each}

  <h2>Runtime config</h2>
  <div class="config">
    {#each configFields as field (field.path)}
      <label class="cfg">
        {field.path}
        <input
          value={String(field.value)}
          size="7"
          onchange={(e) => setConfigField(field.path, e.currentTarget.value)}
        />
      </label>
    {/each}
  </div>

  <h2>Clocks <span class="muted">(read-only in v1)</span></h2>
  {#if state.clocks.length === 0}
    <p class="muted">No team clocks (no snakes on the board).</p>
  {/if}
  {#each state.clocks as clock (clock.centaurTeamId)}
    <p class="muted">
      {clock.centaurTeamId}: budget {clock.budgetMs}ms, per-turn {clock.perTurnMs}ms,
      declared over: {clock.declaredTurnOver ? "yes" : "no"}
    </p>
  {/each}
</section>

<style>
  section { display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.85rem; }
  h2 { font-size: 0.9rem; margin: 0.5rem 0 0; color: #f8fafc; }
  .tools { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
  button {
    background: #1e293b;
    color: #e2e8f0;
    border: 1px solid #334155;
    border-radius: 4px;
    padding: 0.2rem 0.5rem;
    cursor: pointer;
    font-size: 0.78rem;
  }
  button:hover { border-color: #7dd3fc; }
  button.active { background: #0369a1; border-color: #7dd3fc; }
  button.danger { border-color: #9f1239; }
  input {
    background: #0f172a;
    color: #e2e8f0;
    border: 1px solid #334155;
    border-radius: 4px;
    padding: 0.15rem 0.35rem;
    font-family: inherit;
  }
  label { color: #94a3b8; display: inline-flex; align-items: center; gap: 0.3rem; }
  .seed { flex: 1; font-family: monospace; font-size: 0.72rem; min-width: 12rem; }
  .muted { color: #64748b; }
  .error { color: #fda4af; margin: 0; }
  details.snake { background: #1e293b; border-radius: 6px; padding: 0.35rem 0.55rem; }
  summary { cursor: pointer; color: #e2e8f0; }
  details.snake .row { margin-top: 0.4rem; }
  .effects .effect { color: #94a3b8; }
  .body { word-break: break-all; margin: 0.3rem 0 0; }
  .config { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .cfg { font-size: 0.75rem; }
  .teams { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; }
  .team { display: inline-flex; align-items: center; gap: 0.25rem; }
  .team input[type="color"] { width: 1.6rem; height: 1.4rem; padding: 0; border-radius: 4px; background: none; cursor: pointer; }
  .teamname { width: 6rem; }
  select {
    background: #0f172a; color: #e2e8f0; border: 1px solid #334155;
    border-radius: 4px; padding: 0.15rem 0.35rem; font: inherit;
  }
</style>
