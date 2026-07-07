// The authoritative eleven-phase turn resolver. spec: 01 §2.8
// (01-REQ-041..052, 01-REQ-062), win conditions per 01 §2.10
// (01-REQ-053..058), event schema per 01 §2.11 (01-REQ-052).
//
// Effect immutability (01-REQ-033) is satisfied structurally: no code path
// before Phase 9 writes `activeEffects` — Phase 6 writes `pendingEffects`
// only, and Phase 9 is the sole writer of `activeEffects` (01 §2.7
// correctness-critical invariant). All `invulnerabilityLevel`/collision reads
// therefore see start-of-turn values by construction.
import { advance, cellAt, fertileGroundEnabled } from "./board.js";
import { invulnerabilityLevel } from "./effects.js";
import { rngFromSeed, subSeed } from "./rng.js";
import type { Rng } from "./rng.js";
import type {
  Agent,
  Cell,
  CentaurTeamId,
  Direction,
  EffectFamily,
  GameOutcome,
  GameRuntimeConfig,
  GameState,
  ItemId,
  PotionEffect,
  SnakeId,
  StagedMove,
  TurnEvent,
  TurnNumber,
} from "./types.js";
import { CellType, ItemType } from "./types.js";

export interface TurnResolution {
  readonly nextState: GameState;
  readonly events: ReadonlyArray<TurnEvent>;
  readonly outcome: GameOutcome;
}

// Internal mutable working copies. Inputs are never mutated.
interface WorkSnake {
  readonly snakeId: SnakeId;
  readonly letter: string;
  readonly centaurTeamId: CentaurTeamId;
  body: Cell[];
  health: number;
  activeEffects: PotionEffect[];
  pendingEffects: PotionEffect[];
  lastDirection: Direction | null;
  alive: boolean;
  ateLastTurn: boolean;
}

interface WorkItem {
  readonly itemId: ItemId;
  readonly itemType: ItemType;
  readonly cell: Cell;
  consumed: boolean;
}

// spec: 01 §2.7 disruption buffer
interface DisruptionRecord {
  readonly snakeId: SnakeId;
  readonly cause:
    | "wall_death"
    | "self_death"
    | "body_collision_death"
    | "severed"
    | "severing_other"
    | "body_collision_received"
    | "head_to_head_death"
    | "hazard_entry"
    | "starvation";
}

interface PhasedEvent {
  readonly phase: number;
  readonly sortId: number; // primary subject snakeId; itemId-order for spawns
  readonly event: TurnEvent;
}

const cellKey = (c: Cell): number => c.y * 4096 + c.x;

/**
 * Resolve one complete turn.
 *
 * Deviation from the drafted signature (01 §3.8, documented decision): takes
 * `config: GameRuntimeConfig` as a fifth parameter. The drafted signature has
 * no config route, yet Phases 5/7/8/10 consume maxHealth, hazardDamage, spawn
 * rates, and maxTurns. `GameState` is kept purely dynamic per DOWNSTREAM
 * IMPACT note 8.
 *
 * `state.clocks` passes through untouched: the chess timer is driven by
 * module 04 between turns (01 §2.9), not by turn resolution.
 */
// spec: 01-REQ-041 — eleven phases in strict order.
export function resolveTurn(
  state: GameState,
  stagedMoves: ReadonlyMap<SnakeId, StagedMove>,
  turnNumber: TurnNumber,
  turnSeed: Uint8Array,
  config: GameRuntimeConfig,
): TurnResolution {
  const T = turnNumber;
  const snakes: WorkSnake[] = state.snakes.map((s) => ({
    snakeId: s.snakeId,
    letter: s.letter,
    centaurTeamId: s.centaurTeamId,
    body: [...s.body],
    health: s.health,
    activeEffects: [...s.activeEffects],
    pendingEffects: [...s.pendingEffects],
    lastDirection: s.lastDirection,
    alive: s.alive,
    ateLastTurn: s.ateLastTurn,
  }));
  // Ascending-snakeId iteration order makes every per-phase loop and every
  // rng draw deterministic (01-REQ-052 ordering, 01-REQ-060 reproducibility).
  snakes.sort((a, b) => a.snakeId - b.snakeId);
  const items: WorkItem[] = state.items.map((i) => ({ ...i }));
  const board = state.board;
  const alive = () => snakes.filter((s) => s.alive);
  const byId = new Map<SnakeId, WorkSnake>(snakes.map((s) => [s.snakeId, s]));

  const events: PhasedEvent[] = [];
  const disruptions: DisruptionRecord[] = [];

  // Roster and start-of-turn aliveness for Phase 10. Forfeit exclusion
  // (01-REQ-053a) happens upstream: the engine treats every team present in
  // `state.snakes` as competing.
  const roster: CentaurTeamId[] = [];
  for (const s of snakes) {
    if (!roster.includes(s.centaurTeamId)) roster.push(s.centaurTeamId);
  }
  const aliveTeamsAtStart = new Set(alive().map((s) => s.centaurTeamId));

  // ---------- Phase 1: Move Collection. spec: 01-REQ-042 ----------
  const rngP1 = rngFromSeed(subSeed(turnSeed, "phase-1-random"));
  const moves = new Map<SnakeId, { direction: Direction; stagedBy: Agent | null }>();
  for (const snake of alive()) {
    const staged = stagedMoves.get(snake.snakeId);
    if (staged !== undefined) {
      moves.set(snake.snakeId, { direction: staged.direction, stagedBy: staged.stagedBy });
    } else if (snake.lastDirection !== null) {
      // Used unconditionally even if lethal.
      moves.set(snake.snakeId, { direction: snake.lastDirection, stagedBy: null });
    } else {
      // Turn 0 with nothing staged: seeded uniform pick, not filtered for safety.
      moves.set(snake.snakeId, {
        direction: rngP1.pick([0, 1, 2, 3] as const) as Direction,
        stagedBy: null,
      });
    }
  }

  // ---------- Phase 2: Snake Movement. spec: 01-REQ-043 ----------
  for (const snake of alive()) {
    const move = moves.get(snake.snakeId);
    if (move === undefined) continue;
    const from = snake.body[0] as Cell;
    const newHead = advance(from, move.direction);
    const grew = snake.ateLastTurn;
    if (grew) {
      snake.body = [newHead, ...snake.body]; // retain tail → grow (01-REQ-062)
      snake.ateLastTurn = false;
    } else {
      snake.body = [newHead, ...snake.body.slice(0, -1)];
    }
    snake.lastDirection = move.direction;
    events.push({
      phase: 2,
      sortId: snake.snakeId,
      event: {
        kind: "snake_moved",
        snakeId: snake.snakeId,
        from,
        to: newHead,
        direction: move.direction,
        grew,
        stagedBy: move.stagedBy,
      },
    });
  }

  // ---------- Phase 3: Collision Detection. spec: 01-REQ-044 ----------
  // Single post-Phase-2 snapshot (resolved 01-REVIEW-002): heads, bodies and
  // lengths are captured once; deaths and severings accumulating within the
  // phase never remove segments from the reference state.
  const movers = alive();
  const heads = new Map<SnakeId, Cell>(movers.map((s) => [s.snakeId, s.body[0] as Cell]));
  const snapBodies = new Map<SnakeId, Cell[]>(movers.map((s) => [s.snakeId, [...s.body]]));
  const snapLength = new Map<SnakeId, number>(movers.map((s) => [s.snakeId, s.body.length]));
  const deadThisPhase = new Map<
    SnakeId,
    { cause: "wall" | "self_collision" | "body_collision" | "head_to_head"; killer: SnakeId | null }
  >();
  const die = (
    id: SnakeId,
    cause: "wall" | "self_collision" | "body_collision" | "head_to_head",
    killer: SnakeId | null,
    disruption: DisruptionRecord["cause"],
  ) => {
    if (deadThisPhase.has(id)) return; // one death per snake; first cause wins
    deadThisPhase.set(id, { cause, killer });
    disruptions.push({ snakeId: id, cause: disruption });
  };

  // 3a. Wall (044a) and self (044b) collisions.
  for (const snake of movers) {
    const head = heads.get(snake.snakeId) as Cell;
    if (cellAt(board, head) === CellType.Wall || cellAt(board, head) === undefined) {
      die(snake.snakeId, "wall", null, "wall_death");
      continue;
    }
    const body = snapBodies.get(snake.snakeId) as Cell[];
    if (body.slice(1).some((c) => c.x === head.x && c.y === head.y)) {
      die(snake.snakeId, "self_collision", null, "self_death");
    }
  }

  // 3b. Body collisions (044c) against the snapshot; severs applied after the
  // full pair scan so that snapshot indices stay valid.
  const pendingSevers = new Map<SnakeId, number>(); // victim → min contact index
  for (const attacker of movers) {
    const head = heads.get(attacker.snakeId) as Cell;
    for (const victim of movers) {
      if (victim.snakeId === attacker.snakeId) continue;
      const victimBody = snapBodies.get(victim.snakeId) as Cell[];
      let contactIndex = -1;
      for (let i = 1; i < victimBody.length; i++) {
        const seg = victimBody[i] as Cell;
        if (seg.x === head.x && seg.y === head.y) {
          contactIndex = i;
          break;
        }
      }
      if (contactIndex === -1) continue;
      // Start-of-turn levels (01-REQ-033): activeEffects are untouched so far.
      if (invulnerabilityLevel(attacker) > invulnerabilityLevel(victim)) {
        const prev = pendingSevers.get(victim.snakeId);
        pendingSevers.set(
          victim.snakeId,
          prev === undefined ? contactIndex : Math.min(prev, contactIndex),
        );
        const segmentsLost = victimBody.length - contactIndex;
        events.push({
          phase: 3,
          sortId: victim.snakeId,
          event: {
            kind: "snake_severed",
            attackerSnakeId: attacker.snakeId,
            victimSnakeId: victim.snakeId,
            contactCell: victimBody[contactIndex] as Cell,
            segmentsLost,
          },
        });
        disruptions.push({ snakeId: attacker.snakeId, cause: "severing_other" });
        disruptions.push({ snakeId: victim.snakeId, cause: "severed" });
      } else {
        die(attacker.snakeId, "body_collision", victim.snakeId, "body_collision_death");
        disruptions.push({ snakeId: victim.snakeId, cause: "body_collision_received" });
      }
    }
  }
  // 3c. Head-to-head (044d): tiers by start-of-turn level, then by
  // post-Phase-2 reference-state length — severs recorded in 3b are applied
  // only after 3c, per the reference-state resolution principle
  // (01 §2.8, resolved 01-REVIEW-021).
  const headGroups = new Map<number, WorkSnake[]>();
  for (const snake of movers) {
    const key = cellKey(heads.get(snake.snakeId) as Cell);
    const group = headGroups.get(key);
    if (group === undefined) headGroups.set(key, [snake]);
    else group.push(snake);
  }
  for (const group of headGroups.values()) {
    if (group.length < 2) continue;
    const maxLvl = Math.max(...group.map((s) => invulnerabilityLevel(s)));
    const topTier = group.filter((s) => invulnerabilityLevel(s) === maxLvl);
    const losers = new Set<SnakeId>(
      group.filter((s) => invulnerabilityLevel(s) < maxLvl).map((s) => s.snakeId),
    );
    const maxLen = Math.max(...topTier.map((s) => snapLength.get(s.snakeId) as number));
    const atMax = topTier.filter((s) => (snapLength.get(s.snakeId) as number) === maxLen);
    if (atMax.length >= 2) {
      for (const s of topTier) losers.add(s.snakeId); // length tie kills the whole tier
    } else {
      for (const s of topTier) {
        if (s !== atMax[0]) losers.add(s.snakeId);
      }
    }
    const survivors = group.filter((s) => !losers.has(s.snakeId));
    const killer = survivors.length === 1 ? (survivors[0] as WorkSnake).snakeId : null;
    for (const s of group) {
      if (losers.has(s.snakeId)) die(s.snakeId, "head_to_head", killer, "head_to_head_death");
    }
  }

  // Apply severing outcomes now that every Phase-3 outcome is determined
  // (min contact index per victim). spec: 01-REQ-044c, 01-REVIEW-021
  for (const [victimId, contactIndex] of pendingSevers) {
    const victim = byId.get(victimId) as WorkSnake;
    victim.body = victim.body.slice(0, contactIndex);
  }

  // Mark deaths and emit snake_died events.
  for (const snake of snakes) {
    const death = deadThisPhase.get(snake.snakeId);
    if (death === undefined) continue;
    snake.alive = false;
    events.push({
      phase: 3,
      sortId: snake.snakeId,
      event: {
        kind: "snake_died",
        snakeId: snake.snakeId,
        cause: death.cause,
        killerSnakeId: death.killer,
        location: heads.get(snake.snakeId) as Cell,
      },
    });
  }

  // ---------- Phase 4: Pending Effect Recording. spec: 01-REQ-045 ----------
  // Intentionally a no-op phase boundary: the disruption buffer already holds
  // every Phase-3 disruption; cancellation scope is computed in Phase 9a
  // (DOWNSTREAM IMPACT note 7).

  // ---------- Phase 5: Health, Hazards, Food. spec: 01-REQ-046 ----------
  const enteredHazard = new Set<SnakeId>();
  for (const snake of alive()) {
    snake.health -= 1; // 5a: unconditional tick (046a)
    const head = snake.body[0] as Cell;
    if (cellAt(board, head) === CellType.Hazard) {
      // 5b (046b): damage + disruption
      snake.health -= config.hazardDamage;
      enteredHazard.add(snake.snakeId);
      disruptions.push({ snakeId: snake.snakeId, cause: "hazard_entry" });
    }
    const food = items.find(
      (i) =>
        !i.consumed && i.itemType === ItemType.Food && i.cell.x === head.x && i.cell.y === head.y,
    );
    if (food !== undefined) {
      // 5c (046c, 01-REQ-025): heal after tick/hazard; eating is not a disruption
      food.consumed = true;
      const healthRestored = config.maxHealth - snake.health;
      snake.health = config.maxHealth;
      snake.ateLastTurn = true;
      events.push({
        phase: 5,
        sortId: snake.snakeId,
        event: { kind: "food_eaten", snakeId: snake.snakeId, cell: head, healthRestored },
      });
    }
  }
  for (const snake of alive()) {
    // 5d (046d): starvation after ALL Phase-5 health modifications
    if (snake.health <= 0) {
      snake.alive = false;
      disruptions.push({ snakeId: snake.snakeId, cause: "starvation" });
      events.push({
        phase: 5,
        sortId: snake.snakeId,
        event: {
          kind: "snake_died",
          snakeId: snake.snakeId,
          // Cause attribution: hazard if a hazard entry contributed this turn.
          cause: enteredHazard.has(snake.snakeId) ? "hazard" : "starvation",
          killerSnakeId: null,
          location: snake.body[0] as Cell,
        },
      });
    }
  }

  // ---------- Phase 6: Potion Collection. spec: 01-REQ-047, 026, 027 ----------
  // Collect-and-aggregate: (team, family) → collector set, then one coherent
  // team rebuild per pair via pendingEffects.
  const collectorsByTeamFamily = new Map<
    string,
    { team: CentaurTeamId; family: EffectFamily; collectorIds: Set<SnakeId> }
  >();
  for (const snake of alive()) {
    const head = snake.body[0] as Cell;
    const potion = items.find(
      (i) =>
        !i.consumed &&
        (i.itemType === ItemType.InvulnPotion || i.itemType === ItemType.InvisPotion) &&
        i.cell.x === head.x &&
        i.cell.y === head.y,
    );
    if (potion === undefined || potion.itemType === ItemType.Food) continue;
    potion.consumed = true;
    const family: EffectFamily =
      potion.itemType === ItemType.InvulnPotion ? "invulnerability" : "invisibility";
    const key = `${snake.centaurTeamId} ${family}`;
    let entry = collectorsByTeamFamily.get(key);
    if (entry === undefined) {
      entry = { team: snake.centaurTeamId, family, collectorIds: new Set() };
      collectorsByTeamFamily.set(key, entry);
    }
    entry.collectorIds.add(snake.snakeId);
    events.push({
      phase: 6,
      sortId: snake.snakeId,
      event: {
        kind: "potion_collected",
        snakeId: snake.snakeId,
        cell: head,
        potionType: potion.itemType,
        affectedTeammateIds: alive()
          .filter((s) => s.centaurTeamId === snake.centaurTeamId && s.snakeId !== snake.snakeId)
          .map((s) => s.snakeId),
      },
    });
  }
  for (const { team, family, collectorIds } of collectorsByTeamFamily.values()) {
    const expiryTurn = (T + 3) as TurnNumber;
    for (const mate of alive()) {
      if (mate.centaurTeamId !== team) continue;
      mate.pendingEffects = mate.pendingEffects.filter((e) => e.family !== family);
      mate.pendingEffects.push({
        family,
        state: collectorIds.has(mate.snakeId) ? "debuff" : "buff",
        expiryTurn,
      });
    }
  }

  // ---------- Phase 7: Food Spawning. spec: 01-REQ-048 ----------
  let nextItemId = items.reduce((max, i) => Math.max(max, i.itemId), -1) + 1;
  const restrictFoodToFertile = fertileGroundEnabled(board);
  const eligibleSpawnCells = (fertileOnly: boolean): Cell[] => {
    const occupied = new Set<number>();
    for (const snake of alive()) {
      for (const seg of snake.body) occupied.add(cellKey(seg));
    }
    for (const item of items) {
      if (!item.consumed) occupied.add(cellKey(item.cell));
    }
    const cells: Cell[] = [];
    for (let y = 1; y < board.boardSize - 1; y++) {
      for (let x = 1; x < board.boardSize - 1; x++) {
        const type = board.cells[y * board.boardSize + x];
        if (type === CellType.Wall || type === CellType.Hazard) continue;
        if (fertileOnly && type !== CellType.Fertile) continue;
        if (occupied.has(cellKey({ x, y }))) continue;
        cells.push({ x, y });
      }
    }
    return cells; // row-major deterministic order
  };
  const spawnItems = (
    itemType: typeof ItemType.Food | typeof ItemType.InvulnPotion | typeof ItemType.InvisPotion,
    rate: number,
    rng: Rng,
    eligible: Cell[],
  ): void => {
    let count = Math.floor(rate);
    const frac = rate - count;
    if (frac > 0 && rng.nextFloat() < frac) count += 1;
    if (count <= 0) return;
    rng.shuffle(eligible);
    for (const cell of eligible.slice(0, count)) {
      const itemId = nextItemId++ as ItemId;
      items.push({ itemId, itemType, cell, consumed: false });
      events.push({
        phase: itemType === ItemType.Food ? 7 : 8,
        sortId: itemId,
        event:
          itemType === ItemType.Food
            ? { kind: "food_spawned", itemId, cell }
            : { kind: "potion_spawned", itemId, cell, potionType: itemType },
      });
    }
  };
  const rngP7 = rngFromSeed(subSeed(turnSeed, "phase-7-food"));
  spawnItems(ItemType.Food, config.foodSpawnRate, rngP7, eligibleSpawnCells(restrictFoodToFertile));

  // ---------- Phase 8: Potion Spawning. spec: 01-REQ-049 ----------
  // Potion eligibility uses the base criteria without the fertile restriction:
  // 01-REQ-012 and §2.8's separate eligiblePotionCells() scope the
  // fertile-only rule to food (documented decision; see DECISIONS.md).
  const rngP8 = rngFromSeed(subSeed(turnSeed, "phase-8-potions"));
  spawnItems(ItemType.InvulnPotion, config.invulnPotionSpawnRate, rngP8, eligibleSpawnCells(false));
  spawnItems(ItemType.InvisPotion, config.invisPotionSpawnRate, rngP8, eligibleSpawnCells(false));

  // ---------- Phase 9: Effect Application and Expiry. spec: 01-REQ-050 ----------
  // Order: cancel (9a) → apply pending rebuilds (9b) → expire (9c).

  // 9a. Team-wide, family-scoped cancellation for disrupted debuff-holders
  // (01-REQ-031). Collector identification reads activeEffects, still equal
  // to start-of-turn state here. Removes ACTIVE effects only — pending
  // rebuilds scheduled this turn survive and apply in 9b, so a same-turn
  // re-collection supersedes the cancellation (01-REQ-031, resolved
  // 01-REVIEW-020).
  const cancelledTeamFamilies = new Set<string>();
  const cancelPairs: Array<{ team: CentaurTeamId; family: EffectFamily }> = [];
  for (const d of disruptions) {
    const snake = byId.get(d.snakeId) as WorkSnake;
    for (const e of snake.activeEffects) {
      if (e.state === "debuff") {
        const key = `${snake.centaurTeamId} ${e.family}`;
        if (!cancelledTeamFamilies.has(key)) {
          cancelledTeamFamilies.add(key);
          cancelPairs.push({ team: snake.centaurTeamId, family: e.family });
        }
      }
    }
  }
  for (const { team, family } of cancelPairs) {
    for (const mate of snakes) {
      if (!mate.alive || mate.centaurTeamId !== team) continue;
      if (mate.activeEffects.some((e) => e.family === family)) {
        mate.activeEffects = mate.activeEffects.filter((e) => e.family !== family);
        events.push({
          phase: 9,
          sortId: mate.snakeId,
          event: {
            kind: "effect_cancelled",
            snakeId: mate.snakeId,
            family,
            reason: "collector_disruption",
          },
        });
      }
    }
  }

  // 9b. Apply pending rebuilds with replace-semantics.
  for (const snake of snakes) {
    for (const pe of snake.pendingEffects) {
      if (snake.activeEffects.some((e) => e.family === pe.family)) {
        snake.activeEffects = snake.activeEffects.filter((e) => e.family !== pe.family);
        events.push({
          phase: 9,
          sortId: snake.snakeId,
          event: {
            kind: "effect_cancelled",
            snakeId: snake.snakeId,
            family: pe.family,
            reason: "replaced",
          },
        });
      }
      snake.activeEffects.push(pe);
      events.push({
        phase: 9,
        sortId: snake.snakeId,
        event: {
          kind: "effect_applied",
          snakeId: snake.snakeId,
          family: pe.family,
          state: pe.state,
          expiryTurn: pe.expiryTurn,
        },
      });
    }
    snake.pendingEffects = [];
  }

  // 9c. Expire effects whose last-active turn has been reached
  // (currentTurn >= expiryTurn; resolved 01-REVIEW-003).
  for (const snake of snakes) {
    const expired = snake.activeEffects.filter((e) => T >= e.expiryTurn);
    if (expired.length === 0) continue;
    snake.activeEffects = snake.activeEffects.filter((e) => T < e.expiryTurn);
    for (const e of expired) {
      events.push({
        phase: 9,
        sortId: snake.snakeId,
        event: {
          kind: "effect_cancelled",
          snakeId: snake.snakeId,
          family: e.family,
          reason: "expiry",
        },
      });
    }
  }

  // ---------- Phase 10: Win Condition Check. spec: 01-REQ-051, §2.10 ----------
  const outcome = checkWinConditions(snakes, roster, aliveTeamsAtStart, T, config);

  // ---------- Phase 11: Event Emission. spec: 01-REQ-052 ----------
  // Deterministic ordering: phase ascending, then primary subject snakeId
  // ascending, insertion order as the stable tie-break.
  const ordered = events
    .map((e, i) => ({ ...e, seq: i }))
    .sort((a, b) => a.phase - b.phase || a.sortId - b.sortId || a.seq - b.seq)
    .map((e) => e.event);

  const nextState: GameState = {
    board,
    snakes: snakes.map((s) => ({
      snakeId: s.snakeId,
      letter: s.letter,
      centaurTeamId: s.centaurTeamId,
      body: s.body,
      health: s.health,
      activeEffects: s.activeEffects,
      pendingEffects: s.pendingEffects,
      lastDirection: s.lastDirection,
      alive: s.alive,
      ateLastTurn: s.ateLastTurn,
    })),
    items,
    clocks: state.clocks,
  };
  return { nextState, events: ordered, outcome };
}

// spec: 01 §2.10 (01-REQ-053..058)
function checkWinConditions(
  snakes: ReadonlyArray<WorkSnake>,
  roster: ReadonlyArray<CentaurTeamId>,
  aliveTeamsAtStart: ReadonlySet<CentaurTeamId>,
  T: TurnNumber,
  config: GameRuntimeConfig,
): GameOutcome {
  const n = roster.length;
  if (n === 0) {
    // All-forfeit degenerate case (01-REQ-053a) — unreachable through
    // resolveTurn with snakes present; kept for arithmetic completeness.
    return { kind: "draw", tiedCentaurTeamIds: [], scores: new Map() };
  }
  const aggregateLength = new Map<CentaurTeamId, number>(roster.map((t) => [t, 0]));
  const aliveTeams: CentaurTeamId[] = [];
  for (const team of roster) {
    let sum = 0;
    let anyAlive = false;
    for (const s of snakes) {
      if (s.centaurTeamId === team && s.alive) {
        sum += s.body.length;
        anyAlive = true;
      }
    }
    aggregateLength.set(team, sum);
    if (anyAlive) aliveTeams.push(team);
  }

  if (aliveTeams.length === 0) {
    // Simultaneous elimination (01-REQ-055, 01-REQ-056): teams alive at the
    // start of this turn score par 1.0; earlier-eliminated teams score 0.
    const scores = new Map<CentaurTeamId, number>(
      roster.map((t) => [t, aliveTeamsAtStart.has(t) ? 1.0 : 0.0]),
    );
    return winnerOrDraw(roster, scores);
  }

  if (aliveTeams.length === 1) {
    // Last team standing (01-REQ-054)
    const winner = aliveTeams[0] as CentaurTeamId;
    const scores = new Map<CentaurTeamId, number>(
      roster.map((t) => [t, t === winner ? 1.0 * n : 0.0]),
    );
    return { kind: "victory", winnerCentaurTeamId: winner, scores };
  }

  if (config.maxTurns > 0 && T === config.maxTurns - 1) {
    // Turn limit (01-REQ-057, 01-REQ-053): normalised body-share × team count
    const totalAliveSegments = aliveTeams.reduce(
      (sum, t) => sum + (aggregateLength.get(t) as number),
      0,
    );
    const scores = new Map<CentaurTeamId, number>(
      roster.map((t) => {
        if (!aliveTeams.includes(t) || totalAliveSegments === 0) return [t, 0.0];
        return [t, ((aggregateLength.get(t) as number) / totalAliveSegments) * n];
      }),
    );
    return winnerOrDraw(roster, scores);
  }

  return { kind: "in_progress" }; // 01-REQ-058
}

function winnerOrDraw(
  roster: ReadonlyArray<CentaurTeamId>,
  scores: ReadonlyMap<CentaurTeamId, number>,
): GameOutcome {
  let max = Number.NEGATIVE_INFINITY;
  for (const team of roster) {
    const s = scores.get(team) as number;
    if (s > max) max = s;
  }
  const top = roster.filter((t) => scores.get(t) === max);
  if (top.length === 1) {
    return { kind: "victory", winnerCentaurTeamId: top[0] as CentaurTeamId, scores };
  }
  return { kind: "draw", tiedCentaurTeamIds: top, scores };
}
