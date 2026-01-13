import React, { useEffect, useMemo, useRef, useState } from "react";
import { findBestGrid } from "./puzzle/grid";
import { fileToObjectUrl, loadImageFromUrl, revokeObjectUrl } from "./puzzle/image";
import { generatePieces, shuffleInPlace } from "./puzzle/generatePieces";
import { hintRectForPiece } from "./puzzle/hints";
import type { Grid, HelpLevel, Piece, PieceRotation } from "./puzzle/types";
import { fetchCategoryFileTitlesDeep, fetchFileTitlesBySearchMulti, fetchImageInfos, WIKIMEDIA_CATEGORIES, type WikimediaImage } from "./puzzle/wikimedia";

const PIECE_COUNTS = [50, 100, 200, 500, 1000] as const;
const DEFAULT_IMAGE_URL =
  "https://upload.wikimedia.org/wikipedia/commons/b/bd/Taj_Mahal%2C_Agra%2C_India_edit3.jpg";

function rotate90(r: PieceRotation): PieceRotation {
  switch (r) {
    case 0:
      return 90;
    case 90:
      return 180;
    case 180:
      return 270;
    case 270:
      return 0;
  }
}

function removeFromArray(arr: number[], id: number) {
  const idx = arr.indexOf(id);
  if (idx >= 0) arr.splice(idx, 1);
}

function isPieceCorrect(args: {
  piece: Piece;
  placements: (number | null)[];
  rotationEnabled: boolean;
}) {
  const { piece, placements, rotationEnabled } = args;
  const onCorrectCell = placements[piece.id] === piece.id;
  const rotationOk = !rotationEnabled || piece.rotation === 0;
  return piece.placed && onCorrectCell && rotationOk;
}

export function App() {
  const [fileObjectUrl, setFileObjectUrl] = useState<string | null>(null);
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const [imageAspect, setImageAspect] = useState<number>(1);
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);

  const [pieceCount, setPieceCount] = useState<(typeof PIECE_COUNTS)[number]>(100);
  const [rotationEnabled, setRotationEnabled] = useState<boolean>(true);
  const [helpEnabled, setHelpEnabled] = useState<boolean>(true);
  const [helpLevel, setHelpLevel] = useState<HelpLevel>("medium");
  const [outlineColor, setOutlineColor] = useState<string>("#ffffff");
  const [outlineWidth, setOutlineWidth] = useState<number>(0.6);
  const [outlineOpacity, setOutlineOpacity] = useState<number>(0.16);
  const [outlineStrong, setOutlineStrong] = useState<boolean>(false);
  const [loupeEnabled, setLoupeEnabled] = useState<boolean>(false);
  const [loupeZoom, setLoupeZoom] = useState<number>(2.5);
  const [loupeSize, setLoupeSize] = useState<number>(220);
  const [zoomRegionMode, setZoomRegionMode] = useState<boolean>(false);
  const [zoomDrag, setZoomDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [zoomCells, setZoomCells] = useState<{ r0: number; c0: number; r1: number; c1: number } | null>(null);
  const [filterByZoom, setFilterByZoom] = useState<boolean>(false);
  const [zoomDragCells, setZoomDragCells] = useState<{ r0: number; c0: number; r1: number; c1: number } | null>(null);
  const [zoomHoverCell, setZoomHoverCell] = useState<{ r: number; c: number } | null>(null);
  const [filterEdgesOnly, setFilterEdgesOnly] = useState<boolean>(false);
  const [puzzleSeed, setPuzzleSeed] = useState<number | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const settingsBtnRef = useRef<HTMLButtonElement | null>(null);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const [settingsPos, setSettingsPos] = useState<{ left: number; top: number } | null>(null);
  const [isPiecePreviewOpen, setIsPiecePreviewOpen] = useState<boolean>(true);
  const [previewPieceId, setPreviewPieceId] = useState<number | null>(null);

  const [grid, setGrid] = useState<Grid | null>(null);
  const [trayAspect, setTrayAspect] = useState<number>(1);
  const [piecesById, setPiecesById] = useState<Piece[]>([]);
  const [trayOrder, setTrayOrder] = useState<number[]>([]);
  const [placements, setPlacements] = useState<(number | null)[]>([]);
  const [selectedPieceId, setSelectedPieceId] = useState<number | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const boardRef = useRef<HTMLDivElement | null>(null);
  const [boardFlash, setBoardFlash] = useState<{ type: "good" | "bad" | "warn"; key: number } | null>(null);
  const [boardBasePx, setBoardBasePx] = useState<{ w: number; h: number } | null>(null);
  const [boardScale, setBoardScale] = useState<number>(1);
  const boardHeaderRef = useRef<HTMLDivElement | null>(null);
  const boardSnapshotRef = useRef<HTMLCanvasElement | null>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [loupePos, setLoupePos] = useState<{ x: number; y: number } | null>(null);
  const trayScrollRef = useRef<HTMLDivElement | null>(null);
  const [trayAvailW, setTrayAvailW] = useState<number>(0);

  // Modal "Choisir un puzzle"
  const [isModalOpen, setIsModalOpen] = useState<boolean>(true);
  const [modalStep, setModalStep] = useState<1 | 2>(1);
  const [modalUrl, setModalUrl] = useState<string>(DEFAULT_IMAGE_URL);
  const [modalFile, setModalFile] = useState<File | null>(null);
  const [modalFileUrl, setModalFileUrl] = useState<string | null>(null);
  const [modalImg, setModalImg] = useState<HTMLImageElement | null>(null);
  const [modalImgSize, setModalImgSize] = useState<{ w: number; h: number } | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState<boolean>(false);
  const [libraryOpen, setLibraryOpen] = useState<boolean>(false);
  const [libraryCategoryId, setLibraryCategoryId] = useState<string>(WIKIMEDIA_CATEGORIES[0]?.id ?? "featured");
  const [libraryLoading, setLibraryLoading] = useState<boolean>(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [libraryByCategory, setLibraryByCategory] = useState<Record<string, { loaded: boolean; images: WikimediaImage[] }>>({});
  const [libraryQuery, setLibraryQuery] = useState<string>("");
  const [libraryBlockedUrls, setLibraryBlockedUrls] = useState<Record<string, true>>({});
  const libraryLoadSeqRef = useRef<number>(0);

  const isReady = !!loadedImage;
  const placedCount = useMemo(() => piecesById.reduce((acc, p) => acc + (p.placed ? 1 : 0), 0), [piecesById]);
  const totalCount = grid?.count ?? 0;
  const percentDone = totalCount ? Math.round((placedCount / totalCount) * 100) : 0;

  useEffect(() => {
    return () => revokeObjectUrl(fileObjectUrl);
  }, [fileObjectUrl]);

  useEffect(() => {
    return () => revokeObjectUrl(modalFileUrl);
  }, [modalFileUrl]);

  function resetPuzzleState() {
    setGrid(null);
    setTrayAspect(1);
    setPiecesById([]);
    setTrayOrder([]);
    setPlacements([]);
    setSelectedPieceId(null);
    setBoardFlash(null);
    setGenProgress(null);
    setBoardBasePx(null);
    setBoardScale(1);
    setLoupePos(null);
    setZoomDrag(null);
    setZoomCells(null);
    setFilterByZoom(false);
    setZoomDragCells(null);
    setZoomHoverCell(null);
    setFilterEdgesOnly(false);
  }

  async function restartSamePuzzle() {
    if (!loadedImage || !imageSize) return;
    setError(null);
    setIsGenerating(true);
    setGenProgress({ done: 0, total: pieceCount });
    setSelectedPieceId(null);
    setPreviewPieceId(null);
    setIsPiecePreviewOpen(false);
    setZoomCells(null);
    setFilterByZoom(false);
    setZoomDrag(null);
    setZoomDragCells(null);
    setZoomHoverCell(null);

    try {
      const g = findBestGrid(pieceCount, imageAspect);
      setGrid(g);

      const seed = puzzleSeed ?? ((Date.now() ^ Math.floor(Math.random() * 1_000_000)) >>> 0);
      if (puzzleSeed == null) setPuzzleSeed(seed);

      const generated = await generatePieces(loadedImage, g, {
        randomRotation: rotationEnabled,
        seed,
        outlineColor,
        outlineWidth,
        outlineAlpha: outlineOpacity,
        outlineStrong,
        onProgress: (p) => setGenProgress(p),
      });

      const byId = [...generated].sort((a, b) => a.id - b.id);
      const order = byId.map((p) => p.id);
      shuffleInPlace(order);

      setPiecesById(byId);
      setTrayOrder(order);
      setPlacements(Array(g.count).fill(null));
      setGenProgress({ done: g.count, total: g.count });

      if (byId[0]) {
        setBoardBasePx({ w: g.cols * byId[0].tileW, h: g.rows * byId[0].tileH });
      }
    } finally {
      setIsGenerating(false);
    }
  }

  function estimateQualityForCount(size: { w: number; h: number }, count: number) {
    const maxBoardPx = 900;
    const scale = Math.min(1, maxBoardPx / Math.max(size.w, size.h));
    const g = findBestGrid(count, size.w / size.h);
    const tileW = Math.floor((size.w / g.cols) * scale);
    const tileH = Math.floor((size.h / g.rows) * scale);
    const tilePx = Math.min(tileW, tileH);
    return { ok: tilePx >= 28, tilePx, grid: g };
  }

  const modalQualityByCount = useMemo(() => {
    if (!modalImgSize) return null;
    const out: Record<number, { ok: boolean; tilePx: number; grid: Grid }> = {};
    for (const n of PIECE_COUNTS) out[n] = estimateQualityForCount(modalImgSize, n);
    return out;
  }, [modalImgSize]);

  async function analyzeModalImage(srcOverride?: string): Promise<boolean> {
    setModalError(null);
    setIsAnalyzing(true);
    setModalImg(null);
    setModalImgSize(null);
    try {
      const src = (srcOverride ?? (modalFileUrl ?? modalUrl.trim())).trim();
      if (!src) throw new Error("Aucune source");
      const img = await loadImageFromUrl(src);
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      setModalImg(img);
      setModalImgSize({ w, h });
      return true;
    } catch (e) {
      setModalError(
        "Impossible d’analyser cette image (URL bloquée CORS ou image invalide). Essaie un upload fichier, ou une autre URL.",
      );
      return false;
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function loadPuzzleFromModal() {
    setError(null);
    setModalError(null);
    if (!modalImg || !modalImgSize) {
      const ok = await analyzeModalImage();
      if (!ok) return;
    }
    const q = estimateQualityForCount(modalImgSize!, pieceCount);
    if (!q.ok) {
      // On autorise 1000 pièces même si la qualité est faible (avec avertissement UI).
      if (pieceCount !== 1000) {
        setModalError(
          `Image trop petite pour garantir des pièces de bonne qualité à ${pieceCount}. Choisis moins de pièces ou une image de meilleure résolution.`,
        );
        return;
      }
    }

    setIsModalOpen(false);
    setIsGenerating(true);
    setGenProgress({ done: 0, total: pieceCount });
    setSelectedPieceId(null);
    setBoardFlash(null);

    try {
      resetPuzzleState();
      setIsSettingsOpen(false);

      // Source finale (pour cleanup blob)
      if (modalFileUrl && modalFile) {
        revokeObjectUrl(fileObjectUrl);
        setFileObjectUrl(modalFileUrl);
      }

      const seed = (Date.now() ^ Math.floor(Math.random() * 1_000_000)) >>> 0;
      setPuzzleSeed(seed);

      const w = modalImgSize!.w;
      const h = modalImgSize!.h;
      const aspect = w / h;

      setLoadedImage(modalImg);
      setImageSize({ w, h });
      setImageAspect(aspect);
      setGrid(q.grid);

      const generated = await generatePieces(modalImg!, q.grid, {
        randomRotation: rotationEnabled,
        seed,
        outlineColor,
        outlineWidth,
        outlineAlpha: outlineOpacity,
        outlineStrong,
        onProgress: (p) => setGenProgress(p),
      });

      const byId = [...generated].sort((a, b) => a.id - b.id);
      const order = byId.map((p) => p.id);
      shuffleInPlace(order);

      setPiecesById(byId);
      if (byId[0]) setTrayAspect(byId[0].outW / byId[0].outH);
      setTrayOrder(order);
      setPlacements(Array(q.grid.count).fill(null));
      setGenProgress({ done: q.grid.count, total: q.grid.count });

      // IMPORTANT: taille du plateau = multiple exact des tuiles générées,
      // sinon on obtient des rescale subpixel -> on voit le background entre pièces.
      if (byId[0]) {
        const bw = q.grid.cols * byId[0].tileW;
        const bh = q.grid.rows * byId[0].tileH;
        setBoardBasePx({ w: bw, h: bh });
      } else {
        const maxBoardPx = 900;
        const scale = Math.min(1, maxBoardPx / Math.max(w, h));
        setBoardBasePx({ w: Math.floor(w * scale), h: Math.floor(h * scale) });
      }
      setBoardScale(1);
    } catch (e) {
      setError("Erreur lors de la génération des pièces.");
      setIsModalOpen(true);
    } finally {
      setIsGenerating(false);
    }
  }

  const qualityByCount = useMemo(() => {
    if (!imageSize) return null;
    const maxBoardPx = 900;
    const scale = Math.min(1, maxBoardPx / Math.max(imageSize.w, imageSize.h));

    const out: Record<number, { ok: boolean; tilePx: number; grid: Grid }> = {};
    for (const n of PIECE_COUNTS) {
      const g = findBestGrid(n, imageSize.w / imageSize.h);
      const tileW = Math.floor((imageSize.w / g.cols) * scale);
      const tileH = Math.floor((imageSize.h / g.rows) * scale);
      const tilePx = Math.min(tileW, tileH);
      // Seuil "garantit de bonne qualité" (empêche de créer des pièces trop petites).
      const ok = tilePx >= 28;
      out[n] = { ok, tilePx, grid: g };
    }
    return out;
  }, [imageSize]);

  const currentQuality = useMemo(() => (qualityByCount ? qualityByCount[pieceCount] : null), [qualityByCount, pieceCount]);

  // (Le puzzle se lance depuis la modal, à la validation.)

  function setPieceRotation(pieceId: number, next: PieceRotation) {
    setPiecesById((prev) => {
      const p = prev[pieceId];
      if (!p) return prev;
      const out = [...prev];
      out[pieceId] = { ...p, rotation: next };
      return out;
    });
  }

  function rotatePiece90(pieceId: number) {
    const p = piecesById[pieceId];
    if (!p) return;
    setPieceRotation(pieceId, rotate90(p.rotation));
  }

  function unplacePiece(pieceId: number) {
    setPiecesById((prev) => {
      const p = prev[pieceId];
      if (!p || !p.placed) return prev;
      const out = [...prev];
      out[pieceId] = { ...p, placed: false };
      return out;
    });
    setPlacements((prev) => {
      const idx = prev.findIndex((x) => x === pieceId);
      if (idx < 0) return prev;
      const out = [...prev];
      out[idx] = null;
      return out;
    });
    setTrayOrder((prev) => {
      if (prev.includes(pieceId)) return prev;
      return [pieceId, ...prev];
    });
  }

  function solvePuzzle() {
    if (!grid) return;
    // Force toutes les rotations à 0 pour afficher le résultat final.
    setPiecesById((prev) => prev.map((p) => ({ ...p, rotation: 0, placed: true })));
    setPlacements(Array.from({ length: grid.count }, (_, i) => i));
    setTrayOrder([]);
    setSelectedPieceId(null);
    flash("good");
  }

  async function regeneratePieceImages(next: {
    outlineColor?: string;
    outlineWidth?: number;
    outlineOpacity?: number;
    outlineStrong?: boolean;
  }) {
    if (!loadedImage || !grid || puzzleSeed == null) return;
    setIsGenerating(true);
    try {
      const generated = await generatePieces(loadedImage, grid, {
        randomRotation: false,
        seed: puzzleSeed,
        outlineColor: next.outlineColor ?? outlineColor,
        outlineWidth: next.outlineWidth ?? outlineWidth,
        outlineAlpha: next.outlineOpacity ?? outlineOpacity,
        outlineStrong: next.outlineStrong ?? outlineStrong,
      });
      const byId = [...generated].sort((a, b) => a.id - b.id);
      setPiecesById((prev) =>
        byId.map((np) => {
          const old = prev[np.id];
          if (!old) return np;
          return { ...np, rotation: old.rotation, placed: old.placed };
        }),
      );
    } finally {
      setIsGenerating(false);
    }
  }

  function placePiece(pieceId: number, cellIndex: number) {
    setPiecesById((prev) => {
      const p = prev[pieceId];
      if (!p) return prev;
      const out = [...prev];
      out[pieceId] = { ...p, placed: true };
      return out;
    });
    setPlacements((prev) => {
      const out = [...prev];
      out[cellIndex] = pieceId;
      return out;
    });
    setTrayOrder((prev) => {
      const out = [...prev];
      removeFromArray(out, pieceId);
      return out;
    });
  }

  function cellAtPoint(clientX: number, clientY: number): { idx: number; row: number; col: number } | null {
    if (!grid || !boardRef.current || !view) return null;
    const rect = boardRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) return null;
    const nx = x / rect.width;
    const ny = y / rect.height;
    const col = Math.floor(nx * view.cols) + view.cOff;
    const row = Math.floor(ny * view.rows) + view.rOff;
    const idx = row * grid.cols + col;
    return { idx, row, col };
  }

  function flash(type: "good" | "bad" | "warn") {
    setBoardFlash({ type, key: Date.now() + Math.random() });
  }

  function tryPlaceSelectedAtCell(cellIdx: number) {
    if (!grid) return;
    if (selectedPieceId == null) return;
    const piece = piecesById[selectedPieceId];
    if (!piece) return;
    const isCorrectCell = piece.id === cellIdx;
    const isSameAlreadyThere = placements[cellIdx] === piece.id;
    const cellEmpty = placements[cellIdx] == null;
    const rotationOk = !rotationEnabled || piece.rotation === 0;

    if (isCorrectCell && (cellEmpty || isSameAlreadyThere)) {
      // Bonne case. Si la rotation est mauvaise, on place quand même et on guide l’utilisateur.
      if (!isSameAlreadyThere) placePiece(piece.id, cellIdx);

      if (rotationEnabled && !rotationOk) {
        flash("warn");
        // On garde la sélection pour inciter à tourner.
        return;
      }

      flash("good");
      setSelectedPieceId(null);
      return;
    }

    flash("bad");
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "r") return;
      if (!rotationEnabled) return;
      if (selectedPieceId == null) return;
      const p = piecesById[selectedPieceId];
      if (!p) return;
      setPieceRotation(selectedPieceId, rotate90(p.rotation));
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [piecesById, rotationEnabled, selectedPieceId]);

  useEffect(() => {
    // Si la pièce sélectionnée est bien placée ET maintenant dans le bon sens, on peut relâcher la sélection.
    if (!rotationEnabled) return;
    if (selectedPieceId == null) return;
    if (!grid) return;
    const p = piecesById[selectedPieceId];
    if (!p || !p.placed) return;
    const correctlyPlaced = placements[p.id] === p.id;
    if (!correctlyPlaced) return;
    if (p.rotation !== 0) return;
    setSelectedPieceId(null);
  }, [grid, piecesById, placements, rotationEnabled, selectedPieceId]);

  useEffect(() => {
    // Si la pièce affichée dans "Pièce sélectionnée" devient correcte, fermer automatiquement.
    if (!isPiecePreviewOpen) return;
    if (previewPieceId == null) return;
    const p = piecesById[previewPieceId];
    if (!p) return;
    if (isPieceCorrect({ piece: p, placements, rotationEnabled })) {
      setIsPiecePreviewOpen(false);
      setPreviewPieceId(null);
    }
  }, [isPiecePreviewOpen, placements, piecesById, previewPieceId, rotationEnabled]);

  useEffect(() => {
    // Si on active le filtre "Pièces de la zone uniquement" et que la pièce sélectionnée
    // n'appartient pas à la zone, on enlève la sélection (et le preview associé).
    if (!filterByZoom) return;
    if (!zoomCells) return;

    if (selectedPieceId != null) {
      const p = piecesById[selectedPieceId];
      const inZone = !!p && p.row >= zoomCells.r0 && p.row <= zoomCells.r1 && p.col >= zoomCells.c0 && p.col <= zoomCells.c1;
      if (!inZone) setSelectedPieceId(null);
    }

    if (previewPieceId != null) {
      const p = piecesById[previewPieceId];
      const inZone = !!p && p.row >= zoomCells.r0 && p.row <= zoomCells.r1 && p.col >= zoomCells.c0 && p.col <= zoomCells.c1;
      if (!inZone) {
        setPreviewPieceId(null);
        setIsPiecePreviewOpen(false);
      }
    }
  }, [filterByZoom, piecesById, previewPieceId, selectedPieceId, zoomCells]);

  useEffect(() => {
    if (rotationEnabled) return;
    // Si la rotation est désactivée, on garantit que TOUTES les pièces sont dans le bon sens.
    setPiecesById((prev) => {
      let changed = false;
      const out = prev.map((p) => {
        if (p.rotation === 0) return p;
        changed = true;
        return { ...p, rotation: 0 as PieceRotation };
      });
      return changed ? out : prev;
    });
  }, [rotationEnabled]);

  useEffect(() => {
    if (!isSettingsOpen) return;
    const margin = 12;

    const place = () => {
      const btn = settingsBtnRef.current;
      const panel = settingsRef.current;
      if (!btn || !panel) return;
      const b = btn.getBoundingClientRect();
      const p = panel.getBoundingClientRect();

      // position par défaut: sous le bouton, aligné à droite
      let left = b.right - p.width;
      let top = b.bottom + 10;

      // clamp horizontal
      left = Math.max(margin, Math.min(left, window.innerWidth - p.width - margin));

      // si ça déborde en bas, on remonte au-dessus du bouton
      if (top + p.height > window.innerHeight - margin) {
        top = b.top - p.height - 10;
      }
      // clamp vertical
      top = Math.max(margin, Math.min(top, window.innerHeight - p.height - margin));

      setSettingsPos({ left, top });
    };

    const raf = requestAnimationFrame(place);
    const onResize = () => place();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [isSettingsOpen]);

  useEffect(() => {
    if (!libraryOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLibraryOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [libraryOpen]);

  async function ensureLibraryCategoryLoaded(catId: string) {
    const cat = WIKIMEDIA_CATEGORIES.find((c) => c.id === catId);
    if (!cat) return;
    const state = libraryByCategory[cat.id];
    if (state?.loaded) return;
    if (libraryLoading) return;

    const seq = ++libraryLoadSeqRef.current;
    try {
      setLibraryLoading(true);
      setLibraryError(null);
      let titles: string[] = [];
      if (cat.mode === "search_multi") {
        titles = await fetchFileTitlesBySearchMulti(cat.searchQueries ?? [], cat.limit);
      } else {
        titles = await fetchCategoryFileTitlesDeep(cat.categoryTitle ?? "Category:Files", cat.limit, { maxDepth: 3, maxRequests: 80 });
      }
      const imgsAll = await fetchImageInfos(titles, 320);
      if (libraryLoadSeqRef.current !== seq) return;
      setLibraryByCategory((prev) => ({
        ...prev,
        [cat.id]: { loaded: true, images: imgsAll.slice(0, cat.limit) },
      }));
    } catch (e) {
      if (libraryLoadSeqRef.current !== seq) return;
      setLibraryError("Impossible de charger cette catégorie (réseau/CORS). Essaie un autre thème ou un upload fichier.");
    } finally {
      if (libraryLoadSeqRef.current === seq) setLibraryLoading(false);
    }
  }

  useEffect(() => {
    if (!libraryOpen) return;
    void ensureLibraryCategoryLoaded(libraryCategoryId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryOpen, libraryCategoryId]);

  useEffect(() => {
    if (!isSettingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsSettingsOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      const panel = settingsRef.current;
      const btn = settingsBtnRef.current;
      if (!panel || !btn) return;
      const t = e.target as Node | null;
      if (t && (panel.contains(t) || btn.contains(t))) return;
      setIsSettingsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [isSettingsOpen]);

  const view = useMemo(() => {
    if (!grid) return null;
    if (!zoomCells) return { rows: grid.rows, cols: grid.cols, rOff: 0, cOff: 0 };
    return {
      rows: zoomCells.r1 - zoomCells.r0 + 1,
      cols: zoomCells.c1 - zoomCells.c0 + 1,
      rOff: zoomCells.r0,
      cOff: zoomCells.c0,
    };
  }, [grid, zoomCells]);

  const hintRectStyle = useMemo(() => {
    if (!helpEnabled) return null;
    if (!grid) return null;
    if (!view) return null;
    if (selectedPieceId == null) return null;
    const p = piecesById[selectedPieceId];
    if (!p) return null;
    const { r0, c0, r1, c1 } = hintRectForPiece(grid, p.row, p.col, helpLevel);

    // Convertir en coordonnées "view" (mode focus) et ignorer si hors zone affichée.
    const vr0 = Math.max(r0, view.rOff);
    const vc0 = Math.max(c0, view.cOff);
    const vr1 = Math.min(r1, view.rOff + view.rows - 1);
    const vc1 = Math.min(c1, view.cOff + view.cols - 1);
    if (vr1 < vr0 || vc1 < vc0) return null;

    const left = ((vc0 - view.cOff) / view.cols) * 100;
    const top = ((vr0 - view.rOff) / view.rows) * 100;
    const width = ((vc1 - vc0 + 1) / view.cols) * 100;
    const height = ((vr1 - vr0 + 1) / view.rows) * 100;
    return { left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` } as const;
  }, [grid, helpEnabled, helpLevel, piecesById, selectedPieceId, view]);

  const boardCells = useMemo(() => {
    if (!grid || !view) return [];
    const out: Array<{
      idx: number;
      left: string;
      top: string;
      width: string;
      height: string;
    }> = [];
    for (let r = 0; r < view.rows; r++) {
      for (let c = 0; c < view.cols; c++) {
        const rr = r + view.rOff;
        const cc = c + view.cOff;
        const idx = rr * grid.cols + cc;
        out.push({
          idx,
          left: `${(c / view.cols) * 100}%`,
          top: `${(r / view.rows) * 100}%`,
          width: `${(1 / view.cols) * 100}%`,
          height: `${(1 / view.rows) * 100}%`,
        });
      }
    }
    return out;
  }, [grid, view]);

  const trayCandidates = useMemo(() => {
    // Base: ne jamais reproposer une pièce déjà correctement placée.
    const base = trayOrder.filter((id) => {
      const p = piecesById[id];
      if (!p) return false;
      return !isPieceCorrect({ piece: p, placements, rotationEnabled });
    });

    // Si une zone est sélectionnée (focus), on calcule la disponibilité des "bords"
    // par rapport à cette zone (même si le filtre zone n'est pas coché).
    const baseInZone =
      zoomCells && grid
        ? base.filter((id) => {
            const p = piecesById[id];
            if (!p) return false;
            return p.row >= zoomCells.r0 && p.row <= zoomCells.r1 && p.col >= zoomCells.c0 && p.col <= zoomCells.c1;
          })
        : base;

    const zoneFiltered =
      filterByZoom && zoomCells
        ? base.filter((id) => {
            const p = piecesById[id];
            if (!p || !grid) return false;
            return p.row >= zoomCells.r0 && p.row <= zoomCells.r1 && p.col >= zoomCells.c0 && p.col <= zoomCells.c1;
          })
        : base;

    const edgesAvailable =
      !!grid &&
      (zoomCells ? baseInZone : zoneFiltered).some((id) => {
        const p = piecesById[id];
        if (!p) return false;
        return p.row === 0 || p.row === grid.rows - 1 || p.col === 0 || p.col === grid.cols - 1;
      });

    const edgesFiltered =
      filterEdgesOnly && edgesAvailable && grid
        ? zoneFiltered.filter((id) => {
            const p = piecesById[id];
            if (!p) return false;
            return p.row === 0 || p.row === grid.rows - 1 || p.col === 0 || p.col === grid.cols - 1;
          })
        : zoneFiltered;

    return { ids: edgesFiltered, edgesAvailable };
  }, [filterByZoom, filterEdgesOnly, grid, piecesById, placements, rotationEnabled, trayOrder, zoomCells]);

  const trayVisibleIds = useMemo(() => trayCandidates.ids.slice(0, 96), [trayCandidates]);
  const edgePiecesAvailable = trayCandidates.edgesAvailable;

  useEffect(() => {
    if (filterEdgesOnly && !edgePiecesAvailable) setFilterEdgesOnly(false);
  }, [edgePiecesAvailable, filterEdgesOnly]);

  const remainingInTray = trayOrder.length;

  const isLandscapeLayout = useMemo(() => {
    if (!grid) return false;
    const cols = view?.cols ?? grid.cols;
    const rows = view?.rows ?? grid.rows;
    const aspect = cols / Math.max(1, rows);
    return aspect >= 1.15; // puzzle "paysage"
  }, [grid, view]);

  const boardStyle = useMemo(() => {
    const p0 = piecesById[0];
    const baseTileW = p0?.tileW ?? (boardBasePx && grid ? boardBasePx.w / grid.cols : 90);
    const baseTileH = p0?.tileH ?? (boardBasePx && grid ? boardBasePx.h / grid.rows : 90);
    const base =
      view && grid
        ? { w: Math.round(view.cols * baseTileW), h: Math.round(view.rows * baseTileH) }
        : boardBasePx ?? { w: 900, h: Math.floor(900 / imageAspect) };
    return {
      width: `${Math.floor(base.w * boardScale)}px`,
      height: `${Math.floor(base.h * boardScale)}px`,
    } as const;
  }, [boardBasePx, boardScale, grid, imageAspect, piecesById, view]);

  const traySizing = useMemo(() => {
    const p = piecesById[0];
    if (!p) return null;
    // Taille "idéale" = même scale que le puzzle (focus inclus), mais on la cape dans le drawer
    // pour garantir AU MOINS 2 colonnes (et éviter des pièces trop grosses).
    const baseTileW = p.tileW * boardScale;
    const baseTileH = p.tileH * boardScale;
    const basePad = p.pad * boardScale;

    // En mode focus (zoomCells), on rajoute un peu d’espace pour éviter tout chevauchement visible.
    const focusExtra = zoomCells ? 10 : 0;
    const baseGap = rotationEnabled ? Math.max(18, basePad * 2 + 14 + focusExtra) : Math.max(10, basePad * 2 + 6 + focusExtra);
    const maxTileWFor2Cols = trayAvailW > 0 ? Math.max(18, Math.floor((trayAvailW - baseGap) / 2)) : Math.floor(baseTileW);
    const scaleDown = Math.min(1, maxTileWFor2Cols / Math.max(1, baseTileW));
    const effectiveScale = boardScale * scaleDown;

    const tileW = Math.max(18, Math.round(p.tileW * effectiveScale));
    const tileH = Math.max(18, Math.round(p.tileH * effectiveScale));
    const pad = Math.max(0, Math.round(p.pad * effectiveScale));
    // IMPORTANT: dans le tray, les images débordent de `pad` tout autour.
    // En mode rotation, on veut éviter toute impression que les pièces "se touchent"
    // (y compris via le bouton "Bon sens"), donc on met un gap plus généreux.
    const gap = rotationEnabled ? Math.max(18, pad * 2 + 14) : Math.max(10, pad * 2 + 6);
    const scaleX = p.outW / p.tileW;
    const scaleY = p.outH / p.tileH;
    const offsetX = (p.pad / p.tileW) * 100;
    const offsetY = (p.pad / p.tileH) * 100;
    const originX = ((p.pad + p.tileW / 2) / p.outW) * 100;
    const originY = ((p.pad + p.tileH / 2) / p.outH) * 100;
    return { tileW, tileH, gap, scaleX, scaleY, offsetX, offsetY, originX, originY };
  }, [piecesById, rotationEnabled, boardScale, trayAvailW, zoomCells]);

  useEffect(() => {
    const el = trayScrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setTrayAvailW(r.width);
    });
    ro.observe(el);
    // initial
    setTrayAvailW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!grid || !boardBasePx) return;
    const margin = 18;

    const compute = () => {
      const bh = boardHeaderRef.current?.getBoundingClientRect();
      const wrap = boardRef.current?.parentElement?.getBoundingClientRect();
      if (!wrap) return;

      const p0 = piecesById[0];
      const baseTileW = p0?.tileW ?? boardBasePx.w / grid.cols;
      const baseTileH = p0?.tileH ?? boardBasePx.h / grid.rows;
      const baseW = view ? view.cols * baseTileW : boardBasePx.w;
      const baseH = view ? view.rows * baseTileH : boardBasePx.h;

      // Espace dispo: on se base sur la taille réelle de la zone d'affichage (boardStage)
      // pour toujours maximiser le puzzle, quel que soit le layout (tray à droite ou en bas).
      const maxW = wrap.width - margin;
      const maxH = wrap.height - margin;

      const s = Math.min(maxW / baseW, maxH / baseH);
      // On autorise d'agrandir mais en restant dans le viewport.
      setBoardScale(Math.max(0.25, Math.min(3, s)));
    };

    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [grid, boardBasePx, piecesById, view]);

  // Snapshot canvas (état du puzzle) pour la loupe.
  useEffect(() => {
    if (!loupeEnabled) return;
    if (!grid || !boardBasePx) return;
    if (!piecesById.length) return;

    let cancelled = false;
    const snapshot = boardSnapshotRef.current ?? document.createElement("canvas");
    boardSnapshotRef.current = snapshot;
    snapshot.width = boardBasePx.w;
    snapshot.height = boardBasePx.h;
    const ctx = snapshot.getContext("2d");
    if (!ctx) return;

    const cache = new Map<string, HTMLImageElement>();
    const load = async (url: string) => {
      const existing = cache.get(url);
      if (existing) return existing;
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      cache.set(url, img);
      return img;
    };

    (async () => {
      ctx.clearRect(0, 0, snapshot.width, snapshot.height);

      // Dessine uniquement les pièces placées (fond vide sinon).
      for (let idx = 0; idx < placements.length; idx++) {
        const pid = placements[idx];
        if (pid == null) continue;
        const p = piecesById[pid];
        if (!p) continue;

        const row = Math.floor(idx / grid.cols);
        const col = idx % grid.cols;
        const x = col * p.tileW;
        const y = row * p.tileH;

        // Underlay base (sans contour), léger overlap comme le DOM.
        const baseImg = await load(p.baseUrl);
        const outlineImg = await load(p.imgUrl);

        const overlapScale = 1.015;
        const w = p.outW * overlapScale;
        const h = p.outH * overlapScale;

        const ox = x - p.pad - (w - p.outW) / 2;
        const oy = y - p.pad - (h - p.outH) / 2;

        const cx = x + p.tileW / 2;
        const cy = y + p.tileH / 2;

        // base
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.translate(-cx, -cy);
        ctx.drawImage(baseImg, ox, oy, w, h);
        // outline (sans overlap)
        ctx.drawImage(outlineImg, x - p.pad, y - p.pad, p.outW, p.outH);
        ctx.restore();
      }

      if (cancelled) return;
      // redessine la loupe si elle est visible
      setLoupePos((pos) => (pos ? { ...pos } : pos));
    })();

    return () => {
      cancelled = true;
    };
  }, [loupeEnabled, grid, boardBasePx, piecesById, placements]);

  useEffect(() => {
    if (!loupeEnabled) return;
    if (!loupePos) return;
    if (!grid || !boardBasePx) return;
    const snapshot = boardSnapshotRef.current;
    const canvas = loupeCanvasRef.current;
    if (!snapshot || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(loupeSize * dpr);
    canvas.height = Math.floor(loupeSize * dpr);
    canvas.style.width = `${loupeSize}px`;
    canvas.style.height = `${loupeSize}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;

    const baseX = loupePos.x * boardBasePx.w;
    const baseY = loupePos.y * boardBasePx.h;
    const srcW = loupeSize / loupeZoom;
    const srcH = loupeSize / loupeZoom;
    let sx = baseX - srcW / 2;
    let sy = baseY - srcH / 2;
    sx = Math.max(0, Math.min(sx, boardBasePx.w - srcW));
    sy = Math.max(0, Math.min(sy, boardBasePx.h - srcH));

    ctx.clearRect(0, 0, loupeSize, loupeSize);
    ctx.drawImage(snapshot, sx, sy, srcW, srcH, 0, 0, loupeSize, loupeSize);
    // crosshair
    ctx.strokeStyle = "rgba(255,255,255,0.30)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(loupeSize / 2, 0);
    ctx.lineTo(loupeSize / 2, loupeSize);
    ctx.moveTo(0, loupeSize / 2);
    ctx.lineTo(loupeSize, loupeSize / 2);
    ctx.stroke();
  }, [loupeEnabled, loupePos, loupeZoom, loupeSize, grid, boardBasePx]);

  useEffect(() => {
    if (!zoomCells) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomCells(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomCells]);

  const placedPieces = useMemo(() => {
    if (!grid || !view) return [];
    const cellW = 100 / view.cols;
    const cellH = 100 / view.rows;
    const out: Array<{
      id: number;
      left: string;
      top: string;
      width: string;
      height: string;
    }> = [];
    for (let r = 0; r < view.rows; r++) {
      for (let c = 0; c < view.cols; c++) {
        const rr = r + view.rOff;
        const cc = c + view.cOff;
        const idx = rr * grid.cols + cc;
        const pid = placements[idx];
        if (pid == null) continue;
        // IMPORTANT: taille identique à la grille -> la pièce fait EXACTEMENT la taille d’une case.
        // Les formes “jigsaw” (PNG avec padding) sont donc simplement scalées dans la case.
        const left = c * cellW;
        const top = r * cellH;
        const width = cellW;
        const height = cellH;
        out.push({ id: pid, left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` });
      }
    }
    return out;
  }, [grid, placements, view]);

  return (
    <div className="container">
      {isModalOpen && (
        <div
          className="modalOverlay"
          onClick={() => {
            // Autoriser fermeture seulement si un puzzle est déjà chargé.
            // (Plus de bouton "Fermer" dans la modal; on garde la modal comme point d'entrée.)
          }}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>Choisir un puzzle</div>
                <div className="stepper">
                  <div className={`step ${modalStep === 1 ? "active" : modalImgSize ? "done" : ""}`}>
                    <span className="stepNum">1</span> Image
                  </div>
                  <div className="stepSep" />
                  <div className={`step ${modalStep === 2 ? "active" : ""}`}>
                    <span className="stepNum">2</span> Options
                  </div>
                </div>
              </div>
            </div>

            <div className="modalBody">
              {modalStep === 1 ? (
                <>
                  <div className="modalCard">
                    <div className="field">
                      <label>Image (fichier)</label>
                      <input
                        type="file"
                        accept="image/*"
                        disabled={isGenerating || isAnalyzing}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          setModalFile(f);
                          setModalUrl("");
                          setModalError(null);
                          revokeObjectUrl(modalFileUrl);
                          const u = fileToObjectUrl(f);
                          setModalFileUrl(u);
                          void analyzeModalImage(u);
                        }}
                      />
          
                    </div>

                    <div style={{ height: 10 }} />

                    <div className="field">
                      <label>Image (URL)</label>
                      <div className="row">
                        <input
                          type="text"
                          value={modalUrl}
                          placeholder="https://..."
                          disabled={isGenerating || isAnalyzing}
                          onChange={(e) => {
                            setModalUrl(e.target.value);
                            setModalFile(null);
                            revokeObjectUrl(modalFileUrl);
                            setModalFileUrl(null);
                            setModalError(null);
                          }}
                        />
                        <button className="btn" disabled={!modalUrl.trim() || isGenerating || isAnalyzing} onClick={() => void analyzeModalImage()}>
                          Vérifier
                        </button>
                      </div>
                    </div>

                    <div style={{ height: 14 }} />

                    <div className="field">
                      <label>Bibliothèque (URL avec aperçu)</label>
                      <div className="libraryTopRow">
                        <button
                          className="btn"
                          type="button"
                          disabled={isGenerating || isAnalyzing}
                          onClick={() => setLibraryOpen(true)}
                          title="Ouvrir une bibliothèque d’images (Wikimedia Commons) par thèmes"
                        >
                          Rechercher dans une bibliothèque
                        </button>
                      </div>
                    </div>

                    {modalError && (
                      <div
                        style={{
                          marginTop: 12,
                          padding: 12,
                          border: "1px solid rgba(239,68,68,0.35)",
                          borderRadius: 14,
                          background: "rgba(239,68,68,0.07)",
                        }}
                      >
                        {modalError}
                      </div>
                    )}
                  </div>

                  <div className="modalCard">
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Aperçu</div>
                    {modalImgSize ? (
                      <div className="meta">
                        Résolution: {modalImgSize.w}×{modalImgSize.h}
                        {modalQualityByCount ? (
                          <>
                            {" "}
                            • Qualité (100): ~{modalQualityByCount[100].tilePx}px/tuile{" "}
                            <span style={{ color: modalQualityByCount[100].ok ? "rgba(34,197,94,0.9)" : "rgba(239,68,68,0.9)" }}>
                              {modalQualityByCount[100].ok ? "OK" : "Insuffisant"}
                            </span>
                          </>
                        ) : null}
                      </div>
                    ) : (
                      <div className="meta">Charge une image pour continuer.</div>
                    )}
                    {modalImgSize && modalQualityByCount && !modalQualityByCount[1000].ok && (
                      <div
                        style={{
                          marginTop: 10,
                          padding: 12,
                          border: "1px solid rgba(245,158,11,0.35)",
                          borderRadius: 14,
                          background: "rgba(245,158,11,0.08)",
                          color: "rgba(255,255,255,0.92)",
                        }}
                      >
                        À <b>1000 pièces</b>, cette image risque d’être un peu pixelisée (~{modalQualityByCount[1000].tilePx}px/tuile).
                      </div>
                    )}
                    <div className="previewFrame">
                      {modalFileUrl || modalUrl.trim() ? (
                        <img alt="Aperçu" src={modalFileUrl ?? modalUrl.trim()} draggable={false} />
                      ) : (
                        <div className="meta">Aucun aperçu</div>
                      )}
                    </div>
                    <div className="meta" style={{ marginTop: 10 }}>
                      Étape suivante: choix du nombre de pièces et options.
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="modalCard">
                    <div className="field">
                      <label>Pièces</label>
                      <select
                        value={pieceCount}
                        disabled={isGenerating || isAnalyzing || !modalImgSize}
                        onChange={(e) => {
                          const next = Number(e.target.value) as (typeof PIECE_COUNTS)[number];
                          setPieceCount(next);
                        }}
                      >
                        {PIECE_COUNTS.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                      {modalImgSize && modalQualityByCount && (
                        <div className="meta" style={{ marginTop: 6 }}>
                          Résolution: {modalImgSize.w}×{modalImgSize.h} • Qualité estimée: ~{modalQualityByCount[pieceCount].tilePx}px/tuile{" "}
                          <span style={{ color: modalQualityByCount[pieceCount].ok ? "rgba(34,197,94,0.9)" : "rgba(239,68,68,0.9)" }}>
                            {modalQualityByCount[pieceCount].ok ? "OK" : "Insuffisant"}
                          </span>
                        </div>
                      )}
                      {modalImgSize && modalQualityByCount && pieceCount === 1000 && !modalQualityByCount[1000].ok && (
                        <div
                          style={{
                            marginTop: 10,
                            padding: 12,
                            border: "1px solid rgba(245,158,11,0.35)",
                            borderRadius: 14,
                            background: "rgba(245,158,11,0.08)",
                            color: "rgba(255,255,255,0.92)",
                          }}
                        >
                          Attention: à <b>1000 pièces</b>, cette image peut être un peu pixelisée (~{modalQualityByCount[1000].tilePx}px/tuile).
                        </div>
                      )}
                    </div>

                    <div style={{ height: 12 }} />

                    <div className="field">
                      <label>Rotation 90°</label>
                      <div className="toggle">
                        <input
                          type="checkbox"
                          checked={rotationEnabled}
                          onChange={(e) => setRotationEnabled(e.target.checked)}
                          disabled={isGenerating || isAnalyzing}
                        />
                        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)" }}>
                          {rotationEnabled ? "Activée (R pour tourner)" : "Désactivée (toutes les pièces à 0°)"}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="modalCard">
                    <div className="field">
                      <label>Aide (zone)</label>
                      <div className="row">
                        <div className="toggle" style={{ flex: 1 }}>
                          <input
                            type="checkbox"
                            checked={helpEnabled}
                            onChange={(e) => setHelpEnabled(e.target.checked)}
                            disabled={isGenerating || isAnalyzing}
                          />
                          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)" }}>{helpEnabled ? "Activée" : "Désactivée"}</div>
                        </div>
                        <select value={helpLevel} onChange={(e) => setHelpLevel(e.target.value as HelpLevel)} disabled={!helpEnabled || isGenerating || isAnalyzing} style={{ width: 160 }}>
                          <option value="simple">simple</option>
                          <option value="medium">medium</option>
                          <option value="advanced">advanced</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ height: 12 }} />

                    <div className="meta">
                      Valide pour charger directement le puzzle.
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="modalFooter">
              {modalStep === 2 ? (
                <button className="btn" onClick={() => setModalStep(1)} disabled={isGenerating || isAnalyzing}>
                  Retour
                </button>
              ) : (
                <button
                  className="btn"
                  onClick={async () => {
                    if (modalImgSize) {
                      setModalStep(2);
                      return;
                    }
                    const ok = await analyzeModalImage();
                    if (ok) setModalStep(2);
                  }}
                  disabled={isGenerating || isAnalyzing || (!modalFileUrl && !modalUrl.trim())}
                  title="Analyse l’image si besoin, puis passe aux options"
                >
                  Continuer
                </button>
              )}
              {modalStep === 2 && (
                <button
                  className="btn primary"
                  onClick={() => void loadPuzzleFromModal()}
                  disabled={isGenerating || isAnalyzing || (!modalFileUrl && !modalUrl.trim())}
                  title="Valide l’image et génère directement le puzzle"
                >
                  Valider et charger
                </button>
              )}
            </div>
          </div>

          {libraryOpen && (
            <div
              className="subModalOverlay"
              onClick={() => {
                if (!libraryLoading) setLibraryOpen(false);
              }}
            >
              <div className="subModal" onClick={(e) => e.stopPropagation()}>
                <div className="subModalHeader">
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                    <div className="subModalTitle">Bibliothèque d’images (Wikimedia Commons)</div>
                    <div className="meta">Choisis un thème pour charger ses images.</div>
                  </div>
                  <button className="subModalClose" type="button" onClick={() => setLibraryOpen(false)} disabled={libraryLoading} title="Fermer">
                    ✕
                  </button>
                </div>

                <div className="subModalBody">
                  <div className="tabs">
                    {WIKIMEDIA_CATEGORIES.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        className={`tabBtn ${libraryCategoryId === cat.id ? "active" : ""}`}
                        onClick={() => {
                          setLibraryCategoryId(cat.id);
                          setLibraryError(null);
                          setLibraryQuery("");
                        }}
                        disabled={libraryLoading}
                        title={cat.categoryTitle}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>

                  <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
                    <input
                      type="text"
                      value={libraryQuery}
                      placeholder="Filtrer par nom de fichier…"
                      disabled={libraryLoading}
                      onChange={(e) => setLibraryQuery(e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <div className="meta" style={{ whiteSpace: "nowrap" }}>
                      {libraryLoading ? "Chargement…" : (() => {
                        const cat = WIKIMEDIA_CATEGORIES.find((c) => c.id === libraryCategoryId);
                        if (!cat) return "—";
                        const state = libraryByCategory[cat.id];
                        return state?.loaded ? `${state.images.length} images` : "—";
                      })()}
                    </div>
                  </div>

                  {libraryError && (
                    <div style={{ marginTop: 10, padding: 10, borderRadius: 14, border: "1px solid rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.07)" }}>
                      {libraryError}
                    </div>
                  )}

                  <div style={{ marginTop: 12 }}>
                    {(() => {
                      const cat = WIKIMEDIA_CATEGORIES.find((c) => c.id === libraryCategoryId);
                      if (!cat) return null;
                      const state = libraryByCategory[cat.id];
                      if (!state?.loaded) {
                        return <div className="meta">Aucune image chargée pour ce thème.</div>;
                      }
                      const q = libraryQuery.trim().toLowerCase();
                      const imgs0 = q ? state.images.filter((img) => img.title.toLowerCase().includes(q)) : state.images;
                      const imgs = imgs0.filter((img) => !libraryBlockedUrls[img.url]);
                      return (
                        <div className="libraryGrid" style={{ maxHeight: 520 }}>
                          {imgs.map((img) => (
                            <button
                              key={img.url}
                              className={`libraryItem ${((modalFileUrl ?? modalUrl.trim()) === img.url) ? "selected" : ""}`}
                              onClick={async () => {
                                setModalFile(null);
                                revokeObjectUrl(modalFileUrl);
                                setModalFileUrl(null);
                                setModalUrl(img.url);
                                setModalError(null);
                                const ok = await analyzeModalImage(img.url);
                                if (ok) {
                                  setLibraryOpen(false);
                                } else {
                                  // Si l'URL ne peut pas être analysée (CORS/invalid), on la retire des propositions.
                                  setLibraryBlockedUrls((prev) => ({ ...prev, [img.url]: true }));
                                }
                              }}
                              disabled={libraryLoading || isGenerating || isAnalyzing}
                              title={img.title}
                              type="button"
                            >
                              <div className="libraryThumb">
                                <img alt={img.title} src={img.thumbUrl} loading="lazy" draggable={false} />
                              </div>
                              <div className="libraryTitle">{img.title.replace(/^File:/, "")}</div>
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="topbar">
        <div className="brand">
          <h1>Puzzle</h1>
          <div className="sub">
            {grid ? (
              <>
                {pieceCount} pièces • sélection → clique sur la grille pour placer
                {imageSize ? ` • image ${imageSize.w}×${imageSize.h}` : ""}
              </>
            ) : (
              "Ouvre la modal pour choisir une image."
            )}
          </div>
        </div>
        <div className="topbarPanel">
          <button
            className={`btn ${zoomRegionMode ? "primary" : ""}`}
            onClick={() => {
              if (!grid) return;
              const next = !zoomRegionMode;
              setZoomRegionMode(next);
              setZoomDrag(null);
              if (next) {
                setZoomCells(null);
                setFilterByZoom(false);
              }
            }}
            disabled={!grid || isGenerating}
            title="Zoom par sélection de cases (clique-glisse sur la grille)"
          >
            Sélection zone
          </button>
          <button
            ref={settingsBtnRef}
            className="btn"
            onClick={() => setIsSettingsOpen((v) => !v)}
            disabled={!grid || isGenerating}
            title="Paramètres"
          >
            ⚙︎ Paramètres
          </button>
        </div>

        <div className="topbarPanel">
          <button className="btn" onClick={() => solvePuzzle()} disabled={!grid || isGenerating} title="Triche: résout instantanément le puzzle">
            Résoudre
          </button>
          <button
            className="btn ghost"
            onClick={() => {
              setResetConfirmOpen(true);
            }}
            disabled={isGenerating}
          >
            Réinitialiser
          </button>
        </div>

        <div className="topbarPanel">
          <button className="btn" onClick={() => setIsModalOpen(true)} disabled={isGenerating}>
            Choisir un autre puzzle
          </button>
        </div>
      </div>

      {error && (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid rgba(239,68,68,0.35)", borderRadius: 14, background: "rgba(239,68,68,0.07)" }}>
          {error}
        </div>
      )}

      {resetConfirmOpen && (
        <div className="modalOverlay" onClick={() => setResetConfirmOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: "min(560px, 100%)" }}>
            <div className="modalHeader">
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>Réinitialiser la partie ?</div>
                <div className="meta">Remet le même puzzle au début (même image / mêmes options). Tu peux annuler.</div>
              </div>
            </div>
            <div className="modalFooter">
              <button className="btn" onClick={() => setResetConfirmOpen(false)}>
                Annuler
              </button>
              <button
                className="btn primary"
                onClick={async () => {
                  setResetConfirmOpen(false);
                  if (!loadedImage) {
                    // pas de puzzle en cours -> on renvoie vers la modale
                    setIsModalOpen(true);
                    setModalStep(1);
                    return;
                  }
                  await restartSamePuzzle();
                }}
              >
                Réinitialiser
              </button>
            </div>
          </div>
        </div>
      )}

      {isSettingsOpen && (
        <div
          ref={settingsRef}
          className="settingsPanel"
          style={
            settingsPos
              ? ({
                  left: settingsPos.left,
                  top: settingsPos.top,
                } as React.CSSProperties)
              : undefined
          }
        >
          <div className="settingsRow">
            <div className="left">
              <div className="title">Rotation 90°</div>
              <div className="hint">Désactivé = toutes les pièces remises à 0°</div>
            </div>
            <input type="checkbox" checked={rotationEnabled} onChange={(e) => setRotationEnabled(e.target.checked)} disabled={isGenerating} />
          </div>

          <div className="settingsRow">
            <div className="left">
              <div className="title">Aide (zone)</div>
              <div className="hint">Affiche la zone cible pour la pièce sélectionnée</div>
            </div>
            <input type="checkbox" checked={helpEnabled} onChange={(e) => setHelpEnabled(e.target.checked)} disabled={!isReady || isGenerating} />
          </div>

          <div className="settingsRow">
            <div className="left">
              <div className="title">Niveau d’aide</div>
              <div className="hint">simple / medium / advanced</div>
            </div>
            <select
              value={helpLevel}
              onChange={(e) => setHelpLevel(e.target.value as HelpLevel)}
              disabled={!helpEnabled || !isReady || isGenerating}
              style={{ width: 140 }}
            >
              <option value="simple">simple</option>
              <option value="medium">medium</option>
              <option value="advanced">advanced</option>
            </select>
          </div>

          <div className="settingsRow">
            <div className="left">
              <div className="title">Couleur de délimitation</div>
              <div className="hint">Appliquée en régénérant le rendu (mêmes formes)</div>
            </div>
            <input
              className="colorInput"
              type="color"
              value={outlineColor}
              onChange={(e) => {
                const c = e.target.value;
                setOutlineColor(c);
                void regeneratePieceImages({ outlineColor: c });
              }}
              disabled={isGenerating || !grid}
              title="Couleur du contour"
            />
          </div>

          <div className="settingsRow">
            <div className="left">
              <div className="title">Épaisseur de délimitation</div>
              <div className="hint">0.5 → 3 px (pas de 0.5)</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className="meta" style={{ minWidth: 44, textAlign: "right" }}>
                {outlineWidth.toFixed(1)}px
              </div>
              <input
                type="range"
                min={0.5}
                max={3}
                step={0.5}
                value={outlineWidth}
                onChange={(e) => {
                  const w = Number(e.target.value);
                  setOutlineWidth(w);
                  void regeneratePieceImages({ outlineWidth: w });
                }}
                disabled={isGenerating || !grid}
                title="Épaisseur du contour"
              />
            </div>
          </div>

          <div className="settingsRow">
            <div className="left">
              <div className="title">Opacité de délimitation</div>
              <div className="hint">10% → 100%</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className="meta" style={{ minWidth: 44, textAlign: "right" }}>
                {Math.round(outlineOpacity * 100)}%
              </div>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={outlineOpacity}
                onChange={(e) => {
                  const a = Number(e.target.value);
                  setOutlineOpacity(a);
                  void regeneratePieceImages({ outlineOpacity: a });
                }}
                disabled={isGenerating || !grid}
                title="Opacité du contour"
              />
            </div>
          </div>

          <div className="settingsRow">
            <div className="left">
              <div className="title">Contour renforcé</div>
              <div className="hint">Double-stroke pour un contour très visible</div>
            </div>
            <input
              type="checkbox"
              checked={outlineStrong}
              onChange={(e) => {
                const v = e.target.checked;
                setOutlineStrong(v);
                void regeneratePieceImages({ outlineStrong: v });
              }}
              disabled={isGenerating || !grid}
            />
          </div>

          <div className="settingsRow">
            <div className="left">
              <div className="title">Loupe (zoom local)</div>
              <div className="hint">Zoom d’une zone du puzzle</div>
            </div>
            <input type="checkbox" checked={loupeEnabled} onChange={(e) => setLoupeEnabled(e.target.checked)} disabled={!grid || isGenerating} />
          </div>

          <div className="settingsRow">
            <div className="left">
              <div className="title">Zoom loupe</div>
              <div className="hint">1.5× → 5×</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className="meta" style={{ minWidth: 44, textAlign: "right" }}>
                {loupeZoom.toFixed(1)}×
              </div>
              <input
                type="range"
                min={1.5}
                max={5}
                step={0.5}
                value={loupeZoom}
                onChange={(e) => setLoupeZoom(Number(e.target.value))}
                disabled={!loupeEnabled || !grid}
              />
            </div>
          </div>
        </div>
      )}

      <div className={`layout ${isLandscapeLayout ? "landscape" : ""}`}>
        <div className="panel boardWrap">
          <div className="boardHeader" ref={boardHeaderRef} />

          <div className="boardStage">
            <div
              ref={boardRef}
              className={`board ${boardFlash?.type === "good" ? "flashGood" : ""} ${boardFlash?.type === "bad" ? "flashBad" : ""} ${boardFlash?.type === "warn" ? "flashWarn" : ""}`}
              key={boardFlash?.key ?? "board"}
              style={boardStyle as any}
              onPointerEnter={() => loupeEnabled && setLoupePos({ x: 0.5, y: 0.5 })}
              onPointerLeave={() => {
                setLoupePos(null);
                setZoomHoverCell(null);
              }}
              onPointerMove={(e) => {
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                const x = (e.clientX - rect.left) / rect.width;
                const y = (e.clientY - rect.top) / rect.height;
                const clx = Math.max(0, Math.min(1, x));
                const cly = Math.max(0, Math.min(1, y));

                if (loupeEnabled) setLoupePos({ x: clx, y: cly });

                if (zoomRegionMode && zoomDrag && grid) {
                  // Snap sur des CASES (pas une zone libre)
                  const startC = Math.floor(zoomDrag.x0 * grid.cols);
                  const startR = Math.floor(zoomDrag.y0 * grid.rows);
                  let endC = Math.floor(clx * grid.cols);
                  let endR = Math.floor(cly * grid.rows);
                  endC = Math.max(0, Math.min(grid.cols - 1, endC));
                  endR = Math.max(0, Math.min(grid.rows - 1, endR));

                  // Contrainte d’aspect pour éviter toute distorsion: on ajuste en nombre de cases.
                  const aspect = rect.width / rect.height; // largeur/hauteur en px
                  let dC = endC - startC;
                  let dR = endR - startR;
                  const dCx = Math.abs(dC) / grid.cols * rect.width;
                  const dRy = Math.abs(dR) / grid.rows * rect.height;
                  if (dCx > dRy * aspect) {
                    const targetDyPx = dCx / aspect;
                    const targetDR = Math.round((targetDyPx / rect.height) * grid.rows) * Math.sign(dR || 1);
                    dR = targetDR;
                  } else {
                    const targetDxPx = dRy * aspect;
                    const targetDC = Math.round((targetDxPx / rect.width) * grid.cols) * Math.sign(dC || 1);
                    dC = targetDC;
                  }

                  endC = Math.max(0, Math.min(grid.cols - 1, startC + dC));
                  endR = Math.max(0, Math.min(grid.rows - 1, startR + dR));

                  setZoomDrag((prev) => (prev ? { ...prev, x1: (endC + 1) / grid.cols, y1: (endR + 1) / grid.rows } : prev));

                  const r0 = Math.min(startR, endR);
                  const r1 = Math.max(startR, endR);
                  const c0 = Math.min(startC, endC);
                  const c1 = Math.max(startC, endC);
                  setZoomDragCells({ r0, c0, r1, c1 });
                } else if (zoomRegionMode && grid && !zoomDrag) {
                  // case potentielle sous la souris (avant drag)
                  const c = Math.max(0, Math.min(grid.cols - 1, Math.floor(clx * grid.cols)));
                  const r = Math.max(0, Math.min(grid.rows - 1, Math.floor(cly * grid.rows)));
                  setZoomHoverCell({ r, c });
                } else {
                  setZoomHoverCell(null);
                }
              }}
              onPointerDown={(e) => {
                if (!zoomRegionMode) return;
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                const x = (e.clientX - rect.left) / rect.width;
                const y = (e.clientY - rect.top) / rect.height;
                const clx = Math.max(0, Math.min(1, x));
                const cly = Math.max(0, Math.min(1, y));
                // on stocke un point de départ, mais on snappera ensuite sur des cases
                setZoomDrag({ x0: clx, y0: cly, x1: clx, y1: cly });
                if (grid) {
                  const c = Math.max(0, Math.min(grid.cols - 1, Math.floor(clx * grid.cols)));
                  const r = Math.max(0, Math.min(grid.rows - 1, Math.floor(cly * grid.rows)));
                  setZoomDragCells({ r0: r, c0: c, r1: r, c1: c });
                }
                (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
              }}
              onPointerUp={() => {
                if (!zoomRegionMode || !zoomDrag) return;
                const x0 = Math.min(zoomDrag.x0, zoomDrag.x1);
                const y0 = Math.min(zoomDrag.y0, zoomDrag.y1);
                const x1 = Math.max(zoomDrag.x0, zoomDrag.x1);
                const y1 = Math.max(zoomDrag.y0, zoomDrag.y1);
                setZoomDrag(null);
                setZoomDragCells(null);
                if (!grid) return;
                const c0 = Math.max(0, Math.min(grid.cols - 1, Math.floor(x0 * grid.cols)));
                const r0 = Math.max(0, Math.min(grid.rows - 1, Math.floor(y0 * grid.rows)));
                const c1 = Math.max(0, Math.min(grid.cols - 1, Math.floor(x1 * grid.cols) - 1));
                const r1 = Math.max(0, Math.min(grid.rows - 1, Math.floor(y1 * grid.rows) - 1));
                if (c1 < c0 || r1 < r0) return;
                // taille minimale: 2x2 cases
                if (c1 - c0 + 1 < 2 || r1 - r0 + 1 < 2) return;
                setZoomCells({ r0, c0, r1, c1 });
                setZoomRegionMode(false); // retour en mode jeu
              }}
              onClick={(e) => {
                if (!grid) return;
                if (zoomRegionMode) return;
                const cell = cellAtPoint(e.clientX, e.clientY);
                if (!cell) return;
                if (selectedPieceId == null) {
                  const pid = placements[cell.idx];
                  if (pid != null) {
                    const p = piecesById[pid];
                    if (p && !isPieceCorrect({ piece: p, placements, rotationEnabled })) setSelectedPieceId(pid);
                  }
                  return;
                }
                tryPlaceSelectedAtCell(cell.idx);
              }}
            >
              {zoomCells && (
                <button className="btn boardZoomExit" onClick={() => setZoomCells(null)} title="Sortir du zoom (ESC)">
                  Quitter zoom
                </button>
              )}

              <div
                className="boardContent"
              >
                {boardCells.map((cell) => (
                  <div
                    key={cell.idx}
                    className={`cell ${placements[cell.idx] != null ? "placed" : ""}`}
                    style={{ left: cell.left, top: cell.top, width: cell.width, height: cell.height }}
                  />
                ))}

                {placedPieces.map((pp) => {
                  const p = piecesById[pp.id]!;
                  const scaleX = p.outW / p.tileW;
                  const scaleY = p.outH / p.tileH;
                  const offsetX = (p.pad / p.tileW) * 100;
                  const offsetY = (p.pad / p.tileH) * 100;
                  const originX = ((p.pad + p.tileW / 2) / p.outW) * 100;
                  const originY = ((p.pad + p.tileH / 2) / p.outH) * 100;
                  const overlapScale = 1.015;
                  const isSelected = selectedPieceId === p.id;
                  const shouldDim = selectedPieceId != null && !isSelected;
                  const showSnapRotate = rotationEnabled && p.rotation !== 0 && placements[p.id] === p.id;
                  const locked = isPieceCorrect({ piece: p, placements, rotationEnabled });
                  return (
                    <div
                      key={p.id}
                      className={`piece ${isSelected ? "selected" : ""} ${shouldDim ? "dimmed" : ""}`}
                      style={{
                        position: "absolute",
                        left: pp.left,
                        top: pp.top,
                        width: pp.width,
                        height: pp.height,
                        border: "none",
                        background: "transparent",
                        overflow: "visible",
                        zIndex: isSelected ? 10 : 1,
                      }}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        if (locked) return;
                        setSelectedPieceId(p.id);
                        setPreviewPieceId(p.id);
                        setIsPiecePreviewOpen(true);
                      }}
                      title={locked ? "Pièce correcte (verrouillée)" : "Clique pour sélectionner"}
                    >
                      {showSnapRotate && (
                        <button
                          className="pieceRotateBtn"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            rotatePiece90(p.id);
                          }}
                          title="Tourner la pièce de 90°"
                        >
                          ↻ 90°
                        </button>
                      )}
                      <div
                        style={{
                          position: "absolute",
                          left: `-${offsetX}%`,
                          top: `-${offsetY}%`,
                          width: `${scaleX * 100}%`,
                          height: `${scaleY * 100}%`,
                          transform: `rotate(${p.rotation}deg) scale(${overlapScale})`,
                          transformOrigin: `${originX}% ${originY}%`,
                          opacity: 1,
                        }}
                      >
                        <img
                          alt=""
                          src={p.baseUrl}
                          draggable={false}
                          onDragStart={(ev) => ev.preventDefault()}
                          style={{ width: "100%", height: "100%", display: "block", filter: "none" }}
                        />
                      </div>
                      <div
                        style={{
                          position: "absolute",
                          left: `-${offsetX}%`,
                          top: `-${offsetY}%`,
                          width: `${scaleX * 100}%`,
                          height: `${scaleY * 100}%`,
                          transform: `rotate(${p.rotation}deg)`,
                          transformOrigin: `${originX}% ${originY}%`,
                        }}
                      >
                        <img
                          alt=""
                          src={p.imgUrl}
                          draggable={false}
                          onDragStart={(ev) => ev.preventDefault()}
                          style={{ width: "100%", height: "100%", display: "block", filter: "none" }}
                        />
                      </div>
                    </div>
                  );
                })}

                {hintRectStyle && <div className="hintOverlay">{<div className="hintRect" style={hintRectStyle} />}</div>}
              </div>

              {zoomRegionMode && (
                <div className="zoomSelectOverlay">
                  {zoomDragCells &&
                    (() => {
                      if (!grid) return null;
                      const cells: React.ReactNode[] = [];
                      const w = 100 / grid.cols;
                      const h = 100 / grid.rows;
                      for (let r = zoomDragCells.r0; r <= zoomDragCells.r1; r++) {
                        for (let c = zoomDragCells.c0; c <= zoomDragCells.c1; c++) {
                          cells.push(
                            <div
                              key={`z-${r}-${c}`}
                              className="zoomCell"
                              style={{ left: `${c * w}%`, top: `${r * h}%`, width: `${w}%`, height: `${h}%` }}
                            />,
                          );
                        }
                      }
                      return cells;
                    })()}

                  {zoomHoverCell && grid && (
                    <div
                      className="zoomCell hover"
                      style={{
                        left: `${(zoomHoverCell.c / grid.cols) * 100}%`,
                        top: `${(zoomHoverCell.r / grid.rows) * 100}%`,
                        width: `${(1 / grid.cols) * 100}%`,
                        height: `${(1 / grid.rows) * 100}%`,
                      }}
                    />
                  )}
                </div>
              )}
            </div>

            {loupeEnabled && loupePos && (
              <div className="loupeWrap" style={{ width: loupeSize, height: loupeSize }}>
                <div className="loupeLabel">Loupe</div>
                <canvas ref={loupeCanvasRef} className="loupeCanvas" />
              </div>
            )}
          </div>
        </div>

        <div className="panel tray">
          {isLandscapeLayout ? (
            <div className="trayLandscape">
              <div className="trayCol trayColOptions">
                <div className="trayHeader">
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>Options</div>
                  </div>
                  <button
                    className="btn"
                    disabled={!piecesById.length || isGenerating}
                    onClick={() => {
                      setTrayOrder((prev) => {
                        const out = [...prev];
                        shuffleInPlace(out);
                        return out;
                      });
                    }}
                    title="Mélange l’ordre des pièces restantes"
                  >
                    Mélanger
                  </button>
                </div>

                {grid && (
                  <div className="filtersBar">
                    {zoomCells && (
                      <div className="filtersRow">
                        <span className="filterLabel">
                          Pièces de la zone uniquement
                          <span
                            className="infoIcon"
                            title={`N’afficher que les pièces dont la case cible est dans la zone sélectionnée (lignes ${zoomCells.r0 + 1}–${zoomCells.r1 + 1}, colonnes ${zoomCells.c0 + 1}–${zoomCells.c1 + 1}).`}
                          >
                            i
                          </span>
                        </span>
                        <input type="checkbox" checked={filterByZoom} onChange={(e) => setFilterByZoom(e.target.checked)} disabled={isGenerating} />
                      </div>
                    )}

                    {edgePiecesAvailable && (
                      <div className="filtersRow">
                        <span className="filterLabel">
                          Bords uniquement
                          <span className="infoIcon" title="N’afficher que les pièces du contour (ligne 1/dernière ou colonne 1/dernière).">
                            i
                          </span>
                        </span>
                        <input type="checkbox" checked={filterEdgesOnly} onChange={(e) => setFilterEdgesOnly(e.target.checked)} disabled={isGenerating} />
                      </div>
                    )}
                  </div>
                )}

                {!piecesById.length && (
                  <div className="meta" style={{ padding: 6 }}>
                    Les pièces apparaîtront ici après “Démarrer”.
                  </div>
                )}
              </div>

              <div className="trayCol trayColPieces">
                <div className="trayHeader">
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>Pièces</div>
                  </div>
                </div>
                <div className="trayScroll" ref={trayScrollRef}>
                  <div
                    className="trayGrid"
                    style={
                      traySizing
                        ? ({
                            ["--tray-tile-w" as any]: `${traySizing.tileW}px`,
                            ["--tray-tile-h" as any]: `${traySizing.tileH}px`,
                            ["--tray-gap" as any]: `${traySizing.gap}px`,
                          } as React.CSSProperties)
                        : undefined
                    }
                  >
                    {trayVisibleIds.map((id) => {
                      const p = piecesById[id]!;
                      const scaleX = p.outW / p.tileW;
                      const scaleY = p.outH / p.tileH;
                      const offsetX = (p.pad / p.tileW) * 100;
                      const offsetY = (p.pad / p.tileH) * 100;
                      const originX = ((p.pad + p.tileW / 2) / p.outW) * 100;
                      const originY = ((p.pad + p.tileH / 2) / p.outH) * 100;
                      const isSelected = selectedPieceId === p.id;
                      const shouldDim = selectedPieceId != null && !isSelected;
                      return (
                        <div
                          key={p.id}
                          className={`piece ${isSelected ? "selected" : ""} ${shouldDim ? "dimmed" : ""}`}
                          style={{
                            overflow: "visible",
                            zIndex: isSelected ? 10 : 1,
                          }}
                          onClick={() => {
                            setSelectedPieceId(p.id);
                            setPreviewPieceId(p.id);
                            setIsPiecePreviewOpen(true);
                          }}
                          title={rotationEnabled ? "Sélectionner • R (ou bouton) pour tourner • puis clique sur le plateau" : "Sélectionner • puis clique sur le plateau"}
                        >
                          <div
                            style={{
                              position: "absolute",
                              left: `-${offsetX}%`,
                              top: `-${offsetY}%`,
                              width: `${scaleX * 100}%`,
                              height: `${scaleY * 100}%`,
                              transform: `rotate(${p.rotation}deg)`,
                              transformOrigin: `${originX}% ${originY}%`,
                            }}
                          >
                            <img
                              alt=""
                              src={p.imgUrl}
                              draggable={false}
                              onDragStart={(ev) => ev.preventDefault()}
                              style={{ width: "100%", height: "100%", display: "block" }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="trayCol trayColSelected">
                <div className="trayHeader">
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>Pièce sélectionnée</div>
                  </div>
                </div>

                {isPiecePreviewOpen && previewPieceId != null && piecesById[previewPieceId] ? (
                  <div className="piecePreview">
                    <div className="piecePreviewHeader">
                      <div style={{ fontWeight: 700, fontSize: 13 }}>Aperçu</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {rotationEnabled && (
                          <button
                            className="btn"
                            onClick={() => rotatePiece90(previewPieceId)}
                            disabled={isGenerating}
                            title="Tourner la pièce de 90° (la rotation reste dans le catalogue)"
                          >
                            ↻ 90°
                          </button>
                        )}
                        <button className="btn ghost closeBtn" onClick={() => setIsPiecePreviewOpen(false)} title="Fermer le zoom">
                          ✕
                        </button>
                      </div>
                    </div>
                    <div className="piecePreviewStage">
                      {(() => {
                        const p = piecesById[previewPieceId]!;
                        return (
                          <div
                            style={{
                              position: "absolute",
                              inset: 0,
                              transform: `rotate(${p.rotation}deg)`,
                              transformOrigin: "center center",
                            }}
                          >
                            <img alt="Pièce zoom" src={p.imgUrl} draggable={false} />
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ) : (
                  <div className="meta" style={{ padding: 6 }}>
                    Clique une pièce pour l’afficher ici.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="trayHeader">
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Pièces</div>
                </div>
                <button
                  className="btn"
                  disabled={!piecesById.length || isGenerating}
                  onClick={() => {
                    setTrayOrder((prev) => {
                      const out = [...prev];
                      shuffleInPlace(out);
                      return out;
                    });
                  }}
                  title="Mélange l’ordre des pièces restantes"
                >
                  Mélanger
                </button>
              </div>

              {grid && (
                <div className="filtersBar">
                  {zoomCells && (
                    <div className="filtersRow">
                      <span className="filterLabel">
                        Pièces de la zone uniquement
                        <span
                          className="infoIcon"
                          title={`N’afficher que les pièces dont la case cible est dans la zone sélectionnée (lignes ${zoomCells.r0 + 1}–${zoomCells.r1 + 1}, colonnes ${zoomCells.c0 + 1}–${zoomCells.c1 + 1}).`}
                        >
                          i
                        </span>
                      </span>
                      <input type="checkbox" checked={filterByZoom} onChange={(e) => setFilterByZoom(e.target.checked)} disabled={isGenerating} />
                    </div>
                  )}

                  {edgePiecesAvailable && (
                    <div className="filtersRow">
                      <span className="filterLabel">
                        Bords uniquement
                        <span className="infoIcon" title="N’afficher que les pièces du contour (ligne 1/dernière ou colonne 1/dernière).">
                          i
                        </span>
                      </span>
                      <input type="checkbox" checked={filterEdgesOnly} onChange={(e) => setFilterEdgesOnly(e.target.checked)} disabled={isGenerating} />
                    </div>
                  )}
                </div>
              )}

              {!piecesById.length && (
                <div className="meta" style={{ padding: 6 }}>
                  Les pièces apparaîtront ici après “Démarrer”.
                </div>
              )}

              <div className="trayMain">
                {isPiecePreviewOpen && previewPieceId != null && piecesById[previewPieceId] && (
                  <div className="piecePreview">
                    <div className="piecePreviewHeader">
                      <div style={{ fontWeight: 700, fontSize: 13 }}>Pièce sélectionnée</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {rotationEnabled && (
                          <button
                            className="btn"
                            onClick={() => rotatePiece90(previewPieceId)}
                            disabled={isGenerating}
                            title="Tourner la pièce de 90° (la rotation reste dans le catalogue)"
                          >
                            ↻ 90°
                          </button>
                        )}
                        <button className="btn ghost closeBtn" onClick={() => setIsPiecePreviewOpen(false)} title="Fermer le zoom">
                          ✕
                        </button>
                      </div>
                    </div>
                    <div className="piecePreviewStage">
                      {(() => {
                        const p = piecesById[previewPieceId]!;
                        return (
                          <div
                            style={{
                              position: "absolute",
                              inset: 0,
                              transform: `rotate(${p.rotation}deg)`,
                              transformOrigin: "center center",
                            }}
                          >
                            <img alt="Pièce zoom" src={p.imgUrl} draggable={false} />
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}

                <div className="trayScroll" ref={trayScrollRef}>
                  <div
                    className="trayGrid"
                    style={
                      traySizing
                        ? ({
                            ["--tray-tile-w" as any]: `${traySizing.tileW}px`,
                            ["--tray-tile-h" as any]: `${traySizing.tileH}px`,
                            ["--tray-gap" as any]: `${traySizing.gap}px`,
                          } as React.CSSProperties)
                        : undefined
                    }
                  >
                    {trayVisibleIds.map((id) => {
                      const p = piecesById[id]!;
                      const scaleX = p.outW / p.tileW;
                      const scaleY = p.outH / p.tileH;
                      const offsetX = (p.pad / p.tileW) * 100;
                      const offsetY = (p.pad / p.tileH) * 100;
                      const originX = ((p.pad + p.tileW / 2) / p.outW) * 100;
                      const originY = ((p.pad + p.tileH / 2) / p.outH) * 100;
                      const isSelected = selectedPieceId === p.id;
                      const shouldDim = selectedPieceId != null && !isSelected;
                      return (
                        <div
                          key={p.id}
                          className={`piece ${isSelected ? "selected" : ""} ${shouldDim ? "dimmed" : ""}`}
                          style={{
                            overflow: "visible",
                            zIndex: isSelected ? 10 : 1,
                          }}
                          onClick={() => {
                            setSelectedPieceId(p.id);
                            setPreviewPieceId(p.id);
                            setIsPiecePreviewOpen(true);
                          }}
                          title={rotationEnabled ? "Sélectionner • R (ou bouton) pour tourner • puis clique sur le plateau" : "Sélectionner • puis clique sur le plateau"}
                        >
                          <div
                            style={{
                              position: "absolute",
                              left: `-${offsetX}%`,
                              top: `-${offsetY}%`,
                              width: `${scaleX * 100}%`,
                              height: `${scaleY * 100}%`,
                              transform: `rotate(${p.rotation}deg)`,
                              transformOrigin: `${originX}% ${originY}%`,
                            }}
                          >
                            <img
                              alt=""
                              src={p.imgUrl}
                              draggable={false}
                              onDragStart={(ev) => ev.preventDefault()}
                              style={{ width: "100%", height: "100%", display: "block" }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


