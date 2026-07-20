// Zod schema + validation for Test Sequence documents.
//
// spec: test-sequences/validation — structural conformance, closed
// vocabularies, referential integrity, path-addressed errors.
// spec: test-sequences/schema-version — version gate before any other
// interpretation.
// design: add-visual-tester (D7) — Zod schema colocated with the codec,
// no Svelte imports.

import { z } from "zod";
import { type GameStateJson, SCHEMA_VERSION, type TestSequenceDoc } from "./codec.js";

export const SUPPORTED_SCHEMA_VERSIONS: ReadonlyArray<number> = [SCHEMA_VERSION];

export interface ValidationError {
  readonly path: string; // e.g. "turns[2].stagedMoves.7.direction"
  readonly message: string;
}

export type ValidationResult =
  | { readonly ok: true; readonly doc: TestSequenceDoc }
  | { readonly ok: false; readonly errors: ReadonlyArray<ValidationError> };

// ---------------------------------------------------------------------------
// Path formatting
// ---------------------------------------------------------------------------

function formatPath(path: ReadonlyArray<PropertyKey>): string {
  let out = "";
  for (const seg of path) {
    if (typeof seg === "number") out += `[${seg}]`;
    else out += out === "" ? String(seg) : `.${String(seg)}`;
  }
  return out === "" ? "(document root)" : out;
}

// ---------------------------------------------------------------------------
// Closed vocabularies (game-rules/domain-vocabulary)
// ---------------------------------------------------------------------------

const directionSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)], {
  error: "must be a Direction (0=Up, 1=Right, 2=Down, 3=Left)",
});
const cellTypeSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)], {
  error: "must be a CellType (0=Normal, 1=Wall, 2=Hazard, 3=Fertile)",
});
const itemTypeSchema = z.union([z.literal(0), z.literal(1), z.literal(2)], {
  error: "must be an ItemType (0=Food, 1=InvulnPotion, 2=InvisPotion)",
});
const potionTypeSchema = z.union([z.literal(1), z.literal(2)], {
  error: "must be a PotionType (1=InvulnPotion, 2=InvisPotion)",
});
const effectFamilySchema = z.enum(["invulnerability", "invisibility"]);
const effectStateSchema = z.enum(["buff", "debuff"]);
const deathCauseSchema = z.enum([
  "wall",
  "self_collision",
  "body_collision",
  "head_to_head",
  "health_depletion",
]);
const damageSourceSchema = z.enum(["tick", "hazard"]);
const cancelReasonSchema = z.enum(["collector_disruption", "expiry", "replaced"]);

// ---------------------------------------------------------------------------
// Structural schemas (strict: unknown keys are canonical-encoding violations)
// ---------------------------------------------------------------------------

const nonNegInt = z.number().int().nonnegative();

const cellSchema = z.strictObject({ x: nonNegInt, y: nonNegInt });

const snakeIdSchema = nonNegInt;

const numericKeySchema = z
  .string()
  .regex(/^(0|[1-9][0-9]*)$/, "must be a canonical non-negative integer key");

const agentSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("centaur_team"), centaurTeamId: z.string().min(1) }),
  z.strictObject({ kind: z.literal("operator"), operatorUserId: z.string().min(1) }),
]);

const potionEffectSchema = z.strictObject({
  family: effectFamilySchema,
  state: effectStateSchema,
  expiryTurn: nonNegInt,
});

const snakeSchema = z.strictObject({
  snakeId: snakeIdSchema,
  letter: z.string().regex(/^[A-Za-z]$/, "must be a single alphabetic character"),
  centaurTeamId: z.string().min(1),
  // spec: test-sequences/validation — structural conformance includes body
  // contiguity: each consecutive segment pair is orthogonally adjacent or
  // shares a cell (stacked), the only shapes game-rules/movement produces.
  body: z
    .array(cellSchema)
    .min(1, "snake body must have at least one segment")
    .superRefine((body, ctx) => {
      for (let i = 1; i < body.length; i++) {
        const a = body[i - 1];
        const b = body[i];
        if (a === undefined || b === undefined) continue;
        if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 1) {
          ctx.addIssue({
            code: "custom",
            path: [i],
            message: `segments ${i - 1} (${a.x},${a.y}) and ${i} (${b.x},${b.y}) are not contiguous (orthogonally adjacent or stacked)`,
          });
        }
      }
    }),
  health: nonNegInt,
  activeEffects: z.array(potionEffectSchema),
  lastDirection: directionSchema.nullable(),
  alive: z.boolean(),
});

const boardSchema = z.strictObject({
  boardSize: z.number().int().positive(),
  cells: z.array(cellTypeSchema),
});

const itemSchema = z.strictObject({
  itemType: itemTypeSchema,
  spawnTurn: nonNegInt,
  spawnIndex: nonNegInt,
  cell: cellSchema,
});

const clockSchema = z.strictObject({
  centaurTeamId: z.string().min(1),
  budgetMs: z.number(),
  perTurnMs: z.number(),
  declaredTurnOver: z.boolean(),
});

const gameStateSchema = z
  .strictObject({
    board: boardSchema,
    items: z.record(numericKeySchema, itemSchema),
    snakes: z.array(snakeSchema),
    clocks: z.array(clockSchema),
  })
  .superRefine((state, ctx) => {
    const size = state.board.boardSize;
    if (state.board.cells.length !== size * size) {
      ctx.addIssue({
        code: "custom",
        path: ["board", "cells"],
        message: `must have boardSize² = ${size * size} entries, got ${state.board.cells.length}`,
      });
    }
    // Referential integrity of the item map: key is the canonical cell index
    // `y * boardSize + x` of the item's own cell (game-rules/item-identity).
    for (const [key, item] of Object.entries(state.items)) {
      const expected = item.cell.y * size + item.cell.x;
      if (Number(key) !== expected) {
        ctx.addIssue({
          code: "custom",
          path: ["items", key],
          message: `item map key ${key} does not match the item's cell index ${expected} (cell ${item.cell.x},${item.cell.y})`,
        });
      }
    }
    const seenSnakeIds = new Set<number>();
    for (const [i, snake] of state.snakes.entries()) {
      if (seenSnakeIds.has(snake.snakeId)) {
        ctx.addIssue({
          code: "custom",
          path: ["snakes", i, "snakeId"],
          message: `duplicate snake id ${snake.snakeId}`,
        });
      }
      seenSnakeIds.add(snake.snakeId);
    }
  });

const stagedMoveSchema = z.strictObject({
  direction: directionSchema,
  stagedBy: agentSchema,
});

const scoresSchema = z.record(z.string(), z.number());

const outcomeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("in_progress") }),
  z.strictObject({
    kind: z.literal("victory"),
    winnerCentaurTeamId: z.string().min(1),
    scores: scoresSchema,
  }),
  z.strictObject({
    kind: z.literal("draw"),
    tiedCentaurTeamIds: z.array(z.string().min(1)),
    scores: scoresSchema,
  }),
  z.strictObject({ kind: z.literal("error"), reason: z.string() }),
]);

const eventSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("snake_moved"),
    snakeId: snakeIdSchema,
    from: cellSchema,
    to: cellSchema,
    direction: directionSchema,
    stagedBy: agentSchema.nullable(),
  }),
  z.strictObject({
    kind: z.literal("snake_died"),
    snakeId: snakeIdSchema,
    cause: deathCauseSchema,
    killerSnakeId: snakeIdSchema.nullable(),
    location: cellSchema,
    sources: z.array(damageSourceSchema).optional(),
  }),
  z.strictObject({
    kind: z.literal("snake_severed"),
    attackerSnakeId: snakeIdSchema,
    victimSnakeId: snakeIdSchema,
    contactCell: cellSchema,
    segmentsLost: nonNegInt,
  }),
  z.strictObject({
    kind: z.literal("food_eaten"),
    snakeId: snakeIdSchema,
    itemId: z.string().min(1),
    cell: cellSchema,
    healthRestored: nonNegInt,
  }),
  z.strictObject({
    kind: z.literal("potion_collected"),
    snakeId: snakeIdSchema,
    itemId: z.string().min(1),
    cell: cellSchema,
    potionType: potionTypeSchema,
    affectedTeammateIds: z.array(snakeIdSchema),
  }),
  z.strictObject({
    kind: z.literal("food_spawned"),
    spawnTurn: nonNegInt,
    spawnIndex: nonNegInt,
    cell: cellSchema,
  }),
  z.strictObject({
    kind: z.literal("potion_spawned"),
    spawnTurn: nonNegInt,
    spawnIndex: nonNegInt,
    cell: cellSchema,
    potionType: potionTypeSchema,
  }),
  z.strictObject({
    kind: z.literal("effect_applied"),
    snakeId: snakeIdSchema,
    family: effectFamilySchema,
    state: effectStateSchema,
    expiryTurn: nonNegInt,
  }),
  z.strictObject({
    kind: z.literal("effect_cancelled"),
    snakeId: snakeIdSchema,
    family: effectFamilySchema,
    reason: cancelReasonSchema,
  }),
]);

const configSchema = z.strictObject({
  orchestration: z.strictObject({
    boardSize: z.number().int().positive(),
    snakesPerTeam: z.number().int().positive(),
    hazardPercentage: z.number(),
    fertileGround: z.strictObject({ density: z.number(), clustering: z.number() }),
  }),
  runtime: z.strictObject({
    maxHealth: z.number().int().positive(),
    maxTurns: nonNegInt,
    hazardDamage: z.number(),
    foodSpawnRate: z.number(),
    invulnPotionSpawnRate: z.number(),
    invisPotionSpawnRate: z.number(),
    clock: z.strictObject({
      initialBudgetMs: z.number(),
      budgetIncrementMs: z.number(),
      firstTurnTimeMs: z.number(),
      maxTurnTimeMs: z.number(),
    }),
  }),
});

const turnSchema = z.strictObject({
  turnNumber: nonNegInt,
  stagedMoves: z.record(numericKeySchema, stagedMoveSchema),
  expected: z.strictObject({
    nextState: gameStateSchema,
    events: z.array(eventSchema),
    outcome: outcomeSchema,
  }),
});

const docSchema = z.strictObject({
  schemaVersion: z.number().int(),
  name: z.string().min(1, "sequence name must be non-empty"),
  gameSeed: z
    .string()
    .regex(/^[0-9a-f]{64}$/, "must be exactly 64 lowercase hex characters (a 32-byte seed)"),
  config: configSchema,
  initialState: gameStateSchema,
  turns: z.array(turnSchema),
});

// ---------------------------------------------------------------------------
// Cross-turn referential integrity
// ---------------------------------------------------------------------------

// spec: test-sequences/validation#referential-integrity — every snake
// referenced by a staged move must exist in the state that turn resolves
// from (the recorded pre-state: initialState for the first turn, the
// previous turn's expected nextState afterwards).
function checkCrossTurnIntegrity(doc: z.infer<typeof docSchema>): ValidationError[] {
  const errors: ValidationError[] = [];
  let preState: GameStateJson = doc.initialState;
  let prevTurnNumber: number | null = null;

  for (const [i, turn] of doc.turns.entries()) {
    if (prevTurnNumber !== null && turn.turnNumber !== prevTurnNumber + 1) {
      errors.push({
        path: `turns[${i}].turnNumber`,
        message: `turn numbers must be consecutive: expected ${prevTurnNumber + 1}, got ${turn.turnNumber}`,
      });
    }
    prevTurnNumber = turn.turnNumber;

    const knownIds = new Set(preState.snakes.map((s) => s.snakeId));
    for (const key of Object.keys(turn.stagedMoves)) {
      if (!knownIds.has(Number(key))) {
        errors.push({
          path: `turns[${i}].stagedMoves.${key}`,
          message: `turn ${turn.turnNumber} stages a move for unknown snake id ${key} (not present in that turn's pre-state)`,
        });
      }
    }
    preState = turn.expected.nextState;
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

// spec: test-sequences/validation#invalid-document-creates-nothing — a
// document is either fully accepted or rejected with path-addressed errors;
// callers never receive a partially interpreted result.
export function validateTestSequenceDoc(input: unknown): ValidationResult {
  // spec: test-sequences/schema-version#unknown-version-rejected — the
  // version gate runs first; an unsupported document is never partially
  // interpreted against the wrong schema.
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, errors: [{ path: "(document root)", message: "must be a JSON object" }] };
  }
  const version = (input as { schemaVersion?: unknown }).schemaVersion;
  if (typeof version !== "number" || !Number.isInteger(version)) {
    return {
      ok: false,
      errors: [{ path: "schemaVersion", message: "must be an integer schema version" }],
    };
  }
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(version)) {
    return {
      ok: false,
      errors: [
        {
          path: "schemaVersion",
          message: `unsupported schema version ${version}; supported version(s): ${SUPPORTED_SCHEMA_VERSIONS.join(", ")}`,
        },
      ],
    };
  }

  const parsed = docSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => ({
        path: formatPath(issue.path),
        message: issue.message,
      })),
    };
  }

  const integrityErrors = checkCrossTurnIntegrity(parsed.data);
  if (integrityErrors.length > 0) {
    return { ok: false, errors: integrityErrors };
  }

  return { ok: true, doc: parsed.data as TestSequenceDoc };
}
