// Greedy demo bot — a deterministic stand-in for the module-07 Centaur bot
// framework, used by the /demo page to drive both teams. It sees the full
// game state (a local demo has no invisibility fog); a real Centaur bot
// consumes the module-04 subscription view instead.
//
// Strategy, in priority order:
//   1. Never stage a certain-death move. "Certain" means deterministic from
//      this snake's own information at staging time — other snakes' heads
//      are unknowable under 01 §2.8's simultaneity, so only these qualify:
//        - wall entry / guaranteed self-collision (engine `isValidMove`,
//          which honours tail vacation and duplicated-tail growth),
//        - guaranteed body collision: another alive snake's post-move body
//          cells — its segments 0..len-2 plus a duplicated tail (01-REQ-062)
//          — unless our invulnerability level exceeds every such victim's,
//          in which case contact severs rather than kills (01-REQ-044c),
//        - fatal health resolution (01-REQ-046): the 1-damage tick plus
//          hazard damage on hazard entry, with no food on the target cell
//          to heal it away.
//   2. Among safe moves, minimise Manhattan distance to the nearest food,
//      with penalties for hazard entry and for cells a same-or-longer
//      snake's head could reach (head-to-head risk, 01-REQ-044d), and a
//      bonus per escape route from the target cell (dead-end avoidance).
//   3. If no move is safe, prefer the least-bad death: starvation over body
//      collision over self-collision over wall — from any inner cell at
//      least two in-bounds moves exist, so a bot snake never dies to a wall.
//
// Ties resolve in fixed direction order (Up, Right, Down, Left), so staged
// moves are a pure function of the game state.
import {
  CellType,
  Direction,
  ItemType,
  advance,
  cellAt,
  cellKey,
  invulnerabilityLevel,
  isValidMove,
} from "@cyphid/snek-centaur-server-lib";
import type {
  Cell,
  GameRuntimeConfig,
  GameState,
  SnakeId,
  SnakeState,
  StagedMove,
} from "@cyphid/snek-centaur-server-lib";

const DIRS: ReadonlyArray<Direction> = [
  Direction.Up,
  Direction.Right,
  Direction.Down,
  Direction.Left,
];

// Scoring weights (per-cell food distance = 10).
const FOOD_DISTANCE_WEIGHT = 10;
const HAZARD_PENALTY = 60;
const LOW_HEALTH_HAZARD_PENALTY = 300;
const HEAD_TO_HEAD_PENALTY = 250;
const ESCAPE_ROUTE_BONUS = 8;

/** Compute staged moves for every alive snake, staged by its team's Centaur. */
export function computeBotMoves(
  state: GameState,
  config: GameRuntimeConfig,
): Map<SnakeId, StagedMove> {
  const moves = new Map<SnakeId, StagedMove>();
  const alive = state.snakes.filter((s) => s.alive);
  const foods = state.items
    .filter((i) => !i.consumed && i.itemType === ItemType.Food)
    .map((i) => i.cell);
  const shared = buildSharedView(alive);

  for (const snake of alive) {
    const direction = chooseDirection(state, config, snake, shared, foods);
    moves.set(snake.snakeId, {
      direction,
      stagedBy: { kind: "centaur_team", centaurTeamId: snake.centaurTeamId },
    });
  }
  return moves;
}

interface OccupancyEntry {
  readonly owner: SnakeId;
  readonly level: number;
}

interface HeadReachEntry {
  readonly owner: SnakeId;
  readonly length: number;
}

interface SharedView {
  /** cellKey → snakes whose post-move body is guaranteed to occupy the cell
   * (with their invulnerability levels). Queries exclude the asking snake —
   * its own body is `isValidMove`'s job. */
  readonly occupancy: Map<number, OccupancyEntry[]>;
  /** cellKey → snakes whose head could enter the cell next turn (with their
   * post-Phase-2 lengths — head-to-head candidates, 01-REQ-044d). */
  readonly headReach: Map<number, HeadReachEntry[]>;
}

function buildSharedView(alive: ReadonlyArray<SnakeState>): SharedView {
  const occupancy = new Map<number, OccupancyEntry[]>();
  const headReach = new Map<number, HeadReachEntry[]>();
  const push = <T>(map: Map<number, T[]>, k: number, entry: T): void => {
    const list = map.get(k);
    if (list === undefined) map.set(k, [entry]);
    else list.push(entry);
  };

  for (const snake of alive) {
    const body = snake.body;
    const level = invulnerabilityLevel(snake);
    // Guaranteed post-move occupancy: old segments 0..len-2 shift into body
    // positions 1..len-1; the old tail vacates unless duplicated (growth
    // committed last turn, 01-REQ-062).
    const last = body.length - 1;
    for (let i = 0; i < last; i++) {
      push(occupancy, cellKey(body[i] as Cell), { owner: snake.snakeId, level });
    }
    const tail = body[last];
    const beforeTail = body[last - 1];
    if (tail !== undefined && beforeTail !== undefined && sameCell(tail, beforeTail)) {
      push(occupancy, cellKey(tail), { owner: snake.snakeId, level });
    }

    const head = body[0];
    if (head !== undefined) {
      for (const dir of DIRS) {
        push(headReach, cellKey(advance(head, dir)), {
          owner: snake.snakeId,
          length: body.length,
        });
      }
    }
  }
  return { occupancy, headReach };
}

function sameCell(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y;
}

function manhattan(a: Cell, b: Cell): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

interface Candidate {
  readonly direction: Direction;
  readonly certainDeath: boolean;
  /** Fallback rank when every move is certain death (lower = preferred). */
  readonly deathRank: number;
  readonly score: number;
}

function chooseDirection(
  state: GameState,
  config: GameRuntimeConfig,
  snake: SnakeState,
  shared: SharedView,
  foods: ReadonlyArray<Cell>,
): Direction {
  const head = snake.body[0] as Cell;
  const nearestFood = pickNearestFood(head, foods);

  let best: Candidate | undefined;
  for (const direction of DIRS) {
    const candidate = evaluate(state, config, snake, shared, nearestFood, direction);
    if (best === undefined || better(candidate, best)) best = candidate;
  }
  return (best as Candidate).direction;
}

function better(a: Candidate, b: Candidate): boolean {
  if (a.certainDeath !== b.certainDeath) return !a.certainDeath;
  if (a.certainDeath) return a.deathRank < b.deathRank;
  return a.score < b.score;
}

function pickNearestFood(head: Cell, foods: ReadonlyArray<Cell>): Cell | undefined {
  let nearest: Cell | undefined;
  let nearestDist = Number.POSITIVE_INFINITY;
  for (const food of foods) {
    const d = manhattan(head, food);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = food;
    }
  }
  return nearest;
}

function evaluate(
  state: GameState,
  config: GameRuntimeConfig,
  snake: SnakeState,
  shared: SharedView,
  nearestFood: Cell | undefined,
  direction: Direction,
): Candidate {
  const target = advance(snake.body[0] as Cell, direction);
  const targetType = cellAt(state.board, target);
  const wall = targetType === undefined || targetType === CellType.Wall;
  // isValidMove covers wall entry AND guaranteed self-collision; with wall
  // separated above, a false here on a non-wall cell means own body.
  const ownBody = !wall && !isValidMove(state, snake.snakeId, direction);

  const myLevel = invulnerabilityLevel(snake);
  const victims = (shared.occupancy.get(cellKey(target)) ?? []).filter(
    (e) => e.owner !== snake.snakeId,
  );
  // Sever exemption (01-REQ-044c): survivable only if we out-level EVERY
  // snake guaranteed to occupy the cell.
  const bodyDeath = victims.some((e) => e.level >= myLevel);

  const hazard = targetType === CellType.Hazard;
  const foodAt = hasFoodAt(state, target);
  // spec: 01-REQ-046 — tick damage + hazard damage resolve together; a heal
  // claim (food) dominates, so a food cell never starves the entrant.
  const damage = 1 + (hazard ? config.hazardDamage : 0);
  const starves = !foodAt && snake.health <= damage;

  const certainDeath = wall || ownBody || bodyDeath || starves;
  // Least-bad death for the trapped fallback: starving in-bounds beats body
  // collision beats self-collision beats the wall.
  const deathRank = wall ? 3 : ownBody ? 2 : bodyDeath ? 1 : 0;

  let score = 0;
  if (nearestFood !== undefined) {
    score += manhattan(target, nearestFood) * FOOD_DISTANCE_WEIGHT;
  }
  if (hazard) {
    // Nonfatal here (else certainDeath), but lingering in hazard drains fast
    // — weight much harder when reserves are thin.
    score += HAZARD_PENALTY + (snake.health <= 2 * damage ? LOW_HEALTH_HAZARD_PENALTY : 0);
  }
  const rivals = (shared.headReach.get(cellKey(target)) ?? []).filter(
    (e) => e.owner !== snake.snakeId,
  );
  // spec: 01-REQ-044d — equal post-Phase-2 length is mutual death, so a
  // same-or-longer rival head reaching this cell is a losing contest.
  if (rivals.some((e) => e.length >= snake.body.length)) score += HEAD_TO_HEAD_PENALTY;
  score -= escapeRoutes(state, shared, target) * ESCAPE_ROUTE_BONUS;

  return { direction, certainDeath, deathRank, score };
}

function hasFoodAt(state: GameState, cell: Cell): boolean {
  return state.items.some(
    (i) => !i.consumed && i.itemType === ItemType.Food && sameCell(i.cell, cell),
  );
}

/** Approximate onward mobility from a cell: neighbours that are in-board,
 * non-wall, and not guaranteed-occupied by ANY snake's post-move body
 * (including our own — our old head is in the shared occupancy map). */
function escapeRoutes(state: GameState, shared: SharedView, from: Cell): number {
  let routes = 0;
  for (const dir of DIRS) {
    const next = advance(from, dir);
    const type = cellAt(state.board, next);
    if (type === undefined || type === CellType.Wall) continue;
    if (shared.occupancy.has(cellKey(next))) continue;
    routes += 1;
  }
  return routes;
}
