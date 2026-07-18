// The interaction rules (01 §2.8 stage 3) and derived rules (stage 4).
//
// Every interaction rule is a pure function of (TurnContext, ClaimSet): it
// reads the snapshot via the context and the surviving moved-head set H*,
// and only ever ADDS claims. Rules never write game state and never read
// another rule's committed effect, so INTERACTION_RULES may be evaluated in
// any order (verified by the order-shuffle property test).
//
// Adding a mechanic = adding a rule here (plus, for a new claim type, one
// clause in commit.ts). No pipeline position to choose.
import { cellAt, cellIndex, sameCell } from "../board.js";
import { familyOfPotion, invulnerabilityLevel } from "../effects.js";
import { CellType, ItemType } from "../types.js";
import type { ClaimSet } from "./claims.js";
import type { TurnContext } from "./context.js";
import { projectionOf } from "./context.js";
import type { WorkSnake } from "./work.js";

export type InteractionRule = (ctx: TurnContext, claims: ClaimSet) => void;

// Wall rule. spec: game-rules/collisions-and-severing
export const wallRule: InteractionRule = (ctx, claims) => {
  for (const { snake, head } of ctx.survivingHeads) {
    const type = cellAt(ctx.board, head);
    if (type === CellType.Wall || type === undefined) {
      claims.certainDeath(snake.snakeId, { cause: "wall", killer: null }, "wall_death");
    }
  }
};

// Self-collision rule. spec: game-rules/collisions-and-severing
export const selfCollisionRule: InteractionRule = (ctx, claims) => {
  for (const { snake, head } of ctx.survivingHeads) {
    const body = projectionOf(ctx, snake.snakeId).body;
    if (body.slice(1).some((c) => sameCell(c, head))) {
      claims.certainDeath(snake.snakeId, { cause: "self_collision", killer: null }, "self_death");
    }
  }
};

// Body-collision rule. spec: game-rules/collisions-and-severing — victims include head-to-head
// losers (their bodies stay on the logical board); severs are recorded as
// claims and applied at commit, so no rule observes a severed body.
export const bodyCollisionRule: InteractionRule = (ctx, claims) => {
  for (const { snake: attacker, head } of ctx.survivingHeads) {
    // ctx.bodySegmentsAt entries are ordered by (snakeId, segment index), so
    // the first entry seen per victim is the head-closest contact and victims
    // are evaluated in ascending-snakeId order.
    const contacted = new Set<WorkSnake>();
    for (const { snake: victim, index: contactIndex } of ctx.bodySegmentsAt(head)) {
      if (victim.snakeId === attacker.snakeId || contacted.has(victim)) continue;
      contacted.add(victim);
      // Snapshot invulnerability levels (game-rules/turn-resolution-model).
      if (invulnerabilityLevel(attacker) > invulnerabilityLevel(victim)) {
        const victimBody = projectionOf(ctx, victim.snakeId).body;
        claims.sever(
          {
            attackerSnakeId: attacker.snakeId,
            victimSnakeId: victim.snakeId,
            contactCell: victimBody[contactIndex] as (typeof victimBody)[number],
            segmentsLost: victimBody.length - contactIndex,
          },
          contactIndex,
        );
      } else {
        claims.certainDeath(
          attacker.snakeId,
          { cause: "body_collision", killer: victim.snakeId },
          "body_collision_death",
        );
        claims.disrupt(victim.snakeId, "body_collision_received");
      }
    }
  }
};

// Hazard rule. spec: game-rules/health-and-starvation
export const hazardRule: InteractionRule = (ctx, claims) => {
  for (const { snake, head } of ctx.survivingHeads) {
    if (cellAt(ctx.board, head) === CellType.Hazard) {
      claims.damage(snake.snakeId, ctx.config.hazardDamage, "hazard");
      claims.disrupt(snake.snakeId, "hazard_entry");
    }
  }
};

// Health-tick rule. spec: game-rules/health-and-starvation
export const healthTickRule: InteractionRule = (ctx, claims) => {
  for (const snake of ctx.aliveInS) {
    claims.damage(snake.snakeId, 1, "tick");
  }
};

// Food rule. spec: game-rules/food-and-growth — unique entrancy guaranteed by stage 2;
// consumption is a claim applied at commit, never a rule-time write.
// Death by any non-head-to-head cause does not gate collection
// (game-rules/team-potion-effects#sacrificial-collection).
export const foodRule: InteractionRule = (ctx, claims) => {
  for (const { snake, head } of ctx.survivingHeads) {
    const item = ctx.itemAt(head);
    if (item === null || item.itemType !== ItemType.Food) continue;
    claims.consume(item.itemId, cellIndex(ctx.board, head));
    claims.eatFood(snake.snakeId, head, item.itemId);
  }
};

// Potion rule. spec: game-rules/team-potion-effects — aggregates to one rebuild claim per
// (team, family); sacrificial collection stands (game-rules/team-potion-effects#sacrificial-collection).
export const potionRule: InteractionRule = (ctx, claims) => {
  for (const { snake, head } of ctx.survivingHeads) {
    const item = ctx.itemAt(head);
    if (item === null || item.itemType === ItemType.Food) continue;
    const potionType = item.itemType;
    claims.consume(item.itemId, cellIndex(ctx.board, head));
    claims.collectPotion(snake.centaurTeamId, {
      snakeId: snake.snakeId,
      itemId: item.itemId,
      cell: head,
      potionType,
      family: familyOfPotion(potionType),
    });
  }
};

// spec: game-rules/turn-resolution-model stage 3 — the order of this list is NOT semantically
// meaningful (any permutation yields identical output); it is fixed only so
// the source reads in the spec's presentation order.
export const INTERACTION_RULES: ReadonlyArray<InteractionRule> = [
  wallRule,
  selfCollisionRule,
  bodyCollisionRule,
  hazardRule,
  healthTickRule,
  foodRule,
  potionRule,
];

/**
 * Derived rules (01 §2.8 stage 4) — read the claim set plus the snapshot.
 * Internal order matters here and only here among the rule stages: health
 * resolution must precede cancellation because a fatal health depletion is
 * itself a disruption that can trigger a cancellation.
 */
export function runDerivedRules(ctx: TurnContext, claims: ClaimSet): void {
  // Health resolution and health deaths. spec: game-rules/health-and-starvation
  for (const snake of ctx.aliveInS) {
    const resolved = claims.hasHeal(snake.snakeId)
      ? ctx.config.maxHealth
      : snake.health - claims.totalDamage(snake.snakeId);
    claims.setResolvedHealth(snake.snakeId, resolved);
    if (resolved <= 0 && !claims.hasCertainDeath(snake.snakeId)) {
      claims.healthDeath(snake.snakeId, claims.damageSources(snake.snakeId));
    }
  }

  // Cancellation. spec: game-rules/team-potion-effects — snapshot debuff-holders
  // only, so a collector is disruptable only from the turn after its debuff
  // committed; rebuild claims from this turn are unaffected (supersede rule).
  for (const d of claims.disruptions) {
    const snake = ctx.byId.get(d.snakeId);
    if (snake === undefined) continue;
    for (const e of snake.activeEffects) {
      if (e.state === "debuff") claims.cancelFamily(snake.centaurTeamId, e.family);
    }
  }
}
