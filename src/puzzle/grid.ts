import type { Grid } from "./types";

function divisors(n: number) {
  const out: number[] = [];
  for (let i = 1; i * i <= n; i++) {
    if (n % i === 0) {
      out.push(i);
      if (i !== n / i) out.push(n / i);
    }
  }
  return out.sort((a, b) => a - b);
}

export function findBestGrid(pieceCount: number, imageAspect: number): Grid {
  // On veut cols/rows proche de imageAspect.
  // rows * cols = pieceCount (exact), en prenant les diviseurs.
  const ds = divisors(pieceCount);
  let best = { rows: 1, cols: pieceCount, score: Number.POSITIVE_INFINITY };

  for (const d of ds) {
    const rows = d;
    const cols = pieceCount / d;
    const ratio = cols / rows;
    const score = Math.abs(Math.log(ratio / imageAspect));
    if (score < best.score) best = { rows, cols, score };
  }

  // Autoriser aussi l’inversion (portrait).
  const ratio = best.cols / best.rows;
  if (Math.abs(Math.log(ratio / imageAspect)) > Math.abs(Math.log((best.rows / best.cols) / imageAspect))) {
    return { rows: best.cols, cols: best.rows, count: pieceCount };
  }

  return { rows: best.rows, cols: best.cols, count: pieceCount };
}



