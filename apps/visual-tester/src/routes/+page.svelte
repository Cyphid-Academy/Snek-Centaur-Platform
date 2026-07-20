<script lang="ts">
// The visual tester's interactive surface: board editor, move staging,
// turn simulation, and session history with scrub bar.
// spec: visual-tester/dedicated-app — a dev tool, never player-facing;
// turns advance exclusively through the shared engine's resolveTurn (D2:
// the engine runs in the browser).
import BoardView from "$lib/components/BoardView.svelte";
import EditorPanel from "$lib/components/EditorPanel.svelte";
import HistoryBar from "$lib/components/HistoryBar.svelte";
import MovePanel from "$lib/components/MovePanel.svelte";
import RunPanel from "$lib/components/RunPanel.svelte";
import SequencePanel from "$lib/components/SequencePanel.svelte";
import * as editor from "$lib/editor.js";
import { TesterStore } from "$lib/store.svelte.js";
import type { Tool } from "$lib/tools.js";
import { browser } from "$app/environment";
import type { Cell } from "@cyphid/snek-engine";
import { onMount } from "svelte";

const store = new TesterStore();

let tool = $state<Tool>({ kind: "inspect" });

// spec: visual-tester/board-editor#head-parity-enforced — while the Add Snake
// tool is active, the cells of the parity a new head may NOT take (the red
// checkerboard). null when not placing, or when no head yet fixes the parity
// (the first head may go on any cell).
const blockedParity = $derived.by<0 | 1 | null>(() => {
  if (tool.kind !== "addSnake") return null;
  const required = editor.requiredHeadParity(store.currentState);
  return required === null ? null : ((1 - required) as 0 | 1);
});

// spec: visual-tester/sequence-management — the selected sequence is mirrored
// in the URL (?seq=<id>) so it survives reload and is shareable; on load a
// ?seq points the session at that saved sequence. Capture the incoming id
// synchronously here, before the sync effect below can rewrite the URL.
const initialSeq = browser ? new URL(window.location.href).searchParams.get("seq") : null;
let initialized = $state(false);

onMount(async () => {
  await store.refreshList();
  if (initialSeq !== null) {
    const entry = store.sequences.find((e) => e.id === initialSeq);
    if (entry) {
      await store.load(entry);
    } else {
      store.notice = `No saved sequence "${initialSeq}" was found — it may have been removed. Showing a fresh session.`;
    }
  }
  initialized = true; // only now may the effect start syncing the URL
});

$effect(() => {
  const id = store.selectedId;
  // Gate until the initial ?seq load has run, so this never strips it first.
  if (!browser || !initialized) return;
  const url = new URL(window.location.href);
  if (id === null) url.searchParams.delete("seq");
  else url.searchParams.set("seq", id);
  if (url.search !== window.location.search) {
    history.replaceState(history.state, "", url);
  }
});

function onCellClick(cell: Cell): void {
  const t = tool;
  switch (t.kind) {
    case "inspect": {
      // spec: visual-tester/snake-selection — clicking a snake's body selects
      // it (and clicking empty space clears the selection).
      const snake = store.currentState.snakes.find((sn) =>
        sn.body.some((c) => c.x === cell.x && c.y === cell.y),
      );
      store.selectSnake(snake ? snake.snakeId : null);
      return;
    }
    case "paint":
      store.applyEdit((s) => editor.paintCell(s, cell, t.cellType));
      return;
    case "placeItem":
      store.applyEdit((s) => editor.placeItem(s, cell, t.itemType));
      return;
    case "eraseItem":
      store.applyEdit((s) => editor.removeItem(s, cell));
      return;
    case "addSnake":
      // spec: visual-tester/snake-selection#creation-selects — the store
      // creates and selects atomically.
      store.addSnakeAt(cell);
      return;
    case "extendBody": {
      // spec: visual-tester/snake-selection#extend-targets-selection — extend
      // always grows the one selected snake, never a separately-tracked target.
      const target = store.selectedSnake;
      if (target === null) {
        store.notice = "Select a snake first — then click cells to extend its body.";
        return;
      }
      store.applyEdit((s) => editor.appendBodyCell(s, target.snakeId, cell));
      return;
    }
  }
}
</script>

<svelte:head>
  <title>Snek Visual Tester</title>
</svelte:head>

<main>
  <header>
    <h1>Snek Visual Tester</h1>
    <div class="actions">
      <button type="button" onclick={() => store.newBlank()}>New blank session</button>
      <button type="button" onclick={() => store.newFromBoardgen()}>New from boardgen</button>
    </div>
  </header>

  {#if store.error}
    <p class="error" role="alert">Edit rejected: {store.error}</p>
  {/if}
  {#if store.notice}
    <p class="error" role="alert">{store.notice}</p>
  {/if}
  {#if store.persistError}
    <p class="error" role="alert">Autosave error: {store.persistError}. Your edits are in memory but may not be saved to disk.</p>
  {/if}

  <div class="layout">
    <div class="left">
      <BoardView
        state={store.currentState}
        {onCellClick}
        highlights={store.activeHighlights}
        teamColours={store.teamColours}
        selectedSnakeId={store.selectedSnakeId}
        staged={store.staged}
        ghostSnakeIds={store.ghostSnakeIds}
        {blockedParity}
      />
      {#if store.runResult}
        <RunPanel result={store.runResult} />
      {/if}
      <HistoryBar
        cursor={store.cursor}
        turnCount={store.turnCount}
        record={store.currentRecord}
        onScrub={(k) => store.scrubTo(k)}
        teamName={(id) => store.teamName(id)}
      />
      <MovePanel
        state={store.currentState}
        staged={store.staged}
        onStage={(id, dir) => store.stage(id, dir)}
        onUnstage={(id) => store.unstage(id)}
        onSimulate={() => store.simulate()}
        selectedSnakeId={store.selectedSnakeId}
        onSelect={(id) => store.selectSnake(id)}
        teamName={(id) => store.teamName(id)}
      />
    </div>
    <aside class="right">
      {#if tool.kind === "addSnake"}
        <div class="addsnake">
          <label>Team
            <select bind:value={store.selectedTeamId}>
              {#each store.teams as team (team.id)}
                <option value={team.id}>{team.name}</option>
              {/each}
            </select>
          </label>
          <span class="hint">
            letter is auto-assigned; click a cell to place the head{#if blockedParity !== null} — red cells are the wrong parity (all heads must share <code>(x+y) mod 2</code>){/if}
          </span>
        </div>
      {/if}
      <EditorPanel {store} {tool} onToolChange={(t) => (tool = t)} />
      <SequencePanel {store} />
    </aside>
  </div>
</main>

<style>
  :global(body) {
    margin: 0;
    background: #0f172a;
    color: #e2e8f0;
    font-family: system-ui, sans-serif;
  }
  main { max-width: 1200px; margin: 0 auto; padding: 1rem; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  h1 { font-size: 1.3rem; margin: 0.2rem 0; color: #f8fafc; }
  .actions { display: flex; gap: 0.5rem; }
  button {
    background: #1e293b;
    color: #e2e8f0;
    border: 1px solid #334155;
    border-radius: 4px;
    padding: 0.3rem 0.7rem;
    cursor: pointer;
  }
  button:hover { border-color: #7dd3fc; }
  .error { color: #fda4af; background: #1e293b; border-radius: 6px; padding: 0.4rem 0.6rem; }
  .layout { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 1.2rem; margin-top: 0.8rem; }
  .left { display: flex; flex-direction: column; gap: 0.9rem; min-width: 0; }
  .right { min-width: 0; }
  .addsnake { display: flex; gap: 0.6rem; margin-bottom: 0.5rem; flex-wrap: wrap; align-items: center; }
  .addsnake label { color: #94a3b8; display: inline-flex; gap: 0.3rem; align-items: center; }
  .hint { color: #64748b; font-size: 0.8rem; }
  @media (max-width: 900px) {
    .layout { grid-template-columns: 1fr; }
  }
</style>
