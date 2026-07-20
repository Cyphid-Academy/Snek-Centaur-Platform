// Reactive session store for the visual tester UI (Svelte 5 runes).
//
// The Session value itself is immutable (see session.ts) and held in
// $state.raw — every operation replaces it wholesale, so snapshots stay
// untouched and reactivity is by reassignment.
//
// Auto-persistence (design D11): the working session is continuously saved to
// a scratch sequence with no explicit action. Head edits update the bound
// scratch in place (debounced); a middle edit or the first edit of a loaded
// fixture forks a new scratch (copying 0..k) and leaves the original on disk.
// The only explicit save is promoting a snapshot to a git-tracked fixture.
import { DEFAULT_GAME_CONFIG } from "@cyphid/snek-engine";
import type {
  Cell,
  CentaurTeamId,
  Direction,
  GameRuntimeConfig,
  GameState,
  SnakeId,
  SnakeState,
  StagedMove,
  UserId,
} from "@cyphid/snek-engine";
import { addSnake } from "./editor.js";
import type { EditResult } from "./editor.js";
import { blankState, boardgenState } from "./factory.js";
import { planPersist } from "./persistPlan.js";
import { implicatedCellIndices } from "./run.js";
import { randomSeed } from "./seed.js";
import {
  type SequenceClient,
  type SequenceListEntry,
  fetchSequenceClient,
} from "./sequenceClient.js";
import { sequenceToSession, sessionToSequence } from "./sequences.js";
import type { Session, TurnRecord } from "./session.js";
import {
  createSession,
  editConfigAt,
  editSeedAt,
  editStateAt,
  simulateNext,
  stateAt,
  truncateAfter,
  turnCount,
} from "./session.js";
import {
  type TestSequenceDoc,
  decodeTestSequence,
  encodeTestSequence,
} from "./test-sequences/codec.js";
import { type ReplayResult, runReplayCheck } from "./test-sequences/replay.js";

// spec: visual-tester/move-staging — moves are exclusively manual; the tool
// stages them as a single operator agent.
export const OPERATOR_AGENT = {
  kind: "operator",
  operatorUserId: "visual-tester" as UserId,
} as const;

export type SequenceFilter = "all" | "fixture" | "scratch";

export interface BoardgenSettings {
  boardSize: number;
  snakesPerTeam: number;
  hazardPercentage: number;
  density: number;
  clustering: number;
}

export interface TeamConfig {
  id: CentaurTeamId;
  name: string;
  colour: string;
}

// Sequence of default (name, colour) pairs auto-assigned as teams are added.
const TEAM_PALETTE: ReadonlyArray<{ name: string; colour: string }> = [
  { name: "Red", colour: "#ef4444" },
  { name: "Blue", colour: "#3b82f6" },
  { name: "Green", colour: "#22c55e" },
  { name: "Amber", colour: "#f59e0b" },
  { name: "Purple", colour: "#a855f7" },
  { name: "Pink", colour: "#ec4899" },
  { name: "Cyan", colour: "#06b6d4" },
  { name: "Orange", colour: "#f97316" },
];
const FALLBACK_COLOUR = "#94a3b8";

function paletteAt(i: number): { name: string; colour: string } {
  return (
    TEAM_PALETTE[i % TEAM_PALETTE.length] ?? { name: `Team ${i + 1}`, colour: FALLBACK_COLOUR }
  );
}

// Team ids are numeric (`team-0`, `team-1`, …), NOT derived from the name or
// colour — those stay editable without the id drifting out of sync. Returns
// the smallest free `team-<n>` given the ids already in use.
function nextTeamId(taken: ReadonlySet<string>): CentaurTeamId {
  let n = 0;
  while (taken.has(`team-${n}`)) n++;
  return `team-${n}` as CentaurTeamId;
}
function defaultTeams(): TeamConfig[] {
  const taken = new Set<string>();
  return [0, 1].map((i) => {
    const { name, colour } = paletteAt(i);
    const id = nextTeamId(taken);
    taken.add(id);
    return { id, name, colour };
  });
}

const HEX = "0123456789abcdef";
function seedTag(seed: Uint8Array): string {
  let s = "";
  for (let i = 0; i < 3 && i < seed.length; i++) {
    const b = seed[i] ?? 0;
    s += (HEX[(b >> 4) & 0xf] ?? "0") + (HEX[b & 0xf] ?? "0");
  }
  return s;
}

export class TesterStore {
  session = $state.raw<Session>(
    createSession(blankState(11), DEFAULT_GAME_CONFIG.runtime, randomSeed()),
  );
  /** History position being displayed: 0 = initial state .. turns.length. */
  cursor = $state(0);
  /** Pending staged moves for the next simulation from the cursor. */
  staged = $state.raw<ReadonlyMap<SnakeId, StagedMove>>(new Map());
  /** Last editor-boundary rejection (cleared by the next successful edit). */
  error = $state<string | null>(null);
  /** Boardgen failure message from the last "new from boardgen" attempt. */
  notice = $state<string | null>(null);
  /** Result of the last sequence run (cleared by any history mutation). */
  runResult = $state.raw<ReplayResult | null>(null);
  /** History position of the divergent turn shown by a failed run. */
  runCursor = $state<number | null>(null);
  /** Cell indices implicated by the failed run's differences. */
  runHighlights = $state.raw<ReadonlySet<number>>(new Set());

  /** Editable display name of the working session (auto-persist doc name). */
  name = $state("");
  /** Saved sequences (both tiers), newest first. */
  sequences = $state.raw<ReadonlyArray<SequenceListEntry>>([]);
  /** List filter for the sequence panel. */
  filter = $state<SequenceFilter>("all");
  /** Surfaced autosave failure, if any. */
  persistError = $state<string | null>(null);
  /** Id of the currently loaded/bound sequence, synced to the URL (null when
   *  the session is brand-new and not yet materialized). */
  selectedId = $state<string | null>(null);
  /** Board-generation parameters for "New from boardgen" (orchestration
   *  config; not part of a sequence — the generated board is the state). */
  boardgen = $state<BoardgenSettings>({
    boardSize: DEFAULT_GAME_CONFIG.orchestration.boardSize,
    snakesPerTeam: DEFAULT_GAME_CONFIG.orchestration.snakesPerTeam,
    hazardPercentage: DEFAULT_GAME_CONFIG.orchestration.hazardPercentage,
    density: DEFAULT_GAME_CONFIG.orchestration.fertileGround.density,
    clustering: DEFAULT_GAME_CONFIG.orchestration.fertileGround.clustering,
  });
  /** Configured teams (name + colour); the Add Snake tool assigns from here. */
  teams = $state<TeamConfig[]>(defaultTeams());
  /** Team the Add Snake tool assigns new snakes to. */
  selectedTeamId = $state<CentaurTeamId>(defaultTeams()[0]?.id ?? ("team-0" as CentaurTeamId));
  /** The selected snake — the sole expanded one in the editor and the one
   *  highlighted on the board. */
  selectedSnakeId = $state<SnakeId | null>(null);

  // Binding: the scratch file the session writes through to. A Slot is
  // created synchronously (so back-to-back edits target one scratch) while its
  // server-assigned `id` fills in asynchronously on the serialized #queue.
  // null = not yet materialized; #sourceIsFixture marks a read-only source.
  #slot: { id: string | null } | null = null;
  #sourceIsFixture = false;
  // Debounced head-update: the latest doc queued for the bound slot.
  #pending: { slot: { id: string | null }; doc: TestSequenceDoc } | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;
  // Serialized chain of persistence tasks: a slot's create is always enqueued
  // before any update targeting it, so its id is known by update time.
  #queue: Promise<unknown> = Promise.resolve();

  readonly #client: SequenceClient;
  readonly #debounceMs: number;

  constructor(client: SequenceClient = fetchSequenceClient, debounceMs = 300) {
    this.#client = client;
    this.#debounceMs = debounceMs;
    this.name = `scratch ${seedTag(this.session.gameSeed)}`;
  }

  get currentState(): GameState {
    return stateAt(this.session, this.cursor);
  }

  get turnCount(): number {
    return turnCount(this.session);
  }

  /** The record whose resolution produced the displayed state (if any). */
  get currentRecord(): TurnRecord | null {
    return this.cursor > 0 ? (this.session.turns[this.cursor - 1] ?? null) : null;
  }

  /** Highlights apply only while the divergent turn itself is displayed. */
  get activeHighlights(): ReadonlySet<number> {
    return this.runCursor !== null && this.cursor === this.runCursor
      ? this.runHighlights
      : new Set();
  }

  get filteredSequences(): ReadonlyArray<SequenceListEntry> {
    if (this.filter === "all") return this.sequences;
    return this.sequences.filter((e) => e.tier === this.filter);
  }

  private clearRun(): void {
    this.runResult = null;
    this.runCursor = null;
    this.runHighlights = new Set();
  }

  // --- Persistence plumbing -------------------------------------------------

  #enqueue(task: () => Promise<unknown>): void {
    this.#queue = this.#queue.then(task).catch((e) => {
      this.persistError = e instanceof Error ? e.message : String(e);
    });
  }

  #encode(name: string): TestSequenceDoc {
    return encodeTestSequence(sessionToSequence(this.session, name));
  }

  #flushPending(): void {
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
    const p = this.#pending;
    if (p !== null) {
      this.#pending = null;
      this.#enqueue(() =>
        p.slot.id === null ? Promise.resolve() : this.#client.update(p.slot.id, p.doc),
      );
    }
  }

  #scheduleUpdate(slot: { id: string | null }, doc: TestSequenceDoc): void {
    this.#pending = { slot, doc };
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.#flushPending(), this.#debounceMs);
  }

  /** Bind a fresh scratch slot synchronously; its id fills in on the queue. */
  #newSlot(doc: TestSequenceDoc): void {
    const slot: { id: string | null } = { id: null };
    this.#slot = slot;
    this.#sourceIsFixture = false;
    this.#enqueue(() =>
      this.#client.create(doc, "scratch").then((entry) => {
        slot.id = entry.id;
        this.selectedId = entry.id; // the working scratch is now the selection
        return this.refreshList();
      }),
    );
  }

  /** Persist the effect of a mutation that edited history at position k.
   *  `wasMiddle` is true when it truncated turns after k (a fork trigger). */
  #autosave(k: number, wasMiddle: boolean): void {
    this.persistError = null;
    const plan = planPersist({
      boundId: this.#slot === null ? null : "bound",
      sourceIsFixture: this.#sourceIsFixture,
      wasMiddle,
      k,
      name: this.name,
    });
    this.name = plan.name;
    const doc = this.#encode(plan.name);
    if (plan.kind === "update" && this.#slot !== null) {
      this.#scheduleUpdate(this.#slot, doc);
    } else {
      // fork/create: flush the parent slot's tail first, then bind a fresh
      // scratch capturing the (possibly truncated) current session.
      this.#flushPending();
      this.#newSlot(doc);
    }
  }

  /** Await all queued persistence (flushing the debounce). For tests. */
  async settled(): Promise<void> {
    this.#flushPending();
    await this.#queue;
  }

  async refreshList(): Promise<void> {
    try {
      this.sequences = await this.#client.list();
    } catch (e) {
      this.persistError = e instanceof Error ? e.message : String(e);
    }
  }

  // --- Teams & selection ----------------------------------------------------

  /** Colour for a team id, falling back to a stable palette pick for teams
   *  with no config (e.g. an id from a loaded sequence not yet reconciled). */
  teamColour(id: string): string {
    const cfg = this.teams.find((t) => t.id === id);
    if (cfg) return cfg.colour;
    const teamIds = [...new Set(this.currentState.snakes.map((s) => s.centaurTeamId))];
    return paletteAt(Math.max(0, teamIds.indexOf(id as CentaurTeamId))).colour;
  }

  /** Colour map over every team present in the current state (for the board). */
  get teamColours(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const s of this.currentState.snakes)
      map[s.centaurTeamId] = this.teamColour(s.centaurTeamId);
    return map;
  }

  /** Display name for a team id (config name, else the id). */
  teamName(id: string): string {
    return this.teams.find((t) => t.id === id)?.name ?? id;
  }

  /**
   * Dead snakes to draw as a one-turn ghost: those dead in the displayed
   * state that were alive the turn before (they died *this* turn). A dead
   * snake is off the board after its death turn (it only lingers in state so
   * its effects run their course), so it is not rendered thereafter.
   */
  // spec: visual-tester/snake-rendering#dead-snake-ghost-one-turn
  get ghostSnakeIds(): ReadonlySet<SnakeId> {
    const prevAlive =
      this.cursor > 0
        ? new Set(
            stateAt(this.session, this.cursor - 1)
              .snakes.filter((s) => s.alive)
              .map((s) => s.snakeId),
          )
        : null;
    const ids = new Set<SnakeId>();
    for (const s of this.currentState.snakes) {
      if (!s.alive && (prevAlive === null || prevAlive.has(s.snakeId))) ids.add(s.snakeId);
    }
    return ids;
  }

  // spec: visual-tester/team-configuration — adding a team assigns the next
  // palette colour and matching name; both stay editable.
  addTeam(): void {
    const { name, colour } = paletteAt(this.teams.length);
    const id = nextTeamId(new Set(this.teams.map((t) => t.id)));
    this.teams = [...this.teams, { id, name, colour }];
    this.selectedTeamId = id;
  }

  renameTeam(id: CentaurTeamId, name: string): void {
    this.teams = this.teams.map((t) => (t.id === id ? { ...t, name } : t));
  }

  setTeamColour(id: CentaurTeamId, colour: string): void {
    this.teams = this.teams.map((t) => (t.id === id ? { ...t, colour } : t));
  }

  /** Ensure every team present in the current state has a config, so loaded
   *  or generated states get names + colours without losing edited ones. */
  #ensureTeamsForState(): void {
    const known = new Set(this.teams.map((t) => t.id));
    const added: TeamConfig[] = [];
    for (const s of this.currentState.snakes) {
      if (known.has(s.centaurTeamId)) continue;
      known.add(s.centaurTeamId);
      // A team id from a loaded/generated state that has no config yet gets
      // the next palette name + colour by its position (like adding a team).
      const { name, colour } = paletteAt(this.teams.length + added.length);
      added.push({ id: s.centaurTeamId, name, colour });
    }
    if (added.length > 0) this.teams = [...this.teams, ...added];
  }

  // spec: visual-tester/snake-selection — `selectedSnakeId` is the single
  // source of truth for "which snake is the subject"; `selectSnake` is the one
  // atomic API that writes it. Everything else — board glow, sole-expansion in
  // the editor, move-panel highlight, and the body-extend target — is derived
  // from it, so they can never disagree. It is a plain setter (not a toggle):
  // callers that want click-to-deselect pass the computed next value.
  selectSnake(id: SnakeId | null): void {
    this.selectedSnakeId = id;
  }

  // spec: visual-tester/snake-selection — the *effective* selection: the live
  // snake `selectedSnakeId` names in the displayed turn, or null if none is
  // selected or it isn't present here (e.g. removed, or a turn where it is off
  // the board). Derived, so selection self-heals instead of dangling.
  get selectedSnake(): SnakeState | null {
    if (this.selectedSnakeId === null) return null;
    return this.currentState.snakes.find((s) => s.snakeId === this.selectedSnakeId) ?? null;
  }

  // spec: visual-tester/snake-selection#creation-selects — adding a snake
  // atomically makes it the selection, so the new snake is immediately the
  // sole-expanded row, the highlighted body, and the body-extend target (no
  // stale prior selection can capture the next click).
  addSnakeAt(cell: Cell): void {
    const before = new Set(this.currentState.snakes.map((s) => s.snakeId));
    this.applyEdit((s) =>
      addSnake(s, cell, this.selectedTeamId, this.session.config.maxHealth, this.session.config),
    );
    const created = this.currentState.snakes.find((s) => !before.has(s.snakeId));
    if (created !== undefined) this.selectSnake(created.snakeId);
  }

  // --- Session lifecycle ----------------------------------------------------

  newBlank(boardSize = 11): void {
    this.#flushPending();
    const seed = randomSeed();
    this.session = createSession(blankState(boardSize), DEFAULT_GAME_CONFIG.runtime, seed);
    this.#resetBinding(`scratch ${seedTag(seed)}`);
    this.cursor = 0;
    this.staged = new Map();
    this.error = null;
    this.notice = null;
    this.clearRun();
  }

  newFromBoardgen(): void {
    const seed = randomSeed();
    const s = this.boardgen;
    const config = {
      orchestration: {
        boardSize: s.boardSize,
        snakesPerTeam: s.snakesPerTeam,
        hazardPercentage: s.hazardPercentage,
        fertileGround: { density: s.density, clustering: s.clustering },
      },
      runtime: DEFAULT_GAME_CONFIG.runtime,
    };
    const result = boardgenState(seed, config);
    if (!result.ok) {
      // spec: visual-tester/board-editor — communicate why generation failed
      // instead of silently doing nothing.
      this.notice = `Board generation failed (${result.failure.code}). Adjust board size, snakes per team, or hazard percentage and try again.`;
      return;
    }
    this.#flushPending();
    this.session = createSession(result.state, DEFAULT_GAME_CONFIG.runtime, seed);
    this.#resetBinding(`boardgen ${seedTag(seed)}`);
    this.cursor = 0;
    this.staged = new Map();
    this.error = null;
    this.notice = null;
    this.clearRun();
    this.#ensureTeamsForState();
  }

  #resetBinding(name: string): void {
    this.#slot = null;
    this.#sourceIsFixture = false;
    this.#pending = null;
    this.name = name;
    this.selectedId = null;
    this.selectedSnakeId = null;
  }

  // spec: visual-tester/session-history#scrub-navigation — scrubbing alone
  // never alters history; it only changes what is displayed.
  scrubTo(k: number): void {
    if (k < 0 || k > this.turnCount) return;
    this.cursor = k;
    const next = this.session.turns[k];
    this.staged = next !== undefined ? new Map(next.stagedMoves) : new Map();
    this.error = null;
  }

  /**
   * Apply an editor-boundary operation to the displayed state. On success
   * the edited turn becomes the end of history (history rewrite); on
   * rejection the state is unchanged and the error is surfaced.
   */
  applyEdit(edit: (state: GameState) => EditResult): void {
    const result = edit(this.currentState);
    if (!result.ok) {
      this.error = result.error;
      return;
    }
    const wasMiddle = this.cursor < this.turnCount;
    // spec: visual-tester/history-rewrite — editing at cursor k discards
    // turns k+1..n; a middle edit also forks a new scratch (design D11).
    this.session = editStateAt(this.session, this.cursor, result.state);
    this.error = null;
    this.clearRun();
    this.#autosave(this.cursor, wasMiddle);
  }

  setConfig(config: GameRuntimeConfig): void {
    const wasMiddle = this.cursor < this.turnCount;
    this.session = editConfigAt(this.session, this.cursor, config);
    this.cursor = Math.min(this.cursor, this.turnCount);
    this.error = null;
    this.clearRun();
    this.#autosave(this.cursor, wasMiddle);
  }

  setSeed(gameSeed: Uint8Array): void {
    const wasMiddle = this.cursor < this.turnCount;
    this.session = editSeedAt(this.session, this.cursor, gameSeed);
    this.cursor = Math.min(this.cursor, this.turnCount);
    this.error = null;
    this.clearRun();
    this.#autosave(this.cursor, wasMiddle);
  }

  // spec: visual-tester/history-rewrite — restaging at a past turn makes it
  // the new end of history (and forks a scratch); at the head it only edits
  // the pending moves, which are not part of the persisted document.
  stage(snakeId: SnakeId, direction: Direction): void {
    const wasMiddle = this.cursor < this.turnCount;
    this.session = truncateAfter(this.session, this.cursor);
    const next = new Map(this.staged);
    next.set(snakeId, { direction, stagedBy: OPERATOR_AGENT });
    this.staged = next;
    this.clearRun();
    if (wasMiddle) this.#autosave(this.cursor, true);
  }

  // spec: visual-tester/move-staging#unstaged-snakes-omitted
  unstage(snakeId: SnakeId): void {
    const wasMiddle = this.cursor < this.turnCount;
    this.session = truncateAfter(this.session, this.cursor);
    const next = new Map(this.staged);
    next.delete(snakeId);
    this.staged = next;
    this.clearRun();
    if (wasMiddle) this.#autosave(this.cursor, true);
  }

  // spec: visual-tester/turn-simulation#repeatable
  simulate(): void {
    const wasMiddle = this.cursor < this.turnCount;
    this.session = truncateAfter(this.session, this.cursor);
    this.session = simulateNext(this.session, this.staged);
    this.cursor = this.turnCount;
    this.staged = new Map();
    this.error = null;
    this.clearRun();
    this.#autosave(this.cursor, wasMiddle);
  }

  /** Rename the working session; persists like an edit but keeps the typed
   *  name verbatim (no branch suffix). A rename of a fixture-sourced session
   *  copies it to a scratch under the new name. */
  rename(name: string): void {
    const trimmed = name.trim();
    if (trimmed === "" || trimmed === this.name) return;
    this.name = trimmed;
    this.persistError = null;
    if (this.#slot !== null && !this.#sourceIsFixture) {
      this.#scheduleUpdate(this.#slot, this.#encode(trimmed));
    } else if (this.#sourceIsFixture) {
      this.#flushPending();
      this.#newSlot(this.#encode(trimmed));
    }
    // brand-new unmaterialized: the name is kept and used on first edit.
  }

  // --- Sequence management --------------------------------------------------

  #bindLoaded(doc: TestSequenceDoc, entry: SequenceListEntry): void {
    const seq = decodeTestSequence(doc);
    this.session = sequenceToSession(seq);
    this.cursor = this.turnCount;
    this.staged = new Map();
    this.name = entry.name;
    this.#slot = entry.tier === "scratch" ? { id: entry.id } : null;
    this.#sourceIsFixture = entry.tier === "fixture";
    this.#pending = null;
    this.selectedId = entry.id;
    this.selectedSnakeId = null;
    this.error = null;
    this.notice = null;
    this.#ensureTeamsForState();
  }

  // spec: visual-tester/sequence-management — load replaces the session;
  // editing a loaded fixture forks it to a scratch (design D11).
  async load(entry: SequenceListEntry): Promise<void> {
    this.#flushPending();
    try {
      const doc = await this.#client.get(entry.id);
      this.#bindLoaded(doc, entry);
      this.clearRun();
    } catch (e) {
      this.notice = e instanceof Error ? e.message : String(e);
    }
  }

  // spec: visual-tester/sequence-run — run per test-sequences/replay-check;
  // on divergence the run halts, that turn is displayed, and every reported
  // difference is annotated (design D8).
  async run(entry: SequenceListEntry): Promise<void> {
    this.#flushPending();
    try {
      const doc = await this.#client.get(entry.id);
      this.#bindLoaded(doc, entry);
      const result = runReplayCheck(decodeTestSequence(doc));
      this.runResult = result;
      if (!result.passed) {
        const position = Math.min(result.turnsVerified + 1, this.turnCount);
        this.cursor = position;
        this.runCursor = position;
        this.runHighlights = implicatedCellIndices(
          result.differences,
          result.expected,
          result.computed,
          this.currentState.board.boardSize,
        );
      } else {
        this.clearRun();
      }
    } catch (e) {
      this.notice = e instanceof Error ? e.message : String(e);
    }
  }

  async fetchDoc(id: string): Promise<TestSequenceDoc> {
    return this.#client.get(id);
  }

  // spec: visual-tester/sequence-management — importing pasted JSON creates a
  // new scratch sequence, accepted only if it validates.
  async importPaste(parsed: unknown): Promise<ReadonlyArray<{ path: string; message: string }>> {
    try {
      await this.#client.create(parsed as TestSequenceDoc, "scratch");
      await this.refreshList();
      return [];
    } catch (e) {
      const errs = (e as { errors?: ReadonlyArray<{ path: string; message: string }> }).errors;
      return (
        errs ?? [{ path: "(document root)", message: e instanceof Error ? e.message : String(e) }]
      );
    }
  }

  #findFixtureByName(name: string): SequenceListEntry | undefined {
    const key = name.trim().toLowerCase();
    return this.sequences.find((e) => e.tier === "fixture" && e.name.trim().toLowerCase() === key);
  }

  // spec: visual-tester/sequence-management#fixture-overwrite-confirm — a name
  // clash with an existing fixture is reported so the UI can confirm before
  // overwriting; otherwise a new fixture is created.
  async saveFixture(
    name: string,
  ): Promise<{ status: "created" } | { status: "conflict"; id: string }> {
    const trimmed = name.trim();
    const clash = this.#findFixtureByName(trimmed);
    if (clash) return { status: "conflict", id: clash.id };
    await this.#client.create(this.#encode(trimmed), "fixture");
    await this.refreshList();
    return { status: "created" };
  }

  async overwriteFixture(id: string, name: string): Promise<void> {
    await this.#client.update(id, this.#encode(name.trim()));
    await this.refreshList();
  }
}
