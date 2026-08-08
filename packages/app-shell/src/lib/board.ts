// spec: application-shell/one-board-rendering#composition-not-replacement
// The coordinate system `BoardView` hands to an `overlay` snippet, so a surface
// composing a marker over the board draws in the same units the board does
// rather than guessing at them. Lives beside the component instead of inside it
// because a Svelte instance script has no exports to declare a type through.

/** Board coordinates: `cellSize` user units per grid cell, `padding` inset. */
export interface BoardGeometry {
  readonly cellSize: number;
  readonly padding: number;
  readonly boardSize: number;
}
