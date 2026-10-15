"use client";

/**
 * jsPDF can embed a Bengali font but cannot *shape* it: pre-base vowel signs
 * (ি ে ৈ) stay after the consonant and conjuncts (ক্ষ, স্ক) fall apart. The
 * browser's text engine shapes correctly, so text that needs shaping is
 * drawn onto a canvas with the app's Bangla font and placed as an image.
 * Everything else, including Bangla digits and ৳, stays real PDF text.
 */
import type { jsPDF } from "jspdf";
import type { Cell } from "jspdf-autotable";

// Combining marks that need reordering or positioning: Bengali signs,
// hasanta and nukta (U+0981–0983, 09BC, 09BE–09CD, 09D7), plus Devanagari.
const NEEDS_SHAPING = /[\u0900-\u097F\u0981-\u0983\u09BC\u09BE-\u09CD\u09D7]/;

export function needsShaping(text: string): boolean {
  return NEEDS_SHAPING.test(text);
}

/** Canvas resolution: 12 px per mm ≈ 300 dpi. */
const PX_PER_MM = 12;
const PT_TO_MM = 25.4 / 72;

type RGB = [number, number, number];

/**
 * The app's own web fonts (Geist for Latin, Noto Sans Bengali for Bangla),
 * read from the CSS variables next/font sets on <html>, so shaped text in
 * the PDF looks exactly like the screen.
 */
function canvasFamily(): string {
  const css = getComputedStyle(document.documentElement);
  const families = ["--font-geist-sans", "--font-bengali"]
    .map((v) => css.getPropertyValue(v).trim())
    .filter(Boolean);
  return [...families, "sans-serif"].join(", ");
}

let fontsReady: Promise<void> | null = null;

/**
 * Makes sure both weights of the Bangla web font are loaded before drawing.
 * Only the real faces are checked: next/font's "… Fallback" families point at
 * local fonts that may not exist, which makes `document.fonts.load` reject.
 * Best effort: if loading fails, the canvas still draws with what is available.
 */
export function loadCanvasFonts(): Promise<void> {
  fontsReady ??= (async () => {
    const primary = canvasFamily()
      .split(",")
      .map((f) => f.trim())
      .filter((f) => f && !/fallback/i.test(f) && f !== "sans-serif");
    const sample = "অক্ষর ১২৩";
    const results = await Promise.allSettled(
      primary.flatMap((family) => ["400", "600"].map((w) => document.fonts.load(`${w} 16px ${family}`, sample))),
    );
    if (results.some((r) => r.status === "rejected")) console.warn("PDF: some fonts did not load", results);
  })();
  return fontsReady;
}

function cssColor(color: Cell["styles"]["textColor"] | RGB): string {
  if (Array.isArray(color)) return `rgb(${color.join(",")})`;
  if (typeof color === "number") return `rgb(${color},${color},${color})`;
  return typeof color === "string" ? color : "#171717";
}

/**
 * Draws one line of shaped text with its box's top-left (or top-right for
 * align "right") at x, y. Returns the drawn width in mm.
 */
export function drawShapedText(
  doc: jsPDF,
  text: string,
  opts: {
    x: number;
    y: number;
    sizePt: number;
    bold?: boolean;
    color?: Cell["styles"]["textColor"] | RGB;
    align?: "left" | "right" | "center";
  },
): number {
  const fontMm = opts.sizePt * PT_TO_MM;
  const lineMm = fontMm * doc.getLineHeightFactor();
  const font = `${opts.bold ? 600 : 400} ${fontMm * PX_PER_MM}px ${canvasFamily()}`;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx || !text) return 0;
  ctx.font = font;
  const widthPx = Math.ceil(ctx.measureText(text).width) + 2;
  const heightPx = Math.ceil(lineMm * PX_PER_MM);
  canvas.width = widthPx;
  canvas.height = heightPx;
  // Resizing resets context state.
  ctx.font = font;
  ctx.fillStyle = cssColor(opts.color ?? [23, 23, 23]);
  ctx.textBaseline = "middle";
  ctx.fillText(text, 1, heightPx / 2);

  const widthMm = widthPx / PX_PER_MM;
  const x = opts.align === "right" ? opts.x - widthMm : opts.align === "center" ? opts.x - widthMm / 2 : opts.x;
  doc.addImage(canvas.toDataURL("image/png"), "PNG", x, opts.y, widthMm, lineMm);
  return widthMm;
}

/** Draws the given (already wrapped) lines into a table cell. */
export function drawShapedLines(doc: jsPDF, cell: Cell, lines: string[]): void {
  const { fontSize, fontStyle, halign, textColor } = cell.styles;
  const lineMm = fontSize * PT_TO_MM * doc.getLineHeightFactor();
  const x =
    halign === "right"
      ? cell.x + cell.width - cell.padding("right")
      : halign === "center"
        ? cell.x + cell.width / 2
        : cell.x + cell.padding("left");
  let y = cell.y + cell.padding("top");
  for (const line of lines) {
    drawShapedText(doc, line, {
      x,
      y,
      sizePt: fontSize,
      bold: fontStyle === "bold",
      color: textColor,
      align: halign === "right" || halign === "center" ? halign : "left",
    });
    y += lineMm;
  }
}
