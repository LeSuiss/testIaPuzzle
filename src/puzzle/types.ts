export type HelpLevel = "simple" | "medium" | "advanced";

export type PieceRotation = 0 | 90 | 180 | 270;

export type Piece = {
  id: number;
  row: number;
  col: number;
  imgUrl: string;
  // Version sans contour (utile comme underlay légèrement agrandi pour éviter les micro-jours).
  baseUrl: string;
  // Dimensions (en px) du rendu généré (PNG) incluant un padding pour les ergots/creux.
  outW: number;
  outH: number;
  // Dimensions du "corps" (rectangle de base de la case) en px.
  tileW: number;
  tileH: number;
  // Padding (en px) utilisé autour du corps.
  pad: number;
  rotation: PieceRotation;
  placed: boolean;
};

export type Grid = {
  rows: number;
  cols: number;
  count: number;
};


