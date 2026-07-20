<script lang="ts">
import { createSnakeBodyPath, type SnakeSegment } from "./snakeBodyPath";

// Copied from the demo renderer (PR #6 branch, design D10). No graceful
// fallback: a non-contiguous body is an invalid state the tool exists to
// catch, so BoardView detects it (firstDiscontinuity) and surfaces a
// prominent error instead of rendering here. This component is only ever
// handed a contiguous body; createSnakeBodyPath still throws if that
// contract is broken, rather than drawing a plausible-looking silhouette.
interface Props {
  readonly segments: readonly SnakeSegment[];
  readonly cellSize: number;
  readonly padding: number;
  readonly fill: string;
  readonly stroke: string | null;
  readonly strokeWidth: number;
  readonly dash: string | null;
}

const { segments, cellSize, padding, fill, stroke, strokeWidth, dash }: Props = $props();

const d = $derived(createSnakeBodyPath({ segments, cellSize, padding }));
</script>

{#if d !== ""}
  <path
    {d}
    {fill}
    fill-rule="evenodd"
    stroke={stroke ?? "none"}
    stroke-width={stroke === null ? 0 : strokeWidth}
    stroke-dasharray={dash}
    stroke-linecap="round"
    stroke-linejoin="round"
  />
{/if}
