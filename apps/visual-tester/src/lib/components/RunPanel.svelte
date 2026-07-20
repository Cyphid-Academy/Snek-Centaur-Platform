<script lang="ts">
// Run-result presentation: pass indication with turns-verified count, or the
// halted run's differences grouped by section and colour-coded by side.
// spec: visual-tester/sequence-run — pass indication (#pass-indication) and
// per-difference (path, expected, computed) annotation (#divergence-annotated).
// design: add-visual-tester (D8) — grouped by top-level section, expected in
// one colour, computed in another.
import { groupDifferences } from "../run.js";
import type { ReplayResult } from "../test-sequences/replay.js";

interface Props {
  result: ReplayResult;
}

const { result }: Props = $props();

const groups = $derived(result.passed ? [] : groupDifferences(result.differences));

function show(value: unknown): string {
  return value === undefined ? "(absent)" : JSON.stringify(value);
}
</script>

<section class:pass={result.passed} class:fail={!result.passed}>
  {#if result.passed}
    <p class="verdict">
      ✓ Run passed — {result.turnsVerified}
      {result.turnsVerified === 1 ? "turn" : "turns"} verified.
    </p>
  {:else}
    <p class="verdict">
      ✗ Run halted at turn {result.divergentTurnNumber} — {result.turnsVerified}
      {result.turnsVerified === 1 ? "turn" : "turns"} matched before the divergence.
      Implicated cells are highlighted on the board.
    </p>
    <p class="legend">
      <span class="expected">expected (recorded)</span>
      <span class="computed">computed (resolver)</span>
    </p>
    {#each groups as group (group.section)}
      <details open>
        <summary>{group.section} — {group.differences.length}</summary>
        <ul>
          {#each group.differences as diff (diff.path)}
            <li>
              <code class="path">{diff.path}</code>
              <span class="expected">{show(diff.expected)}</span>
              <span class="computed">{show(diff.computed)}</span>
            </li>
          {/each}
        </ul>
      </details>
    {/each}
  {/if}
</section>

<style>
  section { border-radius: 8px; padding: 0.6rem 0.8rem; display: flex; flex-direction: column; gap: 0.4rem; }
  section.pass { background: #052e16; border: 1px solid #166534; }
  section.fail { background: #2a0e1a; border: 1px solid #9f1239; }
  .verdict { margin: 0; font-size: 0.9rem; font-weight: 600; }
  .pass .verdict { color: #4ade80; }
  .fail .verdict { color: #fda4af; }
  .legend { display: flex; gap: 1rem; margin: 0; font-size: 0.75rem; }
  .expected { color: #fbbf24; }
  .computed { color: #7dd3fc; }
  details { background: #0f172a; border-radius: 6px; padding: 0.35rem 0.55rem; }
  summary { color: #e2e8f0; cursor: pointer; font-size: 0.82rem; text-transform: capitalize; }
  ul { list-style: none; margin: 0.25rem 0 0; padding: 0; max-height: 16rem; overflow: auto; display: flex; flex-direction: column; gap: 0.3rem; }
  li { display: flex; flex-direction: column; font-size: 0.75rem; }
  .path { color: #94a3b8; word-break: break-all; }
  li .expected, li .computed { word-break: break-all; }
</style>
