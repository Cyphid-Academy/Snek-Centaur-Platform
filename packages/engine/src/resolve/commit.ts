// The commit (01 §2.8 stage 5): the SOLE writer of game state. Combines the
// turn's claims into the end-of-turn state in a fixed, centralised order —
// health resolution → death union → body mutation (move → sever → grow) →
// effect resolution (cancel → rebuild → expire) → item removal for
// consumption claims — and derives the events that describe what it did.
import { cellIndex } from "../board.js";
import { EFFECT_DURATION_TURNS, removeFamily } from "../effects.js";
import type { PotionEffect, SnakeId, TurnNumber } from "../types.js";
import type { ClaimSet } from "./claims.js";
import { teamFamilyKey } from "./claims.js";
import type { TurnContext } from "./context.js";
import { projectionOf } from "./context.js";
import type { EventBuffer } from "./events.js";
import { pickDeathClaim } from "./events.js";
import { must } from "./work.js";

export function commit(ctx: TurnContext, claims: ClaimSet, events: EventBuffer): void {
  // ---- Movement, health, body, deaths — per alive-in-snapshot snake ----
  for (const snake of ctx.aliveInS) {
    const id = snake.snakeId;
    const projection = projectionOf(ctx, id);
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
    // Body: move → sever (min contact index) → grow (duplicate final tail).
    // spec: game-rules/movement, game-rules/collisions-and-severing, game-rules/food-and-growth
    let body = [...projection.body];
    const severAt = claims.severIndex(id);
    if (severAt !== undefined) body = body.slice(0, severAt);
    if (claims.hasGrow(id)) body = [...body, body[body.length - 1] as (typeof body)[number]];
    snake.body = body;
    // Deaths: certain-death claims ∪ fatal health resolution. spec: game-rules/health-and-starvation
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
  // spec: game-rules/team-potion-effects

  for (const { team, family } of claims.cancellations()) {
    for (const mate of ctx.snakes) {
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
    for (const member of ctx.snakes) {
      if (member.centaurTeamId !== team) continue;
      const isCollector = collectorIds.has(member.snakeId);
      // Collectors receive the debuff even if dead at commit — the
      // uncancellable-window reward for sacrificial collection
      // (game-rules/team-potion-effects#collector-marked-even-in-death). Non-collectors must be alive.
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
  // entries, excluding the collecting snake itself. spec: game-rules/turn-events
  for (const collection of claims.potionCollections) {
    const collector = must(ctx.byId.get(collection.snakeId), "collector");
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

  // Expiry: remove effects whose last-active turn has been reached.
  // spec: game-rules/team-potion-effects#three-turn-expiry
  for (const snake of ctx.snakes) {
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

  // ---- Item removal for consumption claims. spec: game-rules/item-identity, 046c, 047 ----
  for (const itemId of claims.consumptions()) {
    // Resolve the reference against the snapshot index — a dangling id is a
    // rule bug and fails loudly here.
    const item = must(ctx.itemById.get(itemId), `consumed item ${itemId}`);
    ctx.items.delete(cellIndex(ctx.board, item.cell));
  }
}
