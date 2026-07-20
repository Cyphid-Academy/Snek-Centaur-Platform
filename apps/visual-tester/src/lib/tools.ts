// The board-click tool palette shared by the editor panel and board view.
import type { CellType, ItemType } from "@cyphid/snek-engine";

export type PaintType = typeof CellType.Normal | typeof CellType.Hazard | typeof CellType.Fertile;

export type Tool =
  | { readonly kind: "inspect" }
  | { readonly kind: "paint"; readonly cellType: PaintType }
  | { readonly kind: "placeItem"; readonly itemType: ItemType }
  | { readonly kind: "eraseItem" }
  | { readonly kind: "addSnake" }
  // spec: visual-tester/snake-selection#extend-targets-selection — extend is a
  // mode with no captured target; it always grows the one selected snake.
  | { readonly kind: "extendBody" };
