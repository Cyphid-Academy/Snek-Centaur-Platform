<script lang="ts">
// The self-contained game-configuration surface: mounted on its own it
// presents the whole parameter set, the board generated from it, and the
// lock — no surrounding application context required.
// spec: game-configuration/self-contained-configuration-surface#runs-with-no-host
//
// Mounting contract (application-shell/surface-mounting-contract,
// game-configuration/host-selected-affordances): the surface takes its mode
// — here, which of the three affordance kinds are offered — as an explicit
// parameter, derives no actor, reads no session, and consults nobody's
// presence. State arrives through exactly ONE binding
// (application-shell/one-state-binding); this surface never knows whether
// that binding is backed by a live subscription, a fetch-polling dev
// harness, or a fixture.
//
// INTERPRETATION CALL — the three kinds are independently selectable
// (host-selected-affordances: "so that a host offering one of them is never
// obliged to offer another"), and the two pinned scenarios
// (#inspection-only-mounting, #editing-without-designation) both mount
// inspection ON. Read literally, "independently selectable" also permits
// editing WITHOUT inspection. This surface's reading: inspection gates the
// READ-ONLY presentation (the plain parameter-value list, the roster list,
// the board, the serialised-JSON view) and parameterEditing gates the
// EDITING widgets — an editing widget necessarily displays its own current
// value, so an editing-only mount still shows every value, just with no
// board and no separate read-only summary (which would only duplicate what
// the widgets already show). boardDesignation gates the lock TOGGLE alone.
// Documented here because the task brief asked for it explicitly; the
// concrete behaviour driving each of `showInspection` / `editingOffered` /
// `designationOffered` below is what a future reader should treat as
// authoritative over this prose if the two ever disagree.
//
// A plain `StateBinding` (no `mutations` member) offers inspection only,
// regardless of what `affordances` requested: there is nothing to invoke, so
// editing and designation collapse rather than rendering a control that
// would refuse when used (application-shell/one-state-binding#absence-not-refusal).
// This does NOT force `inspection` on when the host asked for it off — the
// binding only ever narrows what a widget-bearing kind can offer, never
// widens what the host stated.
import type { CentaurTeamId, ParameterDescriptor } from "@cyphid/snek-engine";
import { RUNTIME_PARAMETER_DESCRIPTORS, descriptorFor } from "@cyphid/snek-engine";
import type {
  BoardGenerationFailure,
  GameConfig,
  GeneratedInitialState,
  TeamRegistration,
} from "@cyphid/snek-game-configuration";
import { GENERATION_PARAMETER_DESCRIPTORS, generationDescriptorFor } from "@cyphid/snek-game-configuration";
import BoardView from "../board/BoardView.svelte";
import type { MutableBinding, StateBinding, SurfaceMount } from "../shell/index.js";
import { toBoardViewState } from "./adapt.js";
import { getAtPath, labelForPath, setAtPath, stepFor } from "./descriptor-utils.js";
import type { ConfigSurfaceMutations, ConfigSurfaceState, Rejection } from "./types.js";

type AffordanceKind = "inspection" | "parameterEditing" | "boardDesignation";

interface Props {
  readonly binding:
    | StateBinding<ConfigSurfaceState>
    | MutableBinding<ConfigSurfaceState, ConfigSurfaceMutations>;
  readonly affordances: SurfaceMount<AffordanceKind>["affordances"];
}

const { binding, affordances }: Props = $props();

// Board size's preset-plus-custom affordance: presentation mechanism only
// (design.md, "UI-mirror requirements folded" — "the preset list itself...
// stays in code"). The persisted/transmitted value is always the raw
// integer regardless of which control produced it.
// spec: game-configuration/closed-parameter-vocabulary#board-size-round-trip
const BOARD_SIZE_PRESETS: ReadonlyArray<{ readonly label: string; readonly value: number }> = [
  { label: "Small (11)", value: 11 },
  { label: "Standard (21)", value: 21 },
  { label: "Large (27)", value: 27 },
];

function presetOrCustom(boardSize: number): string {
  const match = BOARD_SIZE_PRESETS.find((p) => p.value === boardSize);
  return match ? String(match.value) : "custom";
}

function hasMutations(
  b: StateBinding<ConfigSurfaceState> | MutableBinding<ConfigSurfaceState, ConfigSurfaceMutations>,
): b is MutableBinding<ConfigSurfaceState, ConfigSurfaceMutations> {
  return "mutations" in b;
}

function isFailure(
  preview: GeneratedInitialState | BoardGenerationFailure | null,
): preview is BoardGenerationFailure {
  return preview !== null && "code" in preview;
}

// INTERPRETATION CALL — game-configuration/conditional-parameter-semantics
// pins fertileGround.clustering as gated by fertileGround.density = 0
// (#gated-value-persists-and-is-ignored). This surface reads "dependent
// parameters" as also covering hazardDamage: once hazardPercentage = 0,
// generation designates no Hazard cell at all
// (game-configuration/generation-parameters#generation-sentinels), so a
// per-hazard damage amount has nothing left to apply to. Not a pinned
// scenario — an extrapolation from the same sentinel-gating principle,
// documented here rather than silently assumed.
function isGated(namespace: "generation" | "runtime", path: string, cfg: GameConfig): boolean {
  if (namespace === "generation" && path === "fertileGround.clustering") {
    return cfg.generation.fertileGround.density === 0;
  }
  if (namespace === "runtime" && path === "hazardDamage") {
    return cfg.generation.hazardPercentage === 0;
  }
  return false;
}

function gatingNoteFor(path: string): string {
  if (path === "fertileGround.clustering") return "fertileGround.density";
  if (path === "hazardDamage") return "hazardPercentage";
  return "";
}

const mutable = $derived(hasMutations(binding) ? binding : null);
const state = $derived(binding.value);

const showInspection = $derived(affordances.inspection);
const editingOffered = $derived(affordances.parameterEditing && mutable !== null);
const designationOffered = $derived(affordances.boardDesignation && mutable !== null);
const showBoard = $derived(showInspection);
const showRoster = $derived(showInspection || editingOffered);

let lastRejection = $state<Rejection | null>(null);
let newTeamId = $state("");
let newTeamName = $state("");
let copyFeedback = $state<string | null>(null);

const rosterRejectionText = $derived(
  lastRejection?.kind === "empty-roster"
    ? "A game needs at least one team."
    : lastRejection?.kind === "duplicate-team-id"
      ? `Team id "${lastRejection.centaurTeamId}" is already in use.`
      : null,
);

function fieldRejection(fieldPath: string): string | null {
  if (lastRejection?.kind !== "invalid-parameter") return null;
  if (lastRejection.path !== fieldPath) return null;
  return lastRejection.reason === "NOT_INTEGER"
    ? "must be a whole number"
    : `must be between ${lastRejection.min} and ${lastRejection.max}`;
}

// spec: game-configuration/closed-parameter-vocabulary#out-of-range-rejected-regardless-of-client
// — this is UX only; the round trip through `mutations.updateConfig` is the
// authoritative check, and its rejection (surfaced via `lastRejection`) is
// what is actually displayed.
async function submitParam(
  cfg: GameConfig,
  namespace: "generation" | "runtime",
  path: string,
  raw: string,
): Promise<void> {
  const value = Number(raw);
  if (!Number.isFinite(value) || mutable === null) return;
  // Branched rather than a computed-property write: `{ ...cfg, [namespace]: ... }`
  // with a union-typed key loses the precise per-branch shape TypeScript needs
  // to check the result against `GameConfig`.
  const nextConfig: GameConfig =
    namespace === "generation"
      ? { ...cfg, generation: setAtPath(cfg.generation, path, value) }
      : { ...cfg, runtime: setAtPath(cfg.runtime, path, value) };
  lastRejection = await mutable.mutations.updateConfig(nextConfig);
}

// spec: game-configuration/board-preview-lock-in#lock-carries-no-board-data
// — the mutation's own signature is a plain boolean; there is no board data
// for this call site to even attempt to attach.
async function toggleLock(locked: boolean): Promise<void> {
  if (mutable === null) return;
  lastRejection = await mutable.mutations.setBoardLock(!locked);
}

async function addTeam(teams: ReadonlyArray<TeamRegistration>): Promise<void> {
  if (mutable === null) return;
  const id = newTeamId.trim();
  const name = newTeamName.trim();
  if (id === "" || name === "") return;
  const nextTeams = [...teams, { centaurTeamId: id as CentaurTeamId, name }];
  lastRejection = await mutable.mutations.updateRoster(nextTeams);
  if (lastRejection === null) {
    newTeamId = "";
    newTeamName = "";
  }
}

async function removeTeam(
  teams: ReadonlyArray<TeamRegistration>,
  id: CentaurTeamId,
): Promise<void> {
  if (mutable === null) return;
  lastRejection = await mutable.mutations.updateRoster(teams.filter((t) => t.centaurTeamId !== id));
}

// spec: game-configuration/self-contained-configuration-surface#output-is-the-stored-shape
// — the copy-as-JSON affordance emits `cfg` exactly, no wrapper.
async function copyConfig(cfg: GameConfig): Promise<void> {
  const json = JSON.stringify(cfg, null, 2);
  try {
    await navigator.clipboard.writeText(json);
    copyFeedback = "Copied";
  } catch {
    copyFeedback = "Copy failed — select the text below";
  }
  setTimeout(() => {
    copyFeedback = null;
  }, 2000);
}
</script>

{#snippet readonlyField(cfg: GameConfig, namespace: "generation" | "runtime", descriptor: ParameterDescriptor)}
  {@const value = getAtPath(cfg[namespace], descriptor.path)}
  {@const gated = isGated(namespace, descriptor.path, cfg)}
  <div class="field" class:gated data-testid={`param-${namespace}-${descriptor.path}`}>
    <span class="label">{labelForPath(descriptor.path)}</span>
    <span class="value">{value}</span>
    {#if gated}<span class="gated-note">inactive while {gatingNoteFor(descriptor.path)} is 0</span>{/if}
  </div>
{/snippet}

{#snippet editableField(cfg: GameConfig, namespace: "generation" | "runtime", descriptor: ParameterDescriptor)}
  {@const value = getAtPath(cfg[namespace], descriptor.path)}
  {@const gated = isGated(namespace, descriptor.path, cfg)}
  {@const fieldPath = `${namespace}.${descriptor.path}`}
  {@const rejection = fieldRejection(fieldPath)}
  <div class="field" class:gated data-testid={`param-${namespace}-${descriptor.path}`}>
    <label for={fieldPath}>{labelForPath(descriptor.path)}</label>
    <input
      id={fieldPath}
      type="number"
      min={descriptor.min}
      max={descriptor.max}
      step={stepFor(descriptor)}
      value={value}
      onchange={(e) => submitParam(cfg, namespace, descriptor.path, e.currentTarget.value)}
    />
    {#if gated}
      <span class="gated-note">inactive while {gatingNoteFor(descriptor.path)} is 0</span>
    {/if}
    {#if rejection}<span class="error">{rejection}</span>{/if}
  </div>
{/snippet}

{#snippet boardSizeReadOnly(cfg: GameConfig)}
  {@const current = cfg.generation.boardSize}
  {@const preset = BOARD_SIZE_PRESETS.find((p) => p.value === current)}
  <div class="field" data-testid="param-generation-boardSize">
    <span class="label">{labelForPath("boardSize")}</span>
    <span class="value">{preset ? preset.label : `Custom (${current})`}</span>
  </div>
{/snippet}

{#snippet boardSizeEditable(cfg: GameConfig)}
  {@const descriptor = generationDescriptorFor("boardSize")}
  {@const current = cfg.generation.boardSize}
  {@const selection = presetOrCustom(current)}
  {@const rejection = fieldRejection("generation.boardSize")}
  <div class="field" data-testid="param-generation-boardSize">
    <label for="boardSize-preset">{labelForPath("boardSize")}</label>
    <select
      id="boardSize-preset"
      data-testid="board-size-preset"
      value={selection}
      onchange={(e) => {
        const raw = e.currentTarget.value;
        if (raw !== "custom") void submitParam(cfg, "generation", "boardSize", raw);
      }}
    >
      {#each BOARD_SIZE_PRESETS as p (p.value)}
        <option value={String(p.value)}>{p.label}</option>
      {/each}
      <option value="custom">Custom</option>
    </select>
    <input
      id="boardSize-custom"
      data-testid="board-size-custom"
      type="number"
      min={descriptor.min}
      max={descriptor.max}
      step="1"
      value={current}
      onchange={(e) => submitParam(cfg, "generation", "boardSize", e.currentTarget.value)}
    />
    {#if rejection}<span class="error">{rejection}</span>{/if}
  </div>
{/snippet}

{#snippet gameLengthReadOnly(cfg: GameConfig)}
  <div class="field-group" data-testid="game-length">
    <div class="field" data-testid="param-runtime-maxTurns">
      <span class="label">{labelForPath("maxTurns")}</span>
      <span class="value">{cfg.runtime.maxTurns === 0 ? "no limit" : cfg.runtime.maxTurns}</span>
    </div>
    <div class="field" data-testid="param-runtime-maxGameDurationMs">
      <span class="label">{labelForPath("maxGameDurationMs")}</span>
      <span class="value"
        >{cfg.runtime.maxGameDurationMs === 0
          ? "no limit"
          : `${cfg.runtime.maxGameDurationMs} ms`}</span
      >
    </div>
  </div>
{/snippet}

{#snippet gameLengthEditable(cfg: GameConfig)}
  {@const maxTurnsDescriptor = descriptorFor("maxTurns")}
  {@const maxDurationDescriptor = descriptorFor("maxGameDurationMs")}
  {@const maxTurns = cfg.runtime.maxTurns}
  {@const maxDuration = cfg.runtime.maxGameDurationMs}
  {@const bothZero = maxTurns === 0 && maxDuration === 0}
  <!-- spec: game-configuration/bounded-game-duration — presented as one joint
       "game length" affordance because the record's own condition is a
       predicate over the pair, never a range on either alone. The warning
       below is UX only: it never blocks persistence, and the record's own
       #unbounded-duration rejection (surfaced through lastRejection) is what
       is authoritative. spec: global-invariants/client-truthfulness#enablement-derives-from-server-state -->
  <div class="field-group" data-testid="game-length">
    <div class="field" data-testid="param-runtime-maxTurns">
      <label for="runtime-maxTurns">{labelForPath("maxTurns")} (0 = no limit)</label>
      <input
        id="runtime-maxTurns"
        type="number"
        min={maxTurnsDescriptor.min}
        max={maxTurnsDescriptor.max}
        step="1"
        value={maxTurns}
        onchange={(e) => submitParam(cfg, "runtime", "maxTurns", e.currentTarget.value)}
      />
    </div>
    <div class="field" data-testid="param-runtime-maxGameDurationMs">
      <label for="runtime-maxGameDurationMs">{labelForPath("maxGameDurationMs")} (0 = no limit)</label>
      <input
        id="runtime-maxGameDurationMs"
        type="number"
        min={maxDurationDescriptor.min}
        max={maxDurationDescriptor.max}
        step="1"
        value={maxDuration}
        onchange={(e) => submitParam(cfg, "runtime", "maxGameDurationMs", e.currentTarget.value)}
      />
    </div>
    {#if bothZero}
      <p class="warning" data-testid="unbounded-warning">
        A game needs at least a turn limit or a duration limit — the record will reject this
        combination.
      </p>
    {/if}
    {#if lastRejection?.kind === "unbounded-duration"}
      <p class="error">Rejected: neither limit is set.</p>
    {/if}
  </div>
{/snippet}

{#snippet readonlyParams(cfg: GameConfig)}
  <section class="params" data-testid="readonly-params">
    <h3>Board generation</h3>
    {#each GENERATION_PARAMETER_DESCRIPTORS as d (d.path)}
      {#if d.path === "boardSize"}
        {@render boardSizeReadOnly(cfg)}
      {:else}
        {@render readonlyField(cfg, "generation", d)}
      {/if}
    {/each}

    <h3>Game rules</h3>
    {#each RUNTIME_PARAMETER_DESCRIPTORS as d (d.path)}
      {#if d.path !== "maxTurns" && d.path !== "maxGameDurationMs"}
        {@render readonlyField(cfg, "runtime", d)}
      {/if}
    {/each}
    {@render gameLengthReadOnly(cfg)}
  </section>
{/snippet}

{#snippet editingParams(cfg: GameConfig)}
  <section class="params" data-testid="editing-params">
    <h3>Board generation</h3>
    {#each GENERATION_PARAMETER_DESCRIPTORS as d (d.path)}
      {#if d.path === "boardSize"}
        {@render boardSizeEditable(cfg)}
      {:else}
        {@render editableField(cfg, "generation", d)}
      {/if}
    {/each}

    <h3>Game rules</h3>
    {#each RUNTIME_PARAMETER_DESCRIPTORS as d (d.path)}
      {#if d.path !== "maxTurns" && d.path !== "maxGameDurationMs"}
        {@render editableField(cfg, "runtime", d)}
      {/if}
    {/each}
    {@render gameLengthEditable(cfg)}
  </section>
{/snippet}

{#snippet rosterReadOnly(teams: ReadonlyArray<TeamRegistration>)}
  <section class="roster" data-testid="roster">
    <h3>Teams</h3>
    <ul>
      {#each teams as team (team.centaurTeamId)}
        <li>{team.centaurTeamId}: {team.name}</li>
      {/each}
    </ul>
  </section>
{/snippet}

{#snippet rosterEditable(teams: ReadonlyArray<TeamRegistration>)}
  <section class="roster" data-testid="roster">
    <h3>Teams</h3>
    <ul>
      {#each teams as team (team.centaurTeamId)}
        <li>
          {team.centaurTeamId}: {team.name}
          <button type="button" onclick={() => removeTeam(teams, team.centaurTeamId)}>Remove</button>
        </li>
      {/each}
    </ul>
    <div class="row">
      <input placeholder="team id" bind:value={newTeamId} data-testid="new-team-id" />
      <input placeholder="team name" bind:value={newTeamName} data-testid="new-team-name" />
      <button type="button" onclick={() => addTeam(teams)}>Add team</button>
    </div>
    {#if rosterRejectionText}<p class="error">{rosterRejectionText}</p>{/if}
  </section>
{/snippet}

{#snippet failurePreview(failure: BoardGenerationFailure)}
  <!-- spec: game-configuration/infeasibility-surfaced#failure-names-the-constraint
       — the constraint code and which constraint, never a generic error. -->
  <div class="failure" data-testid="generation-failure">
    <p><strong>Generation infeasible:</strong> <code>{failure.code}</code></p>
    <p class="muted">
      {#if failure.details.centaurTeamId !== undefined}team {failure.details.centaurTeamId} — {/if}
      {failure.details.innerCellCount} inner cells{#if failure.details.eligibleCellCount !== undefined},
        {failure.details.eligibleCellCount} eligible{/if} ({failure.attemptsUsed} attempts)
    </p>
  </div>
{/snippet}

{#snippet boardSection(
  preview: GeneratedInitialState | BoardGenerationFailure | null,
  cfg: GameConfig,
  teams: ReadonlyArray<TeamRegistration>,
  locked: boolean,
)}
  <section class="preview" data-testid="board-preview">
    <h3>Board preview</h3>
    {#if preview === null}
      <p class="muted">No preview yet.</p>
    {:else if isFailure(preview)}
      {@render failurePreview(preview)}
    {:else}
      <!-- spec: game-configuration/board-preview#clients-render-never-generate
           — renders the platform-delivered candidate; this surface never
           runs board generation itself. -->
      <BoardView state={toBoardViewState(preview, cfg.runtime, teams)} />
    {/if}
    <p class="lock-status" data-testid="lock-status">Board {locked ? "locked" : "unlocked"}</p>
  </section>
{/snippet}

{#snippet lockControls(preview: GeneratedInitialState | BoardGenerationFailure | null, locked: boolean)}
  {@const disabled = !locked && (preview === null || isFailure(preview))}
  <div class="lock-controls" data-testid="lock-controls">
    <button type="button" data-testid="lock-toggle" {disabled} onclick={() => toggleLock(locked)}>
      {locked ? "Unlock board" : "Lock board"}
    </button>
    {#if lastRejection?.kind === "no-lockable-preview"}
      <span class="error">No board to lock — the current preview has no successful candidate.</span>
    {/if}
  </div>
{/snippet}

{#snippet serialisedSection(cfg: GameConfig)}
  <!-- spec: game-configuration/self-contained-configuration-surface#output-is-the-stored-shape -->
  <section class="serialised" data-testid="serialised-config">
    <h3>Serialised configuration</h3>
    <p class="muted">Exactly the shape the configuration record stores.</p>
    <button type="button" onclick={() => copyConfig(cfg)}>Copy as JSON</button>
    {#if copyFeedback}<span class="muted">{copyFeedback}</span>{/if}
    <pre data-testid="config-json">{JSON.stringify(cfg, null, 2)}</pre>
  </section>
{/snippet}

{#if binding.status.kind === "lost"}
  <!-- spec: application-shell/one-state-binding#loss-is-the-bindings-to-report -->
  <p class="status-lost" role="alert" data-testid="connection-lost">
    Connection lost: {binding.status.reason}
  </p>
{/if}

{#if state === undefined}
  <p class="loading">Loading configuration…</p>
{:else}
  <div class="config-surface">
    {#if showInspection}
      <p class="phase" data-testid="phase">Phase: {state.phase}</p>
    {/if}

    {#if editingOffered}
      {@render editingParams(state.config)}
    {:else if showInspection}
      {@render readonlyParams(state.config)}
    {/if}

    {#if showRoster}
      {#if editingOffered}
        {@render rosterEditable(state.teams)}
      {:else}
        {@render rosterReadOnly(state.teams)}
      {/if}
    {/if}

    {#if showBoard}
      {@render boardSection(state.currentPreview, state.config, state.teams, state.boardLocked)}
    {/if}

    {#if designationOffered}
      {@render lockControls(state.currentPreview, state.boardLocked)}
    {/if}

    {#if showInspection}
      {@render serialisedSection(state.config)}
    {/if}
  </div>
{/if}

<style>
  .config-surface {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    font-family: system-ui, sans-serif;
    font-size: 0.85rem;
    color: #e2e8f0;
  }
  h3 {
    font-size: 0.9rem;
    margin: 0.5rem 0 0.25rem;
    color: #f8fafc;
  }
  .params {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 6px;
    padding: 0.35rem 0.5rem;
    min-width: 9rem;
  }
  .field.gated {
    opacity: 0.55;
  }
  .field label,
  .field .label {
    font-size: 0.72rem;
    color: #94a3b8;
  }
  .field .value {
    font-weight: 600;
  }
  .field input,
  .field select {
    background: #0f172a;
    color: #e2e8f0;
    border: 1px solid #334155;
    border-radius: 4px;
    padding: 0.15rem 0.35rem;
    font: inherit;
  }
  .gated-note {
    font-size: 0.68rem;
    color: #fbbf24;
  }
  .error {
    color: #fda4af;
    font-size: 0.72rem;
  }
  .warning {
    color: #fbbf24;
    font-size: 0.78rem;
  }
  .muted {
    color: #64748b;
  }
  .field-group {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 0.6rem;
    width: 100%;
  }
  .roster ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .row {
    display: flex;
    gap: 0.4rem;
    margin-top: 0.4rem;
  }
  button {
    background: #1e293b;
    color: #e2e8f0;
    border: 1px solid #334155;
    border-radius: 4px;
    padding: 0.2rem 0.5rem;
    cursor: pointer;
    font-size: 0.78rem;
  }
  button:hover {
    border-color: #7dd3fc;
  }
  button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .lock-status {
    font-weight: 600;
  }
  .status-lost {
    color: #fda4af;
  }
  pre {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 6px;
    padding: 0.5rem;
    font-size: 0.72rem;
    overflow-x: auto;
    max-width: 100%;
  }
</style>
