// The editor boundary: every state mutation the map editor can perform,
// expressed as pure functions returning either the new state or a rejection.
//
// spec: visual-tester/board-editor — the editor permits any structurally
// valid state (in-bounds cells, closed domain vocabulary, fixed Wall ring),
// including states board generation would never produce. Invalid edits are
// rejected here and the state is unchanged.
import { CellType, cellIndex, initialClock, isInner, itemsByCell } from "@cyphid/snek-engine";
import type {
  Cell,
  CellIndex,
  CentaurTeamClockState,
  CentaurTeamId,
  EffectFamily,
  EffectState,
  GameRuntimeConfig,
  GameState,
  Item,
  ItemType,
  PotionEffect,
  SnakeId,
  SnakeState,
  TurnNumber,
} from "@cyphid/snek-engine";

export type EditResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly error: string };

const ok = (state: GameState): EditResult => ({ ok: true, state });
const reject = (error: string): EditResult => ({ ok: false, error });

// The three paintable terrains within the fixed Wall ring
// (game-rules/board-geometry): the Wall ring itself is never paintable.
export type PaintableCellType =
  | typeof CellType.Normal
  | typeof CellType.Hazard
  | typeof CellType.Fertile;

export const MIN_BOARD_SIZE = 3; // wall ring plus at least one inner cell
export const MAX_BOARD_SIZE = 32;

function inBounds(state: GameState, cell: Cell): boolean {
  const n = state.board.boardSize;
  return (
    Number.isInteger(cell.x) &&
    Number.isInteger(cell.y) &&
    cell.x >= 0 &&
    cell.y >= 0 &&
    cell.x < n &&
    cell.y < n
  );
}

/** All items as a flat list (editor-side convenience view of the map). */
export function itemList(state: GameState): Item[] {
  return [...state.items.values()];
}

function withItems(state: GameState, items: Item[]): GameState {
  return { ...state, items: itemsByCell(state.board, items) };
}

/**
 * Keep clocks structurally consistent with the teams present: every team
 * with a snake has exactly one clock. Existing clocks are preserved;
 * clocks for vanished teams are dropped. Clocks are read-only data in v1
 * (design D9: resolveTurn passes them through untouched).
 */
function syncClocks(state: GameState, config: GameRuntimeConfig): GameState {
  const teams = [...new Set(state.snakes.map((s) => s.centaurTeamId))];
  const existing = new Map(state.clocks.map((c) => [c.centaurTeamId, c]));
  const clocks: CentaurTeamClockState[] = teams.map(
    (t) => existing.get(t) ?? initialClock(t, config.clock),
  );
  return { ...state, clocks };
}

// spec: visual-tester/board-editor#structural-validity-enforced — terrain
// painting is bounded to Hazard/Fertile/Normal within the fixed Wall ring.
export function paintCell(state: GameState, cell: Cell, cellType: PaintableCellType): EditResult {
  if (!inBounds(state, cell)) return reject(`cell (${cell.x}, ${cell.y}) is out of bounds`);
  if (!isInner(state.board, cell)) {
    return reject(`cell (${cell.x}, ${cell.y}) is on the Wall ring and cannot be painted`);
  }
  if (
    cellType !== CellType.Normal &&
    cellType !== CellType.Hazard &&
    cellType !== CellType.Fertile
  ) {
    return reject(`cell type ${String(cellType)} is not paintable`);
  }
  const cells = state.board.cells.slice();
  cells[cellIndex(state.board, cell)] = cellType;
  return ok({ ...state, board: { ...state.board, cells } });
}

/** A fresh boardSize x boardSize grid: Wall ring, Normal interior. */
export function blankBoardCells(boardSize: number): CellType[] {
  const cells: CellType[] = [];
  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) {
      const wall = x === 0 || y === 0 || x === boardSize - 1 || y === boardSize - 1;
      cells.push(wall ? CellType.Wall : CellType.Normal);
    }
  }
  return cells;
}

/**
 * Resize the board, preserving inner terrain where still in the new inner
 * area. Snakes with any body cell out of the new bounds and items out of
 * the new inner area are dropped (an editor convenience, not spec surface).
 */
export function resizeBoard(
  state: GameState,
  newSize: number,
  config: GameRuntimeConfig,
): EditResult {
  if (!Number.isInteger(newSize) || newSize < MIN_BOARD_SIZE || newSize > MAX_BOARD_SIZE) {
    return reject(`board size must be an integer in ${MIN_BOARD_SIZE}..${MAX_BOARD_SIZE}`);
  }
  const cells = blankBoardCells(newSize);
  const newBoard = { boardSize: newSize, cells };
  for (let y = 1; y < newSize - 1; y++) {
    for (let x = 1; x < newSize - 1; x++) {
      const old = state.board.cells[y * state.board.boardSize + x];
      if (
        x < state.board.boardSize - 1 &&
        y < state.board.boardSize - 1 &&
        (old === CellType.Hazard || old === CellType.Fertile)
      ) {
        cells[y * newSize + x] = old;
      }
    }
  }
  const snakes = state.snakes.filter((s) =>
    s.body.every((c) => c.x >= 1 && c.y >= 1 && c.x < newSize - 1 && c.y < newSize - 1),
  );
  const items = itemList(state).filter(
    (i) => i.cell.x >= 1 && i.cell.y >= 1 && i.cell.x < newSize - 1 && i.cell.y < newSize - 1,
  );
  const next: GameState = {
    ...state,
    board: newBoard,
    snakes,
    items: itemsByCell(newBoard, items),
  };
  return ok(syncClocks(next, config));
}

function nextSnakeId(state: GameState): SnakeId {
  const max = state.snakes.reduce((m, s) => Math.max(m, s.snakeId), -1);
  return (max + 1) as SnakeId;
}

// A..Z then a..z — enough for 52 snakes per team in a testing tool.
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export function letterForIndex(i: number): string {
  return LETTERS[i % LETTERS.length] ?? "?";
}

/**
 * Re-letter every snake from its index within its team, in snake order
 * (game-rules/initial-snakes: lettered consecutively from A within the team).
 * Letters are derived, never hand-set, so this runs after any add/remove/team
 * change (visual-tester/board-editor#letters-auto-assigned).
 */
export function relabelTeams(state: GameState): GameState {
  const perTeam = new Map<string, number>();
  const snakes = state.snakes.map((s) => {
    const i = perTeam.get(s.centaurTeamId) ?? 0;
    perTeam.set(s.centaurTeamId, i + 1);
    const letter = letterForIndex(i);
    return s.letter === letter ? s : { ...s, letter };
  });
  return { ...state, snakes };
}

// spec: visual-tester/board-editor#derived-lifecycle-fields — an authored
// snake is alive with null last direction; neither field is editable. Its
// letter is derived from its team index (relabelTeams), never passed in.
export function addSnake(
  state: GameState,
  cell: Cell,
  centaurTeamId: CentaurTeamId,
  health: number,
  config: GameRuntimeConfig,
): EditResult {
  if (!inBounds(state, cell)) return reject(`cell (${cell.x}, ${cell.y}) is out of bounds`);
  if (centaurTeamId.length === 0) return reject("team id must be non-empty");
  if (!Number.isInteger(health) || health < 1) {
    return reject("health must be a positive integer");
  }
  // spec: visual-tester/board-editor#item-not-on-body — no snake body on an item.
  if (cellHasItem(state, cell)) {
    return reject(
      `cell (${cell.x}, ${cell.y}) holds an item; remove it before placing a snake head`,
    );
  }
  // spec: visual-tester/board-editor#head-parity-enforced — a new head must
  // share the parity of the existing heads this turn, the only head arrangement
  // any reachable state has (game-rules/starting-placement#shared-parity).
  const parity = requiredHeadParity(state);
  if (parity !== null && cellParity(cell) !== parity) {
    return reject(
      `cell (${cell.x}, ${cell.y}) is the wrong parity; a new head must share (x + y) mod 2 = ${parity} with the existing heads (game-rules/starting-placement)`,
    );
  }
  const snake: SnakeState = {
    snakeId: nextSnakeId(state),
    letter: "A", // placeholder; relabelTeams assigns the real letter
    centaurTeamId,
    body: [{ x: cell.x, y: cell.y }], // single-segment bodies are valid
    health,
    activeEffects: [],
    lastDirection: null,
    alive: true,
  };
  return ok(syncClocks(relabelTeams({ ...state, snakes: [...state.snakes, snake] }), config));
}

export function removeSnake(
  state: GameState,
  snakeId: SnakeId,
  config: GameRuntimeConfig,
): EditResult {
  if (!state.snakes.some((s) => s.snakeId === snakeId)) {
    return reject(`no snake with id ${snakeId}`);
  }
  const snakes = state.snakes.filter((s) => s.snakeId !== snakeId);
  return ok(syncClocks(relabelTeams({ ...state, snakes }), config));
}

function updateSnake(
  state: GameState,
  snakeId: SnakeId,
  update: (snake: SnakeState) => SnakeState | string,
): EditResult {
  const idx = state.snakes.findIndex((s) => s.snakeId === snakeId);
  const snake = state.snakes[idx];
  if (snake === undefined) return reject(`no snake with id ${snakeId}`);
  const result = update(snake);
  if (typeof result === "string") return reject(result);
  const snakes = state.snakes.slice();
  snakes[idx] = result;
  return ok({ ...state, snakes });
}

// spec: visual-tester/board-editor#structural-validity-enforced — bodies
// stay contiguous: an appended cell is orthogonally adjacent to the current
// tail, or stacked on it (the duplicated-tail shape growth produces,
// game-rules/food-and-growth). Contiguity is the only body shape
// game-rules/movement can produce, and the silhouette renderer relies on it.
export function appendBodyCell(state: GameState, snakeId: SnakeId, cell: Cell): EditResult {
  if (!inBounds(state, cell)) return reject(`cell (${cell.x}, ${cell.y}) is out of bounds`);
  // spec: visual-tester/board-editor#item-not-on-body — no snake body on an item.
  if (cellHasItem(state, cell)) {
    return reject(
      `cell (${cell.x}, ${cell.y}) holds an item; remove it before extending a body there`,
    );
  }
  return updateSnake(state, snakeId, (s) => {
    const tail = s.body[s.body.length - 1];
    if (tail === undefined) return "snake has no body to extend";
    if (Math.abs(tail.x - cell.x) + Math.abs(tail.y - cell.y) > 1) {
      return `cell (${cell.x}, ${cell.y}) is not adjacent to the tail (${tail.x}, ${tail.y}); a snake body must stay contiguous`;
    }
    return { ...s, body: [...s.body, { x: cell.x, y: cell.y }] };
  });
}

// spec: visual-tester/board-editor — body length must stay >= 1.
export function removeTailCell(state: GameState, snakeId: SnakeId): EditResult {
  return updateSnake(state, snakeId, (s) =>
    s.body.length <= 1
      ? "a snake body must keep at least one segment"
      : { ...s, body: s.body.slice(0, -1) },
  );
}

export function setSnakeHealth(state: GameState, snakeId: SnakeId, health: number): EditResult {
  if (!Number.isInteger(health) || health < 1) {
    return reject("health must be a positive integer");
  }
  return updateSnake(state, snakeId, (s) => ({ ...s, health }));
}

export function setSnakeTeam(
  state: GameState,
  snakeId: SnakeId,
  centaurTeamId: CentaurTeamId,
  config: GameRuntimeConfig,
): EditResult {
  if (centaurTeamId.length === 0) return reject("team id must be non-empty");
  const result = updateSnake(state, snakeId, (s) => ({ ...s, centaurTeamId }));
  // Re-letter both the old and new teams from their new indices.
  return result.ok ? ok(syncClocks(relabelTeams(result.state), config)) : result;
}

// spec: game-rules/domain-vocabulary — at most one active effect per family.
export function setSnakeEffect(
  state: GameState,
  snakeId: SnakeId,
  family: EffectFamily,
  effectState: EffectState,
  expiryTurn: number,
): EditResult {
  if (family !== "invulnerability" && family !== "invisibility") {
    return reject(`unknown effect family ${String(family)}`);
  }
  if (effectState !== "buff" && effectState !== "debuff") {
    return reject(`unknown effect state ${String(effectState)}`);
  }
  if (!Number.isInteger(expiryTurn) || expiryTurn < 0) {
    return reject("expiry turn must be a non-negative integer");
  }
  return updateSnake(state, snakeId, (s) => {
    const effect: PotionEffect = {
      family,
      state: effectState,
      expiryTurn: expiryTurn as TurnNumber,
    };
    const others = s.activeEffects.filter((e) => e.family !== family);
    return { ...s, activeEffects: [...others, effect] };
  });
}

export function removeSnakeEffect(
  state: GameState,
  snakeId: SnakeId,
  family: EffectFamily,
): EditResult {
  return updateSnake(state, snakeId, (s) => ({
    ...s,
    activeEffects: s.activeEffects.filter((e) => e.family !== family),
  }));
}

/** True when a snake body segment occupies `cell` (editor snakes are alive). */
function cellHasSnakeBody(state: GameState, cell: Cell): boolean {
  return state.snakes.some((s) => s.body.some((c) => c.x === cell.x && c.y === cell.y));
}

/** `(x + y) mod 2` — the checkerboard colour of a cell. */
export type Parity = 0 | 1;
export function cellParity(cell: Cell): Parity {
  return ((cell.x + cell.y) % 2) as Parity;
}

// spec: visual-tester/board-editor#head-parity-enforced — the parity all new
// heads must share this turn, or null when no head yet fixes it. Every snake
// moves one cell per turn, so `(x + y) mod 2` flips in lockstep for all heads;
// since all starting heads share one parity (game-rules/starting-placement
// #shared-parity), every head at every reachable turn shares it. Dead snakes
// are off the board, so only alive heads fix the parity.
export function requiredHeadParity(state: GameState): Parity | null {
  for (const s of state.snakes) {
    const head = s.body[0];
    if (s.alive && head !== undefined) return cellParity(head);
  }
  return null;
}
/** True when an item occupies `cell`. */
function cellHasItem(state: GameState, cell: Cell): boolean {
  return state.items.has(cellIndex(state.board, cell));
}

// spec: visual-tester/board-editor#item-not-on-body — an item may not share a
// cell with a snake body. The engine never puts an item on an ALIVE snake body
// (game-rules/item-spawning excludes alive snakes; a surviving head consumes
// any item it lands on), and every editor snake is alive — so placing an item
// on a body is rejected. Placing over an existing item still REPLACES it.
export function placeItem(state: GameState, cell: Cell, itemType: ItemType): EditResult {
  if (!inBounds(state, cell)) return reject(`cell (${cell.x}, ${cell.y}) is out of bounds`);
  if (cellHasSnakeBody(state, cell)) {
    return reject(
      `cell (${cell.x}, ${cell.y}) holds a snake body; items cannot be placed on snakes`,
    );
  }
  // Drop any item already in this cell so the new one takes its place.
  const items = itemList(state).filter((i) => !(i.cell.x === cell.x && i.cell.y === cell.y));
  // Hand-placed items take setup boundary 0 with the next free spawn index.
  const spawnIndex = items.reduce(
    (m, i) => (i.spawnTurn === 0 ? Math.max(m, i.spawnIndex + 1) : m),
    0,
  );
  const item = {
    spawnTurn: 0 as TurnNumber,
    spawnIndex,
    cell: { x: cell.x, y: cell.y },
    itemType,
  } as Item;
  return ok(withItems(state, [...items, item]));
}

export function removeItem(state: GameState, cell: Cell): EditResult {
  if (!inBounds(state, cell)) return reject(`cell (${cell.x}, ${cell.y}) is out of bounds`);
  const key = cellIndex(state.board, cell) as CellIndex;
  if (!state.items.has(key)) return reject(`no item at (${cell.x}, ${cell.y})`);
  const items = itemList(state).filter((i) => !(i.cell.x === cell.x && i.cell.y === cell.y));
  return ok(withItems(state, items));
}
