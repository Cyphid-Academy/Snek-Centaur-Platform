<script lang="ts">
// spec: visual-tester/move-staging — per-snake manual staging; any snake
// may stay unstaged; certain-death marking is advisory only.
import { Direction, isValidMove } from "@cyphid/snek-engine";
import type { GameState, SnakeId, StagedMove } from "@cyphid/snek-engine";

interface Props {
  state: GameState;
  staged: ReadonlyMap<SnakeId, StagedMove>;
  onStage: (snakeId: SnakeId, direction: Direction) => void;
  onUnstage: (snakeId: SnakeId) => void;
  onSimulate: () => void;
  // spec: visual-tester/snake-selection — the selected snake is highlighted
  // here too, and clicking a snake's name selects it.
  selectedSnakeId?: SnakeId | null;
  onSelect?: (snakeId: SnakeId) => void;
  // spec: visual-tester/team-configuration — teams shown by name, not id.
  teamName?: (id: string) => string;
}

const {
  state,
  staged,
  onStage,
  onUnstage,
  onSimulate,
  selectedSnakeId = null,
  onSelect,
  teamName = (id) => id,
}: Props = $props();

const alive = $derived(state.snakes.filter((s) => s.alive));

const DIRECTIONS: Array<{ dir: Direction; label: string }> = [
  { dir: Direction.Up, label: "\u2191" },
  { dir: Direction.Right, label: "\u2192" },
  { dir: Direction.Down, label: "\u2193" },
  { dir: Direction.Left, label: "\u2190" },
];
</script>

<section>
  <h2>Move staging</h2>
  {#if alive.length === 0}
    <p class="muted">No living snakes to stage.</p>
  {:else}
    <ul>
      {#each alive as snake (snake.snakeId)}
        {@const move = staged.get(snake.snakeId)}
        {@const certainDeath = move !== undefined && !isValidMove(state, snake.snakeId, move.direction)}
        <li class:selected={snake.snakeId === selectedSnakeId}>
          <button type="button" class="name" onclick={() => onSelect?.(snake.snakeId)}>
            {snake.letter}
            <span class="muted">#{snake.snakeId} ({teamName(snake.centaurTeamId)})</span>
          </button>
          <span class="dirs">
            {#each DIRECTIONS as d (d.dir)}
              <button
                type="button"
                class:active={move?.direction === d.dir}
                class:deadly={move?.direction === d.dir && certainDeath}
                onclick={() => onStage(snake.snakeId, d.dir)}
                title={!isValidMove(state, snake.snakeId, d.dir)
                  ? "Certain death (advisory — still submitted unchanged)"
                  : undefined}
              >
                {d.label}{#if !isValidMove(state, snake.snakeId, d.dir)}<sup>!</sup>{/if}
              </button>
            {/each}
            <button type="button" class="unstage" disabled={move === undefined} onclick={() => onUnstage(snake.snakeId)}>
              unstage
            </button>
          </span>
          {#if certainDeath}
            <span class="warn" data-testid="certain-death">certain death — submitted unchanged</span>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  <button type="button" class="simulate" onclick={onSimulate}>Simulate turn</button>
</section>

<style>
  section { display: flex; flex-direction: column; gap: 0.5rem; }
  h2 { font-size: 0.95rem; margin: 0; color: #f8fafc; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
  li { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; padding: 0.15rem 0.3rem; border-radius: 5px; border: 1px solid transparent; }
  li.selected { background: #0c2a3f; border-color: #38bdf8; }
  button.name {
    min-width: 9rem;
    color: #e2e8f0;
    font-weight: 600;
    text-align: left;
    background: none;
    border: none;
    padding: 0.1rem 0.2rem;
    cursor: pointer;
  }
  button.name:hover { border: none; color: #7dd3fc; }
  .muted { color: #64748b; font-weight: 400; font-size: 0.8rem; }
  .dirs { display: inline-flex; gap: 0.25rem; }
  button {
    background: #1e293b;
    color: #e2e8f0;
    border: 1px solid #334155;
    border-radius: 4px;
    padding: 0.2rem 0.5rem;
    cursor: pointer;
  }
  button:hover { border-color: #7dd3fc; }
  button.active { background: #0369a1; border-color: #7dd3fc; }
  button.active.deadly { background: #9f1239; border-color: #fda4af; }
  button:disabled { opacity: 0.4; cursor: default; }
  .unstage { font-size: 0.75rem; }
  .warn { color: #fda4af; font-size: 0.8rem; }
  .simulate {
    align-self: flex-start;
    background: #0369a1;
    border-color: #0ea5e9;
    font-weight: 700;
    padding: 0.4rem 1rem;
  }
  sup { color: #fda4af; }
</style>
