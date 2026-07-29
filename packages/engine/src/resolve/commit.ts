// The commit (01 §2.8 stage 5): the SOLE writer of game state. Combines the
// turn's claims into the end-of-turn state in a fixed, centralised order —
// health resolution → death union → body mutation (move → sever → grow) →
// effect resolution (cancel → rebuild → expire) → item removal for
// consumption claims → the clock arithmetic and the deaths it causes — and
// derives the events that describe what it did.
//
// The clock lands here rather than between turns because time reaches
// committed state through exactly one channel: a turn's resolution, applying
// the burn it was declared. Two writers of one budget can disagree, and the
// disagreement is unfalsifiable from inside either side.
// spec: game-engine/chess-timer#only-a-resolution-moves-a-budget
import { cellIndex } from "../board.js";
import { applyDeclaredBurns } from "../clock.js";
import { EFFECT_DURATION_TURNS, removeFamily } from "../effects.js";
import { isProjection, occupiedCells } from "../state.js";
import type {
  Cell,
  CentaurTeamClockState,
  PotionEffect,
  SnakeId,
  TurnNumber,
  TurnTimings,
} from "../types.js";
import type { ClaimSet } from "./claims.js";
import { teamFamilyKey } from "./claims.js";
import type { TurnContext } from "./context.js";
import { movedOf } from "./context.js";
import type { EventBuffer } from "./events.js";
import { pickDeathClaim } from "./events.js";
import type { WorkOccupant } from "./work.js";
import { must } from "./work.js";

/**
 * Where an occupant stands, for an event that must name a cell. A projection
 * severed to nothing has none of its own left, and its historic record's head
 * is the last position anyone modelled.
 */
function locationOf(occupant: WorkOccupant): Cell {
  const cells = occupiedCells(occupant);
  return (cells[0] ?? (isProjection(occupant) ? occupant.historic.body[0] : undefined)) as Cell;
}

/** What the commit did to the game's timekeeping. */
export interface ClockCommitResult {
  readonly clocks: ReadonlyArray<CentaurTeamClockState>;
  readonly consumedDurationMs: number;
}

export function commit(
  ctx: TurnContext,
  claims: ClaimSet,
  events: EventBuffer,
  timings: TurnTimings,
  clocks: ReadonlyArray<CentaurTeamClockState>,
  consumedDurationMs: number,
  turnAdvances: boolean,
): ClockCommitResult {
  // ---- Movement, health, deaths — per PARTICIPANT ----
  for (const snake of ctx.participants) {
    const id = snake.snakeId;
    const projection = movedOf(ctx, id);
    events.emit(
      {
        kind: "snake_moved",
        snakeId: id,
        from: projection.from,
        to: projection.head,
        direction: projection.direction,
        stagedBy: projection.stagedBy,
      },
      id,
    );
    snake.health = must(claims.resolvedHealth(id), `resolved health for snake ${id}`);
    snake.lastDirection = projection.direction;
    // Only a snake that took the turn advances to it.
    // spec: game-engine/domain-vocabulary#turns-at-two-grains
    snake.turn = (ctx.turnNumber + 1) as TurnNumber;
    // Deaths: certain-death claims ∪ fatal health resolution. spec: game-engine/health-and-starvation
    const healthDeathSources = claims.healthDeathSources(id);
    if (claims.hasCertainDeath(id)) {
      snake.alive = false;
      const claim = pickDeathClaim(claims.certainDeathClaims(id));
      events.emit(
        {
          kind: "snake_died",
          snakeId: id,
          cause: claim.cause,
          killerSnakeId: claim.killer,
          location: projection.head,
        },
        id,
      );
    } else if (healthDeathSources !== undefined) {
      snake.alive = false;
      events.emit(
        {
          kind: "snake_died",
          snakeId: id,
          cause: "health_depletion",
          killerSnakeId: null,
          location: projection.head,
          sources: healthDeathSources,
        },
        id,
      );
    }
  }

  // ---- Body: move → sever (min contact index) → grow (duplicate final tail).
  //
  // Severing is ONE arithmetic over whatever cells an occupant stands in, and it
  // is written once: another snake's action reaches a projection exactly as it
  // reaches a snake, because a hold suspends the held snake's own turn and not
  // the world's effect on it. What differs is only what surrounds it — a
  // participant moved first and may grow; a projection did neither, so a sever
  // is the only thing that can change where it stands, and one reaching its
  // first segment leaves it standing in nothing at all.
  // spec: game-engine/movement, game-engine/collisions-and-severing,
  // game-engine/food-and-growth, game-engine/held-snakes#a-severed-projection-locates-nothing
  const severed = (cells: ReadonlyArray<Cell>, id: SnakeId): Cell[] => {
    const at = claims.severIndex(id);
    return at === undefined ? [...cells] : cells.slice(0, at);
  };

  for (const snake of ctx.participants) {
    const id = snake.snakeId;
    const body = severed(ctx.cellsThisTurn(id), id);
    if (claims.hasGrow(id)) body.push(body[body.length - 1] as Cell);
    snake.body = body;
  }
  for (const projection of ctx.projections) {
    projection.segments = severed(projection.segments, projection.snakeId);
  }

  for (const record of claims.severRecords) {
    events.emit({ kind: "snake_severed", ...record }, record.victimSnakeId);
  }

  for (const [id, itemId] of claims.foodEaten) {
    const item = must(ctx.itemById.get(itemId), `consumed item ${itemId}`);
    // MaxHealth minus what the snake would have resolved to without the heal.
    const withoutHeal =
      must(ctx.snapshotHealth.get(id), `snapshot health for snake ${id}`) - claims.totalDamage(id);
    const resolved = must(claims.resolvedHealth(id), `resolved health for snake ${id}`);
    events.emit(
      {
        kind: "food_eaten",
        snakeId: id,
        itemId,
        cell: item.cell,
        healthRestored: resolved - withoutHeal,
      },
      id,
    );
  }

  // ---- Effect resolution: cancel → rebuild (replace-semantics) → expire ----
  // spec: game-engine/team-potion-effects

  for (const { team, family } of claims.cancellations()) {
    for (const mate of ctx.occupants) {
      if (!mate.alive || mate.centaurTeamId !== team) continue;
      const { effects, removed } = removeFamily(mate.activeEffects, family);
      if (removed === undefined) continue;
      mate.activeEffects = effects;
      events.emit(
        { kind: "effect_cancelled", snakeId: mate.snakeId, family, reason: "collector_disruption" },
        mate.snakeId,
      );
    }
  }

  // Members that received entries from each rebuild — the single encoding of
  // the membership rule, reused below for potion_collected events.
  const rebuildRecipients = new Map<string, SnakeId[]>();
  for (const rebuild of claims.rebuilds()) {
    const { team, family, collectorIds } = rebuild;
    const expiryTurn = (ctx.turnNumber + EFFECT_DURATION_TURNS) as TurnNumber;
    const recipients: SnakeId[] = [];
    for (const member of ctx.occupants) {
      if (member.centaurTeamId !== team) continue;
      const isCollector = collectorIds.has(member.snakeId);
      // Collectors receive the debuff even if dead at commit — the
      // uncancellable-window reward for sacrificial collection
      // (game-engine/team-potion-effects#collector-marked-even-in-death). Non-collectors must be alive.
      if (!isCollector && !member.alive) continue;
      const { effects, removed } = removeFamily(member.activeEffects, family);
      if (removed !== undefined) {
        events.emit(
          { kind: "effect_cancelled", snakeId: member.snakeId, family, reason: "replaced" },
          member.snakeId,
        );
      }
      const effect: PotionEffect = { family, state: isCollector ? "debuff" : "buff", expiryTurn };
      member.activeEffects = [...effects, effect];
      recipients.push(member.snakeId);
      events.emit(
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
    rebuildRecipients.set(teamFamilyKey(team, family), recipients);
  }

  // potion_collected events carry the teammates that received rebuild
  // entries, excluding the collecting snake itself. spec: game-engine/turn-events
  for (const collection of claims.potionCollections) {
    const collector = must(
      ctx.occupants.find((o) => o.snakeId === collection.snakeId),
      "collector",
    );
    const recipients =
      rebuildRecipients.get(teamFamilyKey(collector.centaurTeamId, collection.family)) ?? [];
    events.emit(
      {
        kind: "potion_collected",
        snakeId: collection.snakeId,
        itemId: collection.itemId,
        cell: must(ctx.itemById.get(collection.itemId), `collected item ${collection.itemId}`).cell,
        potionType: collection.potionType,
        affectedTeammateIds: recipients.filter((id) => id !== collection.snakeId),
      },
      collection.snakeId,
    );
  }

  // Expiry: remove effects whose last-active turn has been reached — against
  // the state's current turn, for projections exactly as for movers. An
  // effect's expiry turn is fixed when it is granted and no choice the snake
  // makes moves it, so withholding the expiry would not model uncertainty, it
  // would invent certainty in the other direction. This is why a projection
  // carries effects of its own rather than deferring to its frozen record: the
  // record cannot expire anything, because nothing ever changes it.
  // spec: game-engine/team-potion-effects#three-turn-expiry, game-engine/held-snakes#a-projection-carries-its-own-effects
  for (const snake of ctx.occupants) {
    const expired = snake.activeEffects.filter((e) => ctx.turnNumber >= e.expiryTurn);
    if (expired.length === 0) continue;
    snake.activeEffects = snake.activeEffects.filter((e) => ctx.turnNumber < e.expiryTurn);
    for (const e of expired) {
      events.emit(
        { kind: "effect_cancelled", snakeId: snake.snakeId, family: e.family, reason: "expiry" },
        snake.snakeId,
      );
    }
  }

  // ---- Item removal for consumption claims. spec: game-engine/item-identity, 046c, 047 ----
  for (const itemId of claims.consumptions()) {
    // Resolve the reference against the snapshot index — a dangling id is a
    // rule bug and fails loudly here.
    const item = must(ctx.itemById.get(itemId), `consumed item ${itemId}`);
    ctx.items.delete(cellIndex(ctx.board, item.cell));
  }

  // ---- The clock, and the deaths it causes ----
  // Charged per turn TAKEN: hold every snake and the state's current turn does
  // not move, so no clock moves and no duration accumulates whatever timings
  // were declared. That keeps holding everything the no-op it already was
  // rather than a way to burn a team's clock down for free.
  // spec: game-engine/turn-resolution-model#a-turn-nobody-took-charges-nothing
  //
  // Nothing below this line can apply when no turn was taken: with no
  // participant there is no burn to spend and no hazard damage to announce.
  if (!turnAdvances) return { clocks, consumedDurationMs };

  const clockCommit = applyDeclaredBurns(
    clocks,
    timings.burnMs,
    (ctx.turnNumber + 1) as TurnNumber,
    ctx.config.clock,
  );
  // A competing team left with no remaining time at all loses every snake
  // still alive at this commit — held snakes with the rest, because a team
  // burned its time whether or not this resolution chose to model its snakes,
  // and a hold that stopped a team's clock would hand a search a free reprieve
  // from the deaths it exists to see coming. Nothing else follows: whether the
  // game is over is decided from the state these deaths leave.
  // spec: game-engine/chess-timer#exhaustion-kills-the-teams-snakes, game-engine/held-snakes#a-held-snakes-team-still-spends-its-time
  for (const occupant of ctx.occupants) {
    if (!occupant.alive || !clockCommit.exhausted.has(occupant.centaurTeamId)) continue;
    occupant.alive = false;
    events.emit(
      {
        kind: "snake_died",
        snakeId: occupant.snakeId,
        cause: "clock_exhaustion",
        killerSnakeId: null,
        // Where it last stood: a projection severed to nothing has no cell of
        // its own left, and its record's head is the last position anyone saw.
        location: locationOf(occupant),
      },
      occupant.snakeId,
    );
  }

  // Hazard damage taken by a snake that survived the turn — evaluated against
  // the aliveness this commit leaves, so a snake the damage killed reports
  // through its death event and never through both.
  // spec: game-engine/turn-events#hazard-damage-is-announced
  for (const snake of ctx.participants) {
    if (!snake.alive) continue;
    const damage = claims.damageFrom(snake.snakeId, "hazard");
    if (damage === 0) continue;
    events.emit(
      {
        kind: "hazard_damage_taken",
        snakeId: snake.snakeId,
        damage,
        cell: movedOf(ctx, snake.snakeId).head,
      },
      snake.snakeId,
    );
  }

  return {
    clocks: clockCommit.clocks,
    consumedDurationMs: consumedDurationMs + timings.durationMs,
  };
}
