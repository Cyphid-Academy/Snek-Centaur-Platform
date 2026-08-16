// spec: game-configuration/config-lives-on-the-game,
// game-configuration/closed-parameter-vocabulary,
// game-configuration/parameter-bounds-sourcing,
// game-configuration/bounded-game-duration, game-configuration/launch-freeze,
// game-configuration/board-preview, game-configuration/board-preview-lock-in,
// game-configuration/infeasibility-surfaced,
// game-configuration/conditional-parameter-semantics
import type { GameRuntimeConfig, ParameterDescriptor } from "@cyphid/snek-engine";
import { CellType, RUNTIME_PARAMETER_DESCRIPTORS } from "@cyphid/snek-engine";
import { describe, expect, it } from "vitest";
import type { TeamRegistration } from "./boardgen.js";
import { generateBoardAndInitialState } from "./boardgen.js";
import { GENERATION_PARAMETER_DESCRIPTORS } from "./config-descriptors.js";
import type { BoardGenerationConfig, GameConfig } from "./config.js";
import { DEFAULT_GAME_CONFIG } from "./config.js";
import type { ConfigOpResult, ConfigRecordState, GenerationInputs, PreviewSlot } from "./record.js";
import {
  applyConfigEdit,
  applyRosterChange,
  concludeWithoutLaunch,
  createRecord,
  generationInputsChanged,
  launch,
  regeneratePreview,
  setBoardLock,
  validateConfig,
} from "./record.js";
import { seed, tid } from "./testkit.js";

const TEAMS: ReadonlyArray<TeamRegistration> = [
  { centaurTeamId: tid("red"), name: "Red" },
  { centaurTeamId: tid("blue"), name: "Blue" },
];
const THREE_TEAMS: ReadonlyArray<TeamRegistration> = [
  ...TEAMS,
  { centaurTeamId: tid("green"), name: "Green" },
];

/** Unwraps a successful ConfigOpResult, failing the test loudly otherwise. */
function unwrapOk(result: ConfigOpResult): ConfigRecordState {
  if (!result.ok) throw new Error(`expected ok, got rejection ${JSON.stringify(result.rejection)}`);
  return result.record;
}

/** Deep-set a dotted path on a plain object, returning a new object. */
function setAtPath(
  obj: Record<string, unknown>,
  path: string,
  value: number,
): Record<string, unknown> {
  const dot = path.indexOf(".");
  if (dot === -1) return { ...obj, [path]: value };
  const head = path.slice(0, dot);
  const rest = path.slice(dot + 1);
  return { ...obj, [head]: setAtPath(obj[head] as Record<string, unknown>, rest, value) };
}

/** Build a full GameConfig with one leaf of one half overridden from DEFAULT_GAME_CONFIG. */
function cfgWith(half: "generation" | "runtime", path: string, value: number): GameConfig {
  if (half === "generation") {
    return {
      ...DEFAULT_GAME_CONFIG,
      generation: setAtPath(
        DEFAULT_GAME_CONFIG.generation as unknown as Record<string, unknown>,
        path,
        value,
      ) as unknown as BoardGenerationConfig,
    };
  }
  return {
    ...DEFAULT_GAME_CONFIG,
    runtime: setAtPath(
      DEFAULT_GAME_CONFIG.runtime as unknown as Record<string, unknown>,
      path,
      value,
    ) as unknown as GameRuntimeConfig,
  };
}

/** The largest value below `d.min` that is not itself the disable sentinel. */
function belowMin(d: ParameterDescriptor): number {
  const candidate = d.min - 1;
  return d.disableSentinel !== undefined && candidate === d.disableSentinel ? d.min - 2 : candidate;
}

/** The smallest value above `d.max` that is not itself the disable sentinel. */
function aboveMax(d: ParameterDescriptor): number {
  const candidate = d.max + 1;
  return d.disableSentinel !== undefined && candidate === d.disableSentinel ? d.max + 2 : candidate;
}

// A config known to be infeasible for TEAMS: a 7x7 board (5x5 inner = 25
// cells) cannot seat 10 snakes per team.
function infeasibleConfig(base: GameConfig): GameConfig {
  return { ...base, generation: { ...base.generation, boardSize: 7, snakesPerTeam: 10 } };
}

describe("createRecord", () => {
  it("is valid from birth", () => {
    expect(validateConfig(createRecord().config).ok).toBe(true);
  });

  it("starts configuring, with an empty roster, no preview, unlocked, no starting state", () => {
    const record = createRecord();
    expect(record.phase).toBe("configuring");
    expect(record.teams).toEqual([]);
    expect(record.currentPreview).toBeNull();
    expect(record.boardLocked).toBe(false);
    expect(record.startingState).toBeNull();
    expect(record.startingStateHidden).toBe(false);
    expect(record.config).toEqual(DEFAULT_GAME_CONFIG);
  });

  // spec: game-configuration/generation-parameters#a-default-for-every-generation-parameter
  it("carries maxTurns 100, so bounded-duration holds from birth", () => {
    expect(createRecord().config.runtime.maxTurns).toBe(100);
  });
});

describe("validateConfig — every descriptor's boundaries", () => {
  const allDescriptors: ReadonlyArray<{ half: "generation" | "runtime"; d: ParameterDescriptor }> =
    [
      ...GENERATION_PARAMETER_DESCRIPTORS.map((d) => ({ half: "generation" as const, d })),
      ...RUNTIME_PARAMETER_DESCRIPTORS.map((d) => ({ half: "runtime" as const, d })),
    ];

  for (const { half, d } of allDescriptors) {
    const fullPath = `${half}.${d.path}`;

    it(`accepts ${fullPath} at its min and max`, () => {
      expect(validateConfig(cfgWith(half, d.path, d.min)).ok).toBe(true);
      expect(validateConfig(cfgWith(half, d.path, d.max)).ok).toBe(true);
    });

    it(`rejects ${fullPath} below its min, naming the parameter`, () => {
      const value = belowMin(d);
      const result = validateConfig(cfgWith(half, d.path, value));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.rejection).toMatchObject({
          kind: "invalid-parameter",
          path: fullPath,
          reason: "OUT_OF_RANGE",
          value,
        });
      }
    });

    it(`rejects ${fullPath} above its max, naming the parameter`, () => {
      const value = aboveMax(d);
      const result = validateConfig(cfgWith(half, d.path, value));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.rejection).toMatchObject({
          kind: "invalid-parameter",
          path: fullPath,
          reason: "OUT_OF_RANGE",
          value,
        });
      }
    });

    if (d.kind === "integer") {
      it(`rejects a non-integer value for ${fullPath}`, () => {
        const result = validateConfig(cfgWith(half, d.path, d.min + 0.5));
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.rejection).toMatchObject({
            kind: "invalid-parameter",
            path: fullPath,
            reason: "NOT_INTEGER",
          });
        }
      });
    }
  }
});

describe("bounded-game-duration", () => {
  it("rejects both limits at their sentinels", () => {
    const cfg: GameConfig = {
      ...DEFAULT_GAME_CONFIG,
      runtime: { ...DEFAULT_GAME_CONFIG.runtime, maxTurns: 0, maxGameDurationMs: 0 },
    };
    const result = validateConfig(cfg);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection).toEqual({ kind: "unbounded-duration" });
  });

  // spec: #a-turn-limit-alone-is-valid
  it("accepts a turn limit alone", () => {
    const cfg: GameConfig = {
      ...DEFAULT_GAME_CONFIG,
      runtime: { ...DEFAULT_GAME_CONFIG.runtime, maxTurns: 50, maxGameDurationMs: 0 },
    };
    expect(validateConfig(cfg).ok).toBe(true);
  });

  // spec: #a-duration-limit-alone-is-valid
  it("accepts a duration limit alone", () => {
    const cfg: GameConfig = {
      ...DEFAULT_GAME_CONFIG,
      runtime: { ...DEFAULT_GAME_CONFIG.runtime, maxTurns: 0, maxGameDurationMs: 60000 },
    };
    expect(validateConfig(cfg).ok).toBe(true);
  });

  // spec: #switching-which-limit-applies
  it("switches turn-limited to duration-limited: setting duration before disabling turns", () => {
    let record = createRecord();
    const step1 = applyConfigEdit(record, {
      ...record.config,
      runtime: { ...record.config.runtime, maxGameDurationMs: 300000 },
    });
    expect(step1.ok).toBe(true);
    record = unwrapOk(step1);
    expect(record.config.runtime).toMatchObject({ maxTurns: 100, maxGameDurationMs: 300000 });

    const step2 = applyConfigEdit(record, {
      ...record.config,
      runtime: { ...record.config.runtime, maxTurns: 0 },
    });
    expect(step2.ok).toBe(true);
    record = unwrapOk(step2);
    expect(record.config.runtime).toMatchObject({ maxTurns: 0, maxGameDurationMs: 300000 });
  });

  // spec: #switching-which-limit-applies, the other direction
  it("switches duration-limited to turn-limited: setting turns before disabling duration", () => {
    let record = unwrapOk(
      applyConfigEdit(createRecord(), {
        ...DEFAULT_GAME_CONFIG,
        runtime: { ...DEFAULT_GAME_CONFIG.runtime, maxTurns: 0, maxGameDurationMs: 45000 },
      }),
    );
    const step1 = applyConfigEdit(record, {
      ...record.config,
      runtime: { ...record.config.runtime, maxTurns: 80 },
    });
    expect(step1.ok).toBe(true);
    record = unwrapOk(step1);
    const step2 = applyConfigEdit(record, {
      ...record.config,
      runtime: { ...record.config.runtime, maxGameDurationMs: 0 },
    });
    expect(step2.ok).toBe(true);
    record = unwrapOk(step2);
    expect(record.config.runtime).toMatchObject({ maxTurns: 80, maxGameDurationMs: 0 });
  });

  // spec: #neither-limit-is-rejected
  it("refuses disabling the turn limit while duration is already disabled", () => {
    const record = createRecord();
    const result = applyConfigEdit(record, {
      ...record.config,
      runtime: { ...record.config.runtime, maxTurns: 0 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection).toEqual({ kind: "unbounded-duration" });
  });

  it("refuses disabling both limits in the same edit", () => {
    const record = createRecord();
    const result = applyConfigEdit(record, {
      ...record.config,
      runtime: { ...record.config.runtime, maxTurns: 0, maxGameDurationMs: 0 },
    });
    expect(result.ok).toBe(false);
  });

  // spec: #launch-cannot-freeze-an-unbounded-game
  it("refuses to launch a both-zero record injected directly, bypassing normal edit validation", () => {
    let record = createRecord();
    record = unwrapOk(applyRosterChange(record, TEAMS));
    const corrupt: ConfigRecordState = {
      ...record,
      config: {
        ...record.config,
        runtime: { ...record.config.runtime, maxTurns: 0, maxGameDurationMs: 0 },
      },
    };
    const result = launch(corrupt, seed(1));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection).toEqual({ kind: "unbounded-duration" });
  });
});

describe("launch-freeze", () => {
  function playingRecord(): ConfigRecordState {
    let record = createRecord();
    record = unwrapOk(applyRosterChange(record, TEAMS));
    const launched = launch(record, seed(5));
    if (!launched.ok) throw new Error("expected launch to succeed");
    return launched.record;
  }

  function neverLaunchedRecord(): ConfigRecordState {
    let record = createRecord();
    record = unwrapOk(applyRosterChange(record, TEAMS));
    return unwrapOk(concludeWithoutLaunch(record));
  }

  it.each([
    ["playing", playingRecord()],
    ["finished without ever launching", neverLaunchedRecord()],
  ] as const)("rejects every write once the game is %s", (_label, record) => {
    const expected = { ok: false, rejection: { kind: "wrong-phase", phase: record.phase } };
    expect(applyConfigEdit(record, record.config)).toEqual(expected);
    expect(applyRosterChange(record, TEAMS)).toEqual(expected);
    expect(setBoardLock(record, true)).toEqual(expected);
    expect(setBoardLock(record, false)).toEqual(expected);
    expect(regeneratePreview(record, seed(1))).toEqual(expected);
    expect(launch(record, seed(1))).toEqual(expected);
    expect(concludeWithoutLaunch(record)).toEqual(expected);
  });

  // spec: #editable-until-launch
  it("is editable until launch, and launch freezes exactly the then-current values", () => {
    let record = createRecord();
    record = unwrapOk(applyRosterChange(record, TEAMS));
    record = unwrapOk(
      applyConfigEdit(record, {
        ...record.config,
        runtime: { ...record.config.runtime, maxHealth: 250 },
      }),
    );
    const launched = launch(record, seed(11));
    if (!launched.ok) throw new Error("expected launch to succeed");
    expect(launched.record.config.runtime.maxHealth).toBe(250);
    expect(launched.record.startingState?.snakes.every((s) => s.health === 250)).toBe(true);
  });
});

describe("applyRosterChange — structural validation", () => {
  it("refuses an empty roster", () => {
    const result = applyRosterChange(createRecord(), []);
    expect(result).toEqual({ ok: false, rejection: { kind: "empty-roster" } });
  });

  it("refuses duplicate team ids", () => {
    const dup: ReadonlyArray<TeamRegistration> = [
      { centaurTeamId: tid("red"), name: "Red" },
      { centaurTeamId: tid("red"), name: "Also Red" },
    ];
    const result = applyRosterChange(createRecord(), dup);
    expect(result).toEqual({
      ok: false,
      rejection: { kind: "duplicate-team-id", centaurTeamId: tid("red") },
    });
  });

  // spec: board-generation-retry — infeasibility is generation's to report,
  // not this structural check's.
  it("accepts a roster generation cannot seat — that is generation's failure to report, not this op's", () => {
    const result = applyRosterChange(createRecord(), TEAMS);
    expect(result.ok).toBe(true);
  });
});

describe("board-preview-lock-in", () => {
  function lockedRecordWithPreview(): { record: ConfigRecordState; preview: PreviewSlot } {
    let record = createRecord();
    record = unwrapOk(applyRosterChange(record, TEAMS));
    record = unwrapOk(regeneratePreview(record, seed(4)));
    const preview = record.currentPreview;
    if (preview === null || "code" in preview.result)
      throw new Error("expected a successful preview");
    record = unwrapOk(setBoardLock(record, true));
    return { record, preview };
  }

  // spec: #board-affecting-edit-clears-the-lock
  it("a generation-affecting edit clears the lock and signals regenerate", () => {
    const { record } = lockedRecordWithPreview();
    const result = applyConfigEdit(record, {
      ...record.config,
      generation: { ...record.config.generation, boardSize: 15 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.regenerate).toBe(true);
      expect(result.record.boardLocked).toBe(false);
    }
  });

  // spec: #roster-change-clears-the-lock — always, even resubmitting the
  // same roster: there is no "no-op roster change" case, unlike op 3's
  // gameplay/generation partition.
  it("a roster change clears the lock and signals regenerate, even resubmitting the same roster", () => {
    const { record } = lockedRecordWithPreview();
    const result = applyRosterChange(record, TEAMS);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.regenerate).toBe(true);
      expect(result.record.boardLocked).toBe(false);
    }
  });

  it("a roster change to a genuinely different roster also clears the lock", () => {
    const { record } = lockedRecordWithPreview();
    const result = applyRosterChange(record, THREE_TEAMS);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.regenerate).toBe(true);
      expect(result.record.boardLocked).toBe(false);
    }
  });

  // spec: #a-dynamic-gameplay-edit-leaves-the-lock-standing
  it("a dynamic gameplay-only edit leaves the lock and the preview standing", () => {
    const { record, preview } = lockedRecordWithPreview();
    const result = applyConfigEdit(record, {
      ...record.config,
      runtime: { ...record.config.runtime, hazardDamage: 30 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.regenerate).toBe(false);
      expect(result.record.boardLocked).toBe(true);
      expect(result.record.currentPreview).toBe(record.currentPreview);
      expect(result.record.currentPreview?.result).toBe(preview.result);
    }
  });

  // spec: #lock-toggles-freely-before-launch
  it("the lock toggles freely before launch", () => {
    const { record } = lockedRecordWithPreview();
    const off = unwrapOk(setBoardLock(record, false));
    expect(off.boardLocked).toBe(false);
    const on = unwrapOk(setBoardLock(off, true));
    expect(on.boardLocked).toBe(true);
    const offAgain = unwrapOk(setBoardLock(on, false));
    expect(offAgain.boardLocked).toBe(false);
  });

  it("refuses to lock with no preview at all", () => {
    let record = createRecord();
    record = unwrapOk(applyRosterChange(record, TEAMS));
    expect(setBoardLock(record, true)).toEqual({
      ok: false,
      rejection: { kind: "no-lockable-preview" },
    });
  });

  it("refuses to lock a preview holding a failure", () => {
    let record = createRecord();
    record = unwrapOk(applyRosterChange(record, TEAMS));
    record = unwrapOk(applyConfigEdit(record, infeasibleConfig(record.config)));
    record = unwrapOk(regeneratePreview(record, seed(1)));
    const preview = record.currentPreview;
    if (preview === null || !("code" in preview.result))
      throw new Error("expected a failed preview");
    expect(setBoardLock(record, true)).toEqual({
      ok: false,
      rejection: { kind: "no-lockable-preview" },
    });
  });

  it("unlocking is always allowed pre-launch, even with no preview", () => {
    let record = createRecord();
    record = unwrapOk(applyRosterChange(record, TEAMS));
    expect(setBoardLock(record, false).ok).toBe(true);
  });
});

describe("launch", () => {
  // spec: #locked-board-launches-exactly
  it("a locked launch starts on exactly the designated preview result", () => {
    let record = createRecord();
    record = unwrapOk(applyRosterChange(record, TEAMS));
    record = unwrapOk(regeneratePreview(record, seed(3)));
    const preview = record.currentPreview;
    if (preview === null || "code" in preview.result)
      throw new Error("expected a successful preview");
    record = unwrapOk(setBoardLock(record, true));

    const launched = launch(record, seed(999)); // freshSeed must be ignored on the locked path
    if (!launched.ok) throw new Error("expected launch to succeed");
    expect(launched.record.phase).toBe("playing");
    expect(launched.record.startingState).toBe(preview.result);
    expect(launched.record.startingStateHidden).toBe(false);
  });

  // spec: #unlocked-regeneration-stays-hidden
  it("an unlocked launch generates fresh from freshSeed, hidden, differing from any standing preview", () => {
    let record = createRecord();
    record = unwrapOk(applyRosterChange(record, TEAMS));
    record = unwrapOk(regeneratePreview(record, seed(3))); // a candidate exists but is never locked
    const preview = record.currentPreview;
    if (preview === null || "code" in preview.result)
      throw new Error("expected a successful preview");

    const freshSeed = seed(77);
    const launched = launch(record, freshSeed);
    if (!launched.ok) throw new Error("expected launch to succeed");

    const expected = generateBoardAndInitialState(record.config, record.teams, freshSeed);
    if ("code" in expected) throw new Error("expected generation to succeed");
    expect(launched.record.startingState).toEqual(expected);
    expect(launched.record.startingState).not.toEqual(preview.result);
    expect(launched.record.startingStateHidden).toBe(true);
  });

  // spec: game-configuration/infeasibility-surfaced#failed-launch-halts
  it("halts without transitioning on an infeasible unlocked launch", () => {
    let record = createRecord();
    record = unwrapOk(applyRosterChange(record, TEAMS));
    record = unwrapOk(applyConfigEdit(record, infeasibleConfig(record.config)));

    const result = launch(record, seed(1));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejection.kind).toBe("generation-failed");
      if (result.rejection.kind === "generation-failed") {
        expect(result.rejection.failure.attemptsUsed).toBe(4);
      }
    }
  });
});

describe("board-preview", () => {
  // spec: #one-slot-no-archive
  it("overwrites the single slot — no archive of prior candidates", () => {
    let record = createRecord();
    record = unwrapOk(applyRosterChange(record, TEAMS));
    record = unwrapOk(regeneratePreview(record, seed(1)));
    const first = record.currentPreview;
    record = unwrapOk(regeneratePreview(record, seed(2)));
    const second = record.currentPreview;
    expect(record.currentPreview).toEqual(second);
    expect(record.currentPreview).not.toEqual(first);
  });

  it("reproduces identically for the same seed and inputs", () => {
    let record = createRecord();
    record = unwrapOk(applyRosterChange(record, TEAMS));
    const a = unwrapOk(regeneratePreview(record, seed(6))).currentPreview;
    const b = unwrapOk(regeneratePreview(record, seed(6))).currentPreview;
    expect(a).toEqual(b);
  });

  // spec: game-configuration/infeasibility-surfaced#failure-names-the-constraint
  it("stores a failure structurally, naming the constraint that failed", () => {
    let record = createRecord();
    record = unwrapOk(applyRosterChange(record, TEAMS));
    record = unwrapOk(applyConfigEdit(record, infeasibleConfig(record.config)));
    record = unwrapOk(regeneratePreview(record, seed(1)));
    const preview = record.currentPreview;
    if (preview === null) throw new Error("expected a preview slot");
    expect("code" in preview.result).toBe(true);
    if ("code" in preview.result) {
      expect([
        "HAZARD_CONNECTIVITY",
        "TERRITORY_PARITY_SHORTAGE",
        "INITIAL_FOOD_SHORTAGE",
      ]).toContain(preview.result.code);
      expect(preview.result.attemptsUsed).toBe(4);
    }
  });
});

// spec: game-configuration/conditional-parameter-semantics
describe("conditional-parameter-semantics", () => {
  it("validateConfig does not special-case a gated dependent value", () => {
    const cfg: GameConfig = {
      ...DEFAULT_GAME_CONFIG,
      generation: {
        ...DEFAULT_GAME_CONFIG.generation,
        fertileGround: { density: 0, clustering: 15 },
      },
    };
    expect(validateConfig(cfg).ok).toBe(true);
  });

  // spec: #gated-value-persists-and-is-ignored
  it("persists a gated dependent value and brings it into effect once its gate opens, without re-entry", () => {
    let record = createRecord();
    record = unwrapOk(applyRosterChange(record, TEAMS));

    // Gate off: density 0. Set a distinctive clustering value while gated.
    record = unwrapOk(
      applyConfigEdit(record, {
        ...record.config,
        generation: { ...record.config.generation, fertileGround: { density: 0, clustering: 17 } },
      }),
    );
    expect(record.config.generation.fertileGround.clustering).toBe(17); // persisted despite being gated

    record = unwrapOk(regeneratePreview(record, seed(9)));
    const gatedOff = record.currentPreview;
    if (gatedOff === null || "code" in gatedOff.result) throw new Error("expected success");
    const fertileCountGatedOff = gatedOff.result.board.cells.filter(
      (c) => c === CellType.Fertile,
    ).length;
    expect(fertileCountGatedOff).toBe(0); // ignored while gated

    // Raise density only — clustering is never re-entered, just carried by the spread.
    record = unwrapOk(
      applyConfigEdit(record, {
        ...record.config,
        generation: {
          ...record.config.generation,
          fertileGround: { ...record.config.generation.fertileGround, density: 40 },
        },
      }),
    );
    expect(record.config.generation.fertileGround.clustering).toBe(17); // untouched

    record = unwrapOk(regeneratePreview(record, seed(9))); // same seed as before — deterministic
    const gatedOn = record.currentPreview;
    if (gatedOn === null || "code" in gatedOn.result) throw new Error("expected success");
    const fertileCountGatedOn = gatedOn.result.board.cells.filter(
      (c) => c === CellType.Fertile,
    ).length;
    expect(fertileCountGatedOn).toBeGreaterThan(0);

    // Determinism: replaying the same seed against the same inputs reproduces the same fertile set.
    const replay = unwrapOk(regeneratePreview(record, seed(9))).currentPreview;
    if (replay === null || "code" in replay.result) throw new Error("expected success");
    expect(replay.result.board.cells).toEqual(gatedOn.result.board.cells);
  });
});

describe("generationInputsChanged", () => {
  const base: GenerationInputs = { generation: DEFAULT_GAME_CONFIG.generation, teams: TEAMS };

  it("is false for identical inputs", () => {
    expect(
      generationInputsChanged(base, { generation: DEFAULT_GAME_CONFIG.generation, teams: TEAMS }),
    ).toBe(false);
  });

  it("is true when a generation parameter differs", () => {
    const after: GenerationInputs = {
      generation: { ...base.generation, boardSize: 15 },
      teams: TEAMS,
    };
    expect(generationInputsChanged(base, after)).toBe(true);
  });

  it("is true when the roster's membership differs", () => {
    const after: GenerationInputs = { generation: base.generation, teams: THREE_TEAMS };
    expect(generationInputsChanged(base, after)).toBe(true);
  });

  it("is true when the roster differs only in order", () => {
    const reordered = [TEAMS[1], TEAMS[0]] as ReadonlyArray<TeamRegistration>;
    expect(generationInputsChanged(base, { generation: base.generation, teams: reordered })).toBe(
      true,
    );
  });
});

// spec: full-sequence replay — every operation is pure and deterministic, so
// the same script of ops over the same seeds gives identical final states.
describe("determinism", () => {
  function runScript(): ConfigRecordState {
    let record = createRecord();
    record = unwrapOk(applyRosterChange(record, TEAMS));
    record = unwrapOk(
      applyConfigEdit(record, {
        ...record.config,
        generation: { ...record.config.generation, hazardPercentage: 10 },
      }),
    );
    record = unwrapOk(regeneratePreview(record, seed(7)));
    record = unwrapOk(setBoardLock(record, true));
    record = unwrapOk(
      applyConfigEdit(record, {
        ...record.config,
        runtime: { ...record.config.runtime, hazardDamage: 25 },
      }),
    );
    const launched = launch(record, seed(99)); // ignored: locked
    if (!launched.ok) throw new Error("expected launch to succeed");
    return launched.record;
  }

  it("replays to identical final states", () => {
    const a = runScript();
    const b = runScript();
    expect(a).toEqual(b);
    expect(a.phase).toBe("playing");
    expect(a.boardLocked).toBe(true); // gameplay edit after locking never touched it
    expect(a.startingStateHidden).toBe(false); // locked launch
  });
});
