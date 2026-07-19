---
name: Svelte 5 demo reactivity patterns
description: Pitfalls when mixing non-reactive engine state with Svelte 5 runes in the snek demo
---
- Keep engine/driver objects OUTSIDE $state (proxies break the engine); render from plain snapshot views. Template can't watch non-reactive fields (e.g. game.finished) — mirror them into $state.
- Don't combine `bind:value` with an `oninput` that reads the bound variable: handler may run before the binding updates (1-step lag). Read `e.currentTarget.valueAsNumber` directly.
- The engine's resolveTurn returns fresh snakes/items arrays each turn, so per-turn history can store references without cloning — cheap scrubbing.
- Engine spawns snakes with all body segments stacked in the same cell (consecutive duplicates); any renderer/geometry consuming s.body must dedupe consecutive cells before adjacency checks.
