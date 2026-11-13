// Line-wrapping simulation.
//
// wordBreak mirrors the CSS / Satori `word-break` property:
//   - "normal"   (default) Break opportunities from UAX #14 via the `linebreak`
//                package — the same library Satori uses for `word-break: normal`.
//                UAX #14 already forbids e.g. 「。」 at a line start and 「「」 at a
//                line end, so kinsoku violations are rare in this mode.
//   - "break-all" Break between any two graphemes (what Satori does for
//                `word-break: break-all`, and what hand-written canvas
//                `measureText` loops usually do). Kinsoku is NOT respected.
//   - "keep-all" Break only at Intl.Segmenter word boundaries (what Satori does
//                for `word-break: keep-all`). Depends on the ICU data bundled
//                with Node, so results can differ between Node versions.
//
// Fitting: greedy. Add units left to right; if the next unit (without its
// trailing whitespace) would exceed contentWidth, start a new line before it.
// A unit wider than the whole line is kept on its own line (it overflows),
// except in "break-all" where units are single graphemes anyway.
import LineBreaker from "linebreak";
import type { Measure } from "./width.ts";

export type WordBreak = "normal" | "break-all" | "keep-all";
export const WORD_BREAKS: readonly WordBreak[] = ["normal", "break-all", "keep-all"];

export interface Line {
  /** Line text (trailing whitespace kept as in the source) */
  text: string;
  /** Code-point offset of the first character (0-based) */
  start: number;
  /** Code-point offset after the last character (exclusive) */
  end: number;
  /** Measured width in px, excluding trailing whitespace */
  width: number;
}

/** Split into code points (surrogate pairs count as one character). */
export function toChars(s: string): string[] {
  return Array.from(s);
}

const graphemeSegmenter = new Intl.Segmenter("ja", { granularity: "grapheme" });
const wordSegmenter = new Intl.Segmenter("ja", { granularity: "word" });

/** Split into grapheme clusters (emoji ZWJ sequences, flags, kana + combining marks stay together). */
export function graphemes(s: string): string[] {
  return Array.from(graphemeSegmenter.segment(s), (x) => x.segment);
}

/** Units between break opportunities, according to wordBreak. */
export function breakUnits(title: string, wordBreak: WordBreak = "normal"): string[] {
  if (wordBreak === "break-all") return graphemes(title);
  if (wordBreak === "keep-all") return Array.from(wordSegmenter.segment(title), (x) => x.segment);
  const units: string[] = [];
  const breaker = new LineBreaker(title);
  let last = 0;
  let bk;
  while ((bk = breaker.nextBreak())) {
    if (bk.position > last) units.push(title.slice(last, bk.position));
    last = bk.position;
  }
  if (last < title.length) units.push(title.slice(last));
  return units;
}

/** Width of a string, measured grapheme by grapheme. */
export function measureText(s: string, measure: Measure): number {
  if (measure.text) return measure.text(s);
  let w = 0;
  for (const g of graphemes(s)) w += measureGrapheme(g, measure);
  return w;
}

/**
 * A multi-code-point grapheme (ZWJ emoji, flag, base + variation selector) is
 * drawn as one glyph, so only its first code point is measured.
 */
export function measureGrapheme(g: string, measure: Measure): number {
  const first = String.fromCodePoint(g.codePointAt(0)!);
  return measure(first);
}

export function wrapUnits(units: readonly string[], contentWidth: number, measure: Measure): Line[] {
  // Like Satori, each unit is measured on its own (font mode: kerning inside the unit only)
  // and the widths are summed. Trailing spaces of the last unit do not count (CSS hangs them).
  const lines: Line[] = [];
  const trimEnd = (x: string) => x.replace(/[ \t]+$/, "");
  let text = "";
  let start = 0;
  let pos = 0;
  let width = 0; // sum of full unit widths on the current line
  let lineFit = 0; // width of the current line without its trailing spaces
  const eps = 1e-9;
  for (const unit of units) {
    const len = toChars(unit).length;
    const full = measureText(unit, measure);
    const fit = measureText(trimEnd(unit), measure);
    if (text !== "" && width + fit > contentWidth + eps) {
      lines.push({ text, start, end: pos, width: lineFit });
      text = "";
      start = pos;
      width = 0;
    }
    text += unit;
    lineFit = width + fit;
    width += full;
    pos += len;
  }
  if (text !== "") lines.push({ text, start, end: pos, width: lineFit });
  return lines;
}

/** Wrap a title. */
export function wrap(title: string, contentWidth: number, measure: Measure, wordBreak: WordBreak = "normal"): Line[] {
  return wrapUnits(breakUnits(title, wordBreak), contentWidth, measure);
}

/** Backwards-compatible character-greedy wrap (= wordBreak "break-all" on code points). */
export function wrapGreedy(chars: readonly string[], contentWidth: number, measure: Measure): Line[] {
  return wrapUnits(chars, contentWidth, measure);
}
