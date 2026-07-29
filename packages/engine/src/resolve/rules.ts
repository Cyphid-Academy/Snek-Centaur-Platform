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
import { cellAt, sameCell } from "../board.js";
import { familyOfPotion, invulnerabilityLevel } from "../effects.js";
import { itemIdOf } from "../items.js";
import { CellType, ItemType } from "../types.js";
import type { SnakeId } from "../types.js";
import type { ClaimSet } from "./claims.js";
import type { TurnContext } from "./context.js";
import { movedOf } from "./context.js";

export type InteractionRule = (ctx: TurnContext, claims: ClaimSet) => void;

// Wall rule. spec: game-engine/collisions-and-severing
export const wallRule: InteractionRule = (ctx, claims) => {
  for (const { snake, head } of ctx.survivingHeads) {
    const type = cellAt(ctx.board, head);
    if (type === CellType.Wall || type === undefined) {
      claims.certainDeath(snake.snakeId, { cause: "wall", killer: null }, "wall_death");
    }
  }
};

// Self-collision rule. spec: game-engine/collisions-and-severing
export const selfCollisionRule: InteractionRule = (ctx, claims) => {
  for (const { snake, head } of ctx.survivingHeads) {
    const body = movedOf(ctx, snake.snakeId).body;
    if (body.slice(1).some((c) => sameCell(c, head))) {
      claims.certainDeath(snake.snakeId, { cause: "self_collision", killer: null }, "self_death");
    }
  }
};

// Body-collision rule. spec: game-engine/collisions-and-severing — victims include head-to-head
// losers (their bodies stay on the logical board); severs are recorded as
// claims and applied at commit, so no rule observes a severed body.
export const bodyCollisionRule: InteractionRule = (ctx, claims) => {
  for (const { snake: attacker, head } of ctx.survivingHeads) {
    // ctx.bodySegmentsAt entries are ordered by (snakeId, segment index), so
    // the first entry seen per victim is the head-closest contact and victims
    // are evaluated in ascending-snakeId order.
    const contacted = new Set<SnakeId>();
    for (const { occupant: victim, index: contactIndex } of ctx.bodySegmentsAt(head)) {
      if (victim.snakeId === attacker.snakeId || contacted.has(victim.snakeId)) continue;
      contacted.add(victim.snakeId);
      // Snapshot invulnerability levels (game-engine/turn-resolution-model).
      // Severing is scoped to NON-HEAD segments, and every entry in the segment
      // index is one — a participant's head is contested through head-to-head
      // and a projection has no head at all. So the level comparison alone
      // decides, with no case in which the higher level dies to the lower, and
      // the rule needs no idea which kind of occupant it just hit.
      // spec: game-engine/collisions-and-severing, game-engine/held-snakes#a-projection-has-no-head
      if (invulnerabilityLevel(attacker) > invulnerabilityLevel(victim)) {
        const cells = ctx.cellsThisTurn(victim.snakeId);
        claims.sever(
          {
            attackerSnakeId: attacker.snakeId,
            victimSnakeId: victim.snakeId,
            contactCell: cells[contactIndex] as (typeof cells)[number],
            segmentsLost: cells.length - contactIndex,
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

// Hazard rule. spec: game-engine/health-and-starvation
export const hazardRule: InteractionRule = (ctx, claims) => {
  for (const { snake, head } of ctx.survivingHeads) {
    if (cellAt(ctx.board, head) === CellType.Hazard) {
      claims.damage(snake.snakeId, ctx.config.hazardDamage, "hazard");
      claims.disrupt(snake.snakeId, "hazard_entry");
    }
  }
};

// Health-tick rule. spec: game-engine/health-and-starvation — participants
// only. A projection takes no tick: a snake allowed to move might have reached
// food, so its health after a turn it did not take is genuinely unknown, and
// the projection answers that with maxHealth rather than with a countdown
// nobody watched. At health 1 a tick would also *kill* it, clearing an obstacle
// the real game keeps.
// spec: game-engine/held-snakes#a-projection-cannot-be-starved-by-a-hold
export const healthTickRule: InteractionRule = (ctx, claims) => {
  for (const snake of ctx.participants) {
    claims.damage(snake.snakeId, 1, "tick");
  }
};

// Food rule. spec: game-engine/food-and-growth — unique entrancy guaranteed by stage 2;
// consumption is a claim applied at commit, never a rule-time write.
// Death by any non-head-to-head cause does not gate collection
// (game-engine/team-potion-effects#sacrificial-collection).
export const foodRule: InteractionRule = (ctx, claims) => {
  for (const { snake, head } of ctx.survivingHeads) {
    const item = ctx.itemAt(head);
    if (item === null || item.itemType !== ItemType.Food) continue;
    // item: FoodItem — referenced onward by derived id only.
    const itemId = itemIdOf(item);
    claims.consume(itemId);
    claims.eatFood(snake.snakeId, itemId);
  }
};

// Potion rule. spec: game-engine/team-potion-effects — aggregates to one rebuild claim per
// (team, family); sacrificial collection stands (game-engine/team-potion-effects#sacrificial-collection).
export const potionRule: InteractionRule = (ctx, claims) => {
  for (const { snake, head } of ctx.survivingHeads) {
    const item = ctx.itemAt(head);
    if (item === null || item.itemType === ItemType.Food) continue;
    // item: PotionItem — the narrowed itemType needs no re-assertion.
    claims.consume(itemIdOf(item));
    claims.collectPotion(snake.centaurTeamId, {
      snakeId: snake.snakeId,
      itemId: itemIdOf(item),
      potionType: item.itemType,
      family: familyOfPotion(item.itemType),
    });
  }
};

// spec: game-engine/turn-resolution-model stage 3 — the order of this list is NOT semantically
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
  // Health resolution and health deaths, over participants only — a held
  // snake's health is not resolved at all (game-engine/held-snakes).
  // spec: game-engine/health-and-starvation
  for (const snake of ctx.participants) {
    const resolved = claims.hasHeal(snake.snakeId)
      ? ctx.config.maxHealth
      : snake.health - claims.totalDamage(snake.snakeId);
    claims.setResolvedHealth(snake.snakeId, resolved);
    if (resolved <= 0 && !claims.hasCertainDeath(snake.snakeId)) {
      claims.healthDeath(snake.snakeId, claims.damageSources(snake.snakeId));
    }
  }

  // Cancellation. spec: game-engine/team-potion-effects — snapshot debuff-holders
  // only, so a collector is disruptable only from the turn after its debuff
  // committed; rebuild claims from this turn are unaffected (supersede rule).
  // Over every occupant: a projection carries effects like any snake, so a
  // disruption to one cancels its team's family exactly as a snake's would.
  for (const d of claims.disruptions) {
    const occupant = ctx.occupants.find((o) => o.snakeId === d.snakeId);
    if (occupant === undefined) continue;
    for (const e of occupant.activeEffects) {
      if (e.state === "debuff") claims.cancelFamily(occupant.centaurTeamId, e.family);
    }
  }
}
