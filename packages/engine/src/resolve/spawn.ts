// Item spawning (01 §2.8 stage 6): seeded generation against the committed
// occupancy. spec: 01-REQ-048, 01-REQ-049.
import { cellKey, fertileGroundEnabled } from "../board.js";
import type { Rng } from "../rng.js";
import { rngFromSeed, subSeed } from "../rng.js";
import type { Cell, ItemId } from "../types.js";
import { CellType, ItemType } from "../types.js";
import type { TurnContext } from "./context.js";
import type { EventBuffer } from "./events.js";

export function runSpawning(ctx: TurnContext, turnSeed: Uint8Array, events: EventBuffer): void {
  const { board, config, items } = ctx;
  let nextItemId = items.reduce((max, i) => Math.max(max, i.itemId), -1) + 1;

  const eligibleSpawnCells = (fertileOnly: boolean): Cell[] => {
    const occupied = new Set<number>();
    for (const snake of ctx.snakes) {
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
    // floor(rate) guaranteed spawns + Bernoulli(rate mod 1) for one more.
    let count = Math.floor(rate);
    const frac = rate - count;
    if (frac > 0 && rng.nextFloat() < frac) count += 1;
    if (count <= 0) return;
    rng.shuffle(eligible);
    for (const cell of eligible.slice(0, count)) {
      const itemId = nextItemId++ as ItemId;
      items.push({ itemId, itemType, cell, consumed: false });
      events.emit(
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
  // Potion eligibility is not fertile-restricted (01-REQ-049; DECISIONS.md §2.1).
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
}
