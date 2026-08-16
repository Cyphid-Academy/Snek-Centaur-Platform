<script lang="ts">
import { CellType, ItemType, cellIndex } from "@cyphid/snek-engine";
import type { Cell, GameState, Item, SnakeState } from "@cyphid/snek-engine";
import type { Snippet } from "svelte";

// spec: application-shell/one-board-rendering — the one component every
// surface of the application that renders a game's board goes through,
// consuming the shared engine's own domain values directly: terrain from
// `CellType`, items from `state.items`, snakes from `state.snakes`. How
// terrain, a snake, an item and a hazard are drawn is stated here once and
// holds wherever a board appears (#one-board-everywhere,
// #a-rendering-rule-is-stated-once).
interface Props {
  readonly state: GameState;
  readonly teamColours?: Record<string, string>;
  readonly onCellClick?: (cell: Cell) => void;
  // spec: application-shell/one-board-rendering#composition-not-replacement
  // — a surface that needs to mark something this rendering does not know
  // about composes its own layer through this snippet rather than forking
  // the renderer; the board underneath stays the one board.
  readonly overlay?: Snippet<[{ cellSize: number; boardSize: number }]>;
}

const { state, teamColours = {}, onCellClick, overlay }: Props = $props();

// Cell-grid geometry: the CSS grid beneath and the SVG overlays above it
// share this constant as their viewBox unit, so a cell boundary in one is a
// cell boundary in the others (visual-tester's D10 approach).
const CELL = 24;
const PAD = 2;
const HEAD_INSET = PAD + 1;

const boardSize = $derived(state.board.boardSize);

interface CellRender {
  readonly cell: Cell;
  readonly cellType: CellType;
  readonly item: Item | null;
}

const grid = $derived.by(() => {
  const n = state.board.boardSize;
  const cells: CellRender[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const cell = { x, y };
      cells.push({
        cell,
        cellType: state.board.cells[y * n + x] ?? CellType.Normal,
        item: state.items.get(cellIndex(state.board, cell)) ?? null,
      });
    }
  }
  return cells;
});

// Only alive snakes stand on the board (game-engine/domain-vocabulary: a dead
// snake leaves its body, not its board presence).
const aliveSnakes = $derived(state.snakes.filter((s) => s.alive));

function terrainClass(t: CellType): string {
  if (t === CellType.Wall) return "wall";
  if (t === CellType.Hazard) return "hazard";
  if (t === CellType.Fertile) return "fertile";
  return "normal";
}

function itemClass(item: Item): string {
  if (item.itemType === ItemType.Food) return "food";
  if (item.itemType === ItemType.InvulnPotion) return "invuln";
  return "invis";
}

function itemGlyph(item: Item): string {
  if (item.itemType === ItemType.Food) return "●";
  if (item.itemType === ItemType.InvulnPotion) return "⬡";
  return "◇";
}

function teamColor(teamId: string): string {
  return teamColours[teamId] ?? "#94a3b8";
}

// spec: application-shell/one-board-rendering — a stroked, round-capped
// polyline through cell centers is a sufficient body rendering; this is
// deliberately simpler than the inflated-silhouette geometry a dedicated dev
// tool affords itself (design.md decision 6, `visual-tester` out of scope).
function centerlinePath(s: SnakeState): string {
  return s.body
    .map((c, i) => `${i === 0 ? "M" : "L"} ${(c.x + 0.5) * CELL} ${(c.y + 0.5) * CELL}`)
    .join(" ");
}
</script>

<div class="board-wrap">
  <div
    class="board"
    style={`grid-template-columns: repeat(${boardSize}, 1fr); aspect-ratio: 1;`}
    role="grid"
  >
    {#each grid as entry (entry.cell.y * boardSize + entry.cell.x)}
      <button
        type="button"
        class={`cell ${terrainClass(entry.cellType)}`}
        title={`(${entry.cell.x}, ${entry.cell.y})`}
        onclick={() => onCellClick?.(entry.cell)}
      >
        {#if entry.item}
          <span class={`item ${itemClass(entry.item)}`}>{itemGlyph(entry.item)}</span>
        {/if}
      </button>
    {/each}
  </div>

  <svg
    class="snakes"
    viewBox={`0 0 ${boardSize * CELL} ${boardSize * CELL}`}
    aria-hidden="true"
  >
    {#each aliveSnakes as s (s.snakeId)}
      {@const color = teamColor(s.centaurTeamId)}
      {@const head = s.body[0]}
      <g>
        <path
          d={centerlinePath(s)}
          fill="none"
          stroke={color}
          stroke-width={CELL - 2 * PAD}
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        {#if head !== undefined}
          <rect
            class="head"
            x={head.x * CELL + HEAD_INSET}
            y={head.y * CELL + HEAD_INSET}
            width={CELL - 2 * HEAD_INSET}
            height={CELL - 2 * HEAD_INSET}
            rx={(CELL - 2 * HEAD_INSET) / 2}
            fill={color}
            stroke="#f8fafc"
            stroke-width={1.5}
          />
          <text
            x={head.x * CELL + CELL / 2}
            y={head.y * CELL + CELL / 2}
            text-anchor="middle"
            dominant-baseline="central"
            font-size="11"
            font-weight="700"
            fill="#0f172a">{s.letter}</text
          >
        {/if}
      </g>
    {/each}
  </svg>

  {#if overlay}
    <svg class="overlay" viewBox={`0 0 ${boardSize * CELL} ${boardSize * CELL}`}>
      {@render overlay({ cellSize: CELL, boardSize })}
    </svg>
  {/if}
</div>

<style>
  .board-wrap {
    position: relative;
    width: 100%;
    max-width: 640px;
    border: 1px solid #334155;
  }
  .board {
    display: grid;
    background: #1e293b;
    width: 100%;
  }
  .snakes,
  .overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  .snakes {
    z-index: 1;
  }
  .overlay {
    z-index: 4;
  }
  .cell {
    position: relative;
    border: none;
    padding: 0;
    margin: 0;
    cursor: pointer;
    aspect-ratio: 1;
    min-width: 0;
    min-height: 0;
    box-shadow: inset 0 0 0 0.5px #1e293b;
  }
  .cell.normal { background: #0f172a; }
  .cell.wall { background: #475569; }
  .cell.hazard { background: #7f1d1d; }
  .cell.fertile { background: #14532d; }
  .cell:hover { outline: 1px solid #7dd3fc; outline-offset: -1px; }
  .item {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.82rem;
    font-weight: 700;
    pointer-events: none;
    z-index: 3;
  }
  .item::before {
    content: "";
    position: absolute;
    inset: 20%;
    border-radius: 50%;
    background: rgba(15, 23, 42, 0.78);
    z-index: -1;
  }
  .item.food { color: #fbbf24; }
  .item.invuln { color: #a5f3fc; }
  .item.invis { color: #d8b4fe; }
</style>
