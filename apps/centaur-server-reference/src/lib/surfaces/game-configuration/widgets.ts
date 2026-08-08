// The widgets a configuration surface offers, derived from the declarations
// that already exist rather than written out beside them.
//
// **Not one number in this file is a bound.** Every limit a widget presents is
// read from the descriptor table of the half the parameter belongs to — the
// engine's for the gameplay half, this platform's own for the generation half —
// which is the same table `validateGameConfig` rejects from. There is no second
// copy to forget when a declared bound moves.
// spec: game-configuration/parameter-bounds-sourcing#widget-and-validator-agree
// spec: game-configuration/parameter-bounds-sourcing#live-game-bounds-are-reflected-not-owned
import type { GameplayParameterDescriptor } from "@cyphid/snek-engine";
import { GAMEPLAY_PARAMETER_DESCRIPTORS, gameplayParameterKey } from "@cyphid/snek-engine";
import type { GameConfig } from "@cyphid/snek-game-configuration";
import { GENERATION_PARAMETER_DESCRIPTORS } from "@cyphid/snek-game-configuration";

/** The two disjoint halves the vocabulary comprises, named by their field. */
// spec: game-configuration/closed-parameter-vocabulary
export type ConfigurationHalf = "generation" | "runtime";

/** One editable parameter, as a widget needs it. */
export interface ParameterWidget {
  readonly half: ConfigurationHalf;
  /** Dotted within its half — `"boardSize"`, `"clock.maxTurnTimeMs"`. */
  readonly key: string;
  /** Dotted from the record's root — the spelling a violation's `path` uses. */
  readonly path: string;
  readonly label: string;
  readonly descriptor: GameplayParameterDescriptor;
  /**
   * The parameter whose disable sentinel gates this one, if any. A gated
   * parameter is shown inactive and still persists whatever in-range value it
   * is given.
   * spec: game-configuration/conditional-parameter-semantics#gated-value-persists-and-is-ignored
   */
  readonly gatedBy: string | null;
}

/**
 * Which parameters a zero sentinel gates, by dotted key within their half.
 *
 * A dependency between two parameters, not a bound: what "off" means is read
 * from the gating parameter's own `disableSentinel` at the point of use, never
 * compared against a literal zero here. There are no auxiliary gating flags to
 * validate against — the sentinels are the whole of how disablement is encoded.
 * spec: game-configuration/conditional-parameter-semantics
 */
const GATES: Readonly<Record<string, string>> = {
  "fertileGround.clustering": "fertileGround.density",
};

/** A descriptor's dotted path prefixed by the half it belongs to. */
export const parameterPath = (half: ConfigurationHalf, key: string): string => `${half}.${key}`;

/**
 * A parameter's label, derived from its own path rather than kept in a table
 * beside it: a table would be a second place to forget when a field is renamed,
 * and the paths are already the words.
 */
export function parameterLabel(key: string): string {
  return key
    .split(".")
    .map((segment) =>
      segment
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/^./, (first) => first.toUpperCase())
        .replace(/\bMs\b/, "(ms)"),
    )
    .join(" · ");
}

function widgets(
  half: ConfigurationHalf,
  descriptors: readonly GameplayParameterDescriptor[],
): readonly ParameterWidget[] {
  return descriptors.map((descriptor) => {
    const key = gameplayParameterKey(descriptor);
    return {
      half,
      key,
      path: parameterPath(half, key),
      label: parameterLabel(key),
      descriptor,
      gatedBy: GATES[key] ?? null,
    };
  });
}

/** The generation half's widgets — this capability's own declaration. */
// spec: game-configuration/generation-parameters
export const GENERATION_WIDGETS: readonly ParameterWidget[] = widgets(
  "generation",
  GENERATION_PARAMETER_DESCRIPTORS,
);

/** The gameplay half's widgets — the engine's declaration, reflected. */
// spec: game-configuration/closed-parameter-vocabulary#the-duration-limit-is-an-ordinary-parameter
export const GAMEPLAY_WIDGETS: readonly ParameterWidget[] = widgets(
  "runtime",
  GAMEPLAY_PARAMETER_DESCRIPTORS,
);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The number a half holds at a descriptor's path, or `undefined`. */
export function valueAt(half: unknown, path: readonly string[]): number | undefined {
  let cursor: unknown = half;
  for (const segment of path) {
    if (!isRecord(cursor)) return undefined;
    cursor = cursor[segment];
  }
  return typeof cursor === "number" ? cursor : undefined;
}

/**
 * A deep copy of a configuration half.
 *
 * Hand-written rather than `structuredClone`: the record arrives through a
 * Svelte binding and is therefore a reactive proxy, which the structured-clone
 * algorithm refuses outright. A configuration half is numbers in nested plain
 * objects and nothing else — the closed vocabulary says so — so walking it is
 * total.
 */
function clonePlain(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const copy: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) copy[key] = clonePlain(nested);
  return copy;
}

/**
 * A whole configuration with one parameter replaced — a fresh document rather
 * than a mutation, because what the surface emits is the post-write record and
 * the stored one is not the surface's to edit in place.
 */
export function withParameter(
  config: GameConfig,
  widget: ParameterWidget,
  value: number,
): GameConfig {
  const half = clonePlain(config[widget.half]) as Record<string, unknown>;
  let cursor = half;
  const path = widget.descriptor.path;
  for (const segment of path.slice(0, -1)) {
    const next = cursor[segment];
    if (!isRecord(next)) return config;
    cursor = next as Record<string, unknown>;
  }
  const leaf = path[path.length - 1];
  if (leaf === undefined) return config;
  cursor[leaf] = value;
  return { ...config, [widget.half]: half } as GameConfig;
}

/**
 * Whether a widget's gate is currently off — read from the gating parameter's
 * declared sentinel, so a changed sentinel moves this with it.
 * spec: game-configuration/conditional-parameter-semantics#ui-communicates-without-blocking
 */
export function isGatedOff(widget: ParameterWidget, config: GameConfig): boolean {
  if (widget.gatedBy === null) return false;
  const gate = descriptorsOf(widget.half).find((d) => gameplayParameterKey(d) === widget.gatedBy);
  if (gate === undefined) return false;
  return valueAt(config[widget.half], gate.path) === gate.disableSentinel;
}

function descriptorsOf(half: ConfigurationHalf): readonly GameplayParameterDescriptor[] {
  return half === "generation" ? GENERATION_PARAMETER_DESCRIPTORS : GAMEPLAY_PARAMETER_DESCRIPTORS;
}

// ---------------------------------------------------------------------------
// Board size: preset plus custom.
// ---------------------------------------------------------------------------

/** The board-size widget, which the preset affordance is a display over. */
export const BOARD_SIZE_WIDGET: ParameterWidget = (() => {
  const widget = GENERATION_WIDGETS.find((candidate) => candidate.key === "boardSize");
  if (widget === undefined) throw new Error("boardSize is not a declared generation parameter");
  return widget;
})();

/**
 * The offered board-size presets.
 *
 * Labels over integers, and nothing more: the persisted and transmitted value
 * is always the raw integer, and the affordance derives its display from the
 * stored integer rather than from how the value was entered. A preset outside
 * the declared range is not offered, because the range is the declaration's and
 * this list is a convenience over it.
 * spec: game-configuration/closed-parameter-vocabulary#board-size-round-trip
 */
export const BOARD_SIZE_PRESETS: ReadonlyArray<{ readonly label: string; readonly value: number }> =
  [
    { label: "Small", value: 11 },
    { label: "Standard", value: 21 },
    { label: "Large", value: 25 },
  ].filter(
    ({ value }) =>
      value >= BOARD_SIZE_WIDGET.descriptor.min && value <= BOARD_SIZE_WIDGET.descriptor.max,
  );

/**
 * How the preset-plus-custom affordance displays a stored board size: the
 * matching preset's label, otherwise custom with the integer pre-filled. The
 * stored value never depends on how it was entered.
 * spec: game-configuration/closed-parameter-vocabulary#board-size-round-trip
 */
export function boardSizeDisplay(size: number): { readonly preset: number | "custom" } {
  return {
    preset: BOARD_SIZE_PRESETS.some((preset) => preset.value === size) ? size : "custom",
  };
}
