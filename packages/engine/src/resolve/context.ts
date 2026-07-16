// TurnContext: the read-only reference state every interaction rule consumes.
// Built in two spec stages: move projection (01-REQ-042/043) and head-to-head
// precedence (01-REQ-044d), which withdraws losing heads and yields the
// surviving moved-head set H*. Everything downstream reads only this context
// plus the claim set.
import { advance, cellIndex, cellKey } from "../board.js";
import { invulnerabilityLevel } from "../effects.js";
import { rngFromSeed, subSeed } from "../rng.js";
import type {
  Agent,
  Board,
  Cell,
  CellIndex,
  CentaurTeamId,
  Direction,
  GameRuntimeConfig,
  GameState,
  ItemState,
  SnakeId,
  StagedMove,
  TurnNumber,
} from "../types.js";
import { ALL_DIRECTIONS } from "../types.js";
import type { ClaimSet } from "./claims.js";
import type { WorkSnake } from "./work.js";
import { must, toWorkSnake } from "./work.js";

export interface MoveProjection {
  readonly direction: Direction;
  readonly stagedBy: Agent | null;
  readonly from: Cell;
  readonly head: Cell;
  readonly body: ReadonlyArray<Cell>;
}

export interface SurvivingHead {
  readonly snake: WorkSnake;
  readonly head: Cell;
}

export interface BodySegmentEntry {
  readonly snake: WorkSnake;
  /** Segment position in the owner's moved body (always ≥ 1; 0 is the head). */
  readonly index: number;
}

export interface TurnContext {
  readonly board: Board;
  readonly config: GameRuntimeConfig;
  readonly turnNumber: TurnNumber;
  /** All snakes, ascending snakeId. Work copies — mutated only by the commit. */
  readonly snakes: ReadonlyArray<WorkSnake>;
  readonly byId: ReadonlyMap<SnakeId, WorkSnake>;
  /**
   * Present items, cell-keyed — the turn's working copy of GameState.items.
   * Rules never write it (consumption is a claim); the commit removes
   * consumption-claimed entries and spawning inserts new ones.
   */
  readonly items: Map<CellIndex, ItemState>;
  /** Snakes alive in the snapshot, ascending snakeId. */
  readonly aliveInS: ReadonlyArray<WorkSnake>;
  readonly moved: ReadonlyMap<SnakeId, MoveProjection>;
  /** H* (01-REQ-044d): alive movers whose head survived head-to-head. */
  readonly survivingHeads: ReadonlyArray<SurvivingHead>;
  /** The nullable single item occupant of a cell (01-REQ-007). */
  readonly itemAt: (cell: Cell) => ItemState | null;
  /**
   * Non-head segments of moved bodies at a cell — the body-collision targets
   * of 01-REQ-044c, including head-to-head losers' bodies. Entries are
   * ordered by (snakeId, segment index) ascending; `index` is the segment's
   * position in the owner's moved body (≥ 1). The contract is fixed by the
   * spec; the backing structure behind this function is deliberately simple
   * (per-call Map) and is the designated swap point for profile-driven
   * optimisation once module 07's simulation loop provides real load
   * (see DECISIONS.md §3.10).
   */
  readonly bodySegmentsAt: (cell: Cell) => ReadonlyArray<BodySegmentEntry>;
  /** Snapshot health, immune to commit mutation (event derivation needs it). */
  readonly snapshotHealth: ReadonlyMap<SnakeId, number>;
  readonly roster: ReadonlyArray<CentaurTeamId>;
  readonly aliveTeamsAtStart: ReadonlySet<CentaurTeamId>;
}

export function projectionOf(ctx: TurnContext, id: SnakeId): MoveProjection {
  return must(ctx.moved.get(id), `move projection for snake ${id}`);
}

/**
 * Build the turn's reference state: clone the snapshot into work copies,
 * project all moves, then resolve head-to-head precedence (emitting its
 * death claims into `claims`) to produce H*.
 */
export function buildTurnContext(
  state: GameState,
  stagedMoves: ReadonlyMap<SnakeId, StagedMove>,
  turnNumber: TurnNumber,
  turnSeed: Uint8Array,
  config: GameRuntimeConfig,
  claims: ClaimSet,
): TurnContext {
  const snakes = state.snakes.map(toWorkSnake);
  snakes.sort((a, b) => a.snakeId - b.snakeId); // deterministic iteration
  const byId = new Map<SnakeId, WorkSnake>(snakes.map((s) => [s.snakeId, s]));
  const items = new Map<CellIndex, ItemState>(state.items);
  const aliveInS = snakes.filter((s) => s.alive);

  // Roster and start-of-turn aliveness for the win check. Forfeit exclusion
  // (01-REQ-053a) happens upstream.
  const roster: CentaurTeamId[] = [];
  for (const s of snakes) {
    if (!roster.includes(s.centaurTeamId)) roster.push(s.centaurTeamId);
  }
  const aliveTeamsAtStart = new Set(aliveInS.map((s) => s.centaurTeamId));
  const snapshotHealth = new Map<SnakeId, number>(snakes.map((s) => [s.snakeId, s.health]));

  // ---- Stage 1: Move Projection. spec: 01-REQ-042, 01-REQ-043 ----
  // RNG draws happen in ascending-snakeId order, only for fallback snakes.
  const rngMove = rngFromSeed(subSeed(turnSeed, "phase-1-random"));
  const moved = new Map<SnakeId, MoveProjection>();
  for (const snake of aliveInS) {
    const staged = stagedMoves.get(snake.snakeId);
    let direction: Direction;
    let stagedBy: Agent | null;
    if (staged !== undefined) {
      direction = staged.direction;
      stagedBy = staged.stagedBy;
    } else if (snake.lastDirection !== null) {
      direction = snake.lastDirection; // used unconditionally, even if lethal
      stagedBy = null;
    } else {
      // Turn 0 with nothing staged: seeded uniform pick, not safety-filtered.
      direction = rngMove.pick(ALL_DIRECTIONS);
      stagedBy = null;
    }
    const from = snake.body[0] as Cell;
    const head = advance(from, direction);
    // Unconditional advance-and-drop-tail; growth is a duplicated tail
    // segment applied at commit (01-REQ-062), never a movement branch.
    moved.set(snake.snakeId, {
      direction,
      stagedBy,
      from,
      head,
      body: [head, ...snake.body.slice(0, -1)],
    });
  }

  // ---- Stage 2: Head-to-Head Precedence. spec: 01-REQ-044d ----
  // Levels and lengths are snapshot reads; losers' heads are withdrawn from
  // the surviving moved-head set consumed by every other rule. Their body
  // segments remain on the logical board.
  const headGroups = new Map<number, WorkSnake[]>();
  for (const snake of aliveInS) {
    const key = cellKey(must(moved.get(snake.snakeId), "projection").head);
    const group = headGroups.get(key);
    if (group === undefined) headGroups.set(key, [snake]);
    else group.push(snake);
  }
  for (const group of headGroups.values()) {
    if (group.length < 2) continue;
    const maxLvl = Math.max(...group.map((s) => invulnerabilityLevel(s)));
    const topTier = group.filter((s) => invulnerabilityLevel(s) === maxLvl);
    // Snapshot body length — growth from earlier food is already a
    // duplicated tail segment in the snapshot (01-REQ-062).
    const maxLen = Math.max(...topTier.map((s) => s.body.length));
    const atMax = topTier.filter((s) => s.body.length === maxLen);
    const survivor = atMax.length === 1 ? (atMax[0] as WorkSnake) : null;
    for (const s of group) {
      if (s === survivor) continue;
      claims.certainDeath(
        s.snakeId,
        { cause: "head_to_head", killer: survivor?.snakeId ?? null },
        "head_to_head_death",
      );
    }
  }
  const survivingHeads: SurvivingHead[] = aliveInS
    .filter((s) => !claims.diedHeadToHead(s.snakeId))
    .map((s) => ({ snake: s, head: must(moved.get(s.snakeId), "projection").head }));

  // Segment occupancy index: non-head moved-body segments per cell, built
  // once per turn in (snakeId, segment index) order so lookups are
  // deterministic and body-collision detection is O(heads + segments).
  const segmentIndex = new Map<number, BodySegmentEntry[]>();
  for (const snake of aliveInS) {
    const body = must(moved.get(snake.snakeId), "projection").body;
    for (let index = 1; index < body.length; index++) {
      const key = cellKey(body[index] as Cell);
      const list = segmentIndex.get(key);
      const entry = { snake, index };
      if (list === undefined) segmentIndex.set(key, [entry]);
      else list.push(entry);
    }
  }
  const EMPTY_SEGMENTS: ReadonlyArray<BodySegmentEntry> = [];
  const bodySegmentsAt = (cell: Cell): ReadonlyArray<BodySegmentEntry> =>
    segmentIndex.get(cellKey(cell)) ?? EMPTY_SEGMENTS;

  // The cell-keyed items map IS the lookup structure — one nullable occupant.
  const itemAt = (cell: Cell): ItemState | null => items.get(cellIndex(state.board, cell)) ?? null;

  return {
    board: state.board,
    config,
    turnNumber,
    snakes,
    byId,
    items,
    aliveInS,
    moved,
    survivingHeads,
    itemAt,
    bodySegmentsAt,
    snapshotHealth,
    roster,
    aliveTeamsAtStart,
  };
}
