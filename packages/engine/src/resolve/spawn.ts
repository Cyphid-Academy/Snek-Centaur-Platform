// Item spawning (01 §2.8 stage 6): seeded generation against the committed
// occupancy. spec: game-engine/item-spawning, game-engine/item-identity.
import { cellIndex, fertileGroundEnabled } from "../board.js";
import { spawnTurnAfter } from "../items.js";
import type { Rng } from "../rng.js";
import { rngFromSeed, subSeed } from "../rng.js";
import type { Cell, Item, TurnEvent } from "../types.js";
import { CellType, ItemType, assertNever } from "../types.js";
import type { TurnContext } from "./context.js";
import type { EventBuffer } from "./events.js";

export function runSpawning(ctx: TurnContext, turnSeed: Uint8Array, events: EventBuffer): void {
  const { board, config, items } = ctx;
  // Spawned items first exist at the boundary after this turn — their
  // spawnTurn per game-engine/item-identity.
  const spawnTurn = spawnTurnAfter(ctx.turnNumber);
  let spawnedThisTurn = 0;

  const eligibleSpawnCells = (fertileOnly: boolean): Cell[] => {
    const occupied = new Set<number>();
    for (const snake of ctx.snakes) {
      if (!snake.alive) continue;
      for (const seg of snake.body) occupied.add(cellIndex(board, seg));
    }
    const cells: Cell[] = [];
    for (let y = 1; y < board.boardSize - 1; y++) {
      for (let x = 1; x < board.boardSize - 1; x++) {
        const type = board.cells[y * board.boardSize + x];
        if (type === CellType.Wall || type === CellType.Hazard) continue;
        if (fertileOnly && type !== CellType.Fertile) continue;
        const cell = { x, y };
        const key = cellIndex(board, cell);
        // The items map already reflects this turn's earlier spawns, so a
        // later family can never stack onto a just-spawned cell (game-engine/item-identity).
        if (occupied.has(key) || items.has(key)) continue;
        cells.push(cell);
      }
    }
    return cells; // row-major deterministic order
  };

  const spawnItems = (
    itemType: Item["itemType"],
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
      const spawnIndex = spawnedThisTurn++;
      const item: Item =
        itemType === ItemType.Food
          ? { spawnTurn, spawnIndex, itemType, cell }
          : { spawnTurn, spawnIndex, itemType, cell };
      items.set(cellIndex(board, cell), item);
      events.emit(spawnEventFor(item), spawnIndex);
    }
  };

  const rngFood = rngFromSeed(subSeed(turnSeed, "phase-7-food"));
  spawnItems(
    ItemType.Food,
    config.foodSpawnRate,
    rngFood,
    eligibleSpawnCells(fertileGroundEnabled(board)),
  );
  // Potion eligibility is not fertile-restricted (game-engine/item-spawning; DECISIONS.md §2.1).
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

// Birth record per item kind — an exhaustive switch over the sealed Item
// union; the assertNever arm turns any future item kind into a compile
// error here (game-engine/domain-vocabulary closed sets).
function spawnEventFor(item: Item): TurnEvent {
  switch (item.itemType) {
    case ItemType.Food:
      return {
        kind: "food_spawned",
        spawnTurn: item.spawnTurn,
        spawnIndex: item.spawnIndex,
        cell: item.cell,
      };
    case ItemType.InvulnPotion:
    case ItemType.InvisPotion:
      return {
        kind: "potion_spawned",
        spawnTurn: item.spawnTurn,
        spawnIndex: item.spawnIndex,
        cell: item.cell,
        potionType: item.itemType,
      };
    default:
      return assertNever(item);
  }
}
