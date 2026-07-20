<script lang="ts">
import {
  CellType,
  Direction,
  ItemType,
  cellIndex,
  invulnerabilityLevel,
  isVisible,
} from "@cyphid/snek-engine";
import type { Cell, GameState, Item, SnakeId, SnakeState, StagedMove } from "@cyphid/snek-engine";
import SnakeBody from "./SnakeBody.svelte";
import { describeContiguityIssue, snakeContiguityIssues } from "./boardIssues";

interface Props {
  state: GameState;
  onCellClick: (cell: Cell) => void;
  // spec: visual-tester/sequence-run#divergence-annotated — cells implicated
  // by a failed run's differences are highlighted on the board itself (D8).
  highlights?: ReadonlySet<number>;
  // spec: visual-tester/team-configuration — team id → colour.
  teamColours?: Record<string, string>;
  // spec: visual-tester/snake-selection — the highlighted snake.
  selectedSnakeId?: SnakeId | null;
  // spec: visual-tester/move-staging#staged-arrows — pending moves to draw.
  staged?: ReadonlyMap<SnakeId, StagedMove>;
  // spec: visual-tester/snake-rendering#dead-snake-ghost-one-turn — dead
  // snakes to draw (only those that died this turn); other dead snakes are off
  // the board and not rendered.
  ghostSnakeIds?: ReadonlySet<SnakeId>;
  // spec: visual-tester/board-editor#head-parity-enforced — the parity of cell
  // on which a new head may NOT be placed (a red checkerboard overlay); null
  // when no parity constraint applies (not placing, or no head fixes it yet).
  blockedParity?: 0 | 1 | null;
}

const {
  state,
  onCellClick,
  highlights = new Set(),
  teamColours = {},
  selectedSnakeId = null,
  staged = new Map(),
  ghostSnakeIds = new Set(),
  blockedParity = null,
}: Props = $props();

// Only alive snakes and this-turn ghosts are on the board.
const renderedSnakes = $derived(
  state.snakes.filter((s) => s.alive || ghostSnakeIds.has(s.snakeId)),
);

// spec: visual-tester/move-staging#staged-arrows — a small arrowhead at the
// head edge in the staged direction, so pending moves read at a glance.
const DIR_VEC: Record<Direction, { dx: number; dy: number }> = {
  [Direction.Up]: { dx: 0, dy: -1 },
  [Direction.Right]: { dx: 1, dy: 0 },
  [Direction.Down]: { dx: 0, dy: 1 },
  [Direction.Left]: { dx: -1, dy: 0 },
};
function stagedArrow(s: SnakeState): string | null {
  const move = staged.get(s.snakeId);
  const head = s.body[0];
  if (move === undefined || head === undefined) return null;
  const { dx, dy } = DIR_VEC[move.direction];
  const cx = (head.x + 0.5) * CELL;
  const cy = (head.y + 0.5) * CELL;
  const px = -dy;
  const py = dx; // perpendicular
  const tip = [cx + dx * CELL * 0.48, cy + dy * CELL * 0.48];
  const base = [cx + dx * CELL * 0.2, cy + dy * CELL * 0.2];
  const w = CELL * 0.17;
  const p1 = [base[0] + px * w, base[1] + py * w];
  const p2 = [base[0] - px * w, base[1] - py * w];
  return `${tip[0]},${tip[1]} ${p1[0]},${p1[1]} ${p2[0]},${p2[1]}`;
}

// spec: visual-tester/invalid-state-surfacing — a discontinuous snake is a
// bug the tool must expose, not hide behind a plausible silhouette.
const contiguityIssues = $derived(snakeContiguityIssues(state));
const brokenSnakeIds = $derived(new Set(contiguityIssues.map((i) => i.snakeId)));

// Snake-overlay geometry (design D10): the SVG viewBox uses CELL units per
// grid cell, so the zero-gap CSS grid beneath and the overlay share exact
// cell boundaries at any rendered size.
const CELL = 24;
const PAD = 2;
const HEAD_INSET = PAD + 1;

function teamColor(teamId: string): string {
  return teamColours[teamId] ?? "#94a3b8";
}

// spec: visual-tester/snake-selection — buff status is shown as a body border
// (stroke), so the selection indicator must be a separate channel (a glow);
// the two are visible together. Invulnerability buff = solid gold, debuff =
// dashed gold; an invisible snake is faded.
interface SnakeStyle {
  stroke: string | null;
  dash: string | null;
  opacity: number;
}
function snakeStyle(s: SnakeState): SnakeStyle {
  if (!s.alive) return { stroke: null, dash: null, opacity: 0.35 };
  const level = invulnerabilityLevel(s);
  const opacity = isVisible(s) ? 0.9 : 0.4;
  if (level > 0) return { stroke: "#fbbf24", dash: null, opacity };
  if (level < 0) return { stroke: "#fbbf24", dash: "4 3", opacity };
  return { stroke: null, dash: null, opacity };
}

interface CellRender {
  cell: Cell;
  cellType: CellType;
  item: Item | null;
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

function terrainClass(t: CellType): string {
  if (t === CellType.Wall) return "wall";
  if (t === CellType.Hazard) return "hazard";
  if (t === CellType.Fertile) return "fertile";
  return "normal";
}

function itemGlyph(item: Item): string {
  if (item.itemType === ItemType.Food) return "●"; // ●
  if (item.itemType === ItemType.InvulnPotion) return "⬡"; // ⬡
  return "◇"; // ◇ invisibility
}

function itemClass(item: Item): string {
  if (item.itemType === ItemType.Food) return "food";
  if (item.itemType === ItemType.InvulnPotion) return "invuln";
  return "invis";
}
</script>

{#if contiguityIssues.length > 0}
  <div class="invalid-state" role="alert">
    <strong>⚠ Invalid state: discontinuous snake body.</strong>
    The engine should never produce this — it means a bug in turn resolution or a
    corrupt sequence. Not rendering it as a normal snake.
    <ul>
      {#each contiguityIssues as issue (issue.snakeId)}
        <li>{describeContiguityIssue(issue)}</li>
      {/each}
    </ul>
  </div>
{/if}

<div class="board-wrap">
  <div
    class="board"
    style={`grid-template-columns: repeat(${state.board.boardSize}, 1fr); aspect-ratio: 1;`}
    role="grid"
  >
    {#each grid as entry (entry.cell.y * state.board.boardSize + entry.cell.x)}
      <button
        type="button"
        class={`cell ${terrainClass(entry.cellType)}`}
        class:diff={highlights.has(entry.cell.y * state.board.boardSize + entry.cell.x)}
        class:wrong-parity={blockedParity !== null &&
          (entry.cell.x + entry.cell.y) % 2 === blockedParity}
        title={`(${entry.cell.x}, ${entry.cell.y})`}
        onclick={() => onCellClick(entry.cell)}
      >
        {#if entry.item}
          <span class={`item ${itemClass(entry.item)}`}>{itemGlyph(entry.item)}</span>
        {/if}
      </button>
    {/each}
  </div>

  <!-- Contiguous snake silhouettes (design D10): one inflated-centerline
       path per snake, drawn over the cell grid; pointer-events stay with
       the cells so the editor keeps its click targets. -->
  <svg
    class="snakes"
    viewBox={`0 0 ${state.board.boardSize * CELL} ${state.board.boardSize * CELL}`}
    aria-hidden="true"
  >
    {#each renderedSnakes as s (s.snakeId)}
      {@const color = s.alive ? teamColor(s.centaurTeamId) : "#475569"}
      {@const head = s.body[0]}
      {@const broken = brokenSnakeIds.has(s.snakeId)}
      {@const style = snakeStyle(s)}
      {@const selected = s.snakeId === selectedSnakeId}
      {@const arrow = s.alive ? stagedArrow(s) : null}
      <g opacity={style.opacity} class:selected>
        {#if broken}
          <!-- Invalid state (spec: visual-tester/invalid-state-surfacing):
               show the raw segments in an alarming outline at their true
               cells instead of a continuous silhouette that would hide the
               break. -->
          {#each s.body as seg, i (i)}
            <rect
              class="broken-seg"
              x={seg.x * CELL + PAD}
              y={seg.y * CELL + PAD}
              width={CELL - 2 * PAD}
              height={CELL - 2 * PAD}
              rx={2}
            />
          {/each}
        {:else}
          <SnakeBody
            segments={s.body}
            cellSize={CELL}
            padding={PAD}
            fill={color}
            stroke={style.stroke}
            strokeWidth={2}
            dash={style.dash}
          />
        {/if}
        {#if head !== undefined}
          <rect
            x={head.x * CELL + HEAD_INSET}
            y={head.y * CELL + HEAD_INSET}
            width={CELL - 2 * HEAD_INSET}
            height={CELL - 2 * HEAD_INSET}
            rx={(CELL - 2 * HEAD_INSET) / 2}
            fill={color}
            stroke="#f8fafc"
            stroke-width={s.alive ? 1.5 : 0}
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
        {#if arrow !== null}
          <polygon class="staged-arrow" points={arrow} />
        {/if}
      </g>
    {/each}
  </svg>
</div>

<style>
  .invalid-state {
    max-width: 640px;
    margin-bottom: 0.75rem;
    padding: 0.6rem 0.8rem;
    border: 1px solid #f43f5e;
    border-left: 4px solid #f43f5e;
    border-radius: 4px;
    background: #2a0a12;
    color: #fecdd3;
    font-size: 0.85rem;
    line-height: 1.35;
  }
  .invalid-state strong { color: #fda4af; }
  .invalid-state ul { margin: 0.4rem 0 0; padding-left: 1.1rem; }
  .invalid-state li { font-family: ui-monospace, monospace; font-size: 0.8rem; }
  .broken-seg {
    fill: rgba(244, 63, 94, 0.25);
    stroke: #f43f5e;
    stroke-width: 1.5;
    stroke-dasharray: 3 2;
  }
  /* spec: visual-tester/snake-selection — a glow, a separate channel from the
     buff-status body border (stroke), so both read at once. */
  .snakes g.selected {
    filter: drop-shadow(0 0 2.5px #38bdf8) drop-shadow(0 0 5px #38bdf8);
  }
  /* spec: visual-tester/move-staging#staged-arrows — pending move direction. */
  .staged-arrow {
    fill: #f8fafc;
    stroke: #0f172a;
    stroke-width: 0.6;
  }
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
  .snakes {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 1;
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
  .cell.diff { outline: 2px solid #f43f5e; outline-offset: -2px; }
  /* spec: visual-tester/board-editor#head-parity-enforced — wrong-parity cells
     for a new head, a translucent red checkerboard; placement there is rejected
     at the editor boundary, this shows why at a glance. Sits above the terrain,
     below items (z-index 3) and the snake overlay (z-index 1). */
  .cell.wrong-parity::after {
    content: "";
    position: absolute;
    inset: 0;
    background: rgba(239, 68, 68, 0.32);
    pointer-events: none;
    z-index: 2;
  }
  /* Items sit above the snake overlay (z-index 1) on a dark disc so the glyph
     reads on any terrain colour, and on a dead snake's cell in run mode (a
     dead snake is off the board but still rendered faded; the engine may
     spawn an item there — game-rules/item-spawning). */
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
