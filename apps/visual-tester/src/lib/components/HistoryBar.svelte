<script lang="ts">
// spec: visual-tester/session-history — scrub bar over the in-memory
// history; scrubbing shows exactly the recorded data for that turn.
import { Direction } from "@cyphid/snek-engine";
import type { GameOutcome } from "@cyphid/snek-engine";
import type { TurnRecord } from "../session.js";

interface Props {
  cursor: number;
  turnCount: number;
  record: TurnRecord | null;
  onScrub: (k: number) => void;
  // spec: visual-tester/team-configuration — teams shown by name, not id.
  teamName?: (id: string) => string;
}

const { cursor, turnCount, record, onScrub, teamName = (id) => id }: Props = $props();

const DIR_LABELS: Record<Direction, string> = {
  [Direction.Up]: "Up",
  [Direction.Right]: "Right",
  [Direction.Down]: "Down",
  [Direction.Left]: "Left",
};

function outcomeText(outcome: GameOutcome): string {
  switch (outcome.kind) {
    case "in_progress":
      return "in progress";
    case "victory":
      return `victory: ${teamName(outcome.winnerCentaurTeamId)} — scores ${[...outcome.scores]
        .map(([t, s]) => `${teamName(t)}=${s}`)
        .join(", ")}`;
    case "draw":
      return `draw: ${outcome.tiedCentaurTeamIds.map((t) => teamName(t)).join(", ")}`;
    case "error":
      return `error: ${outcome.reason}`;
  }
}
</script>

<section>
  <div class="bar">
    <label for="scrub">History</label>
    <input
      id="scrub"
      type="range"
      min="0"
      max={turnCount}
      step="1"
      value={cursor}
      oninput={(e) => onScrub(Number(e.currentTarget.value))}
    />
    <span class="pos">{cursor} / {turnCount}</span>
  </div>
  {#if record}
    <details open>
      <summary>Turn {record.turnNumber} — outcome: {outcomeText(record.outcome)}</summary>
      <p class="staged">
        Staged: {record.stagedMoves.size === 0
          ? "(none)"
          : [...record.stagedMoves]
              .map(([id, m]) => `#${id}→${DIR_LABELS[m.direction]}`)
              .join("  ")}
      </p>
      <ul>
        {#each record.events as event, i (i)}
          <li><code>{JSON.stringify(event)}</code></li>
        {/each}
      </ul>
    </details>
  {:else}
    <p class="muted">Initial state (turn boundary 0) — hand-authored or generated.</p>
  {/if}
</section>

<style>
  section { display: flex; flex-direction: column; gap: 0.4rem; }
  .bar { display: flex; align-items: center; gap: 0.6rem; }
  label { color: #f8fafc; font-weight: 600; font-size: 0.9rem; }
  input[type="range"] { flex: 1; }
  .pos { color: #94a3b8; font-variant-numeric: tabular-nums; }
  details { background: #1e293b; border-radius: 6px; padding: 0.4rem 0.6rem; }
  summary { color: #e2e8f0; cursor: pointer; font-size: 0.85rem; }
  .staged { color: #94a3b8; font-size: 0.8rem; margin: 0.3rem 0; }
  ul { list-style: none; margin: 0; padding: 0; max-height: 12rem; overflow: auto; }
  li { font-size: 0.72rem; color: #7dd3fc; padding: 0.1rem 0; }
  code { word-break: break-all; }
  .muted { color: #64748b; font-size: 0.85rem; margin: 0; }
</style>
