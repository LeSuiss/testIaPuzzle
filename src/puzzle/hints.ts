import type { Grid, HelpLevel } from "./types";

export function helpRadius(level: HelpLevel): number {
  // Rayon en nombre de cases autour de la case cible.
  // Plus le niveau est "advanced", plus c’est permissif (donc plus d’aide).
  switch (level) {
    case "simple":
      return 0; // 1x1
    case "medium":
      return 1; // 3x3
    case "advanced":
      return 2; // 5x5
  }
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function hintRectForPiece(
  grid: Grid,
  pieceRow: number,
  pieceCol: number,
  level: HelpLevel,
): { r0: number; c0: number; r1: number; c1: number } {
  const rad = helpRadius(level);
  const r0 = clamp(pieceRow - rad, 0, grid.rows - 1);
  const c0 = clamp(pieceCol - rad, 0, grid.cols - 1);
  const r1 = clamp(pieceRow + rad, 0, grid.rows - 1);
  const c1 = clamp(pieceCol + rad, 0, grid.cols - 1);
  return { r0, c0, r1, c1 };
}


