// The tester supplies the resolver's required timings.
// spec: visual-tester/turn-simulation, visual-tester/session-history
import { CellType, type CentaurTeamId } from "@cyphid/snek-engine";
import { describe, expect, it } from "vitest";
import { paintCell } from "./editor.js";
import { TesterStore } from "./store.svelte.js";

/** A store with one snake placed, ready to simulate. */
function ready(): TesterStore {
  const store = new TesterStore();
  store.newBlank(11);
  store.addSnakeAt({ x: 5, y: 5 });
  return store;
}

const TEAM_0 = "team-0" as CentaurTeamId;

describe("the tool answers the resolver's timing inputs itself", () => {
  // spec: visual-tester/turn-simulation#a-default-that-needs-no-attention
  it("supplies the default duration as the turn's length and every team's burn", () => {
    const store = ready();
    store.simulate();
    const record = store.session.turns[0];
    expect(record?.timings.durationMs).toBe(500);
    expect(record?.timings.burnMs.get(TEAM_0)).toBe(500);
  });

  it("uses a changed default from the next advance onwards", () => {
    const store = ready();
    store.setDefaultTurnDuration(1200);
    store.simulate();
    expect(store.session.turns[0]?.timings.durationMs).toBe(1200);
  });

  // spec: visual-tester/turn-simulation#per-advance-values-reach-the-timed-endings
  it("applies a per-advance duration and burn, then clears them", () => {
    const store = ready();
    store.setTurnDurationOverride(9000);
    store.setBurnOverride(TEAM_0, 8000);
    store.simulate();
    const first = store.session.turns[0];
    expect(first?.timings.durationMs).toBe(9000);
    expect(first?.timings.burnMs.get(TEAM_0)).toBe(8000);
    // The override was for one advance; the next falls back to the default.
    expect(store.turnDurationOverrideMs).toBeNull();
    expect(store.burnOverrides.size).toBe(0);
    store.simulate();
    expect(store.session.turns[1]?.timings.durationMs).toBe(500);
  });

  // The endings that depend on time are reachable in the tool itself, with no
  // clock-editing surface: a large burn on each advance runs the clock down.
  // A burn spends the per-turn clock and no more, so a team with budget left
  // survives the first one — which is the arithmetic, not a limitation.
  // spec: visual-tester/turn-simulation#per-advance-values-reach-the-timed-endings
  it("drives a team to the end of its clock, killing its snakes", () => {
    const store = ready();
    const causes: string[] = [];
    for (let i = 0; i < 5 && causes.length === 0; i++) {
      store.setTurnDurationOverride(10 ** 9);
      store.simulate();
      for (const e of store.session.turns[i]?.events ?? []) {
        if (e.kind === "snake_died") causes.push(e.cause);
      }
    }
    expect(causes).toEqual(["clock_exhaustion"]);
  });
});

describe("scrubbing back and re-simulating (visual-tester/session-history)", () => {
  // spec: visual-tester/session-history#a-re-simulated-turn-reuses-its-timings
  it("re-supplies the timings the turn recorded, not the current default", () => {
    const store = ready();
    store.setTurnDurationOverride(2500);
    store.simulate();
    const before = store.session.turns[0];
    expect(before?.timings.durationMs).toBe(2500);

    // A later default change must not reach back into an untouched turn.
    store.setDefaultTurnDuration(50);
    store.scrubTo(0);
    store.simulate();
    const after = store.session.turns[0];
    expect(after?.timings.durationMs).toBe(2500);
    expect(after?.nextState).toEqual(before?.nextState);
    expect(after?.outcome).toEqual(before?.outcome);
  });

  it("uses the current values when the tester overrides them at the scrubbed turn", () => {
    const store = ready();
    store.simulate();
    store.scrubTo(0);
    store.setTurnDurationOverride(4000);
    store.simulate();
    expect(store.session.turns[0]?.timings.durationMs).toBe(4000);
  });
});

describe("a generated board is a session like any other", () => {
  // The tool calls the platform's one shared generator rather than growing
  // one of its own. spec: global-invariants/one-shared-generation
  it("starts a session on what the shared generator returns", () => {
    const store = new TesterStore();
    store.newFromBoardgen();
    expect(store.notice).toBeNull();
    expect(store.currentState.snakes.length).toBeGreaterThan(0);
    // Editable afterwards exactly as a hand-authored board is.
    const before = store.currentState.board.cells.filter((c) => c === CellType.Hazard).length;
    store.applyEdit((s) => paintCell(s, { x: 1, y: 1 }, CellType.Hazard));
    expect(store.currentState.board.cells.filter((c) => c === CellType.Hazard).length).toBe(
      before + 1,
    );
  });
});
