// Canonical codec: engine values ⇄ canonical JSON.
//
// spec: test-sequences/canonical-encoding — exactly one JSON encoding per
// engine value, so equality and diffing reduce to deep-equal over the JSON.
// design: add-visual-tester (D3) — hex seeds, sorted-key maps, absent-key
// optionality, arrays keep engine order.
//
// This module has no Svelte imports so a future headless runner can lift it
// into a package unchanged.

import type {
  Agent,
  Board,
  Cell,
  CellIndex,
  CellType,
  CentaurTeamClockState,
  CentaurTeamId,
  Direction,
  EffectFamily,
  EffectState,
  GameConfig,
  GameOutcome,
  GameState,
  Item,
  ItemType,
  ItemsByCell,
  PotionEffect,
  PotionType,
  SnakeId,
  SnakeState,
  StagedMove,
  TurnEvent,
  TurnNumber,
  UserId,
} from "@cyphid/snek-engine";

// ---------------------------------------------------------------------------
// Document types (the JSON side of the codec)
// ---------------------------------------------------------------------------

// spec: test-sequences/schema-version — integer version carried by every doc.
export const SCHEMA_VERSION = 1;

export interface CellJson {
  readonly x: number;
  readonly y: number;
}

export interface PotionEffectJson {
  readonly family: EffectFamily;
  readonly state: EffectState;
  readonly expiryTurn: number;
}

export interface SnakeJson {
  readonly snakeId: number;
  readonly letter: string;
  readonly centaurTeamId: string;
  readonly body: ReadonlyArray<CellJson>; // engine order: head first
  readonly health: number;
  readonly activeEffects: ReadonlyArray<PotionEffectJson>;
  readonly lastDirection: number | null; // explicit domain null, not absence
  readonly alive: boolean;
}

export interface BoardJson {
  readonly boardSize: number;
  readonly cells: ReadonlyArray<number>; // row-major CellType values
}

export interface ItemJson {
  readonly itemType: number;
  readonly spawnTurn: number;
  readonly spawnIndex: number;
  readonly cell: CellJson;
}

export interface ClockJson {
  readonly centaurTeamId: string;
  readonly budgetMs: number;
  readonly perTurnMs: number;
  readonly declaredTurnOver: boolean;
}

export interface GameStateJson {
  readonly board: BoardJson;
  // Map → plain object keyed by canonical cell index, ascending numeric key
  // order (see sortedNumericRecord below).
  readonly items: Readonly<Record<string, ItemJson>>;
  readonly snakes: ReadonlyArray<SnakeJson>;
  readonly clocks: ReadonlyArray<ClockJson>;
}

export type AgentJson =
  | { readonly kind: "centaur_team"; readonly centaurTeamId: string }
  | { readonly kind: "operator"; readonly operatorUserId: string };

export interface StagedMoveJson {
  readonly direction: number;
  readonly stagedBy: AgentJson;
}

export type GameOutcomeJson =
  | { readonly kind: "in_progress" }
  | {
      readonly kind: "victory";
      readonly winnerCentaurTeamId: string;
      readonly scores: Readonly<Record<string, number>>; // keys sorted lexicographically
    }
  | {
      readonly kind: "draw";
      readonly tiedCentaurTeamIds: ReadonlyArray<string>; // engine order preserved
      readonly scores: Readonly<Record<string, number>>;
    }
  | { readonly kind: "error"; readonly reason: string };

export type TurnEventJson =
  | {
      readonly kind: "snake_moved";
      readonly snakeId: number;
      readonly from: CellJson;
      readonly to: CellJson;
      readonly direction: number;
      readonly stagedBy: AgentJson | null;
    }
  | {
      readonly kind: "snake_died";
      readonly snakeId: number;
      readonly cause: string;
      readonly killerSnakeId: number | null;
      readonly location: CellJson;
      // spec: test-sequences/canonical-encoding — optional absence is key
      // absence, never null padding.
      readonly sources?: ReadonlyArray<string>;
    }
  | {
      readonly kind: "snake_severed";
      readonly attackerSnakeId: number;
      readonly victimSnakeId: number;
      readonly contactCell: CellJson;
      readonly segmentsLost: number;
    }
  | {
      readonly kind: "food_eaten";
      readonly snakeId: number;
      readonly itemId: string;
      readonly cell: CellJson;
      readonly healthRestored: number;
    }
  | {
      readonly kind: "potion_collected";
      readonly snakeId: number;
      readonly itemId: string;
      readonly cell: CellJson;
      readonly potionType: number;
      readonly affectedTeammateIds: ReadonlyArray<number>;
    }
  | {
      readonly kind: "food_spawned";
      readonly spawnTurn: number;
      readonly spawnIndex: number;
      readonly cell: CellJson;
    }
  | {
      readonly kind: "potion_spawned";
      readonly spawnTurn: number;
      readonly spawnIndex: number;
      readonly cell: CellJson;
      readonly potionType: number;
    }
  | {
      readonly kind: "effect_applied";
      readonly snakeId: number;
      readonly family: EffectFamily;
      readonly state: EffectState;
      readonly expiryTurn: number;
    }
  | {
      readonly kind: "effect_cancelled";
      readonly snakeId: number;
      readonly family: EffectFamily;
      readonly reason: string;
    };

export interface TurnOutputJson {
  readonly nextState: GameStateJson;
  readonly events: ReadonlyArray<TurnEventJson>; // order-significant
  readonly outcome: GameOutcomeJson;
}

export interface TurnRecordJson {
  readonly turnNumber: number;
  // Map → plain object keyed by snake id; absent snake = absent key
  // (spec: test-sequences/sequence-format#optional-moves).
  readonly stagedMoves: Readonly<Record<string, StagedMoveJson>>;
  readonly expected: TurnOutputJson;
}

// spec: test-sequences/sequence-format — self-contained document.
export interface TestSequenceDoc {
  readonly schemaVersion: number;
  readonly name: string;
  readonly gameSeed: string; // 32 bytes as 64 lowercase hex chars
  readonly config: GameConfig; // already plain JSON-shaped
  readonly initialState: GameStateJson;
  readonly turns: ReadonlyArray<TurnRecordJson>;
}

// ---------------------------------------------------------------------------
// Engine-side aggregate (decoded form)
// ---------------------------------------------------------------------------

export interface TurnOutput {
  readonly nextState: GameState;
  readonly events: ReadonlyArray<TurnEvent>;
  readonly outcome: GameOutcome;
}

export interface TurnRecord {
  readonly turnNumber: TurnNumber;
  readonly stagedMoves: ReadonlyMap<SnakeId, StagedMove>;
  readonly expected: TurnOutput;
}

export interface TestSequence {
  readonly name: string;
  readonly gameSeed: Uint8Array; // 32 bytes
  readonly config: GameConfig;
  readonly initialState: GameState;
  readonly turns: ReadonlyArray<TurnRecord>;
}

// ---------------------------------------------------------------------------
// Seed hex helpers
// ---------------------------------------------------------------------------

// spec: test-sequences/canonical-encoding — byte-array seeds encode to
// lowercase hex, the single canonical rendering.
export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || /[^0-9a-f]/.test(hex)) {
    throw new Error(`invalid lowercase hex string: ${JSON.stringify(hex)}`);
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sorted-key record helpers
// ---------------------------------------------------------------------------

// Integer-like object keys iterate in ascending numeric order in JS
// regardless of insertion order, so ascending numeric IS the canonical order
// for numeric-keyed maps (items, stagedMoves) — lexicographic order could not
// survive a JSON.parse round trip.
function sortedNumericRecord<V>(entries: Array<[number, V]>): Record<string, V> {
  entries.sort((a, b) => a[0] - b[0]);
  const out: Record<string, V> = {};
  for (const [k, v] of entries) out[String(k)] = v;
  return out;
}

// String-keyed maps (per-team scores) sort lexicographically per D3.
function sortedStringRecord<V>(entries: Array<[string, V]>): Record<string, V> {
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const out: Record<string, V> = {};
  for (const [k, v] of entries) out[k] = v;
  return out;
}

// ---------------------------------------------------------------------------
// Encoding (engine → JSON)
// ---------------------------------------------------------------------------

function encodeCell(cell: Cell): CellJson {
  return { x: cell.x, y: cell.y };
}

function encodeEffect(e: PotionEffect): PotionEffectJson {
  return { family: e.family, state: e.state, expiryTurn: e.expiryTurn };
}

function encodeSnake(s: SnakeState): SnakeJson {
  return {
    snakeId: s.snakeId,
    letter: s.letter,
    centaurTeamId: s.centaurTeamId,
    body: s.body.map(encodeCell),
    health: s.health,
    activeEffects: s.activeEffects.map(encodeEffect),
    lastDirection: s.lastDirection,
    alive: s.alive,
  };
}

function encodeItem(item: Item): ItemJson {
  return {
    itemType: item.itemType,
    spawnTurn: item.spawnTurn,
    spawnIndex: item.spawnIndex,
    cell: encodeCell(item.cell),
  };
}

function encodeClock(c: CentaurTeamClockState): ClockJson {
  return {
    centaurTeamId: c.centaurTeamId,
    budgetMs: c.budgetMs,
    perTurnMs: c.perTurnMs,
    declaredTurnOver: c.declaredTurnOver,
  };
}

// Rebuild the config with a fixed key order so canonical documents are
// byte-identical after any value-preserving channel (e.g. a jsonb column
// re-orders object keys. The config is plain JSON-shaped, but "plain" does
// not mean "order-stable" — canonicalisation must own the key order.
export function encodeGameConfig(config: GameConfig): GameConfig {
  return {
    orchestration: {
      boardSize: config.orchestration.boardSize,
      snakesPerTeam: config.orchestration.snakesPerTeam,
      hazardPercentage: config.orchestration.hazardPercentage,
      fertileGround: {
        density: config.orchestration.fertileGround.density,
        clustering: config.orchestration.fertileGround.clustering,
      },
    },
    runtime: {
      maxHealth: config.runtime.maxHealth,
      maxTurns: config.runtime.maxTurns,
      hazardDamage: config.runtime.hazardDamage,
      foodSpawnRate: config.runtime.foodSpawnRate,
      invulnPotionSpawnRate: config.runtime.invulnPotionSpawnRate,
      invisPotionSpawnRate: config.runtime.invisPotionSpawnRate,
      clock: {
        initialBudgetMs: config.runtime.clock.initialBudgetMs,
        budgetIncrementMs: config.runtime.clock.budgetIncrementMs,
        firstTurnTimeMs: config.runtime.clock.firstTurnTimeMs,
        maxTurnTimeMs: config.runtime.clock.maxTurnTimeMs,
      },
    },
  };
}

export function encodeGameState(state: GameState): GameStateJson {
  return {
    board: { boardSize: state.board.boardSize, cells: [...state.board.cells] },
    items: sortedNumericRecord(
      [...state.items.entries()].map(([idx, item]) => [idx as number, encodeItem(item)]),
    ),
    snakes: state.snakes.map(encodeSnake),
    clocks: state.clocks.map(encodeClock),
  };
}

function encodeAgent(agent: Agent): AgentJson {
  return agent.kind === "centaur_team"
    ? { kind: "centaur_team", centaurTeamId: agent.centaurTeamId }
    : { kind: "operator", operatorUserId: agent.operatorUserId };
}

export function encodeStagedMoves(
  moves: ReadonlyMap<SnakeId, StagedMove>,
): Record<string, StagedMoveJson> {
  return sortedNumericRecord(
    [...moves.entries()].map(([id, m]) => [
      id as number,
      { direction: m.direction, stagedBy: encodeAgent(m.stagedBy) },
    ]),
  );
}

export function encodeEvent(event: TurnEvent): TurnEventJson {
  switch (event.kind) {
    case "snake_moved":
      return {
        kind: "snake_moved",
        snakeId: event.snakeId,
        from: encodeCell(event.from),
        to: encodeCell(event.to),
        direction: event.direction,
        stagedBy: event.stagedBy === null ? null : encodeAgent(event.stagedBy),
      };
    case "snake_died": {
      const base = {
        kind: "snake_died" as const,
        snakeId: event.snakeId as number,
        cause: event.cause as string,
        killerSnakeId: event.killerSnakeId as number | null,
        location: encodeCell(event.location),
      };
      // Absent-key optionality: no `sources: undefined` padding.
      return event.sources === undefined ? base : { ...base, sources: [...event.sources] };
    }
    case "snake_severed":
      return {
        kind: "snake_severed",
        attackerSnakeId: event.attackerSnakeId,
        victimSnakeId: event.victimSnakeId,
        contactCell: encodeCell(event.contactCell),
        segmentsLost: event.segmentsLost,
      };
    case "food_eaten":
      return {
        kind: "food_eaten",
        snakeId: event.snakeId,
        itemId: event.itemId,
        cell: encodeCell(event.cell),
        healthRestored: event.healthRestored,
      };
    case "potion_collected":
      return {
        kind: "potion_collected",
        snakeId: event.snakeId,
        itemId: event.itemId,
        cell: encodeCell(event.cell),
        potionType: event.potionType,
        affectedTeammateIds: [...event.affectedTeammateIds],
      };
    case "food_spawned":
      return {
        kind: "food_spawned",
        spawnTurn: event.spawnTurn,
        spawnIndex: event.spawnIndex,
        cell: encodeCell(event.cell),
      };
    case "potion_spawned":
      return {
        kind: "potion_spawned",
        spawnTurn: event.spawnTurn,
        spawnIndex: event.spawnIndex,
        cell: encodeCell(event.cell),
        potionType: event.potionType,
      };
    case "effect_applied":
      return {
        kind: "effect_applied",
        snakeId: event.snakeId,
        family: event.family,
        state: event.state,
        expiryTurn: event.expiryTurn,
      };
    case "effect_cancelled":
      return {
        kind: "effect_cancelled",
        snakeId: event.snakeId,
        family: event.family,
        reason: event.reason,
      };
  }
}

export function encodeOutcome(outcome: GameOutcome): GameOutcomeJson {
  switch (outcome.kind) {
    case "in_progress":
      return { kind: "in_progress" };
    case "victory":
      return {
        kind: "victory",
        winnerCentaurTeamId: outcome.winnerCentaurTeamId,
        scores: sortedStringRecord([...outcome.scores.entries()]),
      };
    case "draw":
      return {
        kind: "draw",
        tiedCentaurTeamIds: [...outcome.tiedCentaurTeamIds],
        scores: sortedStringRecord([...outcome.scores.entries()]),
      };
    case "error":
      return { kind: "error", reason: outcome.reason };
  }
}

export function encodeTurnOutput(output: TurnOutput): TurnOutputJson {
  return {
    nextState: encodeGameState(output.nextState),
    events: output.events.map(encodeEvent),
    outcome: encodeOutcome(output.outcome),
  };
}

export function encodeTestSequence(seq: TestSequence): TestSequenceDoc {
  return {
    schemaVersion: SCHEMA_VERSION,
    name: seq.name,
    gameSeed: bytesToHex(seq.gameSeed),
    config: encodeGameConfig(seq.config),
    initialState: encodeGameState(seq.initialState),
    turns: seq.turns.map((t) => ({
      turnNumber: t.turnNumber,
      stagedMoves: encodeStagedMoves(t.stagedMoves),
      expected: encodeTurnOutput(t.expected),
    })),
  };
}

// ---------------------------------------------------------------------------
// Decoding (JSON → engine)
// ---------------------------------------------------------------------------

function decodeSnake(s: SnakeJson): SnakeState {
  return {
    snakeId: s.snakeId as SnakeId,
    letter: s.letter,
    centaurTeamId: s.centaurTeamId as CentaurTeamId,
    body: s.body.map((c) => ({ x: c.x, y: c.y })),
    health: s.health,
    activeEffects: s.activeEffects.map((e) => ({
      family: e.family,
      state: e.state,
      expiryTurn: e.expiryTurn as TurnNumber,
    })),
    lastDirection: s.lastDirection as Direction | null,
    alive: s.alive,
  };
}

function decodeItem(item: ItemJson): Item {
  const base = {
    spawnTurn: item.spawnTurn as TurnNumber,
    spawnIndex: item.spawnIndex,
    cell: { x: item.cell.x, y: item.cell.y },
  };
  return item.itemType === 0
    ? { ...base, itemType: 0 as typeof ItemType.Food }
    : { ...base, itemType: item.itemType as PotionType };
}

export function decodeGameState(json: GameStateJson): GameState {
  const board: Board = {
    boardSize: json.board.boardSize,
    cells: json.board.cells as ReadonlyArray<CellType>,
  };
  const items = new Map<CellIndex, Item>();
  for (const [key, item] of Object.entries(json.items).sort(
    (a, b) => Number(a[0]) - Number(b[0]),
  )) {
    items.set(Number(key) as CellIndex, decodeItem(item));
  }
  return {
    board,
    items: items as ItemsByCell,
    snakes: json.snakes.map(decodeSnake),
    clocks: json.clocks.map((c) => ({
      centaurTeamId: c.centaurTeamId as CentaurTeamId,
      budgetMs: c.budgetMs,
      perTurnMs: c.perTurnMs,
      declaredTurnOver: c.declaredTurnOver,
    })),
  };
}

function decodeAgent(agent: AgentJson): Agent {
  return agent.kind === "centaur_team"
    ? { kind: "centaur_team", centaurTeamId: agent.centaurTeamId as CentaurTeamId }
    : { kind: "operator", operatorUserId: agent.operatorUserId as UserId };
}

export function decodeStagedMoves(
  json: Readonly<Record<string, StagedMoveJson>>,
): ReadonlyMap<SnakeId, StagedMove> {
  const out = new Map<SnakeId, StagedMove>();
  for (const [key, m] of Object.entries(json).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    out.set(Number(key) as SnakeId, {
      direction: m.direction as Direction,
      stagedBy: decodeAgent(m.stagedBy),
    });
  }
  return out;
}

export function decodeEvent(json: TurnEventJson): TurnEvent {
  // The JSON types are structurally a superset (widened string/number
  // literals); validation (schema.ts) is responsible for vocabulary checks
  // before decode. The cast localises the brand/narrowing in one place.
  return json as unknown as TurnEvent;
}

export function decodeOutcome(json: GameOutcomeJson): GameOutcome {
  switch (json.kind) {
    case "in_progress":
      return { kind: "in_progress" };
    case "victory":
      return {
        kind: "victory",
        winnerCentaurTeamId: json.winnerCentaurTeamId as CentaurTeamId,
        scores: new Map(
          Object.entries(json.scores).map(([k, v]) => [k as CentaurTeamId, v]),
        ) as ReadonlyMap<CentaurTeamId, number>,
      };
    case "draw":
      return {
        kind: "draw",
        tiedCentaurTeamIds: json.tiedCentaurTeamIds as ReadonlyArray<CentaurTeamId>,
        scores: new Map(
          Object.entries(json.scores).map(([k, v]) => [k as CentaurTeamId, v]),
        ) as ReadonlyMap<CentaurTeamId, number>,
      };
    case "error":
      return { kind: "error", reason: json.reason };
  }
}

export function decodeTurnOutput(json: TurnOutputJson): TurnOutput {
  return {
    nextState: decodeGameState(json.nextState),
    events: json.events.map(decodeEvent),
    outcome: decodeOutcome(json.outcome),
  };
}

export function decodeTestSequence(doc: TestSequenceDoc): TestSequence {
  return {
    name: doc.name,
    gameSeed: hexToBytes(doc.gameSeed),
    config: doc.config,
    initialState: decodeGameState(doc.initialState),
    turns: doc.turns.map((t) => ({
      turnNumber: t.turnNumber as TurnNumber,
      stagedMoves: decodeStagedMoves(t.stagedMoves),
      expected: decodeTurnOutput(t.expected),
    })),
  };
}

// Re-canonicalise a document that has been through a value-preserving but
// order-mangling channel (e.g. a jsonb column) back to the canonical
// encoding. design: add-visual-tester (D6) — round-trip fidelity is
// value-level; display/copy always go through this.
export function canonicalizeDoc(doc: TestSequenceDoc): TestSequenceDoc {
  return encodeTestSequence(decodeTestSequence(doc));
}
