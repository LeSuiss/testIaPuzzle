import type { Grid, Piece, PieceRotation } from "./types";

function randomRotation90(): PieceRotation {
  const vals: PieceRotation[] = [0, 90, 180, 270];
  return vals[Math.floor(Math.random() * vals.length)]!;
}

export type GenerateProgress = {
  done: number;
  total: number;
};

type EdgeType = -1 | 0 | 1; // -1 = creux, +1 = ergot, 0 = plat

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

type EdgeSpec = {
  sign: EdgeType; // +1 ergot, -1 creux (par rapport à la pièce du "haut" ou de "gauche"), 0 plat
  widthF: number; // largeur relative de la tête
  neckF: number; // finesse du cou
  skewF: number; // légère asymétrie (-1..1)
};

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function buildEdges(grid: Grid) {
  // On stocke aussi des paramètres de forme pour que 2 pièces voisines partagent EXACTEMENT le même emboîtement.
  // vEdges[r][c] = séparation verticale entre (r,c) et (r,c+1)
  const vEdges: EdgeSpec[][] = Array.from({ length: grid.rows }, () =>
    Array.from({ length: Math.max(0, grid.cols - 1) }, () => ({
      sign: (Math.random() < 0.5 ? 1 : -1) as EdgeType,
      widthF: rand(0.92, 1.06),
      neckF: rand(0.90, 1.12),
      skewF: rand(-1, 1),
    })),
  );
  // hEdges[r][c] = séparation horizontale entre (r,c) et (r+1,c)
  const hEdges: EdgeSpec[][] = Array.from({ length: Math.max(0, grid.rows - 1) }, () =>
    Array.from({ length: grid.cols }, () => ({
      sign: (Math.random() < 0.5 ? 1 : -1) as EdgeType,
      widthF: rand(0.92, 1.06),
      neckF: rand(0.90, 1.12),
      skewF: rand(-1, 1),
    })),
  );
  return { vEdges, hEdges };
}

function pieceEdges(
  grid: Grid,
  edges: ReturnType<typeof buildEdges>,
  r: number,
  c: number,
): { top: EdgeSpec; right: EdgeSpec; bottom: EdgeSpec; left: EdgeSpec } {
  const flat: EdgeSpec = { sign: 0, widthF: 1, neckF: 1, skewF: 0 };
  const top =
    r === 0
      ? flat
      : {
          ...edges.hEdges[r - 1]![c]!,
          sign: (-edges.hEdges[r - 1]![c]!.sign) as EdgeType,
        };
  const bottom = r === grid.rows - 1 ? flat : edges.hEdges[r]![c]!;
  const left =
    c === 0
      ? flat
      : {
          ...edges.vEdges[r]![c - 1]!,
          sign: (-edges.vEdges[r]![c - 1]!.sign) as EdgeType,
        };
  const right = c === grid.cols - 1 ? flat : edges.vEdges[r]![c]!;
  return { top, right, bottom, left };
}

function buildJigsawPath(ctx: CanvasRenderingContext2D, tileW: number, tileH: number, tab: number, e: ReturnType<typeof pieceEdges>) {
  // Path dans l’espace [0..tileW]x[0..tileH], les ergots/creux sortent de +/-tab.
  // IMPORTANT: pas de transformations (rotate/translate) au milieu du path, sinon le "current point" crée des diagonales (triangles).
  const EDGE_A = 0.28;
  const EDGE_B = 0.72;

  function hEdgeAbs(startX: number, endX: number, y: number, normalY: -1 | 1, spec: EdgeSpec) {
    const dir = endX >= startX ? 1 : -1;
    const L = Math.abs(endX - startX);
    const xAt = (u: number) => startX + dir * u;
    if (spec.sign === 0 || L <= 0.0001) {
      ctx.lineTo(endX, y);
      return;
    }

    // IMPORTANT: un bord partagé est souvent tracé dans le sens inverse sur la pièce voisine.
    // Si on ne miroir pas `skewF`, les emboîtements se décalent (trou vs appendice).
    const skew = dir === 1 ? spec.skewF : -spec.skewF;
    const centerU = L * (0.5 + clamp(skew, -1, 1) * 0.06);
    const widthU = clamp(L * 0.42 * spec.widthF, L * 0.34, L * 0.50);
    const neckU = clamp(widthU * 0.34 * spec.neckF, widthU * 0.26, widthU * 0.42);
    const amp = clamp(tab * 0.92, tab * 0.78, tab * 1.05);
    const disp = normalY * spec.sign * amp;
    const shoulder = disp * 0.18;

    const aU = clamp(centerU - widthU / 2, L * 0.14, L * 0.86);
    const dU = clamp(centerU + widthU / 2, L * 0.14, L * 0.86);
    const bU = centerU - neckU / 2;
    const cU = centerU + neckU / 2;

    // baseline -> a
    ctx.lineTo(xAt(L * EDGE_A), y);
    ctx.lineTo(xAt(aU), y);

    // a -> b (shoulder)
    ctx.bezierCurveTo(xAt(aU + widthU * 0.10), y, xAt(bU - widthU * 0.10), y, xAt(bU), y + shoulder);
    // b -> tip
    ctx.bezierCurveTo(xAt(bU + neckU * 0.06), y + shoulder, xAt(centerU - neckU * 0.62), y + disp * 0.92, xAt(centerU), y + disp);
    // tip -> c
    ctx.bezierCurveTo(xAt(centerU + neckU * 0.62), y + disp * 0.92, xAt(cU - neckU * 0.06), y + shoulder, xAt(cU), y + shoulder);
    // c -> d
    ctx.bezierCurveTo(xAt(cU + widthU * 0.10), y, xAt(dU - widthU * 0.10), y, xAt(dU), y);

    ctx.lineTo(xAt(L * EDGE_B), y);
    ctx.lineTo(endX, y);
  }

  function vEdgeAbs(x: number, startY: number, endY: number, normalX: -1 | 1, spec: EdgeSpec) {
    const dir = endY >= startY ? 1 : -1;
    const L = Math.abs(endY - startY);
    const yAt = (u: number) => startY + dir * u;
    if (spec.sign === 0 || L <= 0.0001) {
      ctx.lineTo(x, endY);
      return;
    }

    const skew = dir === 1 ? spec.skewF : -spec.skewF;
    const centerU = L * (0.5 + clamp(skew, -1, 1) * 0.06);
    const widthU = clamp(L * 0.42 * spec.widthF, L * 0.34, L * 0.50);
    const neckU = clamp(widthU * 0.34 * spec.neckF, widthU * 0.26, widthU * 0.42);
    const amp = clamp(tab * 0.92, tab * 0.78, tab * 1.05);
    const disp = normalX * spec.sign * amp;
    const shoulder = disp * 0.18;

    const aU = clamp(centerU - widthU / 2, L * 0.14, L * 0.86);
    const dU = clamp(centerU + widthU / 2, L * 0.14, L * 0.86);
    const bU = centerU - neckU / 2;
    const cU = centerU + neckU / 2;

    ctx.lineTo(x, yAt(L * EDGE_A));
    ctx.lineTo(x, yAt(aU));

    ctx.bezierCurveTo(x, yAt(aU + widthU * 0.10), x, yAt(bU - widthU * 0.10), x + shoulder, yAt(bU));
    ctx.bezierCurveTo(x + shoulder, yAt(bU + neckU * 0.06), x + disp * 0.92, yAt(centerU - neckU * 0.62), x + disp, yAt(centerU));
    ctx.bezierCurveTo(x + disp * 0.92, yAt(centerU + neckU * 0.62), x + shoulder, yAt(cU - neckU * 0.06), x + shoulder, yAt(cU));
    ctx.bezierCurveTo(x, yAt(cU + widthU * 0.10), x, yAt(dU - widthU * 0.10), x, yAt(dU));

    ctx.lineTo(x, yAt(L * EDGE_B));
    ctx.lineTo(x, endY);
  }

  ctx.beginPath();
  ctx.moveTo(0, 0);

  // TOP: left->right, outward is -Y
  hEdgeAbs(0, tileW, 0, -1, e.top);
  // RIGHT: top->bottom, outward is +X
  vEdgeAbs(tileW, 0, tileH, 1, e.right);
  // BOTTOM: right->left, outward is +Y
  hEdgeAbs(tileW, 0, tileH, 1, e.bottom);
  // LEFT: bottom->top, outward is -X
  vEdgeAbs(0, tileH, 0, -1, e.left);

  ctx.closePath();
}

export async function generatePieces(
  image: HTMLImageElement,
  grid: Grid,
  opts: { randomRotation: boolean; onProgress?: (p: GenerateProgress) => void },
): Promise<Piece[]> {
  const total = grid.rows * grid.cols;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas non supporté.");

  const rectCanvas = document.createElement("canvas");
  const rectCtx = rectCanvas.getContext("2d");
  if (!rectCtx) throw new Error("Canvas non supporté.");

  const naturalW = image.naturalWidth || image.width;
  const naturalH = image.naturalHeight || image.height;

  const tileW = naturalW / grid.cols;
  const tileH = naturalH / grid.rows;

  // Petite taille pour le plateau/tray (meilleur perf que du full-res).
  // On conserve le ratio exact pièce->pièce.
  const maxBoardPx = 900;
  const scale = Math.min(1, maxBoardPx / Math.max(naturalW, naturalH));
  const outTileW = Math.max(10, Math.floor(tileW * scale));
  const outTileH = Math.max(10, Math.floor(tileH * scale));

  // Profondeur d’ergot/creux en px (sur l’image de sortie).
  const pad = Math.max(6, Math.floor(Math.min(outTileW, outTileH) * 0.18));
  const outW = outTileW + pad * 2;
  const outH = outTileH + pad * 2;

  canvas.width = outW;
  canvas.height = outH;

  rectCanvas.width = outTileW;
  rectCanvas.height = outTileH;

  const pieces: Piece[] = [];
  let done = 0;
  const edges = buildEdges(grid);

  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Underlay rectangulaire (sans transparence) exactement sur la case.
      rectCtx.clearRect(0, 0, rectCanvas.width, rectCanvas.height);
      rectCtx.drawImage(image, c * tileW, r * tileH, tileW, tileH, 0, 0, outTileW, outTileH);
      const rectUrl = rectCanvas.toDataURL("image/png");

      // 1) Path jigsaw
      const e = pieceEdges(grid, edges, r, c);
      ctx.save();
      ctx.translate(pad, pad);
      buildJigsawPath(ctx, outTileW, outTileH, pad, e);

      // 2) Clip + draw image derrière
      ctx.save();
      ctx.clip();

      // On dessine une zone un peu plus grande pour couvrir les ergots.
      const padSrcX = pad / scale;
      const padSrcY = pad / scale;
      let srcX = c * tileW - padSrcX;
      let srcY = r * tileH - padSrcY;
      let srcW = tileW + padSrcX * 2;
      let srcH = tileH + padSrcY * 2;

      // Clamp (évite de lire hors image).
      const clampX0 = clamp(srcX, 0, naturalW);
      const clampY0 = clamp(srcY, 0, naturalH);
      const clampX1 = clamp(srcX + srcW, 0, naturalW);
      const clampY1 = clamp(srcY + srcH, 0, naturalH);
      const realW = Math.max(1, clampX1 - clampX0);
      const realH = Math.max(1, clampY1 - clampY0);

      // Dest offset si on a clampé le source.
      const dx = (clampX0 - srcX) * scale;
      const dy = (clampY0 - srcY) * scale;
      const dw = realW * scale;
      const dh = realH * scale;

      ctx.drawImage(image, clampX0, clampY0, realW, realH, -pad + dx, -pad + dy, dw, dh);
      ctx.restore(); // clip

      // 3) Contour (look "puzzle physique")
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      // IMPORTANT: pas de shadow canvas, ça crée un “fond/halo” visible sur les appendices externes.
      // On garde la shadow via CSS `drop-shadow` sur l’<img>, plus propre visuellement.
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.stroke();

      ctx.restore(); // translate

      const imgUrl = canvas.toDataURL("image/png");
      pieces.push({
        id: r * grid.cols + c,
        row: r,
        col: c,
        imgUrl,
        rectUrl,
        outW,
        outH,
        tileW: outTileW,
        tileH: outTileH,
        pad,
        rotation: opts.randomRotation ? randomRotation90() : 0,
        placed: false,
      });

      done++;
      if (opts.onProgress && (done % 12 === 0 || done === total)) opts.onProgress({ done, total });

      // Yield régulier pour garder l’UI fluide.
      if (done % 24 === 0) await new Promise((res) => setTimeout(res, 0));
    }
  }

  return pieces;
}

export function shuffleInPlace<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}


