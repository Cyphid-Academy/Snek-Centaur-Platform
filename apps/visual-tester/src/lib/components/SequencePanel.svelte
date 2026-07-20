<script lang="ts">
// Test Sequence management. The working session auto-persists to a scratch
// sequence (design D11) — there is no "save" for scratch. This panel renames
// the working session, promotes a snapshot to a git-tracked fixture (with
// overwrite confirmation on a name clash), imports pasted JSON to scratch,
// and lists / filters / loads / copies / runs saved sequences.
// spec: visual-tester/auto-persist, visual-tester/sequence-management
import { onMount } from "svelte";
import type { SequenceFilter, TesterStore } from "../store.svelte.js";
import type { SequenceListEntry } from "../sequenceClient.js";

interface Props {
  store: TesterStore;
}

const { store }: Props = $props();

interface PathError {
  path: string;
  message: string;
}

let pasteText = $state("");
let showPaste = $state(false);
let errors = $state<PathError[]>([]);
let notice = $state<string | null>(null);
let busy = $state(false);
// Pending overwrite confirmation for a fixture-name clash.
let confirmOverwrite = $state<{ id: string; name: string } | null>(null);

const FILTERS: ReadonlyArray<{ value: SequenceFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "fixture", label: "Fixtures" },
  { value: "scratch", label: "Scratch" },
];

onMount(() => void store.refreshList());

async function saveFixture(): Promise<void> {
  errors = [];
  notice = null;
  confirmOverwrite = null;
  const name = store.name.trim();
  if (name === "") {
    errors = [{ path: "name", message: "name must be non-empty" }];
    return;
  }
  busy = true;
  try {
    const result = await store.saveFixture(name);
    if (result.status === "conflict") {
      confirmOverwrite = { id: result.id, name };
    } else {
      notice = `Saved fixture "${name}" — commit it to promote to the CI regression set.`;
    }
  } catch (e) {
    notice = e instanceof Error ? e.message : String(e);
  } finally {
    busy = false;
  }
}

async function doOverwrite(): Promise<void> {
  const target = confirmOverwrite;
  if (!target) return;
  busy = true;
  try {
    await store.overwriteFixture(target.id, target.name);
    notice = `Overwrote fixture "${target.name}".`;
  } catch (e) {
    notice = e instanceof Error ? e.message : String(e);
  } finally {
    confirmOverwrite = null;
    busy = false;
  }
}

async function load(entry: SequenceListEntry): Promise<void> {
  errors = [];
  notice = null;
  await store.load(entry);
  notice = `Loaded "${entry.name}"${entry.tier === "fixture" ? " (edits will fork to scratch)" : ""}.`;
}

async function run(entry: SequenceListEntry): Promise<void> {
  errors = [];
  notice = null;
  await store.run(entry);
}

// spec: visual-tester/sequence-management#copy-json
async function copy(entry: SequenceListEntry): Promise<void> {
  errors = [];
  notice = null;
  try {
    const doc = await store.fetchDoc(entry.id);
    await navigator.clipboard.writeText(JSON.stringify(doc, null, 2));
    notice = `Copied "${entry.name}" JSON to the clipboard.`;
  } catch (e) {
    notice = e instanceof Error ? e.message : String(e);
  }
}

// spec: visual-tester/sequence-management#paste-import-rejected — invalid
// paste creates nothing; #paste-import-accepted — valid paste becomes scratch.
async function importPaste(): Promise<void> {
  errors = [];
  notice = null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(pasteText);
  } catch (e) {
    errors = [
      { path: "(document root)", message: `not valid JSON: ${e instanceof Error ? e.message : String(e)}` },
    ];
    return;
  }
  busy = true;
  try {
    const problems = await store.importPaste(parsed);
    if (problems.length > 0) {
      errors = [...problems];
      return;
    }
    pasteText = "";
    showPaste = false;
    notice = "Imported sequence to scratch.";
  } finally {
    busy = false;
  }
}
</script>

<section>
  <h2>Test Sequences</h2>

  <label class="editing">
    <span>Editing</span>
    <input
      value={store.name}
      onchange={(e) => store.rename(e.currentTarget.value)}
      placeholder="session name"
    />
  </label>

  <div class="actions">
    <button type="button" class="fixture" disabled={busy} onclick={() => void saveFixture()}>
      Save as fixture
    </button>
    <button type="button" onclick={() => (showPaste = !showPaste)}>
      {showPaste ? "Cancel paste" : "Paste import"}
    </button>
  </div>

  {#if confirmOverwrite}
    <div class="confirm" role="alert">
      A fixture named <strong>{confirmOverwrite.name}</strong> already exists. Overwrite it?
      <div class="confirm-actions">
        <button type="button" class="danger" disabled={busy} onclick={() => void doOverwrite()}>Overwrite</button>
        <button type="button" disabled={busy} onclick={() => (confirmOverwrite = null)}>Cancel</button>
      </div>
    </div>
  {/if}

  {#if showPaste}
    <div class="paste">
      <textarea rows="6" placeholder="Paste a Test Sequence JSON document" bind:value={pasteText}></textarea>
      <button type="button" disabled={busy} onclick={() => void importPaste()}>Import to scratch</button>
    </div>
  {/if}

  {#if store.persistError}
    <p class="persist-error">Autosave error: {store.persistError}</p>
  {/if}
  {#if notice}
    <p class="notice">{notice}</p>
  {/if}
  {#if errors.length > 0}
    <div class="errors" role="alert">
      <p>Validation failed — nothing was created:</p>
      <ul>
        {#each errors as err, i (i)}
          <li><code>{err.path}</code> — {err.message}</li>
        {/each}
      </ul>
    </div>
  {/if}

  <div class="filter" role="group" aria-label="Filter sequences">
    {#each FILTERS as f (f.value)}
      <button type="button" class:active={store.filter === f.value} onclick={() => (store.filter = f.value)}>
        {f.label}
      </button>
    {/each}
  </div>

  {#if store.filteredSequences.length === 0}
    <p class="muted">No {store.filter === "all" ? "" : store.filter} sequences yet.</p>
  {:else}
    <ul class="list">
      {#each store.filteredSequences as entry (entry.id)}
        <li class:selected={entry.id === store.selectedId}>
          <span class="name" title={`updated ${entry.updatedAt}`}>
            <span class={`badge ${entry.tier}`}>{entry.tier}</span>
            {entry.name}
          </span>
          <span class="rowactions">
            <button type="button" onclick={() => void load(entry)}>Load</button>
            <button type="button" onclick={() => void copy(entry)}>Copy JSON</button>
            <button type="button" class="run" onclick={() => void run(entry)}>Run</button>
          </span>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  section {
    background: #1e293b;
    border-radius: 8px;
    padding: 0.7rem 0.8rem;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }
  h2 { font-size: 0.95rem; margin: 0; color: #f8fafc; }
  .editing { display: flex; align-items: center; gap: 0.4rem; }
  .editing span { color: #94a3b8; font-size: 0.8rem; }
  .actions { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  input, textarea {
    background: #0f172a;
    color: #e2e8f0;
    border: 1px solid #334155;
    border-radius: 4px;
    padding: 0.25rem 0.45rem;
    font: inherit;
  }
  .editing input { flex: 1; min-width: 8rem; }
  .paste { display: flex; flex-direction: column; gap: 0.4rem; }
  textarea { font-family: ui-monospace, monospace; font-size: 0.75rem; resize: vertical; }
  button {
    background: #0f172a;
    color: #e2e8f0;
    border: 1px solid #334155;
    border-radius: 4px;
    padding: 0.25rem 0.6rem;
    cursor: pointer;
  }
  button:hover:not(:disabled) { border-color: #7dd3fc; }
  button:disabled { opacity: 0.5; cursor: default; }
  button.run, button.fixture { border-color: #4ade80; }
  button.danger { border-color: #f43f5e; color: #fecdd3; }
  .confirm { background: #2a0a12; border: 1px solid #f43f5e; border-radius: 4px; padding: 0.5rem 0.6rem; color: #fecdd3; font-size: 0.82rem; }
  .confirm-actions { display: flex; gap: 0.4rem; margin-top: 0.4rem; }
  .filter { display: flex; gap: 0.3rem; }
  .filter button { font-size: 0.75rem; padding: 0.15rem 0.55rem; }
  .filter button.active { border-color: #7dd3fc; background: #1e3a5f; }
  .persist-error { color: #fca5a5; font-size: 0.78rem; margin: 0; }
  .notice { color: #7dd3fc; font-size: 0.8rem; margin: 0; }
  .errors { color: #fda4af; font-size: 0.8rem; }
  .errors p { margin: 0 0 0.25rem; }
  .errors ul { margin: 0; padding-left: 1.1rem; max-height: 10rem; overflow: auto; }
  .errors code { color: #fecdd3; word-break: break-all; }
  .muted { color: #64748b; font-size: 0.85rem; margin: 0; }
  .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.3rem; max-height: 14rem; overflow: auto; }
  .list li { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.1rem 0.25rem; border-radius: 4px; }
  .list li.selected { background: #0c2a3f; outline: 1px solid #38bdf8; }
  .name { color: #e2e8f0; font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badge { display: inline-block; font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.03em; padding: 0.05rem 0.3rem; border-radius: 3px; vertical-align: middle; margin-right: 0.3rem; }
  .badge.fixture { background: #14532d; color: #86efac; }
  .badge.scratch { background: #334155; color: #94a3b8; }
  .rowactions { display: flex; gap: 0.3rem; flex-shrink: 0; }
  .rowactions button { font-size: 0.75rem; padding: 0.15rem 0.45rem; }
</style>
