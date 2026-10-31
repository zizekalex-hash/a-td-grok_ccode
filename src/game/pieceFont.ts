import chessFontUrl from "@/assets/chess-pieces.woff2?url";

const PIECE_FONT_NAME = "Azshara Chess";
/** The bundled chess glyphs (♔ to ♟) first, then system fonts that may have them. */
export const PIECE_FONT = `"${PIECE_FONT_NAME}", "Noto Sans Symbols 2", "Segoe UI Symbol", "DejaVu Sans", sans-serif`;
/** Text presentation, so ♟ and ♛ never turn into emoji. */
export const TEXT_VS = "︎";

let fontLoad: Promise<void> | null = null;

/** Loads the bundled chess glyphs once, so pieces and crowns look the same on every device, offline too. */
export function loadPieceFont() {
  if (fontLoad || typeof FontFace === "undefined") return;
  const face = new FontFace(PIECE_FONT_NAME, `url(${chessFontUrl})`);
  fontLoad = face
    .load()
    .then((f) => {
      document.fonts.add(f);
    })
    .catch(() => undefined);
}
