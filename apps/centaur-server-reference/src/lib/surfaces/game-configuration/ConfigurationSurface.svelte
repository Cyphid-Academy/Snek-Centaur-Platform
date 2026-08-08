<script lang="ts">
// The configuration surface: the whole parameter set, the board it produces,
// and the lock.
//
// spec: game-configuration/self-contained-configuration-surface
// It needs nothing around it. Mounted alone over a binding it is fully usable —
// every parameter editable, the generated board rendered, the lock operable —
// and `/dev/game-configuration` mounts exactly that. Embedding it in a larger
// context adds context to it and is never a precondition for it working.
//
// spec: application-shell/surface-mounting-contract
// It derives no actor and reads no session, because the mounting contract
// offers neither: what a host is willing to let a visitor do arrives as the
// three affordance parameters below and nowhere else. Hiding an affordance is
// not enforcement — the record judges every write it receives on its own rules,
// so a mounting that offered too much would make nothing reachable that was not
// already reachable.
//
// spec: game-configuration/host-selected-affordances
// The three kinds are independent parameters rather than a level or a role, so
// a host offering one is never obliged to offer another.
import { BoardView } from "@cyphid/snek-app-shell";
import type {
  AffordanceSet,
  BindingSnapshot,
  BoardGeometry,
  MutableBinding,
  StateBinding,
  SurfaceMode,
} from "@cyphid/snek-app-shell";
import type { ConfigViolation, GameConfig } from "@cyphid/snek-game-configuration";
import { validateGameConfig } from "@cyphid/snek-game-configuration";
import { untrack } from "svelte";
import type { ConfigurationMutations, GameConfigurationRecord } from "./record";
import { infeasibilityMessage, previewGameState } from "./record";
import type { ParameterWidget } from "./widgets";
import {
  BOARD_SIZE_PRESETS,
  BOARD_SIZE_WIDGET,
  GAMEPLAY_WIDGETS,
  GENERATION_WIDGETS,
  boardSizeDisplay,
  isGatedOff,
  valueAt,
  withParameter,
} from "./widgets";

/**
 * The three kinds of affordance a host selects among, independently:
 * `inspection` (reading the parameters and the current board),
 * `parameterEditing`, and `boardDesignation` (setting and clearing the lock).
 *
 * An `AffordanceSet` of the shell's mounting contract, spelled as three
 * separate props rather than one object so a host states each kind by name at
 * the mount site.
 */
// spec: game-configuration/host-selected-affordances#inspection-only-mounting
// spec: game-configuration/host-selected-affordances#editing-without-designation
export type ConfigurationAffordances = AffordanceSet<{
  inspection: boolean;
  parameterEditing: boolean;
  boardDesignation: boolean;
}>;

interface Props extends ConfigurationAffordances {
  /**
   * The one binding this surface obtains the record through. A read-only
   * mounting is handed a `StateBinding`, which has no mutation to invoke at
   * all — the absence is the read-only-ness, rather than something refusing a
   * call.
   * spec: application-shell/one-state-binding#absence-not-refusal
   */
  binding:
    | StateBinding<GameConfigurationRecord | null>
    | MutableBinding<GameConfigurationRecord | null, ConfigurationMutations>;
  mode?: SurfaceMode;
}

const {
  binding,
  mode = "live",
  inspection,
  parameterEditing,
  boardDesignation,
}: Props = $props();

// The binding pushes; this component never pulls. Several surfaces over one
// game therefore render the same current preview without any of them polling or
// holding a private candidate. `current` seeds the first render (a server one
// has no effect to run), and the subscription carries every later delivery.
// spec: game-configuration/board-preview#all-viewers-in-sync
// spec: application-shell/one-state-binding
let snapshot = $state<BindingSnapshot<GameConfigurationRecord | null>>(
  untrack(() => binding.current),
);
$effect(() => binding.subscribe((next) => (snapshot = next)));

const record = $derived(snapshot.value ?? null);
const config = $derived<GameConfig | null>(record?.config ?? null);

/**
 * The mutations, or `null` when the binding carries none.
 *
 * The check is over the binding's shape rather than over an affordance: an
 * affordance says what a host offers, and a read-only binding says what is
 * expressible at all. Both must hold before an input is rendered.
 */
const mutations = $derived<ConfigurationMutations | null>(
  "mutations" in binding ? binding.mutations : null,
);

// Two conditions, and they answer different questions: the affordance says what
// the host chose to offer, the binding's shape says what is expressible at all.
// Neither stands in for the other, and `mode` is in neither — the mode says
// what the state behind the binding is, never which code path to take.
// spec: application-shell/surface-mounting-contract
const canEdit = $derived(parameterEditing && mutations !== null);
const canDesignate = $derived(boardDesignation && mutations !== null);

// Inline validation, mirroring the record's own validator over the record the
// write would leave behind. It spares a round-trip and nothing more: the
// configuration record rejects an out-of-range write identically whether it
// arrived from here or from a direct call on the mutation surface.
// spec: game-configuration/closed-parameter-vocabulary#out-of-range-rejected-regardless-of-client
const violations = $derived<readonly ConfigViolation[]>(violationsOf(config));

function violationsOf(candidate: GameConfig | null): readonly ConfigViolation[] {
  if (candidate === null) return [];
  const validation = validateGameConfig(candidate);
  return validation.ok ? [] : validation.violations;
}

function violationFor(widget: ParameterWidget): ConfigViolation | undefined {
  return violations.find((violation) => "path" in violation && violation.path === widget.path);
}

/** The rejection the record answered a write with, until the next one. */
let rejection = $state<string | null>(null);

async function write(next: GameConfig, widget: ParameterWidget): Promise<void> {
  if (mutations === null) return;
  rejection = null;
  try {
    // Whole subtrees, exactly as the record stores them — and only the half the
    // edit touched, because carrying the generation subtree is what tells the
    // record that what a board is generated from has changed.
    // spec: game-configuration/self-contained-configuration-surface#output-is-the-stored-shape
    // spec: game-configuration/board-preview-lock-in#a-dynamic-gameplay-edit-leaves-the-lock-standing
    await (widget.half === "generation"
      ? mutations.updateConfiguration({ generation: next.generation })
      : mutations.updateConfiguration({ runtime: next.runtime }));
  } catch (error) {
    rejection = error instanceof Error ? error.message : String(error);
  }
}

function edit(widget: ParameterWidget, raw: string): void {
  if (config === null) return;
  const value = Number(raw);
  if (!Number.isFinite(value)) return;
  void write(withParameter(config, widget, value), widget);
}

async function toggleLock(locked: boolean): Promise<void> {
  if (mutations === null) return;
  rejection = null;
  try {
    // No board data travels with it, and there is nowhere in the call to put
    // any: the flag designates the platform-held current preview.
    // spec: game-configuration/board-preview-lock-in#lock-carries-no-board-data
    await mutations.setPreviewLock({ locked });
  } catch (error) {
    rejection = error instanceof Error ? error.message : String(error);
  }
}

const preview = $derived(record?.boardPreview ?? null);
const locked = $derived(record?.boardPreviewLocked ?? false);

// The delivered board, assembled for rendering and never generated here.
// spec: game-configuration/board-preview#clients-render-never-generate
const previewState = $derived(
  preview !== null && preview.kind === "generated" && config !== null
    ? previewGameState(preview, config)
    : null,
);

const boardSizeValue = $derived(
  config === null ? BOARD_SIZE_WIDGET.descriptor.default : config.generation.boardSize,
);
// Derived from the stored integer, never from how the value was entered.
// spec: game-configuration/closed-parameter-vocabulary#board-size-round-trip
const boardSizeChoice = $derived(boardSizeDisplay(boardSizeValue).preset);

function selectBoardSize(raw: string): void {
  if (raw === "custom" || config === null) return;
  edit(BOARD_SIZE_WIDGET, raw);
}

const step = (widget: ParameterWidget): number =>
  widget.descriptor.kind === "rate" ? 0.01 : 1;

const rangeHint = (widget: ParameterWidget): string => {
  const { min, max, disableSentinel } = widget.descriptor;
  const sentinel =
    disableSentinel === null || (disableSentinel >= min && disableSentinel <= max)
      ? ""
      : `, or ${disableSentinel} to disable`;
  return `${min}–${max}${sentinel}`;
};

const editableWidgets = $derived(
  GENERATION_WIDGETS.filter((widget) => widget.key !== BOARD_SIZE_WIDGET.key),
);
</script>

<section class="surface" data-testid="configuration-surface" data-mode={mode}>
  <header>
    <h2>Game configuration</h2>
    <p class="status" data-testid="connection-status">{snapshot.status.kind}</p>
  </header>

  {#if !inspection}
    <!-- Inspection is the affordance the other two are read through: a mounting
         that offers none of the three has nothing to show. -->
    <p data-testid="no-affordances">This surface was mounted with nothing offered.</p>
  {:else if config === null}
    <p data-testid="awaiting-record">Waiting for this game's configuration…</p>
  {:else}
    {#if rejection !== null}
      <!-- spec: global-invariants/client-truthfulness#rejections-reach-the-user -->
      <p class="rejection" role="alert" data-testid="rejection">{rejection}</p>
    {/if}

    <div class="columns">
      <div class="parameters">
        <fieldset data-testid="generation-half">
          <legend>Board generation</legend>

          <!-- Board size: preset plus custom, one stored integer.
               spec: game-configuration/closed-parameter-vocabulary#board-size-round-trip -->
          <div class="parameter" data-testid="parameter-generation.boardSize">
            <span class="label" id="board-size-label">Board size</span>
            {#if canEdit}
              <select
                aria-labelledby="board-size-label"
                data-testid="board-size-preset"
                value={String(boardSizeChoice)}
                onchange={(event) => selectBoardSize(event.currentTarget.value)}
              >
                {#each BOARD_SIZE_PRESETS as preset (preset.value)}
                  <option value={String(preset.value)}>{preset.label} ({preset.value})</option>
                {/each}
                <option value="custom">Custom</option>
              </select>
              <input
                type="number"
                aria-label="Board size (custom)"
                data-testid="board-size-custom"
                min={BOARD_SIZE_WIDGET.descriptor.min}
                max={BOARD_SIZE_WIDGET.descriptor.max}
                step="1"
                value={boardSizeValue}
                onchange={(event) => edit(BOARD_SIZE_WIDGET, event.currentTarget.value)}
              />
            {:else}
              <output data-testid="value-generation.boardSize">{boardSizeValue}</output>
            {/if}
            <span class="hint" data-testid="bounds-generation.boardSize"
              >{rangeHint(BOARD_SIZE_WIDGET)}</span
            >
          </div>

          {#each editableWidgets as widget (widget.path)}
            {@const value = valueAt(config[widget.half], widget.descriptor.path) ?? 0}
            {@const gated = isGatedOff(widget, config)}
            {@const violation = violationFor(widget)}
            <div
              class="parameter"
              class:gated
              data-testid={`parameter-${widget.path}`}
              data-gated={gated ? "true" : "false"}
            >
              <label for={`p-${widget.path}`}>{widget.label}</label>
              {#if canEdit}
                <input
                  id={`p-${widget.path}`}
                  type="number"
                  min={widget.descriptor.min}
                  max={widget.descriptor.max}
                  step={step(widget)}
                  {value}
                  data-testid={`input-${widget.path}`}
                  onchange={(event) => edit(widget, event.currentTarget.value)}
                />
              {:else}
                <output id={`p-${widget.path}`} data-testid={`value-${widget.path}`}>{value}</output>
              {/if}
              <span class="hint" data-testid={`bounds-${widget.path}`}>{rangeHint(widget)}</span>
              {#if gated}
                <!-- Shown inactive, and still persisted: raising the gate later
                     brings the stored value into effect without re-entry.
                     spec: game-configuration/conditional-parameter-semantics#ui-communicates-without-blocking -->
                <span class="gate" data-testid={`gate-${widget.path}`}
                  >Inactive — {widget.gatedBy} is off. This value is still saved.</span
                >
              {/if}
              {#if violation !== undefined}
                <span class="violation" data-testid={`violation-${widget.path}`}
                  >Out of range for this parameter.</span
                >
              {/if}
            </div>
          {/each}
        </fieldset>

        <fieldset data-testid="gameplay-half">
          <legend>Gameplay</legend>
          {#each GAMEPLAY_WIDGETS as widget (widget.path)}
            {@const value = valueAt(config[widget.half], widget.descriptor.path) ?? 0}
            {@const gated = isGatedOff(widget, config)}
            {@const violation = violationFor(widget)}
            <div class="parameter" class:gated data-testid={`parameter-${widget.path}`}>
              <label for={`p-${widget.path}`}>{widget.label}</label>
              {#if canEdit}
                <input
                  id={`p-${widget.path}`}
                  type="number"
                  min={widget.descriptor.min}
                  max={widget.descriptor.max}
                  step={step(widget)}
                  {value}
                  data-testid={`input-${widget.path}`}
                  onchange={(event) => edit(widget, event.currentTarget.value)}
                />
              {:else}
                <output id={`p-${widget.path}`} data-testid={`value-${widget.path}`}>{value}</output>
              {/if}
              <span class="hint" data-testid={`bounds-${widget.path}`}>{rangeHint(widget)}</span>
              {#if violation !== undefined}
                <span class="violation" data-testid={`violation-${widget.path}`}
                  >Out of range for this parameter.</span
                >
              {/if}
            </div>
          {/each}
          {#if violations.some((violation) => violation.code === "unbounded-game")}
            <!-- spec: game-configuration/bounded-game-duration#neither-limit-is-rejected -->
            <p class="violation" data-testid="violation-unbounded-game">
              A game needs a turn limit or a wall-clock limit; both are disabled.
            </p>
          {/if}
        </fieldset>
      </div>

      <div class="board">
        {#if preview === null}
          <p data-testid="no-preview">No board has been generated for this game yet.</p>
        {:else if preview.kind === "infeasible"}
          <!-- The constraint that failed on the final attempt, not a generic error.
               spec: game-configuration/infeasibility-surfaced#failure-names-the-constraint -->
          <p class="infeasible" role="alert" data-testid="infeasibility">
            <strong data-testid="infeasibility-code">{preview.code}</strong>
            {infeasibilityMessage(preview)}
          </p>
        {:else if previewState === null}
          <p data-testid="unrenderable-preview">The delivered board could not be read.</p>
        {:else}
          <div data-testid="board-preview">
            <BoardView state={previewState}>
              {#snippet overlay(geometry: BoardGeometry)}
                {#if locked}
                  <!-- Composed OVER the one board rendering rather than replacing
                       it: the marker is this surface's concern and the board is
                       not.
                       spec: application-shell/one-board-rendering#composition-not-replacement -->
                  <rect
                    data-testid="lock-marker"
                    x={geometry.padding}
                    y={geometry.padding}
                    width={geometry.cellSize * geometry.boardSize - geometry.padding * 2}
                    height={geometry.cellSize * geometry.boardSize - geometry.padding * 2}
                    fill="none"
                    stroke="#facc15"
                    stroke-width="3"
                  />
                {/if}
              {/snippet}
            </BoardView>
          </div>
        {/if}

        {#if canDesignate}
          <button
            type="button"
            data-testid="lock-toggle"
            aria-pressed={locked}
            onclick={() => void toggleLock(!locked)}
          >
            {locked ? "Release this board" : "Lock this board in"}
          </button>
        {:else if locked}
          <p data-testid="lock-state">This board is locked in for launch.</p>
        {/if}
      </div>
    </div>

    <!-- What the component emits, in the shape the record holds it: no wrapper,
         no renaming, so what a reader inspects and what the engine consumes are
         one document.
         spec: game-configuration/self-contained-configuration-surface#output-is-the-stored-shape -->
    <details>
      <summary>Stored configuration</summary>
      <pre data-testid="configuration-document">{JSON.stringify(config, null, 2)}</pre>
    </details>
  {/if}
</section>

<style>
  .surface {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    color: #e2e8f0;
    font-family: system-ui, sans-serif;
  }
  header {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
  }
  h2 {
    margin: 0;
    font-size: 1.25rem;
    color: #f8fafc;
  }
  .status {
    margin: 0;
    font-size: 0.8rem;
    color: #94a3b8;
  }
  .columns {
    display: flex;
    flex-wrap: wrap;
    gap: 1.5rem;
    align-items: flex-start;
  }
  .parameters {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 20rem;
    flex: 1 1 20rem;
  }
  .board {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    flex: 0 1 auto;
  }
  fieldset {
    border: 1px solid #1e293b;
    border-radius: 6px;
    padding: 0.75rem;
  }
  legend {
    color: #7dd3fc;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .parameter {
    display: grid;
    grid-template-columns: 12rem 8rem 1fr;
    align-items: center;
    gap: 0.5rem;
    padding: 0.15rem 0;
  }
  .parameter.gated {
    opacity: 0.55;
  }
  .label,
  label {
    font-size: 0.9rem;
  }
  .hint {
    font-size: 0.75rem;
    color: #64748b;
  }
  .gate,
  .violation {
    grid-column: 1 / -1;
    font-size: 0.75rem;
  }
  .gate {
    color: #fbbf24;
  }
  .violation,
  .rejection,
  .infeasible {
    color: #fca5a5;
  }
  input,
  select,
  output {
    background: #0b1220;
    color: #e2e8f0;
    border: 1px solid #1e293b;
    border-radius: 4px;
    padding: 0.2rem 0.35rem;
    font: inherit;
  }
  button {
    align-self: flex-start;
    background: #1e293b;
    color: #f8fafc;
    border: 1px solid #334155;
    border-radius: 4px;
    padding: 0.35rem 0.7rem;
    font: inherit;
    cursor: pointer;
  }
  pre {
    background: #0b1220;
    border: 1px solid #1e293b;
    border-radius: 4px;
    padding: 0.5rem;
    font-size: 0.75rem;
    overflow-x: auto;
  }
</style>
