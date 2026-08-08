/** Deterministic 4×4 single-channel SDF atlas for the Matrix point treatment. */
export const MATRIX_SDF_ATLAS_URL =
  "/effect-assets/stylized-materialization/matrix-binary-sdf.png";

export const MATRIX_SDF_GLYPHS = Object.freeze([
  "0",
  "1",
  "<",
  ">",
  "[",
  "]",
  "{",
  "}",
  "+",
  "-",
  "=",
  "/",
  "\\",
  ":",
  "#",
  "@",
] as const);

export const MATRIX_SDF_GRID_SIZE = 4;
export const MATRIX_SDF_TEXTURE_SIZE = 512;
export const MATRIX_SDF_CELL_SIZE = MATRIX_SDF_TEXTURE_SIZE / MATRIX_SDF_GRID_SIZE;
export const MATRIX_SDF_DISTANCE_RANGE = 16;

export const MATRIX_SDF_ATLAS = Object.freeze({
  url: MATRIX_SDF_ATLAS_URL,
  glyphs: MATRIX_SDF_GLYPHS,
  gridSize: MATRIX_SDF_GRID_SIZE,
  textureSize: MATRIX_SDF_TEXTURE_SIZE,
  cellSize: MATRIX_SDF_CELL_SIZE,
  distanceRange: MATRIX_SDF_DISTANCE_RANGE,
  sourceFont: "/fonts/chakra-petch/ChakraPetch-Bold.ttf",
  sourceFontLicense: "SIL Open Font License 1.1",
});
