<script lang="ts">
  import { createSnakeBodyPath, type SnakeSegment } from "./snakeBodyPath";

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
