import React, { useEffect, useMemo, useRef, useState } from "react";
import { findBestGrid } from "./puzzle/grid";
import { fileToObjectUrl, loadImageFromUrl, revokeObjectUrl } from "./puzzle/image";
import { generatePieces, shuffleInPlace } from "./puzzle/generatePieces";
import { hintRectForPiece } from "./puzzle/hints";
import type { Grid, HelpLevel, Piece, PieceRotation } from "./puzzle/types";

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

export function App() {
  const [fileObjectUrl, setFileObjectUrl] = useState<string | null>(null);
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const [imageAspect, setImageAspect] = useState<number>(1);
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);

  const [pieceCount, setPieceCount] = useState<(typeof PIECE_COUNTS)[number]>(100);
  const [rotationEnabled, setRotationEnabled] = useState<boolean>(true);
  const [helpEnabled, setHelpEnabled] = useState<boolean>(true);
  const [helpLevel, setHelpLevel] = useState<HelpLevel>("medium");

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
  const [boardFlash, setBoardFlash] = useState<{ type: "good" | "bad"; key: number } | null>(null);
  const [boardBasePx, setBoardBasePx] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState<number>(1);

  // Modal "Choisir un puzzle"
  const [isModalOpen, setIsModalOpen] = useState<boolean>(true);
  const [modalUrl, setModalUrl] = useState<string>(DEFAULT_IMAGE_URL);
  const [modalFile, setModalFile] = useState<File | null>(null);
  const [modalFileUrl, setModalFileUrl] = useState<string | null>(null);
  const [modalImg, setModalImg] = useState<HTMLImageElement | null>(null);
  const [modalImgSize, setModalImgSize] = useState<{ w: number; h: number } | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

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
    setZoom(1);
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

  async function analyzeModalImage() {
    setModalError(null);
    setIsAnalyzing(true);
    setModalImg(null);
    setModalImgSize(null);
    try {
      const src = modalFileUrl ?? modalUrl.trim();
      if (!src) throw new Error("Aucune source");
      const img = await loadImageFromUrl(src);
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      setModalImg(img);
      setModalImgSize({ w, h });
    } catch (e) {
      setModalError(
        "Impossible d’analyser cette image (URL bloquée CORS ou image invalide). Essaie un upload fichier, ou une autre URL.",
      );
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function loadPuzzleFromModal() {
    setError(null);
    setModalError(null);
    if (!modalImg || !modalImgSize) {
      await analyzeModalImage();
      if (!modalImg || !modalImgSize) return;
    }
    const q = estimateQualityForCount(modalImgSize!, pieceCount);
    if (!q.ok) {
      setModalError(
        `Image trop petite pour garantir des pièces de bonne qualité à ${pieceCount}. Choisis moins de pièces ou une image de meilleure résolution.`,
      );
      return;
    }

    setIsModalOpen(false);
    setIsGenerating(true);
    setGenProgress({ done: 0, total: pieceCount });
    setSelectedPieceId(null);
    setBoardFlash(null);

    try {
      resetPuzzleState();

      // Source finale (pour cleanup blob)
      if (modalFileUrl && modalFile) {
        revokeObjectUrl(fileObjectUrl);
        setFileObjectUrl(modalFileUrl);
      }

      const w = modalImgSize!.w;
      const h = modalImgSize!.h;
      const aspect = w / h;

      setLoadedImage(modalImg);
      setImageSize({ w, h });
      setImageAspect(aspect);
      setGrid(q.grid);

      const generated = await generatePieces(modalImg, q.grid, {
        randomRotation: rotationEnabled,
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
        setBoardBasePx({ w: q.grid.cols * byId[0].tileW, h: q.grid.rows * byId[0].tileH });
      } else {
        const maxBoardPx = 900;
        const scale = Math.min(1, maxBoardPx / Math.max(w, h));
        setBoardBasePx({ w: Math.floor(w * scale), h: Math.floor(h * scale) });
      }
      setZoom(pieceCount === 100 ? 1.35 : 1);
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
    if (!grid || !boardRef.current) return null;
    const rect = boardRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) return null;
    const col = Math.floor((x / rect.width) * grid.cols);
    const row = Math.floor((y / rect.height) * grid.rows);
    const idx = row * grid.cols + col;
    return { idx, row, col };
  }

  function flash(type: "good" | "bad") {
    setBoardFlash({ type, key: Date.now() + Math.random() });
  }

  function tryPlaceSelectedAtCell(cellIdx: number) {
    if (!grid) return;
    if (selectedPieceId == null) return;
    const piece = piecesById[selectedPieceId];
    if (!piece) return;
    const rotationOk = !rotationEnabled || piece.rotation === 0;
    const cellEmpty = placements[cellIdx] == null;
    const ok = piece.id === cellIdx && rotationOk && cellEmpty;
    if (ok) {
      placePiece(piece.id, cellIdx);
      flash("good");
      setSelectedPieceId(null);
    } else {
      flash("bad");
    }
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
    if (rotationEnabled) return;
    // Si la rotation est désactivée, on garantit que TOUTES les pièces sont dans le bon sens.
    setPiecesById((prev) => {
      let changed = false;
      const out = prev.map((p) => {
        if (p.rotation === 0) return p;
        changed = true;
        return { ...p, rotation: 0 };
      });
      return changed ? out : prev;
    });
  }, [rotationEnabled]);

  const hintRectStyle = useMemo(() => {
    if (!helpEnabled) return null;
    if (!grid) return null;
    if (selectedPieceId == null) return null;
    const p = piecesById[selectedPieceId];
    if (!p) return null;
    const { r0, c0, r1, c1 } = hintRectForPiece(grid, p.row, p.col, helpLevel);
    const left = (c0 / grid.cols) * 100;
    const top = (r0 / grid.rows) * 100;
    const width = ((c1 - c0 + 1) / grid.cols) * 100;
    const height = ((r1 - r0 + 1) / grid.rows) * 100;
    return { left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` } as const;
  }, [grid, helpEnabled, helpLevel, piecesById, selectedPieceId]);

  const boardCells = useMemo(() => {
    if (!grid) return [];
    const out: Array<{
      idx: number;
      left: string;
      top: string;
      width: string;
      height: string;
    }> = [];
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        const idx = r * grid.cols + c;
        out.push({
          idx,
          left: `${(c / grid.cols) * 100}%`,
          top: `${(r / grid.rows) * 100}%`,
          width: `${(1 / grid.cols) * 100}%`,
          height: `${(1 / grid.rows) * 100}%`,
        });
      }
    }
    return out;
  }, [grid]);

  const trayVisibleIds = useMemo(() => trayOrder.slice(0, 96), [trayOrder]);
  const remainingInTray = trayOrder.length;

  const boardStyle = useMemo(() => {
    const base = boardBasePx ?? { w: 900, h: Math.floor(900 / imageAspect) };
    return { width: `${Math.floor(base.w * zoom)}px`, height: `${Math.floor(base.h * zoom)}px` } as const;
  }, [boardBasePx, imageAspect, zoom]);

  const traySizing = useMemo(() => {
    const p = piecesById[0];
    if (!p) return null;
    const tileW = Math.max(18, Math.round(p.tileW * zoom));
    const tileH = Math.max(18, Math.round(p.tileH * zoom));
    const pad = Math.max(0, Math.round(p.pad * zoom));
    const gap = Math.max(10, pad * 2);
    const scaleX = p.outW / p.tileW;
    const scaleY = p.outH / p.tileH;
    const offsetX = (p.pad / p.tileW) * 100;
    const offsetY = (p.pad / p.tileH) * 100;
    const originX = ((p.pad + p.tileW / 2) / p.outW) * 100;
    const originY = ((p.pad + p.tileH / 2) / p.outH) * 100;
    return { tileW, tileH, gap, scaleX, scaleY, offsetX, offsetY, originX, originY };
  }, [piecesById, zoom]);

  const placedPieces = useMemo(() => {
    if (!grid) return [];
    const cellW = 100 / grid.cols;
    const cellH = 100 / grid.rows;
    const out: Array<{
      id: number;
      left: string;
      top: string;
      width: string;
      height: string;
    }> = [];
    for (let idx = 0; idx < placements.length; idx++) {
      const pid = placements[idx];
      if (pid == null) continue;
      const row = Math.floor(idx / grid.cols);
      const col = idx % grid.cols;
      // IMPORTANT: taille identique à la grille -> la pièce fait EXACTEMENT la taille d’une case.
      // Les formes “jigsaw” (PNG avec padding) sont donc simplement scalées dans la case.
      const left = col * cellW;
      const top = row * cellH;
      const width = cellW;
      const height = cellH;
      out.push({ id: pid, left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` });
    }
    return out;
  }, [grid, placements]);

  return (
    <div className="container">
      {isModalOpen && (
        <div
          className="modalOverlay"
          onClick={() => {
            // Autoriser fermeture seulement si un puzzle est déjà chargé.
            if (loadedImage) setIsModalOpen(false);
          }}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>Choisir un puzzle</div>
                <div className="meta">Sélectionne une image, règle les options, puis “Valider”.</div>
              </div>
              <button className="btn ghost" onClick={() => loadedImage && setIsModalOpen(false)} disabled={!loadedImage}>
                Fermer
              </button>
            </div>

            <div className="modalBody">
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
                      void analyzeModalImage();
                    }}
                  />
                  <div className="meta" style={{ marginTop: 6 }}>
                    Astuce: privilégie l’upload si l’URL est bloquée par CORS.
                  </div>
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
                <div className="field">
                  <label>Pièces</label>
                  <select
                    value={pieceCount}
                    disabled={isGenerating || isAnalyzing || !modalImgSize}
                    onChange={(e) => {
                      const next = Number(e.target.value) as (typeof PIECE_COUNTS)[number];
                      setPieceCount(next);
                      if (next !== 100) setZoom(1);
                    }}
                  >
                    {PIECE_COUNTS.map((n) => (
                      <option key={n} value={n} disabled={!!modalQualityByCount && !modalQualityByCount[n].ok}>
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
                  {!modalImgSize && <div className="meta" style={{ marginTop: 6 }}>Charge une image pour activer le choix de taille.</div>}
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

                <div style={{ height: 12 }} />

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
              </div>
            </div>

            <div className="modalFooter">
              <button
                className="btn"
                onClick={() => {
                  setModalFile(null);
                  setModalUrl("");
                  setModalImg(null);
                  setModalImgSize(null);
                  setModalError(null);
                  revokeObjectUrl(modalFileUrl);
                  setModalFileUrl(null);
                }}
                disabled={isGenerating || isAnalyzing}
              >
                Effacer
              </button>
              <button
                className="btn primary"
                onClick={() => void loadPuzzleFromModal()}
                disabled={isGenerating || isAnalyzing || (!modalFileUrl && !modalUrl.trim())}
                title="Valide l’image et génère directement le puzzle"
              >
                Valider et charger
              </button>
            </div>
          </div>
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
        <div className="topbarActions">
          <button className="btn" onClick={() => setIsModalOpen(true)} disabled={isGenerating}>
            Choisir un puzzle
          </button>
          <button className="btn" onClick={() => solvePuzzle()} disabled={!grid || isGenerating} title="Triche: résout instantanément le puzzle">
            Résoudre
          </button>
          <button
            className="btn ghost"
            onClick={() => {
              resetPuzzleState();
              setIsModalOpen(true);
            }}
            disabled={isGenerating}
          >
            Réinitialiser
          </button>
        </div>
      </div>

      <div className="panel toolbar">
        <div className="field" style={{ width: 260 }}>
          <label>Rotation 90°</label>
          <div className="toggle">
            <input type="checkbox" checked={rotationEnabled} onChange={(e) => setRotationEnabled(e.target.checked)} disabled={isGenerating} />
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)" }}>{rotationEnabled ? "Activée (R pour tourner)" : "Désactivée"}</div>
          </div>
        </div>

        <div className="field" style={{ width: 360 }}>
          <label>Aide (zone)</label>
          <div className="row">
            <div className="toggle" style={{ flex: 1 }}>
              <input type="checkbox" checked={helpEnabled} onChange={(e) => setHelpEnabled(e.target.checked)} disabled={!isReady || isGenerating} />
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)" }}>{helpEnabled ? "Activée" : "Désactivée"}</div>
            </div>
            <select value={helpLevel} onChange={(e) => setHelpLevel(e.target.value as HelpLevel)} disabled={!helpEnabled || !isReady || isGenerating} style={{ width: 160 }}>
              <option value="simple">simple</option>
              <option value="medium">medium</option>
              <option value="advanced">advanced</option>
            </select>
          </div>
        </div>

        {grid && (
          <div className="field" style={{ flex: "1 1 auto", minWidth: 240 }}>
            <label>Partie</label>
            <div className="meta">
              Grille: {grid.cols}×{grid.rows} • {pieceCount} pièces • Placées: {placedCount}/{grid.count} ({percentDone}%)
            </div>
          </div>
        )}
      </div>

      {error && (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid rgba(239,68,68,0.35)", borderRadius: 14, background: "rgba(239,68,68,0.07)" }}>
          {error}
        </div>
      )}

      <div className="layout">
        <div className="panel boardWrap">
          <div className="boardHeader">
            <div className="meta">
              {grid ? (
                <>
                  Grille: {grid.cols}×{grid.rows} • Placées: {placedCount}/{grid.count} ({percentDone}%)
                </>
              ) : (
                "Charge une image, puis Démarrer."
              )}
            </div>
            {genProgress && isGenerating && (
              <div style={{ width: 220 }}>
                <div className="progress">
                  <div style={{ width: `${Math.round((genProgress.done / genProgress.total) * 100)}%` }} />
                </div>
                <div className="meta" style={{ marginTop: 6 }}>
                  Génération: {genProgress.done}/{genProgress.total}
                </div>
              </div>
            )}
            {rotationEnabled && selectedPieceId != null && (
              <button
                className="btn"
                onClick={() => {
                  const p = piecesById[selectedPieceId];
                  if (!p) return;
                  setPieceRotation(selectedPieceId, rotate90(p.rotation));
                }}
                disabled={!piecesById[selectedPieceId] || isGenerating}
                title="Tourner la pièce de 90° (raccourci: R)"
              >
                ↻ Tourner
              </button>
            )}
            {selectedPieceId != null && piecesById[selectedPieceId]?.placed && (
              <button
                className="btn"
                onClick={() => {
                  unplacePiece(selectedPieceId);
                  flash("bad");
                }}
                disabled={isGenerating}
                title="Retire la pièce du plateau (elle retourne dans le tray)"
              >
                Retirer
              </button>
            )}
            {grid && pieceCount === 100 && (
              <div className="row" style={{ gap: 8 }}>
                <button className="btn" disabled={isGenerating} onClick={() => setZoom((z) => Math.max(1, Math.round((z - 0.1) * 10) / 10))}>
                  −
                </button>
                <div className="meta" style={{ minWidth: 58, textAlign: "center" }}>
                  Zoom {Math.round(zoom * 100)}%
                </div>
                <button className="btn" disabled={isGenerating} onClick={() => setZoom((z) => Math.min(2.5, Math.round((z + 0.1) * 10) / 10))}>
                  +
                </button>
                <input
                  type="range"
                  min={1}
                  max={2.5}
                  step={0.05}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  disabled={isGenerating}
                  title="Zoom (100 pièces)"
                />
              </div>
            )}
          </div>

          <div style={{ overflow: "auto", borderRadius: 16 }}>
            <div
              ref={boardRef}
              className={`board ${boardFlash?.type === "good" ? "flashGood" : ""} ${boardFlash?.type === "bad" ? "flashBad" : ""}`}
              key={boardFlash?.key ?? "board"}
              style={boardStyle as any}
              onClick={(e) => {
                if (!grid) return;
                const cell = cellAtPoint(e.clientX, e.clientY);
                if (!cell) return;
                if (selectedPieceId == null) {
                  const pid = placements[cell.idx];
                  if (pid != null) setSelectedPieceId(pid);
                  return;
                }
                tryPlaceSelectedAtCell(cell.idx);
              }}
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
                return (
                  <div
                    key={p.id}
                    className={`piece ${selectedPieceId === p.id ? "selected" : ""}`}
                    style={{
                      position: "absolute",
                      left: pp.left,
                      top: pp.top,
                      width: pp.width,
                      height: pp.height,
                      border: "none",
                      background: "transparent",
                      overflow: "visible",
                    }}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setSelectedPieceId(p.id);
                    }}
                    title="Clique pour sélectionner (puis bouton 'Retirer' si besoin)"
                  >
                  {/* Underlay non-transparent pour supprimer les “jours” aux jonctions */}
                  <img
                    alt=""
                    src={p.rectUrl}
                    draggable={false}
                    onDragStart={(ev) => ev.preventDefault()}
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      display: "block",
                    }}
                  />
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

              {hintRectStyle && <div className="hintOverlay">{<div className="hintRect" style={hintRectStyle} />}</div>}
            </div>
          </div>
        </div>

        <div className="panel tray">
          <div className="trayHeader">
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Pièces</div>
              <div className="meta">
                Dans le tray: {remainingInTray} {remainingInTray > trayVisibleIds.length ? `(affiche ${trayVisibleIds.length})` : ""}
              </div>
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

          {!piecesById.length && (
            <div className="meta" style={{ padding: 6 }}>
              Les pièces apparaîtront ici après “Démarrer”.
            </div>
          )}

          <div style={{ overflowX: "auto" }}>
            <div
              className="trayGrid"
              style={
                traySizing
                  ? ({
                      ["--tray-tile-w" as any]: `${traySizing.tileW}px`,
                      ["--tray-tile-h" as any]: `${traySizing.tileH}px`,
                      ["--tray-gap" as any]: `${traySizing.gap}px`,
                      // Minimum 2 colonnes, puis autant que l’espace le permet.
                      minWidth: `${traySizing.tileW * 2 + traySizing.gap}px`,
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
                return (
                  <div
                    key={p.id}
                    className={`piece ${selectedPieceId === p.id ? "selected" : ""}`}
                    style={{
                      width: traySizing?.tileW ? `${traySizing.tileW}px` : undefined,
                      height: traySizing?.tileH ? `${traySizing.tileH}px` : undefined,
                      overflow: "visible",
                    }}
                    onClick={() => setSelectedPieceId(p.id)}
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
      </div>
    </div>
  );
}


