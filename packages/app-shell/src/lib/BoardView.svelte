<script lang="ts">
// The application's one board.
//
// spec: application-shell/one-board-rendering
// Every surface that shows a board — a live game, a configuration preview, a
// replay — mounts this component, so how terrain, a snake, an item, a hazard
// and a fertile tile are drawn is stated here and nowhere else
// (`#a-rendering-rule-is-stated-once`). It consumes the shared engine's own
// domain values and holds no state of its own.
//
// spec: application-shell/one-board-rendering#composition-not-replacement
// A surface that needs to mark something this component does not know about
// supplies a `banner` (above the board) or an `overlay` (an SVG layer over it,
// in board coordinates) rather than rendering a board of its own. That is how
// the visual tester keeps its contiguity diagnostics — a tool-specific concern
// this component has no business knowing — over the shared rendering.
import {
  CellType,
  Direction,
  ItemType,
  cellIndex,
  invulnerabilityLevel,
  isVisible,
} from "@cyphid/snek-engine";
import type { Cell, GameState, Item, SnakeId, SnakeState, StagedMove } from "@cyphid/snek-engine";
import type { Snippet } from "svelte";
import SnakeBody from "./SnakeBody.svelte";
import type { BoardGeometry } from "./board";
import { firstDiscontinuity } from "./snakeBodyPath";

interface Props {
  state: GameState;
  onCellClick?: (cell: Cell) => void;
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
  // The two composition points (`#composition-not-replacement`).
  banner?: Snippet;
  overlay?: Snippet<[BoardGeometry]>;
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
  banner,
  overlay,
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
  const tipX = cx + dx * CELL * 0.48;
  const tipY = cy + dy * CELL * 0.48;
  const baseX = cx + dx * CELL * 0.2;
  const baseY = cy + dy * CELL * 0.2;
  const w = CELL * 0.17;
  return `${tipX},${tipY} ${baseX + px * w},${baseY + py * w} ${baseX - px * w},${baseY - py * w}`;
}

// A structurally impossible body still has to be drawn — safely. The engine
// cannot produce one, so a snake whose segments are not orthogonally adjacent
// means a bug or a corrupt record upstream, and `createSnakeBodyPath` throws on
// it by contract rather than inventing a plausible silhouette. Drawing the raw
// segments instead keeps one bad snake from taking the whole surface down, and
// shows the break where it is. Naming it — whose bug, in what words, with what
// remedy — is the mounting surface's to compose over the board via `banner`.
const brokenSnakeIds = $derived(
  new Set(state.snakes.filter((s) => firstDiscontinuity(s.body) !== null).map((s) => s.snakeId)),
);

// Snake-overlay geometry (design D10): the SVG viewBox uses CELL units per
// grid cell, so the zero-gap CSS grid beneath and the overlay share exact
// cell boundaries at any rendered size.
const CELL = 24;
const PAD = 2;
const HEAD_INSET = PAD + 1;

const geometry = $derived<BoardGeometry>({
  cellSize: CELL,
  padding: PAD,
  boardSize: state.board.boardSize,
});

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

{@render banner?.()}

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
        class:inert={onCellClick === undefined}
        title={`(${entry.cell.x}, ${entry.cell.y})`}
        onclick={() => onCellClick?.(entry.cell)}
      >
        {#if entry.item}
          <span class={`item ${itemClass(entry.item)}`}>{itemGlyph(entry.item)}</span>
        {/if}
      </button>
    {/each}
  </div>

  <!-- Contiguous snake silhouettes (design D10): one inflated-centerline
       path per snake, drawn over the cell grid; pointer-events stay with
       the cells so an editing surface keeps its click targets. -->
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
          <!-- The safe fallback: raw segments at their true cells, in an
               alarming outline, instead of a continuous silhouette that would
               hide the break. -->
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
    {@render overlay?.(geometry)}
  </svg>
</div>

<style>
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
  /* A mounting that offered no cell click is not clickable; the cells stay
     buttons so the grid's structure is identical in every mounting. */
  .cell.inert {
    cursor: default;
  }
  .cell.normal { background: #0f172a; }
  .cell.wall { background: #475569; }
  .cell.hazard { background: #7f1d1d; }
  .cell.fertile { background: #14532d; }
  .cell:not(.inert):hover { outline: 1px solid #7dd3fc; outline-offset: -1px; }
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
     spawn an item there — game-engine/item-spawning). */
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
