// TurnContext: the read-only reference state every interaction rule consumes.
// Built in two spec stages: move projection (game-engine/movement) and
// head-to-head precedence (game-engine/head-to-head-precedence), which
// withdraws losing heads and yields the surviving moved-head set H*.
// Everything downstream reads only this context plus the claim set.
//
// The board this turn resolves over has two kinds of occupant, and that is why
// holding a snake is not a wrapper around the resolver. PARTICIPANTS are whole
// snakes taking the turn. PROJECTIONS are snakes held through it: headless,
// severable, carrying effects that expire and that team events reach, and
// standing where their historic records last put them. The rules read
// occupants and mostly cannot tell which they have; the four places that must
// are move projection, head-to-head precedence, the health tick, and health
// resolution — each of which is structured around a snake having chosen a move.
// spec: game-engine/held-snakes
import { advance, cellIndex, cellKey } from "../board.js";
import { invulnerabilityLevel } from "../effects.js";
import { itemIdOf } from "../items.js";
import type {
  Agent,
  Board,
  Cell,
  CellIndex,
  CentaurTeamId,
  Direction,
  GameRuntimeConfig,
  Item,
  ItemId,
  PartialGameState,
  SnakeId,
  StagedMove,
  TurnNumber,
} from "../types.js";
import type { ClaimSet } from "./claims.js";
import type { ResolutionPlan } from "./plan.js";
import type { WorkOccupant, WorkProjection, WorkSnake } from "./work.js";
import { must, projectHeldSnake, toWorkProjection, toWorkSnake } from "./work.js";

// The move a participant makes this turn and the body it leaves. Named for the
// spec's "move projection" stage; the type is MovedSnake rather than
// MoveProjection because a PROJECTION is now a held snake's standing form
// (ProjectedSnake), and one word cannot mean both.
export interface MovedSnake {
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
  readonly occupant: WorkOccupant;
  /**
   * Position in the owner's own cell list — the index a sever truncates at.
   * ≥ 1 for a participant, whose head is contested through head-to-head
   * instead; 0 is reachable for a projection, which has no head at all.
   *
   * Every entry here is therefore a NON-HEAD segment, which is what lets the
   * collision requirement apply to both kinds of occupant with no special case
   * on either side. spec: game-engine/collisions-and-severing
   */
  readonly index: number;
}

export interface TurnContext {
  readonly board: Board;
  readonly config: GameRuntimeConfig;
  /** The turn being resolved — the state's own current turn. */
  readonly turnNumber: TurnNumber;
  /** Whole snakes on the board, ascending snakeId. Work copies — mutated only by the commit. */
  readonly snakes: ReadonlyArray<WorkSnake>;
  readonly byId: ReadonlyMap<SnakeId, WorkSnake>;
  /**
   * Present items, cell-keyed — the turn's working copy of the state's items.
   * Rules never write it (consumption is a claim); the commit removes
   * consumption-claimed entries and spawning inserts new ones.
   */
  readonly items: Map<CellIndex, Item>;
  /**
   * Snapshot items by derived id — the reference index that claims (which
   * carry ItemIds, never item objects) are resolved against at commit.
   */
  readonly itemById: ReadonlyMap<ItemId, Item>;
  /** Snakes taking this turn, ascending snakeId. */
  readonly participants: ReadonlyArray<WorkSnake>;
  /**
   * Projections standing on the board this turn, ascending snakeId — those
   * already on the state, plus one for each snake held through this
   * resolution. Work copies; the commit is their only writer.
   */
  readonly projections: ReadonlyArray<WorkProjection>;
  /**
   * Everything a team event reaches: whole snakes and projections alike,
   * ascending snakeId within each. Effect cancellation, team rebuilds, expiry
   * and clock exhaustion iterate this — none of them cares which kind it has.
   */
  readonly occupants: ReadonlyArray<WorkOccupant>;
  readonly moved: ReadonlyMap<SnakeId, MovedSnake>;
  /** H* (game-engine/head-to-head-precedence): participants whose head survived head-to-head. */
  readonly survivingHeads: ReadonlyArray<SurvivingHead>;
  /** The nullable single item occupant of a cell (game-engine/item-identity). */
  readonly itemAt: (cell: Cell) => Item | null;
  /**
   * Body segments at a cell that a moved head can collide with — the targets
   * of game-engine/collisions-and-severing, including head-to-head losers'
   * bodies and every segment of a held body. Entries are ordered by (snakeId,
   * segment index) ascending. The contract is fixed by the spec; the backing
   * structure behind this function is deliberately simple (per-call Map) and
   * is the designated swap point for profile-driven optimisation once the bot
   * framework's simulation loop provides real load (see DECISIONS.md §3.10).
   */
  readonly bodySegmentsAt: (cell: Cell) => ReadonlyArray<BodySegmentEntry>;
  /**
   * The cells an occupant ends the turn standing in, before severing and growth
   * apply — a participant's moved body, or a projection's segments.
   */
  readonly cellsThisTurn: (id: SnakeId) => ReadonlyArray<Cell>;
  /** Snapshot health, immune to commit mutation (event derivation needs it). */
  readonly snapshotHealth: ReadonlyMap<SnakeId, number>;
  readonly roster: ReadonlyArray<CentaurTeamId>;
  readonly aliveTeamsAtStart: ReadonlySet<CentaurTeamId>;
}

export function movedOf(ctx: TurnContext, id: SnakeId): MovedSnake {
  return must(ctx.moved.get(id), `moved body for snake ${id}`);
}

/**
 * Build the turn's reference state: clone the snapshot into work copies,
 * project the participants' moves, then resolve head-to-head precedence
 * (emitting its death claims into `claims`) to produce H*.
 */
export function buildTurnContext(
  state: PartialGameState,
  plan: ResolutionPlan,
  stagedMoves: ReadonlyMap<SnakeId, StagedMove>,
  config: GameRuntimeConfig,
  claims: ClaimSet,
): TurnContext {
  const nextTurn = (plan.turnNumber + 1) as TurnNumber;
  // A hold becomes a PROJECTION only when the turn advances past it: with
  // nothing advanced there is no later plane to project into, so the snakes
  // stay whole and the state that comes back is the state that went in.
  // spec: game-engine/hypothetical-resolution-failure#holding-everything-is-a-no-op-not-a-failure
  const turnAdvances = plan.moves.size > 0;

  const allSnakes = state.snakes.map(toWorkSnake);
  allSnakes.sort((a, b) => a.snakeId - b.snakeId); // deterministic iteration
  const crystallizing = turnAdvances ? allSnakes.filter((s) => plan.held.has(s.snakeId)) : [];
  const crystallizingIds = new Set(crystallizing.map((s) => s.snakeId));
  const snakes = allSnakes.filter((s) => !crystallizingIds.has(s.snakeId));
  const byId = new Map<SnakeId, WorkSnake>(snakes.map((s) => [s.snakeId, s]));

  // Projections already standing, then the ones this turn creates. Ascending
  // snakeId within each group keeps occupancy deterministic.
  const projections: WorkProjection[] = [
    ...state.projections.map(toWorkProjection).sort((a, b) => a.snakeId - b.snakeId),
    ...crystallizing.map((s) => projectHeldSnake(s, nextTurn, config.maxHealth)),
  ];
  const projectionById = new Map<SnakeId, WorkProjection>(projections.map((p) => [p.snakeId, p]));
  const occupants: WorkOccupant[] = [...snakes, ...projections];

  const items = new Map<CellIndex, Item>(state.items);
  const itemById = new Map<ItemId, Item>([...items.values()].map((i) => [itemIdOf(i), i]));
  const participants = snakes.filter((s) => s.alive && plan.moves.has(s.snakeId));

  // Roster and start-of-turn aliveness for the win check, over every occupant
  // rather than only the participants: a hold is a statement about what this
  // resolution models, never about who is in the game. Forfeit exclusion
  // (game-engine/scoring) happens upstream.
  const roster: CentaurTeamId[] = [];
  for (const o of occupants) {
    if (!roster.includes(o.centaurTeamId)) roster.push(o.centaurTeamId);
  }
  const aliveTeamsAtStart = new Set(occupants.filter((o) => o.alive).map((o) => o.centaurTeamId));
  const snapshotHealth = new Map<SnakeId, number>(snakes.map((s) => [s.snakeId, s.health]));

  // ---- Stage 1: Move Projection. spec: game-engine/movement ----
  // Participants only: a held snake does not move, its body is unchanged, and
  // no movement event is emitted for it.
  const moved = new Map<SnakeId, MovedSnake>();
  for (const snake of participants) {
    const direction = must(plan.moves.get(snake.snakeId), `planned direction ${snake.snakeId}`);
    const staged = stagedMoves.get(snake.snakeId);
    const from = snake.body[0] as Cell;
    const head = advance(from, direction);
    // Unconditional advance-and-drop-tail; growth is a duplicated tail
    // segment applied at commit (game-engine/food-and-growth), never a movement branch.
    moved.set(snake.snakeId, {
      direction,
      // Attribution, not choice: a direction that came from the fallback, or
      // from a hypothetical's caller (which stages nothing), was staged by
      // nobody. The direction itself was already decided by the plan.
      stagedBy: staged?.stagedBy ?? null,
      from,
      head,
      body: [head, ...snake.body.slice(0, -1)],
    });
  }

  const cellsThisTurn = (id: SnakeId): ReadonlyArray<Cell> => {
    const move = moved.get(id);
    if (move !== undefined) return move.body;
    const projection = projectionById.get(id);
    if (projection !== undefined) return projection.segments;
    return must(byId.get(id), `snake ${id}`).body;
  };

  // ---- Stage 2: Head-to-Head Precedence. spec: game-engine/head-to-head-precedence ----
  // Levels and lengths are snapshot reads; losers' heads are withdrawn from
  // the surviving moved-head set consumed by every other rule. Their body
  // segments remain on the logical board. Held snakes take no part: precedence
  // is about simultaneous entry into a cell, and a held snake entered none.
  const headGroups = new Map<number, WorkSnake[]>();
  for (const snake of participants) {
    const key = cellKey(must(moved.get(snake.snakeId), "moved body").head);
    const group = headGroups.get(key);
    if (group === undefined) headGroups.set(key, [snake]);
    else group.push(snake);
  }
  for (const group of headGroups.values()) {
    if (group.length < 2) continue;
    const maxLvl = Math.max(...group.map((s) => invulnerabilityLevel(s)));
    const topTier = group.filter((s) => invulnerabilityLevel(s) === maxLvl);
    // Snapshot body length — growth from earlier food is already a
    // duplicated tail segment in the snapshot (game-engine/food-and-growth).
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
  const survivingHeads: SurvivingHead[] = participants
    .filter((s) => !claims.diedHeadToHead(s.snakeId))
    .map((s) => ({ snake: s, head: must(moved.get(s.snakeId), "moved body").head }));

  // Segment occupancy index, built once per turn in (snakeId, segment index)
  // order so lookups are deterministic and body-collision detection is
  // O(heads + segments).
  //
  // A participant contributes its moved body from index 1 — its head is
  // contested through head-to-head instead. A projection contributes every
  // segment it has, from index 0, because it HAS no head: the cell its record
  // named as the head is where its own next segment goes, and its tail has not
  // provably vacated, so following either is fatal even though the same follow
  // is legal against a snake taking the turn. A projection severed to nothing
  // contributes nothing, with no case for that beyond an empty list.
  // spec: game-engine/held-snakes#a-projection-has-no-head, #a-projected-tail-is-impassable
  const segmentIndex = new Map<number, BodySegmentEntry[]>();
  const addSegments = (occupant: WorkOccupant, cells: ReadonlyArray<Cell>, from: number): void => {
    for (let index = from; index < cells.length; index++) {
      const key = cellKey(cells[index] as Cell);
      const list = segmentIndex.get(key);
      const entry = { occupant, index };
      if (list === undefined) segmentIndex.set(key, [entry]);
      else list.push(entry);
    }
  };
  for (const snake of participants) {
    addSegments(snake, must(moved.get(snake.snakeId), "moved body").body, 1);
  }
  for (const projection of projections) {
    if (projection.alive) addSegments(projection, projection.segments, 0);
  }
  const EMPTY_SEGMENTS: ReadonlyArray<BodySegmentEntry> = [];
  const bodySegmentsAt = (cell: Cell): ReadonlyArray<BodySegmentEntry> =>
    segmentIndex.get(cellKey(cell)) ?? EMPTY_SEGMENTS;

  // The cell-keyed items map IS the lookup structure — one nullable occupant.
  const itemAt = (cell: Cell): Item | null => items.get(cellIndex(state.board, cell)) ?? null;

  return {
    board: state.board,
    config,
    turnNumber: plan.turnNumber,
    snakes,
    byId,
    items,
    itemById,
    participants,
    projections,
    occupants,
    moved,
    survivingHeads,
    itemAt,
    bodySegmentsAt,
    cellsThisTurn,
    snapshotHealth,
    roster,
    aliveTeamsAtStart,
  };
}
