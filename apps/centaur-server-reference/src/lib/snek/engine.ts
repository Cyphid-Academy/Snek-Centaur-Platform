// Team Snek — reduced v0 engine (movement + collisions + food/health).
//
// This is a faithful SUBSET of spec module 01's `resolveTurn` pipeline, built
// to prove the game loop + rendering. It deliberately implements only:
//   Phase 1  Move Collection      (staged move -> lastDirection -> default)
//   Phase 2  Snake Movement       (simultaneous, grow on ateLastTurn)
//   Phase 3  Collision Detection   (wall / self / body / head-to-head)
//   Phase 5  Health, Food          (tick, food restore, starvation)
//   Phase 7  Food Spawning         (maintain a target food count)
//   Phase 10 Win Condition Check
//
// Deliberately OMITTED for v0 (the next layer): potions & the team buff/debuff
// mechanic (01-REQ-026/027/047), severing via invulnerability levels
// (01-REQ-044c), invisibility, hazards, fertile ground, the chess timer, and
// BLAKE3/Xoshiro seeding. With no invulnerability, body collisions always kill
// the attacker and no severing occurs — which is exactly the spec's degenerate
// case when every snake is at level 0.
//
// Types mirror `@cyphid/snek-engine` so this migrates into packages/engine
// with minimal churn once the real pipeline is built.

export type Direction = "Up" | "Right" | "Down" | "Left";
export const DIRECTIONS: Direction[] = ["Up", "Right", "Down", "Left"];

const DELTA: Record<Direction, readonly [number, number]> = {
  Up: [0, -1],
  Right: [1, 0],
  Down: [0, 1],
  Left: [-1, 0],
};

export interface Cell {
  x: number;
  y: number;
}

export interface Board {
  size: number; // square edge length; outermost 1-cell border is Wall (01-REQ-008)
}

export interface Item {
  id: string;
  type: "Food";
  x: number;
  y: number;
}

export interface Snake {
  id: string;
  teamId: string;
  letter: string;
  body: Cell[]; // head at index 0, tail last
  health: number;
  lastDirection: Direction | null;
  alive: boolean;
  ateLastTurn: boolean;
}

export interface GameConfig {
  maxHealth: number;
  foodCount: number;
  maxTurns: number;
}

export interface GameState {
  turn: number;
  board: Board;
  snakes: Snake[];
  items: Item[];
  teamIds: string[];
  config: GameConfig;
  rng: number; // xorshift-ish seed state; keeps food spawns reproducible
  finished: boolean;
  winnerTeamId: string | null; // null = draw / everyone dead
}

export type StagedMoves = Record<string, Direction>;

export type DeathCause =
  | "WallCollision"
  | "SelfCollision"
  | "BodyCollision"
  | "HeadToHead"
  | "HealthDepleted";

export type TurnEvent =
  | { type: "SnakeMoved"; snakeId: string; direction: Direction }
  | { type: "SnakeDied"; snakeId: string; cause: DeathCause }
  | { type: "FoodConsumed"; snakeId: string; itemId: string }
  | { type: "ItemSpawned"; item: Item }
  | { type: "GameEnded"; winnerTeamId: string | null };

export interface TurnResult {
  state: GameState;
  events: TurnEvent[];
}

// ---------------------------------------------------------------------------
// Deterministic RNG (mulberry32) — cheap stand-in for the spec's seeded PRNG.
// ---------------------------------------------------------------------------

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const key = (x: number, y: number) => `${x},${y}`;

function isWall(size: number, c: Cell): boolean {
  return c.x <= 0 || c.y <= 0 || c.x >= size - 1 || c.y >= size - 1;
}

// ---------------------------------------------------------------------------
// Food spawning (Phase 7, simplified): top up to config.foodCount.
// ---------------------------------------------------------------------------

function spawnFood(state: GameState, rng: () => number, events: TurnEvent[]): void {
  const size = state.board.size;
  const occupied = new Set<string>();
  for (const s of state.snakes) if (s.alive) for (const seg of s.body) occupied.add(key(seg.x, seg.y));
  for (const it of state.items) occupied.add(key(it.x, it.y));

  const free: Cell[] = [];
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      if (!occupied.has(key(x, y))) free.push({ x, y });
    }
  }

  let need = state.config.foodCount - state.items.length;
  while (need > 0 && free.length > 0) {
    const idx = Math.floor(rng() * free.length);
    const c = free.splice(idx, 1)[0];
    const item: Item = { id: `food-${state.turn}-${c.x}-${c.y}`, type: "Food", x: c.x, y: c.y };
    state.items.push(item);
    events.push({ type: "ItemSpawned", item });
    need--;
  }
}

function leaderByLength(state: GameState): string | null {
  const totals = new Map<string, number>();
  for (const s of state.snakes) {
    if (!s.alive) continue;
    totals.set(s.teamId, (totals.get(s.teamId) ?? 0) + s.body.length);
  }
  let best: string | null = null;
  let bestLen = -1;
  let tie = false;
  for (const [team, len] of totals) {
    if (len > bestLen) {
      bestLen = len;
      best = team;
      tie = false;
    } else if (len === bestLen) {
      tie = true;
    }
  }
  return tie ? null : best;
}

// ---------------------------------------------------------------------------
// resolveTurn — one turn of the reduced pipeline.
// ---------------------------------------------------------------------------

export function resolveTurn(prev: GameState, moves: StagedMoves): TurnResult {
  const state: GameState = structuredClone(prev);
  const events: TurnEvent[] = [];
  if (state.finished) return { state, events };

  const rng = mulberry32(state.rng >>> 0);
  const size = state.board.size;
  state.turn += 1;

  const alive = () => state.snakes.filter((s) => s.alive);

  // ---- Phase 1 + 2: Move Collection & Movement (simultaneous) ----
  for (const s of alive()) {
    const dir: Direction = moves[s.id] ?? s.lastDirection ?? "Up";
    const [dx, dy] = DELTA[dir];
    const head = s.body[0];
    const newHead: Cell = { x: head.x + dx, y: head.y + dy };
    if (s.ateLastTurn) {
      s.body = [newHead, ...s.body]; // retain tail -> grow
      s.ateLastTurn = false;
    } else {
      s.body = [newHead, ...s.body.slice(0, -1)]; // drop tail
    }
    s.lastDirection = dir;
    events.push({ type: "SnakeMoved", snakeId: s.id, direction: dir });
  }

  // ---- Phase 3: Collision Detection (against one post-move snapshot) ----
  const snapshot = alive(); // snakes still flagged alive; bodies are post-move
  const deaths = new Set<string>();
  const die = (id: string, cause: DeathCause) => {
    if (!deaths.has(id)) {
      deaths.add(id);
      events.push({ type: "SnakeDied", snakeId: id, cause });
    }
  };

  // 3a. Wall & self
  for (const s of snapshot) {
    const h = s.body[0];
    if (isWall(size, h)) {
      die(s.id, "WallCollision");
      continue;
    }
    if (s.body.slice(1).some((seg) => seg.x === h.x && seg.y === h.y)) {
      die(s.id, "SelfCollision");
    }
  }

  // 3b. Body collision — head into another snake's non-head segment.
  // No invulnerability in v0, so the attacker always dies (spec 044c, level 0).
  for (const a of snapshot) {
    const h = a.body[0];
    for (const b of snapshot) {
      if (b.id === a.id) continue;
      if (b.body.slice(1).some((seg) => seg.x === h.x && seg.y === h.y)) {
        die(a.id, "BodyCollision");
        break;
      }
    }
  }

  // 3c. Head-to-head — longer survives; ties all die (spec 044d, level 0).
  const byCell = new Map<string, Snake[]>();
  for (const s of snapshot) {
    const k = key(s.body[0].x, s.body[0].y);
    const arr = byCell.get(k);
    if (arr) arr.push(s);
    else byCell.set(k, [s]);
  }
  for (const group of byCell.values()) {
    if (group.length < 2) continue;
    const maxLen = Math.max(...group.map((s) => s.body.length));
    const atMax = group.filter((s) => s.body.length === maxLen);
    for (const s of group) if (s.body.length < maxLen) die(s.id, "HeadToHead");
    if (atMax.length >= 2) for (const s of atMax) die(s.id, "HeadToHead");
  }

  for (const s of state.snakes) if (deaths.has(s.id)) s.alive = false;

  // ---- Phase 5: Health, Food, Starvation ----
  for (const s of alive()) {
    s.health -= 1;
    const food = state.items.find(
      (it) => it.type === "Food" && it.x === s.body[0].x && it.y === s.body[0].y,
    );
    if (food) {
      state.items = state.items.filter((it) => it.id !== food.id);
      s.health = state.config.maxHealth;
      s.ateLastTurn = true;
      events.push({ type: "FoodConsumed", snakeId: s.id, itemId: food.id });
    }
  }
  for (const s of alive()) {
    if (s.health <= 0) {
      s.alive = false;
      events.push({ type: "SnakeDied", snakeId: s.id, cause: "HealthDepleted" });
    }
  }

  // ---- Phase 7: Food Spawning ----
  spawnFood(state, rng, events);

  // ---- Phase 10: Win Condition Check ----
  const aliveTeams = [...new Set(alive().map((s) => s.teamId))];
  if (aliveTeams.length <= 1 || state.turn >= state.config.maxTurns) {
    state.finished = true;
    if (aliveTeams.length === 1) state.winnerTeamId = aliveTeams[0];
    else if (aliveTeams.length === 0) state.winnerTeamId = null;
    else state.winnerTeamId = leaderByLength(state); // turn-limit reached
    events.push({ type: "GameEnded", winnerTeamId: state.winnerTeamId });
  }

  state.rng = Math.floor(rng() * 0xffffffff) >>> 0;
  return { state, events };
}

// ---------------------------------------------------------------------------
// Initial state — two teams, two snakes each, on an 11x11 board.
// ---------------------------------------------------------------------------

export function createInitialState(seed: number): GameState {
  const size = 11;
  const config: GameConfig = { maxHealth: 100, foodCount: 4, maxTurns: 250 };

  const mk = (id: string, teamId: string, letter: string, x: number, y: number): Snake => ({
    id,
    teamId,
    letter,
    body: [
      { x, y },
      { x, y },
      { x, y },
    ], // length 3, stacked (01-REQ-020)
    health: config.maxHealth,
    lastDirection: null,
    alive: true,
    ateLastTurn: false,
  });

  const snakes: Snake[] = [
    mk("red-A", "Red", "A", 2, 3),
    mk("red-B", "Red", "B", 2, 7),
    mk("blue-A", "Blue", "A", 8, 3),
    mk("blue-B", "Blue", "B", 8, 7),
  ];

  const state: GameState = {
    turn: 0,
    board: { size },
    snakes,
    items: [],
    teamIds: ["Red", "Blue"],
    config,
    rng: seed >>> 0 || 1,
    finished: false,
    winnerTeamId: null,
  };

  const rng = mulberry32(state.rng);
  spawnFood(state, rng, []);
  state.rng = Math.floor(rng() * 0xffffffff) >>> 0;
  return state;
}

// ---------------------------------------------------------------------------
// A dumb greedy bot: head for nearest food, avoid stepping into a wall or any
// snake body when a safe option exists. Deterministic given the state — this
// stands in for the spec's Centaur bot framework (module 07).
// ---------------------------------------------------------------------------

export function computeBotMoves(state: GameState): StagedMoves {
  const moves: StagedMoves = {};
  const size = state.board.size;

  const blocked = new Set<string>();
  for (const s of state.snakes) if (s.alive) for (const seg of s.body) blocked.add(key(seg.x, seg.y));

  const foods = state.items.filter((i) => i.type === "Food");

  for (const s of state.snakes) {
    if (!s.alive) continue;
    const head = s.body[0];

    // nearest food (Manhattan)
    let target: Item | null = null;
    let bestD = Infinity;
    for (const f of foods) {
      const d = Math.abs(f.x - head.x) + Math.abs(f.y - head.y);
      if (d < bestD) {
        bestD = d;
        target = f;
      }
    }

    const options = DIRECTIONS.map((dir) => {
      const [dx, dy] = DELTA[dir];
      return { dir, nx: head.x + dx, ny: head.y + dy };
    });
    const safe = options.filter(
      (o) => o.nx > 0 && o.ny > 0 && o.nx < size - 1 && o.ny < size - 1 && !blocked.has(key(o.nx, o.ny)),
    );
    const pool = safe.length ? safe : options; // trapped -> accept fate

    let choice = pool[0];
    if (target) {
      let cd = Infinity;
      for (const o of pool) {
        const d = Math.abs(target.x - o.nx) + Math.abs(target.y - o.ny);
        if (d < cd) {
          cd = d;
          choice = o;
        }
      }
    } else {
      choice = pool[(head.x + head.y + state.turn) % pool.length];
    }
    moves[s.id] = choice.dir;
  }

  return moves;
}
