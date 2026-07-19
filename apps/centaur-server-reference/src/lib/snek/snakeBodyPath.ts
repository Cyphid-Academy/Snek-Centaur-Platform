import { inflatePathsD, JoinType, EndType } from "clipper2-ts";

export interface SnakeSegment {
  readonly x: number;
  readonly y: number;
}

export interface SnakeBodyPathOptions {
  readonly segments: readonly SnakeSegment[];
  readonly cellSize: number;
  readonly padding: number;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function dedupeConsecutive(
  segments: readonly SnakeSegment[],
): SnakeSegment[] {
  const result: SnakeSegment[] = [];
  for (const seg of segments) {
    const prev = result[result.length - 1];
    if (prev === undefined || prev.x !== seg.x || prev.y !== seg.y) {
      result.push(seg);
    }
  }
  return result;
}

function validateSegments(segments: readonly SnakeSegment[]): void {
  for (let i = 1; i < segments.length; i++) {
    const a = segments[i - 1]!;
    const b = segments[i]!;
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    if (dx + dy !== 1) {
      throw new Error(
        `Invalid snake body: segments ${i - 1} (${a.x},${a.y}) and ${i} (${b.x},${b.y}) are not orthogonally adjacent`,
      );
    }
  }
}

function toCenterline(
  segments: readonly SnakeSegment[],
  cellSize: number,
): Point[] {
  const points: Point[] = [];
  for (const seg of segments) {
    const p = { x: (seg.x + 0.5) * cellSize, y: (seg.y + 0.5) * cellSize };
    const prev = points[points.length - 1];
    const beforePrev = points[points.length - 2];
    if (
      prev !== undefined &&
      beforePrev !== undefined &&
      ((prev.x === beforePrev.x && prev.x === p.x) ||
        (prev.y === beforePrev.y && prev.y === p.y))
    ) {
      points[points.length - 1] = p;
    } else {
      points.push(p);
    }
  }
  return points;
}

function polygonsToSvgPath(polygons: readonly (readonly Point[])[]): string {
  return polygons
    .filter((polygon) => polygon.length >= 3)
    .map((polygon) => {
      const [first, ...rest] = polygon as [Point, ...Point[]];
      return [
        `M ${round3(first.x)} ${round3(first.y)}`,
        ...rest.map((p) => `L ${round3(p.x)} ${round3(p.y)}`),
        "Z",
      ].join(" ");
    })
    .join(" ");
}

function roundedSquarePath(
  seg: SnakeSegment,
  cellSize: number,
  padding: number,
  cornerRadius: number,
): string {
  const x = seg.x * cellSize + padding;
  const y = seg.y * cellSize + padding;
  const s = cellSize - 2 * padding;
  const r = Math.min(cornerRadius, s / 2);
  return [
    `M ${round3(x + r)} ${round3(y)}`,
    `H ${round3(x + s - r)}`,
    `A ${r} ${r} 0 0 1 ${round3(x + s)} ${round3(y + r)}`,
    `V ${round3(y + s - r)}`,
    `A ${r} ${r} 0 0 1 ${round3(x + s - r)} ${round3(y + s)}`,
    `H ${round3(x + r)}`,
    `A ${r} ${r} 0 0 1 ${round3(x)} ${round3(y + s - r)}`,
    `V ${round3(y + r)}`,
    `A ${r} ${r} 0 0 1 ${round3(x + r)} ${round3(y)}`,
    "Z",
  ].join(" ");
}

/**
 * Converts an ordered array of snake body segments (grid cells) into a single
 * closed SVG path outlining the connected snake silhouette. The body edge is
 * inset `padding` px from the cell boundary, matching the previous
 * per-segment rect inset.
 */
export function createSnakeBodyPath(options: SnakeBodyPathOptions): string {
  const { cellSize, padding } = options;
  const segments = dedupeConsecutive(options.segments);

  if (segments.length === 0) return "";

  const bodyRadius = cellSize / 2 - padding;
  if (bodyRadius <= 0) {
    throw new Error(
      `Invalid geometry: padding ${padding} leaves no body for cell size ${cellSize}`,
    );
  }

  if (segments.length === 1) {
    return roundedSquarePath(segments[0]!, cellSize, padding, 7);
  }

  validateSegments(segments);

  const centerline = toCenterline(segments, cellSize);
  const polygons = inflatePathsD(
    [centerline],
    bodyRadius,
    JoinType.Round,
    EndType.Round,
    2,
    3,
  );

  return polygonsToSvgPath(polygons);
}
