// The authoritative turn resolver. spec: 01 §2.8 — staged model:
// snapshot → move projection → head-to-head precedence → parallel
// interaction rules → derived rules → deterministic commit → spawning →
// win check → event derivation (01-REQ-041..052, 01-REQ-062).
//
// Reference-state resolution principle (01 §2.8, resolved 01-REVIEW-021/022):
// every interaction rule below is a pure function of the snapshot `S`, the
// surviving moved-head set `H*`, and the turn seed. Rules only append to the
// turn's claim sets; the commit is the sole writer of game state, so rule
// evaluation order is immaterial. A new mechanic is a new rule emitting
// claims (plus, for a new claim type, one clause in the commit).
import { advance, cellAt, fertileGroundEnabled } from "./board.js";
import { invulnerabilityLevel } from "./effects.js";
import type { Rng } from "./rng.js";
import { rngFromSeed, subSeed } from "./rng.js";
import type {
  Agent,
  Cell,
  CentaurTeamId,
  DamageSource,
  DeathCause,
  Direction,
  EffectFamily,
  GameOutcome,
  GameRuntimeConfig,
  GameState,
  ItemId,
  PotionEffect,
  SnakeId,
  SnakeState,
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
  lastDirection: Direction | null;
  alive: boolean;
}

interface WorkItem {
  readonly itemId: ItemId;
  readonly itemType: ItemType;
  readonly cell: Cell;
  consumed: boolean;
}

// spec: 01 §2.7 disruption claims — read by the derived cancellation rule.
type DisruptionCause =
  | "wall_death"
  | "self_death"
  | "body_collision_death"
  | "severed"
  | "severing_other"
  | "body_collision_received"
  | "head_to_head_death"
  | "hazard_entry"
  | "health_depletion";

interface CertainDeathClaim {
  readonly cause: Exclude<DeathCause, "health_depletion">;
  readonly killer: SnakeId | null;
}

interface DamageClaim {
  readonly amount: number;
  readonly source: DamageSource;
}

// spec: 01 §2.11 — canonical event-class order for the derived event set.
const EVENT_CLASS: Record<TurnEvent["kind"], number> = {
  snake_moved: 1,
  snake_died: 2,
  snake_severed: 3,
  food_eaten: 4,
  potion_collected: 5,
  food_spawned: 6,
  potion_spawned: 7,
  effect_applied: 8,
  effect_cancelled: 9,
};

// spec: 01 §2.11 — death-cause precedence when multiple claims target one snake.
const CAUSE_PRECEDENCE: ReadonlyArray<CertainDeathClaim["cause"]> = [
  "head_to_head",
  "wall",
  "self_collision",
  "body_collision",
];

const cellKey = (c: Cell): number => c.y * 4096 + c.x;

/**
 * Resolve one complete turn.
 *
 * `config` is the runtime half of the game configuration (documented
 * deviation from the drafted 01 §3.8 signature — see DECISIONS.md B1).
 * `state.clocks` passes through untouched: the chess timer is driven by
 * module 04 between turns (01 §2.9).
 */
// spec: 01-REQ-041 — staged resolution, commit as sole writer.
export function resolveTurn(
  state: GameState,
  stagedMoves: ReadonlyMap<SnakeId, StagedMove>,
  turnNumber: TurnNumber,
  turnSeed: Uint8Array,
  config: GameRuntimeConfig,
): TurnResolution {
  const T = turnNumber;
  // `snakes` are working copies; their activeEffects/health/body/alive equal
  // the snapshot values until the commit writes them (01-REQ-033).
  const snakes: WorkSnake[] = state.snakes.map((s) => ({
    snakeId: s.snakeId,
    letter: s.letter,
    centaurTeamId: s.centaurTeamId,
    body: [...s.body],
    health: s.health,
    activeEffects: [...s.activeEffects],
    lastDirection: s.lastDirection,
    alive: s.alive,
  }));
  snakes.sort((a, b) => a.snakeId - b.snakeId); // deterministic iteration
  const items: WorkItem[] = state.items.map((i) => ({ ...i }));
  const board = state.board;
  const byId = new Map<SnakeId, WorkSnake>(snakes.map((s) => [s.snakeId, s]));
  const aliveInS = snakes.filter((s) => s.alive);

  // Roster and start-of-turn aliveness for the win check. Forfeit exclusion
  // (01-REQ-053a) happens upstream.
  const roster: CentaurTeamId[] = [];
  for (const s of snakes) {
    if (!roster.includes(s.centaurTeamId)) roster.push(s.centaurTeamId);
  }
  const aliveTeamsAtStart = new Set(aliveInS.map((s) => s.centaurTeamId));

  // ---------- Stage 1: Move Projection. spec: 01-REQ-042, 01-REQ-043 ----------
  const rngMove = rngFromSeed(subSeed(turnSeed, "phase-1-random"));
  const direction = new Map<SnakeId, Direction>();
  const stagedByOf = new Map<SnakeId, Agent | null>();
  const movedHead = new Map<SnakeId, Cell>();
  const movedBody = new Map<SnakeId, Cell[]>();
  for (const snake of aliveInS) {
    const staged = stagedMoves.get(snake.snakeId);
    let dir: Direction;
    let stagedBy: Agent | null;
    if (staged !== undefined) {
      dir = staged.direction;
      stagedBy = staged.stagedBy;
    } else if (snake.lastDirection !== null) {
      dir = snake.lastDirection; // used unconditionally, even if lethal
      stagedBy = null;
    } else {
      // Turn 0 with nothing staged: seeded uniform pick, not safety-filtered.
      dir = rngMove.pick([0, 1, 2, 3] as const) as Direction;
      stagedBy = null;
    }
    direction.set(snake.snakeId, dir);
    stagedByOf.set(snake.snakeId, stagedBy);
    const head = snake.body[0] as Cell;
    movedHead.set(snake.snakeId, advance(head, dir));
    // Unconditional advance-and-drop-tail; growth is a duplicated tail
    // segment applied at commit (01-REQ-062), never a movement branch.
    movedBody.set(snake.snakeId, [advance(head, dir), ...snake.body.slice(0, -1)]);
  }

  // The turn's claim sets. Rules below only ever add to these.
  const certainDeaths = new Map<SnakeId, CertainDeathClaim[]>();
  const damages = new Map<SnakeId, DamageClaim[]>();
  const heals = new Set<SnakeId>();
  const grows = new Set<SnakeId>();
  const severs = new Map<SnakeId, number>(); // victim → min contact index
  const severEvents: Array<Extract<TurnEvent, { kind: "snake_severed" }>> = [];
  const disruptions: Array<{ snakeId: SnakeId; cause: DisruptionCause }> = [];
  const collectorsByTeamFamily = new Map<
    string,
    { team: CentaurTeamId; family: EffectFamily; collectorIds: Set<SnakeId> }
  >();
  const foodEatenCells = new Map<SnakeId, Cell>();
  const potionEvents: Array<{ snakeId: SnakeId; cell: Cell; potionType: ItemType }> = [];
  const claimDeath = (id: SnakeId, claim: CertainDeathClaim, disruption: DisruptionCause) => {
    const list = certainDeaths.get(id);
    if (list === undefined) certainDeaths.set(id, [claim]);
    else list.push(claim);
    disruptions.push({ snakeId: id, cause: disruption });
  };
  const claimDamage = (id: SnakeId, amount: number, source: DamageSource) => {
    const list = damages.get(id);
    if (list === undefined) damages.set(id, [{ amount, source }]);
    else list.push({ amount, source });
  };

  // ---------- Stage 2: Head-to-Head Precedence. spec: 01-REQ-044d ----------
  // Levels and lengths are snapshot reads; losers' heads are withdrawn from
  // the surviving moved-head set consumed by every other rule.
  const headGroups = new Map<number, WorkSnake[]>();
  for (const snake of aliveInS) {
    const key = cellKey(movedHead.get(snake.snakeId) as Cell);
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
      claimDeath(
        s.snakeId,
        { cause: "head_to_head", killer: survivor?.snakeId ?? null },
        "head_to_head_death",
      );
    }
  }
  // Surviving moved-head set H* (01-REQ-044d): heads that lost a head-to-head
  // are withdrawn; the losers' bodies remain on the logical board.
  const survivingHeads = aliveInS.filter(
    (s) => !(certainDeaths.get(s.snakeId) ?? []).some((c) => c.cause === "head_to_head"),
  );

  // ---------- Stage 3: Interaction Rules over (S, H*) — order-free ----------

  // Wall rule. spec: 01-REQ-044a
  for (const snake of survivingHeads) {
    const head = movedHead.get(snake.snakeId) as Cell;
    const type = cellAt(board, head);
    if (type === CellType.Wall || type === undefined) {
      claimDeath(snake.snakeId, { cause: "wall", killer: null }, "wall_death");
    }
  }

  // Self-collision rule. spec: 01-REQ-044b
  for (const snake of survivingHeads) {
    const head = movedHead.get(snake.snakeId) as Cell;
    const body = movedBody.get(snake.snakeId) as Cell[];
    if (body.slice(1).some((c) => c.x === head.x && c.y === head.y)) {
      claimDeath(snake.snakeId, { cause: "self_collision", killer: null }, "self_death");
    }
  }

  // Body-collision rule. spec: 01-REQ-044c — victims include head-to-head
  // losers (their bodies stay on the logical board); severs are recorded as
  // claims and applied at commit, so no rule observes a severed body.
  for (const attacker of survivingHeads) {
    const head = movedHead.get(attacker.snakeId) as Cell;
    for (const victim of aliveInS) {
      if (victim.snakeId === attacker.snakeId) continue;
      const victimBody = movedBody.get(victim.snakeId) as Cell[];
      let contactIndex = -1;
      for (let i = 1; i < victimBody.length; i++) {
        const seg = victimBody[i] as Cell;
        if (seg.x === head.x && seg.y === head.y) {
          contactIndex = i;
          break;
        }
      }
      if (contactIndex === -1) continue;
      // Snapshot invulnerability levels (01-REQ-033).
      if (invulnerabilityLevel(attacker) > invulnerabilityLevel(victim)) {
        const prev = severs.get(victim.snakeId);
        severs.set(
          victim.snakeId,
          prev === undefined ? contactIndex : Math.min(prev, contactIndex),
        );
        severEvents.push({
          kind: "snake_severed",
          attackerSnakeId: attacker.snakeId,
          victimSnakeId: victim.snakeId,
          contactCell: victimBody[contactIndex] as Cell,
          segmentsLost: victimBody.length - contactIndex,
        });
        disruptions.push({ snakeId: attacker.snakeId, cause: "severing_other" });
        disruptions.push({ snakeId: victim.snakeId, cause: "severed" });
      } else {
        claimDeath(
          attacker.snakeId,
          { cause: "body_collision", killer: victim.snakeId },
          "body_collision_death",
        );
        disruptions.push({ snakeId: victim.snakeId, cause: "body_collision_received" });
      }
    }
  }

  // Hazard rule. spec: 01-REQ-046b
  for (const snake of survivingHeads) {
    const head = movedHead.get(snake.snakeId) as Cell;
    if (cellAt(board, head) === CellType.Hazard) {
      claimDamage(snake.snakeId, config.hazardDamage, "hazard");
      disruptions.push({ snakeId: snake.snakeId, cause: "hazard_entry" });
    }
  }

  // Health-tick rule. spec: 01-REQ-046a
  for (const snake of aliveInS) {
    claimDamage(snake.snakeId, 1, "tick");
  }

  // Food rule. spec: 01-REQ-046c — unique entrancy guaranteed by stage 2.
  // Death by any non-head-to-head cause does not gate collection (01-REVIEW-022).
  for (const snake of survivingHeads) {
    const head = movedHead.get(snake.snakeId) as Cell;
    const food = items.find(
      (i) =>
        !i.consumed && i.itemType === ItemType.Food && i.cell.x === head.x && i.cell.y === head.y,
    );
    if (food === undefined) continue;
    food.consumed = true;
    heals.add(snake.snakeId);
    grows.add(snake.snakeId);
    foodEatenCells.set(snake.snakeId, head);
  }

  // Potion rule. spec: 01-REQ-047 — aggregate to one rebuild claim per
  // (team, family); sacrificial collection stands (01-REVIEW-022).
  for (const snake of survivingHeads) {
    const head = movedHead.get(snake.snakeId) as Cell;
    const potion = items.find(
      (i) =>
        !i.consumed &&
        (i.itemType === ItemType.InvulnPotion || i.itemType === ItemType.InvisPotion) &&
        i.cell.x === head.x &&
        i.cell.y === head.y,
    );
    if (potion === undefined) continue;
    potion.consumed = true;
    const family: EffectFamily =
      potion.itemType === ItemType.InvulnPotion ? "invulnerability" : "invisibility";
    const key = `${snake.centaurTeamId} ${family}`;
    let entry = collectorsByTeamFamily.get(key);
    if (entry === undefined) {
      entry = { team: snake.centaurTeamId, family, collectorIds: new Set() };
      collectorsByTeamFamily.set(key, entry);
    }
    entry.collectorIds.add(snake.snakeId);
    potionEvents.push({ snakeId: snake.snakeId, cell: head, potionType: potion.itemType });
  }

  // ---------- Stage 4: Derived Rules ----------

  // Health resolution. spec: 01-REQ-046d — pure function of S and the claims.
  const resolvedHealth = new Map<SnakeId, number>();
  for (const snake of aliveInS) {
    const total = (damages.get(snake.snakeId) ?? []).reduce((sum, d) => sum + d.amount, 0);
    resolvedHealth.set(
      snake.snakeId,
      heals.has(snake.snakeId) ? config.maxHealth : snake.health - total,
    );
  }
  const healthDeaths = new Map<SnakeId, DamageSource[]>();
  for (const snake of aliveInS) {
    if ((resolvedHealth.get(snake.snakeId) as number) > 0) continue;
    if (certainDeaths.has(snake.snakeId)) continue; // certain-death cause reported instead
    const sources = [...new Set((damages.get(snake.snakeId) ?? []).map((d) => d.source))];
    healthDeaths.set(snake.snakeId, sources);
    disruptions.push({ snakeId: snake.snakeId, cause: "health_depletion" });
  }

  // Cancellation rule. spec: 01-REQ-045, 01-REQ-031 — snapshot debuff-holders
  // only, so a collector is disruptable only from the turn after its debuff
  // committed; rebuild claims from this turn are unaffected (supersede rule).
  const cancelledKeys = new Set<string>();
  const cancelPairs: Array<{ team: CentaurTeamId; family: EffectFamily }> = [];
  for (const d of disruptions) {
    const snake = byId.get(d.snakeId) as WorkSnake;
    for (const e of snake.activeEffects) {
      if (e.state !== "debuff") continue;
      const key = `${snake.centaurTeamId} ${e.family}`;
      if (!cancelledKeys.has(key)) {
        cancelledKeys.add(key);
        cancelPairs.push({ team: snake.centaurTeamId, family: e.family });
      }
    }
  }

  // ---------- Stage 5: Commit — sole writer, fixed internal order ----------
  const events: Array<{ event: TurnEvent; sortId: number }> = [];
  const emit = (event: TurnEvent, sortId: number) => events.push({ event, sortId });

  for (const snake of aliveInS) {
    const id = snake.snakeId;
    emit(
      {
        kind: "snake_moved",
        snakeId: id,
        from: snake.body[0] as Cell,
        to: movedHead.get(id) as Cell,
        direction: direction.get(id) as Direction,
        stagedBy: stagedByOf.get(id) ?? null,
      },
      id,
    );
    snake.health = resolvedHealth.get(id) as number;
    snake.lastDirection = direction.get(id) as Direction;
    // Body: move → sever (min contact index) → grow (duplicate final tail).
    let body = movedBody.get(id) as Cell[];
    const severAt = severs.get(id);
    if (severAt !== undefined) body = body.slice(0, severAt);
    if (grows.has(id)) body = [...body, body[body.length - 1] as Cell];
    snake.body = body;
    // Deaths: certain-death claims ∪ fatal health resolution.
    const deathClaims = certainDeaths.get(id);
    const healthDeath = healthDeaths.get(id);
    if (deathClaims !== undefined) {
      snake.alive = false;
      const cause = CAUSE_PRECEDENCE.find((c) => deathClaims.some((d) => d.cause === c));
      const claim = deathClaims.find((d) => d.cause === cause) as CertainDeathClaim;
      emit(
        {
          kind: "snake_died",
          snakeId: id,
          cause: claim.cause,
          killerSnakeId: claim.killer,
          location: movedHead.get(id) as Cell,
        },
        id,
      );
    } else if (healthDeath !== undefined) {
      snake.alive = false;
      emit(
        {
          kind: "snake_died",
          snakeId: id,
          cause: "health_depletion",
          killerSnakeId: null,
          location: movedHead.get(id) as Cell,
          sources: healthDeath,
        },
        id,
      );
    }
  }
  for (const e of severEvents) emit(e, e.victimSnakeId);
  for (const [id, cell] of foodEatenCells) {
    const snake = byId.get(id) as WorkSnake;
    // MaxHealth minus what the snake would have resolved to without the heal.
    const total = (damages.get(id) ?? []).reduce((sum, d) => sum + d.amount, 0);
    const withoutHeal = (state.snakes.find((s) => s.snakeId === id) as SnakeState).health - total;
    emit({ kind: "food_eaten", snakeId: id, cell, healthRestored: snake.health - withoutHeal }, id);
  }

  // Effect resolution: cancel → rebuild (replace-semantics) → expire.
  // spec: 01-REQ-050
  for (const { team, family } of cancelPairs) {
    for (const mate of snakes) {
      if (!mate.alive || mate.centaurTeamId !== team) continue;
      if (mate.activeEffects.some((e) => e.family === family)) {
        mate.activeEffects = mate.activeEffects.filter((e) => e.family !== family);
        emit(
          {
            kind: "effect_cancelled",
            snakeId: mate.snakeId,
            family,
            reason: "collector_disruption",
          },
          mate.snakeId,
        );
      }
    }
  }
  for (const { team, family, collectorIds } of collectorsByTeamFamily.values()) {
    const expiryTurn = (T + 3) as TurnNumber;
    for (const member of snakes) {
      if (member.centaurTeamId !== team) continue;
      const isCollector = collectorIds.has(member.snakeId);
      // Collectors keep their debuff even if dead at commit — the
      // uncancellable-window reward for sacrificial collection
      // (01-REQ-047, resolved 01-REVIEW-022). Non-collectors must be alive.
      if (!isCollector && !member.alive) continue;
      if (member.activeEffects.some((e) => e.family === family)) {
        member.activeEffects = member.activeEffects.filter((e) => e.family !== family);
        emit(
          { kind: "effect_cancelled", snakeId: member.snakeId, family, reason: "replaced" },
          member.snakeId,
        );
      }
      const effect: PotionEffect = {
        family,
        state: isCollector ? "debuff" : "buff",
        expiryTurn,
      };
      member.activeEffects.push(effect);
      emit(
        {
          kind: "effect_applied",
          snakeId: member.snakeId,
          family,
          state: effect.state,
          expiryTurn,
        },
        member.snakeId,
      );
    }
    // potion_collected events carry the teammates that received rebuild
    // entries, excluding the collecting snake itself.
    for (const pe of potionEvents) {
      const collector = byId.get(pe.snakeId) as WorkSnake;
      if (collector.centaurTeamId !== team) continue;
      const potionFamily: EffectFamily =
        pe.potionType === ItemType.InvulnPotion ? "invulnerability" : "invisibility";
      if (potionFamily !== family) continue;
      emit(
        {
          kind: "potion_collected",
          snakeId: pe.snakeId,
          cell: pe.cell,
          potionType: pe.potionType as typeof ItemType.InvulnPotion | typeof ItemType.InvisPotion,
          affectedTeammateIds: snakes
            .filter(
              (s) =>
                s.centaurTeamId === team &&
                s.snakeId !== pe.snakeId &&
                (collectorIds.has(s.snakeId) || s.alive),
            )
            .map((s) => s.snakeId),
        },
        pe.snakeId,
      );
    }
  }
  for (const snake of snakes) {
    const expired = snake.activeEffects.filter((e) => T >= e.expiryTurn);
    if (expired.length === 0) continue;
    snake.activeEffects = snake.activeEffects.filter((e) => T < e.expiryTurn);
    for (const e of expired) {
      emit(
        { kind: "effect_cancelled", snakeId: snake.snakeId, family: e.family, reason: "expiry" },
        snake.snakeId,
      );
    }
  }

  // ---------- Stage 6: Item Spawning. spec: 01-REQ-048, 01-REQ-049 ----------
  let nextItemId = items.reduce((max, i) => Math.max(max, i.itemId), -1) + 1;
  const eligibleSpawnCells = (fertileOnly: boolean): Cell[] => {
    const occupied = new Set<number>();
    for (const snake of snakes) {
      if (!snake.alive) continue;
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
      emit(
        itemType === ItemType.Food
          ? { kind: "food_spawned", itemId, cell }
          : { kind: "potion_spawned", itemId, cell, potionType: itemType },
        itemId,
      );
    }
  };
  const rngFood = rngFromSeed(subSeed(turnSeed, "phase-7-food"));
  spawnItems(
    ItemType.Food,
    config.foodSpawnRate,
    rngFood,
    eligibleSpawnCells(fertileGroundEnabled(board)),
  );
  // Potion eligibility is not fertile-restricted (01-REQ-049; DECISIONS.md C1).
  const rngPotion = rngFromSeed(subSeed(turnSeed, "phase-8-potions"));
  spawnItems(
    ItemType.InvulnPotion,
    config.invulnPotionSpawnRate,
    rngPotion,
    eligibleSpawnCells(false),
  );
  spawnItems(
    ItemType.InvisPotion,
    config.invisPotionSpawnRate,
    rngPotion,
    eligibleSpawnCells(false),
  );

  // ---------- Stage 7: Win Condition Check. spec: 01-REQ-051, §2.10 ----------
  const outcome = checkWinConditions(snakes, roster, aliveTeamsAtStart, T, config);

  // ---------- Stage 8: Event Derivation. spec: 01-REQ-052, §2.11 ----------
  // Canonical order: event class, then primary-subject id, insertion as the
  // stable tie-break.
  const ordered = events
    .map((e, i) => ({ ...e, seq: i }))
    .sort(
      (a, b) =>
        EVENT_CLASS[a.event.kind] - EVENT_CLASS[b.event.kind] ||
        a.sortId - b.sortId ||
        a.seq - b.seq,
    )
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
      lastDirection: s.lastDirection,
      alive: s.alive,
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
