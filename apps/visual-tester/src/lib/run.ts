// Run-mode presentation helpers: grouping the replay-check's differences by
// top-level section and mapping difference paths back onto board cells.
//
// spec: visual-tester/sequence-run#divergence-annotated — each difference is
// listed with its path, expected value, and computed value; cells implicated
// by state differences are highlighted on the board itself.
// design: add-visual-tester (D8) — differences render grouped by top-level
// section (snakes / board / items / events / outcome), colour-coded by side.

import type { TurnOutputJson } from "./test-sequences/codec.js";
import type { Difference } from "./test-sequences/replay.js";

export const DIFF_SECTIONS = ["snakes", "board", "items", "clocks", "events", "outcome"] as const;
export type DiffSection = (typeof DIFF_SECTIONS)[number];

export function sectionOf(path: string): DiffSection {
  if (path.startsWith("nextState.snakes")) return "snakes";
  if (path.startsWith("nextState.board")) return "board";
  if (path.startsWith("nextState.items")) return "items";
  if (path.startsWith("nextState.clocks")) return "clocks";
  if (path.startsWith("events")) return "events";
  return "outcome";
}

export interface DiffGroup {
  readonly section: DiffSection;
  readonly differences: ReadonlyArray<Difference>;
}

/** Group differences by section, in the fixed D8 presentation order. */
export function groupDifferences(differences: ReadonlyArray<Difference>): DiffGroup[] {
  const bySection = new Map<DiffSection, Difference[]>();
  for (const d of differences) {
    const section = sectionOf(d.path);
    const bucket = bySection.get(section);
    if (bucket) bucket.push(d);
    else bySection.set(section, [d]);
  }
  return DIFF_SECTIONS.filter((s) => bySection.has(s)).map((section) => ({
    section,
    differences: bySection.get(section) ?? [],
  }));
}

// ---------------------------------------------------------------------------
// Difference path → board cells
// ---------------------------------------------------------------------------

/** Parse "nextState.snakes[1].body[0].x" into ["nextState","snakes",1,"body",0,"x"]. */
function parsePath(path: string): Array<string | number> {
  const out: Array<string | number> = [];
  for (const match of path.matchAll(/([^.[\]]+)|\[(\d+)\]/g)) {
    if (match[2] !== undefined) out.push(Number(match[2]));
    else if (match[1] !== undefined) out.push(match[1]);
  }
  return out;
}

function valueAt(root: unknown, segments: ReadonlyArray<string | number>): unknown {
  let v: unknown = root;
  for (const seg of segments) {
    if (v === null || typeof v !== "object") return undefined;
    v = (v as Record<string | number, unknown>)[seg];
  }
  return v;
}

function isCellJson(v: unknown): v is { x: number; y: number } {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    typeof (v as { x?: unknown }).x === "number" &&
    typeof (v as { y?: unknown }).y === "number" &&
    Object.keys(v).length === 2
  );
}

/** Collect every canonical {x, y} cell object inside a JSON subtree. */
function collectCells(v: unknown, out: Array<{ x: number; y: number }>): void {
  if (v === null || typeof v !== "object") return;
  if (isCellJson(v)) {
    out.push(v);
    return;
  }
  for (const child of Array.isArray(v) ? v : Object.values(v)) collectCells(child, out);
}

/**
 * Map differences onto the board cells they implicate, as canonical cell
 * indices (`y * boardSize + x`). A difference implicates every cell found in
 * the differing subtree on either side; a bare coordinate difference (path
 * ending in `.x`/`.y`) implicates the enclosing cell; an item-map difference
 * implicates the cell named by its canonical item key.
 */
export function implicatedCellIndices(
  differences: ReadonlyArray<Difference>,
  expected: TurnOutputJson,
  computed: TurnOutputJson,
  boardSize: number,
): ReadonlySet<number> {
  const cells: Array<{ x: number; y: number }> = [];
  const indices = new Set<number>();

  for (const d of differences) {
    const segments = parsePath(d.path);

    // Item-map keys are canonical cell indices (game-engine/item-identity).
    const itemsAt = segments.indexOf("items");
    if (segments[0] === "nextState" && itemsAt === 1 && typeof segments[2] === "string") {
      const idx = Number(segments[2]);
      if (Number.isInteger(idx) && idx >= 0 && idx < boardSize * boardSize) indices.add(idx);
    }

    // Coordinate leaf → look at the enclosing object instead.
    const last = segments[segments.length - 1];
    const target = last === "x" || last === "y" ? segments.slice(0, -1) : segments;

    for (const side of [expected, computed]) {
      collectCells(valueAt(side, target), cells);
    }
  }

  for (const cell of cells) {
    if (
      Number.isInteger(cell.x) &&
      Number.isInteger(cell.y) &&
      cell.x >= 0 &&
      cell.y >= 0 &&
      cell.x < boardSize &&
      cell.y < boardSize
    ) {
      indices.add(cell.y * boardSize + cell.x);
    }
  }
  return indices;
}
