<script lang="ts">
// The visual tester's board: the shared `BoardView` with the tester's own
// diagnostics composed over it.
//
// spec: application-shell/one-board-rendering#composition-not-replacement
// The board itself is the one board every surface of the platform renders, so
// a rendering rule changed there follows here. What is added is the layer the
// shared component has no business knowing about — contiguity diagnostics, a
// concern of this tool alone (spec: visual-tester/invalid-state-surfacing):
// a discontinuous body cannot be authored (editor guard) or imported (schema
// guard), so one on the board means a resolver bug or a stale sequence, which
// is exactly the defect this tool exists to expose. `BoardView` draws such a
// body as raw segments rather than a plausible silhouette; naming it, loudly,
// is this layer's job.
import type { Cell, GameState, SnakeId, StagedMove } from "@cyphid/snek-engine";
import { BoardView } from "@cyphid/snek-app-shell";
import { describeContiguityIssue, snakeContiguityIssues } from "./boardIssues";

interface Props {
  state: GameState;
  onCellClick: (cell: Cell) => void;
  highlights?: ReadonlySet<number>;
  teamColours?: Record<string, string>;
  selectedSnakeId?: SnakeId | null;
  staged?: ReadonlyMap<SnakeId, StagedMove>;
  ghostSnakeIds?: ReadonlySet<SnakeId>;
  blockedParity?: 0 | 1 | null;
}

const {
  state,
  onCellClick,
  highlights = new Set(),
  teamColours = {},
  selectedSnakeId = null,
  staged = new Map(),
  ghostSnakeIds = new Set(),
  blockedParity = null,
}: Props = $props();

const contiguityIssues = $derived(snakeContiguityIssues(state));
</script>

<BoardView
  {state}
  {onCellClick}
  {highlights}
  {teamColours}
  {selectedSnakeId}
  {staged}
  {ghostSnakeIds}
  {blockedParity}
>
  {#snippet banner()}
    {#if contiguityIssues.length > 0}
      <div class="invalid-state" role="alert">
        <strong>⚠ Invalid state: discontinuous snake body.</strong>
        The engine should never produce this — it means a bug in turn resolution or a
        corrupt sequence. Not rendering it as a normal snake.
        <ul>
          {#each contiguityIssues as issue (issue.snakeId)}
            <li>{describeContiguityIssue(issue)}</li>
          {/each}
        </ul>
      </div>
    {/if}
  {/snippet}
</BoardView>

<style>
  .invalid-state {
    max-width: 640px;
    margin-bottom: 0.75rem;
    padding: 0.6rem 0.8rem;
    border: 1px solid #f43f5e;
    border-left: 4px solid #f43f5e;
    border-radius: 4px;
    background: #2a0a12;
    color: #fecdd3;
    font-size: 0.85rem;
    line-height: 1.35;
  }
  .invalid-state strong { color: #fda4af; }
  .invalid-state ul { margin: 0.4rem 0 0; padding-left: 1.1rem; }
  .invalid-state li { font-family: ui-monospace, monospace; font-size: 0.8rem; }
</style>
